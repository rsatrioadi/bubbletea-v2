import { createGraph, lift } from '../graph/graph.js';
import { pkgDepsOf } from '../model/nodes.js';
import { createInfoPanel } from './infoPanel.js';
import { drawArrows } from '../render/arrows.js';
import { getBubbleTeaDataWithContext } from '../model/bubbleTeaData.js';
import { drawServingTableWithContext } from '../render/servingTable.js';
import { createSignal } from '../signal/signal.js';
import { createTooltipManager } from './tooltipManager.js';

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
	fetch(`./data/${filename}.json`)
		.then(resp => {
			if (!resp.ok) {
				throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);
			}
			return resp.text();
		})
		.then(rawText => {
			const jsonData = parseJSONData(rawText, filename);
			if (!jsonData) return;
			handleParsedData(jsonData, filename);
		})
		.catch(err => {
			alert(`Could not load file "./data/${filename}.json": ${err}`);
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

	// Create context
	const context = {
		layers: [null, 'Presentation Layer', 'Service Layer', 'Domain Layer', 'Data Source Layer'],
		graph: createGraph(jsonData),

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

	// Create the info panel
	context.infoPanel = createInfoPanel(context)(document.getElementById("info-panel"));

	// Arrow renderer
	context.arrowRenderer = (nodeInfo) => {
		drawArrows(d3.select("svg"), nodeInfo, pkgDepsOf(nodeInfo));
	};

	// Tooltip management
	context.hoverSignal = createSignal();
	const tooltipManager = createTooltipManager('#tooltip');
	tooltipManager.connect(context.hoverSignal);

	context.deselectSignal = createSignal();

	return context;
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
	let lastSelection = null;

	// 1) Connect a slot to the deselectSignal
	context.deselectSignal.connect(() => {
		d3.select(lastSelection)?.attr("filter", null);
		d3.selectAll('.dep-line').remove();
		lastSelection = null;
		document.getElementById('info-panel').innerHTML = '';
	});

	// 2) Selecting a bubble or tea
	d3.selectAll(".bubble, .tea").on("click", function (event, d) {
		event.stopPropagation();

		// Emit the signal for node info + arrow drawing
		d.signal.emit(d);

		// Highlight this selection, unhighlight the old
		d3.select(lastSelection)?.attr("filter", null);
		d3.select(this).attr("filter", "url(#highlight)");
		lastSelection = this;
	});
}

/**
 * setupTooltips:
 *   - Adds mouseover, mousemove, mouseout for .bubble and .tea elements, 
 *     using #tooltip for display.
 */
function setupTooltips(context) {
	d3.selectAll(".bubble, .tea")
		.on("mouseover", function (event, node) {
			event.stopPropagation();
			context.hoverSignal.emit({
				type: 'mouseover',
				event,
				node
			});
		})
		.on("mousemove", function (event, node) {
			event.stopPropagation();
			context.hoverSignal.emit({
				type: 'mousemove',
				event,
				node
			});
		})
		.on("mouseout", function (event, node) {
			event.stopPropagation();
			context.hoverSignal.emit({
				type: 'mouseout',
				event,
				node
			});
		});
}
