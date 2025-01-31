import { createGraph, lift } from '../graph/graph.js';
import { clearInfo, displayInfo } from './infoPanel.js';
import { clearArrows, displayArrows } from './arrows.js';
import { getBubbleTeaDataWithContext } from '../model/bubbleTeaData.js';
import { drawServingTableWithContext } from '../render/servingTable.js';
import { hideTooltip, showTooltip, updateTooltipPosition } from './tooltip.js';
import { hueMap } from '../utils/utils.js';

/**
 * initFileUpload:
 *   - Hooks up the file input and upload button.
 *   - Also checks if there's a '?p=<filename>' param and immediately loads that file if found.
 */
export function initFileUpload() {
	// 1) Check for URL param: ?p=<filename>
	const urlParams = new URLSearchParams(window.location.search);
	const filenameParam = urlParams.get('p'); // e.g. ?p=demo => "demo"

	// If we have ?p=..., load the local file
	if (filenameParam) {
		handleUrlParamFile(filenameParam); // We'll create this function below
	}

	// 2) Normal file-upload logic
	const fileInput = document.getElementById('file-selector');
	fileInput.addEventListener('change', handleFileUpload);

	const uploadButton = document.getElementById('upload-button');
	uploadButton.addEventListener('click', () => fileInput.click());
}

/**
 * handleUrlParamFile:
 *   - Fetches ./data/<filename>.json, parses the JSON, then
 *     calls the same flow as if we read from a file.
 */
function handleUrlParamFile(filename) {
	// Attempt to fetch the local JSON
	const filenameWithParam = filename + ".json";
	fetch(`./data/${filenameWithParam}`)
		.then(resp => {
			if (!resp.ok) {
				throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);
			}
			return resp.text();
		})
		.then(rawText => {
			const jsonData = parseJSONData(rawText, filenameWithParam);
			if (!jsonData) return;
			handleParsedData(jsonData, filenameWithParam);
		})
		.catch(err => {
			alert(`Could not load file "./data/${filenameWithParam}": ${err}`);
		});
}

/**
 * handleParsedData:
 *   - This is the common code that runs after we successfully parse JSON data,
 *     whether from a user-uploaded file or from URL param fetch.
 */
function handleParsedData(jsonData, fileName) {
	// Display the loaded filename in #filename
	document.getElementById("filename").textContent = `BubbleTea 2.0 – ${fileName}`;

	// Clear old chart
	const chartContainer = document.getElementById('chart-container');
	chartContainer.innerHTML = "";

	// 1) Build the context & augment edges
	const context = buildContext(jsonData);

	// 2) Render the serving table
	const servingTable = renderServingTable(context, chartContainer);
	if (!servingTable) return;

	// 3) Zoom & resize
	const g = setupZoomAndResize(servingTable, chartContainer);

	// 4) Selection interactions
	setupSelectionInteractions(g, context);

	// 5) Tooltips
	setupTooltips(context);
}

function handleFileUpload(event) {
	const file = event.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (e) => {
		const rawText = e.target.result;
		const jsonData = parseJSONData(rawText, file.name);
		if (!jsonData) return;

		handleParsedData(jsonData, file.name);
	};

	reader.readAsText(file);
}


/* ------------------------------ HELPER FUNCTIONS ------------------------------ */

/**
 * parseJSONData:
 *   - Parse a raw string, validate it has .elements.nodes,
 *     or return null if invalid.
 */
function parseJSONData(rawText, fileName) {
	let jsonData;
	try {
		jsonData = JSON.parse(rawText);
	} catch (err) {
		alert("Could not parse JSON file.");
		return null;
	}

	if (!jsonData || !jsonData.elements || !Array.isArray(jsonData.elements.nodes)) {
		alert("The JSON does not contain the expected structure.");
		return null;
	}

	return jsonData;
}

/**
 * buildContext:
 *   - Takes the parsed JSON, merges 'invokes' + 'hasScript' => 'calls', creates the graph,
 *     sets up layers, roleStereotypeHues, etc., and returns the complete "context".
 */
function buildContext(jsonData) {
	// Merge edges: 'invokes' + 'hasScript' => 'calls'
	const invokes = jsonData.elements.edges.filter(e => e.data.label === "invokes");
	const hasScript = jsonData.elements.edges.filter(e => e.data.label === "hasScript");
	const calls = lift(hasScript, invokes, "calls").filter(e => e.data.source !== e.data.target);

	jsonData.elements.edges = [...jsonData.elements.edges, ...calls];

	const graph = createGraph(jsonData);
	var layers;
	const allowedDependencies = graph.edges("allowedDependency");
	if (allowedDependencies && allowedDependencies.length) {
		layers = bfsSort(graph.edges("allowedDependency")).map(l => l.property("simpleName"));
		layers.forEach((l,i) => {
			hueMap[l] = i * Math.floor(360/layers.length);
		});
		layers = [null, ...layers];
	} else {
		layers = ['Presentation Layer', 'Service Layer', 'Domain Layer', 'Data Source Layer'];
	}

	// Create context
	const context = {
		layers,
		graph,
		dispatcher: d3.dispatch("select","deselect","mouseover","mousemove","mouseout"),
		lastSelection: null,

		roleStereotypeHues: {
			"Controller": 294,
			"Coordinator": 115,
			"Information Holder": 355,
			"Interfacer": 35,
			"User Interfacer": 35,
			"Internal Interfacer": 35,
			"External Interfacer": 35,
			"Service Provider": 216,
			"Structurer": 321
		},
		dependencyProfileHues: {
			inbound: 120,
			outbound: 240,
			transit: 60,
			hidden: 0
		}
	};

	setupDispatchers(context);

	return context;
}

function bfsSort(edgeList) {
	// Step 1: Identify all sources and targets
	const sources = new Set();
	const targets = new Set();

	edgeList.forEach((edge) => {
		sources.add(edge.source());
		targets.add(edge.target());
	});

	// Step 2: Find the root (a source that is not a target)
	let root = null;
	for (let src of sources) {
		if (!Array.from(targets).some(tgt => tgt.id() === src.id())) {
			root = src;
			break;
		}
	}

	if (root === null) {
		throw new Error("No root found. Ensure there is a node that never appears as a target.");
	}

	// Step 3: Initialize BFS structures
	const queue = [root];
	const visited = new Set([root]);
	const result = [];

	// Step 4: Perform BFS
	while (queue.length > 0) {
		const current = queue.shift();
		result.push(current);

		// Find all neighbors by iterating through the edge list
		edgeList.forEach((edge) => {
			if (edge.source().id() === current.id() && !Array.from(visited).some(v => v.id() === edge.target().id())) {
				queue.push(edge.target());
				visited.add(edge.target());
			}
		});
	}

	return result;
}

function setupDispatchers(context) {

	context.dispatcher.on("select.infoPanel", displayInfo(context)("#info-panel"));
	context.dispatcher.on("deselect.infoPanel", clearInfo("#info-panel"));

	context.dispatcher.on("select.arrows", displayArrows("svg"));
	context.dispatcher.on("deselect.arrows", clearArrows("svg"));

	context.dispatcher.on("select.viz", highlightSelection);
	context.dispatcher.on("deselect.viz", removeHighlights);

	context.dispatcher.on("mouseover.tooltip", showTooltip("#tooltip"));
	context.dispatcher.on("mousemove.tooltip", updateTooltipPosition("#tooltip"));
	context.dispatcher.on("mouseout.tooltip", hideTooltip("#tooltip"));

	function highlightSelection(_, ele) {
		d3.select(context.lastSelection)?.attr("filter", null);
		d3.select(ele).attr("filter", "url(#highlight)");
		context.lastSelection = ele;
	}

	function removeHighlights() {
		d3.select(context.lastSelection).attr("filter", null);
		context.lastSelection = null;
	}
}

/**
 * renderServingTable:
 *   - Finds all package nodes in the graph, builds bubbleTeaData, 
 *     draws the serving table, and inserts it in 'chartContainer'.
 *   - Returns the D3 selection of the <svg> or null if there's nothing to draw.
 */
function renderServingTable(context, chartContainer) {
	const packages = context.graph.nodes(
		node => node.hasLabel("Container") && !node.hasLabel("Structure")
	);
	if (!packages || packages.length === 0) return null;

	const getBubbleTeaData = getBubbleTeaDataWithContext(context);
	const drawServingTable = drawServingTableWithContext(context);

	const servingTable = drawServingTable(packages.map(getBubbleTeaData));
	if (!servingTable) return null;

	// Append to the DOM
	const divWidth = chartContainer.clientWidth;
	const divHeight = chartContainer.clientHeight * 0.997;
	servingTable.attr("width", divWidth).attr("height", divHeight);

	chartContainer.appendChild(servingTable.node());
	return servingTable;
}

/**
 * setupZoomAndResize:
 *   - Attaches a D3 zoom handler to the <svg>, focusing on the inner <g> with id="serving-table".
 *   - Also observes container resizing to adjust.
 *   - Returns the <g> selection.
 */
function setupZoomAndResize(servingTable, chartContainer) {
	const g = servingTable.select("g");
	const svgWidth = g.attr("width");
	const divWidth = chartContainer.clientWidth;

	// Calculate scale
	const scale = svgWidth ? (divWidth / svgWidth) * 0.6 : 1;
	const zoom = d3.zoom().on('zoom', ({ transform }) => {
		g.attr('transform', transform);
	});
	servingTable.call(zoom);

	// Set initial transform
	const initialTransform = d3.zoomIdentity.translate(divWidth * 0.2, 12).scale(scale);
	servingTable.call(zoom.transform, initialTransform);

	// Add reset-zoom button
	const resetZoom = document.createElement("button");
	resetZoom.id = "reset-zoom";
	resetZoom.textContent = "🧭";
	resetZoom.addEventListener("click", () => {
		servingTable.call(zoom.transform, initialTransform);
	});
	chartContainer.appendChild(resetZoom);

	// Observe resizing
	const resizeObserver = new ResizeObserver(entries => {
		for (let entry of entries) {
			if (entry.target === chartContainer) {
				servingTable
					.attr("width", entry.contentRect.width)
					.attr("height", entry.contentRect.height);

				// Update initial transform for new width
				initialTransform.x = entry.contentRect.width * 0.2;
				initialTransform.k = entry.contentRect.width / svgWidth * 0.6;
			}
		}
	});
	resizeObserver.observe(chartContainer);

	return g;
}

/**
 * setupSelectionInteractions:
 *   - Clears selection on background click, and handles bubble/tea selection clicks.
 *   - Clears highlight filters, removes dep-line, updates the info panel, etc.
 */
function setupSelectionInteractions(g, context) {
	
	d3.select("#serving-table")
		.on("click", function (event, d) {
			context.dispatcher.call("deselect", event, d, this);
		});

	d3.selectAll(".bubble, .tea")
		.on("click", function (event, d) {
			event.stopPropagation();
			context.dispatcher.call("select", event, d, this);
		});
}

/**
 * setupTooltips:
 *   - Adds mouseover, mousemove, mouseout for .bubble and .tea elements, 
 *     using #tooltip for display.
 */
function setupTooltips(context) {
	d3.selectAll(".bubble, .tea")
		.on("mouseover", function (event, d) {
			event.stopPropagation();
			context.dispatcher.call("mouseover", event, d, this);
		})
		.on("mousemove", function (event, d) {
			event.stopPropagation();
			context.dispatcher.call("mousemove", event, d, this);
		})
		.on("mouseout", function (event, d) {
			event.stopPropagation();
			context.dispatcher.call("mouseout", event, d, this);
		});
}
