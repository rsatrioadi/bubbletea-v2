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
 *   - The core logic is in handleFileUpload, which is partially refactored into smaller helpers.
 */
export function initFileUpload() {
	const fileInput = document.getElementById('file-selector');
	fileInput.addEventListener('change', handleFileUpload);

	const uploadButton = document.getElementById('upload-button');
	uploadButton.addEventListener('click', () => fileInput.click());
}

/**
 * handleFileUpload:
 *   - Orchestrates reading the selected file, parsing JSON, 
 *     building the graph/context, rendering the serving table, 
 *     and setting up all interactions (zoom, selection, tooltips).
 */
function handleFileUpload(event) {
	const file = event.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (e) => {
		// 1) Parse the JSON
		const jsonData = parseJSONFile(e);
		if (!jsonData) return;

		// 2) Build the "context" and augment the edges with "calls"
		const context = buildContext(jsonData);

		// 3) Render the "serving table" for package nodes
		const chartContainer = document.getElementById('chart-container');
		const servingTable = renderServingTable(context, chartContainer);
		if (!servingTable) return;

		// 4) Set up zoom and resizing on the rendered table
		const g = setupZoomAndResize(servingTable, chartContainer);

		// 5) Attach background click + selection logic
		setupSelectionInteractions(g, context);

		// 6) Set up tooltips on hover
		setupTooltips(context);
	};

	reader.readAsText(file);
}

/* ------------------------------ HELPER FUNCTIONS ------------------------------ */

/**
 * parseJSONFile:
 *   - Safely parses the FileReader result as JSON and verifies minimal structure.
 *   - Returns the parsed object or null if invalid.
 */
function parseJSONFile(e) {
	let jsonData;
	try {
		jsonData = JSON.parse(e.target.result);
	} catch (err) {
		alert("Could not parse JSON file.");
		return null;
	}

	// Basic validation
	if (!jsonData || !jsonData.elements || !Array.isArray(jsonData.elements.nodes)) {
		alert("The JSON does not contain the expected structure.");
		return null;
	}

	// Display the filename
	const fileName = (e.target.fileName || e.target.filename || "") || e.target.__fileName;
	document.getElementById("filename").textContent = `BubbleTea 2.0 – ${fileName || "Imported File"}`;

	// If the <input> has no custom filename, fallback to the File object:
	if (!fileName) {
		// If we rely on the original <file> object name
		const file = e.target.files?.[0];
		if (file) {
			document.getElementById("filename").textContent = `BubbleTea 2.0 – ${file.name}`;
		}
	}

	// Clear any old chart
	const chartContainer = document.getElementById("chart-container");
	chartContainer.innerHTML = "";

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
