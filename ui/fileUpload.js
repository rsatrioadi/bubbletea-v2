import { createGraph, lift } from '../graph/graph.js';
import { pkgDepsOf } from '../model/nodes.js';  // for arrow rendering
import { createInfoPanel } from './infoPanel.js';  // or wherever your infoPanel is
import { drawArrows } from '../render/arrows.js';  // if you have a dedicated arrows.js
import { getBubbleTeaDataWithContext } from '../model/bubbleTeaData.js';
import { drawServingTableWithContext } from '../render/servingTable.js';

/**
 * initFileUpload:
 *   - Hooks up the file input and upload button
 *   - The actual logic to parse data and build the chart happens in handleFileUpload.
 */
export function initFileUpload() {
	// Listen for file selection changes
	const fileInput = document.getElementById('file-selector');
	fileInput.addEventListener('change', handleFileUpload);

	// Listen for clicks on the “upload” button to trigger file selection
	const uploadButton = document.getElementById('upload-button');
	uploadButton.addEventListener('click', () => fileInput.click());
}

/**
 * handleFileUpload:
 *   - Reads the selected file, parses its JSON, and if valid, 
 *     builds the graph, context, and draws the “serving table” with bubble teas.
 *   - Also sets up event handlers for zoom, tooltips, etc.
 */
function handleFileUpload(event) {
	const file = event.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = function (e) {
		const jsonData = JSON.parse(e.target.result);

		// Basic validation
		if (!jsonData || !jsonData.elements || !Array.isArray(jsonData.elements.nodes)) {
			alert("The JSON does not contain the expected structure.");
			return;
		}

		// Display the loaded filename (optional)
		document.getElementById("filename").textContent = `BubbleTea 2.0 – ${file.name}`;

		// Possibly clear any old chart
		const chartContainer = document.getElementById("chart-container");
		chartContainer.innerHTML = "";

		// --- 1) Build or transform the graph data ---
		// a) Combine "invokes" + "hasScript" edges => "calls"
		const invokes = jsonData.elements.edges.filter((e) => e.data.label === "invokes");
		const hasScript = jsonData.elements.edges.filter((e) => e.data.label === "hasScript");
		const calls = lift(hasScript, invokes, "calls").filter((e) => e.data.source !== e.data.target);
		jsonData.elements.edges = [...jsonData.elements.edges, ...calls];

		// --- 2) Create the application context ---
		const context = {
			layers: [null, 'Presentation Layer', 'Service Layer', 'Domain Layer', 'Data Source Layer'],
			graph: createGraph(jsonData),

			// Example hues or config
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

		// Create the info panel, arrow renderer, etc.
		context.infoPanel = createInfoPanel(context)(document.getElementById("info-panel"));
		context.arrowRenderer = (nodeInfo) => {
			// For arrow drawing, we pass the node to drawArrows
			drawArrows(d3.select("svg"), nodeInfo, pkgDepsOf(nodeInfo));
		};

		// --- 3) Build the serving table from all package (container) nodes ---
		const packages = context.graph.nodes(
			node => node.hasLabel("Container") && !node.hasLabel("Structure")
		);
		const getBubbleTeaData = getBubbleTeaDataWithContext(context);
		const drawServingTable = drawServingTableWithContext(context);
		const servingTable = drawServingTable(packages.map(getBubbleTeaData));

		if (!servingTable) {
			// If no packages or nothing drawn, just stop
			return;
		}

		// Append servingTable to the DOM, set up zoom & other interactions
		const divWidth = chartContainer.clientWidth;
		const divHeight = chartContainer.clientHeight * 0.997;
		servingTable.attr("width", divWidth).attr("height", divHeight);

		chartContainer.appendChild(servingTable.node());

		// We'll zoom the inner <g>, which typically has "id"="serving-table"
		const g = servingTable.select("g");
		const svgWidth = g.attr("width");
		const scale = svgWidth ? (divWidth / svgWidth) * 0.6 : 1;

		// Setup D3 zoom
		const zoom = d3.zoom().on('zoom', ({ transform }) => {
			g.attr('transform', transform);
		});
		servingTable.call(zoom);

		// Set initial zoom transform
		const initialTransform = d3.zoomIdentity.translate(divWidth * 0.2, 12).scale(scale);
		servingTable.call(zoom.transform, initialTransform);

		// Add a reset-zoom button
		const resetZoom = document.createElement("button");
		resetZoom.id = "reset-zoom";
		resetZoom.textContent = "🧭";
		resetZoom.addEventListener("click", () => {
			servingTable.call(zoom.transform, initialTransform);
		});
		chartContainer.appendChild(resetZoom);

		// Observe resizing of the container
		const resizeObserver = new ResizeObserver(entries => {
			for (let entry of entries) {
				if (entry.target === chartContainer) {
					servingTable
						.attr("width", entry.contentRect.width)
						.attr("height", entry.contentRect.height);

					// Adjust initial transform for new width
					initialTransform.x = entry.contentRect.width * 0.2;
					initialTransform.k = entry.contentRect.width / svgWidth * 0.6;
				}
			}
		});
		resizeObserver.observe(chartContainer);

		// --- 4) Interaction: clear selection on background click ---
		let lastSelection = null;
		d3.select("#serving-table").on("click", function (event) {
			d3.select(lastSelection)?.attr("filter", null);
			d3.selectAll(".dep-line").remove();
			lastSelection = null;
			document.getElementById("info-panel").innerHTML = "";
		});

		// --- 5) Interaction: selecting a bubble or tea ---
		d3.selectAll(".bubble, .tea").on("click", function (event, d) {
			event.stopPropagation();
			// Emit signal to show info, draw arrows
			d.signal.emit(d);

			// Highlight selection
			d3.select(lastSelection)?.attr("filter", null);
			d3.select(this).attr("filter", "url(#highlight)");
			lastSelection = this;
		});

		// --- 6) Tooltips on mouseover ---
		const tooltip = d3.select("#tooltip");
		d3.selectAll(".bubble, .tea")
			.on("mouseover", function (event, d) {
				event.stopPropagation();
				tooltip.style("display", "block")
					.html(`<strong>${d.hasLabel("Structure")
							? d.property("simpleName")
							: d.property("qualifiedName")
						}</strong>`);
			})
			.on("mousemove", function (event) {
				event.stopPropagation();
				tooltip
					.style("left", (event.pageX + 10) + "px")
					.style("top", (event.pageY + 10) + "px");
			})
			.on("mouseout", function (event) {
				event.stopPropagation();
				tooltip.style("display", "none");
			});
	};

	reader.readAsText(file);
}
