import { stringToHue, arraysEqual, average, sum, max } from './utils.js';

function nodeName(node) {
	return node.data.properties.simpleName;
}

function nodeId(node) {
	return node.data.id;
}

const classesWithGraph = (graph) => (pkg) => {
	// Helper function to get target node IDs
	const getTargetIds = (edges) =>
		edges
			.filter(edge => edge.data.source === pkg.data.id && edge.data.label === "contains")
			.map(edge => edge.data.target);

	// Helper function to check if node is relevant
	const isRelevantNode = (targetIdsSet) => (node) => targetIdsSet.has(node.data.id) && node.data.labels.includes("Structure");

	// Get the target node IDs as a Set for O(1) lookup
	const targetIdsSet = new Set(getTargetIds(graph.elements.edges));

	// Return the filtered nodes that are both in targetIds and have "Structure" in their labels
	return graph.elements.nodes.filter((node) => isRelevantNode(targetIdsSet)(node));
};

const methodsWithGraph = (graph) => (clasz) => {
	// Helper function to get target node IDs
	const getTargetIds = (edges) =>
		edges
			.filter(edge => edge.data.source === clasz.data.id && edge.data.label === "hasScript")
			.map(edge => edge.data.target);

	// Helper function to check if a node is a target
	const isTargetNode = (node, targetIdsSet) => targetIdsSet.has(node.data.id);

	// Get the target node IDs as a Set for O(1) lookup
	const targetIdsSet = new Set(getTargetIds(graph.elements.edges));

	// Return the filtered nodes that match the target node IDs
	return graph.elements.nodes.filter((node) => isTargetNode(node, targetIdsSet));
};

const layerWithGraph = (graph) => (method) => {
	// In a later version, the implementation may change and involve graph, so let the parameter there.
	return method.data.properties.layer || "Undefined";
}

const getBubbleDataWithContext = (context) => (clasz) => {

	const methods = methodsWithGraph(context.graph);
	const layer = layerWithGraph(context.graph);

	const methodList = methods(clasz);

	// Use reduce to accumulate layer counts without mutating state
	const layerCounts = methodList.reduce((counts, method) => {
		const layerType = layer(method);
		return {
			...counts,
			[layerType]: (counts[layerType] || 0) + 1
		};
	}, {});
	console.log(clasz.data.id, layerCounts);

	// Transform layerCounts into the desired array structure
	const bubbleData = Object.entries(layerCounts).map(([layerType, count]) => ({
		layer: layerType,
		count,
		valid: context.layers.includes(layerType),
		hue: stringToHue(layerType)
	}));
	
	return { class: clasz, bubbleData };
};

const dominatingLayersWithContext = (context) => (bubbleData) => {

	const layers = context.layers;

	if (bubbleData.length < 1) return [];

	let max1 = -Infinity, max2 = -Infinity;
	let layer1 = null, layer2 = null;

	for (const { count, layer } of bubbleData) {
		if (count > max1) {
			max2 = max1;
			layer2 = layer1;
			max1 = count;
			layer1 = layer;
		} else if (count > max2) {
			max2 = count;
			layer2 = layer;
		}
	}

	if (max2 === -Infinity) {
		return [layer1];
	}

	if (max1 > 1.5 * max2) {
		return [layer1];
	}

	if (bubbleData.length === 2 || bubbleData.some(({ count }) => count * 1.5 < max1)) {
		if (Math.abs(layers.indexOf(layer1)-layers.indexOf(layer2))<2) {
			return [layer1, layer2];
		}
	}

	return [];
}

const drawBubbleWithContext = (context) =>  (data) => {

	const {class:clasz,bubbleData} = data;

	// Set up the pie chart
	const width = 20;
	const radius = width / 2;

	// Create an SVG circle
	const svg = d3.create("svg")
		.attr("width", width+5)
		.attr("height", width+5)
		.append("g")
		.attr("transform", `translate(${(width+5) / 2}, ${(width+5) / 2})`);

	svg.append("circle")
		.attr("r", radius+5/2)
		.attr("fill-opacity", 0.3)
		.attr("fill", "black"); // Fill the circle with black

	// If methodList is empty, return a black circle
	if (bubbleData.length === 0) {

		svg.append("circle")
			.attr("r", radius)
			.attr("fill", "black"); // Fill the circle with black


		svg.append("circle")
			.attr("r", radius)
			.attr("fill", "url(#gradient)");

		return svg;  // Return the black circle
	}

	const pie = d3.pie().value(d => d.count).sort((a, b) => context.layers.indexOf(b.layer) - context.layers.indexOf(a.layer));
	const arc = d3.arc().innerRadius(0).outerRadius(radius);

	svg.selectAll("path")
		.data(pie(bubbleData))
		.enter()
		.append("path")
		.attr("d", arc)
		.attr("fill", d=> d.data.valid?`hsl(${d.data.hue}, 90%, 40%)`:"black");

	svg.append("circle")
		.attr("r", radius)
		.attr("fill", "url(#gradient)");

	return svg;  // Return the pie chart SVG element
}

const layerCompositionComparatorWithContext = (context) => {
	const { layers } = context;
	const dominatingLayers = dominatingLayersWithContext(context);

	const calculateDominanceScore = (dominantLayers) => {
		if (dominantLayers.length === 0) return 100;
		if (dominantLayers.length === 1) return layers.indexOf(dominantLayers[0]);

		return (
			layers.indexOf(dominantLayers[0]) + layers.indexOf(dominantLayers[1])
		) / 2;
	};

	const calculateProportion = (arr)=>(dominantLayers) => {
		const total = sum(arr.map((layer) => layer.count));
		const dominantCount = sum(
			arr
				.filter((layer) => dominantLayers.includes(layer.layer))
				.map((layer) => layer.count)
		);

		return dominantCount / total;
	};

	return (a) => (b) => {
		const da = dominatingLayers(a);
		const db = dominatingLayers(b);

		if (arraysEqual(da)(db)) {
			const ia = calculateProportion(a)(da);
			const ib = calculateProportion(b)(db);
			return ib - ia;
		}

		const ia = calculateDominanceScore(da);
		const ib = calculateDominanceScore(db);
		return ia - ib;
	};
};

const getBubbleTeaDataWithContext = (context) => (pkg) => {

	const classes = classesWithGraph(context.graph);
	const getBubbleData = getBubbleDataWithContext(context);
	const dominatingLayers = dominatingLayersWithContext(context);

	const claszList = classes(pkg);  // Get all clasz objects

	const data = claszList.map((clasz) => getBubbleData(clasz));

	const pkgBubbleData = data.map(d => {
		const totalCount = d.bubbleData.reduce((sum, e) => sum + e.count, 0);
		return d.bubbleData.map(e => ({
			layer: e.layer,
			count: e.count / totalCount // Calculate normalized count
		}));
	});

	const uniqueLayers = Array.from(
		new Set(
			data
				.map(d => d.bubbleData)
				.flat(2)                // Flatten the array to a single level
				.map(e => e.layer)       // Map to extract only the 'layer' property
				.filter(layer => layer != null)  // Exclude null and undefined values
		)
	);

	const averageCounts = uniqueLayers.map(layer => {
		const layerData = pkgBubbleData.flat(2).filter(e => e.layer === layer);
		const totalCount = layerData.reduce((sum, e) => sum + e.count, 0);
		const count = pkgBubbleData.length;
		const averageCount = count > 0 ? totalCount / count : 0;
		return { layer, count: averageCount };
	});

	const dominant = dominatingLayers(averageCounts);

	return {
		package:pkg,
		dominant,
		bubbleTeaData:averageCounts,
		bubbleData:data
	};
}

// Helper function to create positions array
const calculatePositions = (numPies, bubbleRadius, padding) => {
	const numCols = Math.ceil(Math.sqrt(numPies));
	const twoRowNumCols = numCols * 2 - 1;

	return Array.from({ length: numPies }, (_, index) => {
		const drow = Math.floor(index / twoRowNumCols);
		const irow = Math.floor((index % twoRowNumCols) / numCols);
		const x = bubbleRadius / 2 + padding * 1.5 + irow * ((bubbleRadius + padding) / 2) + (index % twoRowNumCols - irow * numCols) * (bubbleRadius + padding);
		const y = bubbleRadius * 2.5 + padding * 1.5 + (drow * 2 + irow) * (bubbleRadius + padding / 3);
		return [x, y];
	});
};

// Helper function to calculate maximum dimensions
const calculateLayoutDimensions = (positions, bubbleRadius, padding) => {
	const maxX = Math.max(...positions.map(pos => pos[0])) + bubbleRadius / 2 + padding * 1.5;
	const maxY = Math.max(...positions.map(pos => pos[1])) + bubbleRadius / 2 + padding * 1.5;
	return { layoutWidth: maxX, layoutHeight: maxY };
};

// Helper function to create SVG gradients
const createGradient = (svg) => {
	const defs = svg.append("svg:defs");
	const grad = defs
		.append("svg:radialGradient")
		.attr("gradientUnits", "objectBoundingBox")
		.attr("cx", "25%")
		.attr("cy", "25%")
		.attr("r", "100%")
		.attr("id", "gradient");

	grad
		.append("stop")
		.attr("offset", "0%")
		.style("stop-color", "hsl(0, 0%, 100%")
		.style("stop-opacity", 0.7);
	grad
		.append("stop")
		.attr("offset", "75%")
		.style("stop-color", "hsl(0, 0%, 100%")
		.style("stop-opacity", 0);
};

// Function to draw the layout container
const drawLayoutContainer = (svg, width, height, bubbleRadius, padding, fill, stroke) => {
	const bottomCornerRadius = 20;
	svg.append("rect")
		.attr("x", padding / 2)
		.attr("y", padding / 2)
		.attr("width", width - padding)
		.attr("height", bubbleRadius)
		.attr("fill", stroke)
		.attr("stroke", stroke);

	svg.append("path")
		.attr("d", `
            M${padding / 2},${padding / 2 + bubbleRadius}
            h${width - padding}
            v${height - bottomCornerRadius - padding - bubbleRadius}
            a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},${bottomCornerRadius}
            h-${width - 2 * bottomCornerRadius - padding}
            a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},-${bottomCornerRadius}
            V${padding / 2 + bubbleRadius} Z
        `)
		.attr("fill", fill)
		.attr("stroke", stroke);
};

// Main function to create the bubble tea layout
const drawBubbleTeaWithContext = (context) => (bubbleTeaData) => {
	const compare = layerCompositionComparatorWithContext(context);
	const drawBubble = drawBubbleWithContext(context);
	const { package: pkg, dominant, bubbleData: data } = bubbleTeaData;

	if (data.length === 0) return null;

	const pkgName = nodeName(pkg);
	const bubbleRadius = 20;
	const padding = 10;

	// Calculate positions and layout dimensions
	const positions = calculatePositions(data.length, bubbleRadius, padding);
	const { layoutWidth, layoutHeight } = calculateLayoutDimensions(positions, bubbleRadius, padding);

	// Create SVG container
	const svg = d3.create("svg");
	const g = svg.append("g");

	// Create gradient
	createGradient(g);

	// Draw layout container with calculated dimensions
	const my_hue = average(dominant.map(stringToHue));
	const fill = dominant.length > 0 ? `hsl(${my_hue}, 60%, 80%)` : "hsl(0, 0%, 80%)";
	const stroke = dominant.length > 0 ? `hsl(${my_hue}, 90%, 40%)` : "hsl(0, 0%, 40%)";
	drawLayoutContainer(g, layoutWidth, layoutHeight, bubbleRadius, padding, fill, stroke);

	// Sort and map bubble data to draw pie charts
	data
		.sort((a, b) => compare(a.bubbleData)(b.bubbleData))
		.forEach((d, index) => {
			const [xPos, yPos] = positions[index];
			const bubble = drawBubble(d);
			g.node().appendChild(bubble.node());
			d3.select(bubble.node()).attr("transform", `translate(${xPos}, ${yPos})`);
		});

	// Add package name text
	g.append("text")
		.attr("x", layoutWidth / 2)
		.attr("y", layoutHeight + 20)
		.attr("text-anchor", "middle")
		.style("font-size", "20px")
		.text(pkgName);

	// resizeSVGToFitContents
	// const bbox = g.node().getBBox();

	// svg
	// 	.attr("width", bbox.width + 20)
	// 	.attr("height", bbox.height + 20)
		// .attr("viewBox", `${bbox.x - 10} ${bbox.y - 10} ${bbox.width + 20} ${bbox.height + 20}`);
	return svg;
};

const drawServingTableWithContext = (context) => (bubbleTeaDataArray) => {

	const drawBubbleTea = drawBubbleTeaWithContext(context);

	function generateLayerOrder(layers) {
		const layerOrder = [];

		// Combinations of consecutive layers (pairs)
		for (let i = 0; i < layers.length - 1; i++) {
			layerOrder.push([layers[i]]);
			layerOrder.push([layers[i], layers[i + 1]]);
		}
		layerOrder.push([layers[layers.length - 1]]);

		// Add the cross-cutting layer
		layerOrder.push([]); // Cross-cutting layer represented by an empty array

		return layerOrder;
	}

	const layerOrder = generateLayerOrder(context.layers.slice(1));
	
	const layers = {};
	layerOrder.forEach(layer => (layers[layer.join(",")] = []));
	
	// Categorize bubbleTeaData objects into layers based on `dominant`
	bubbleTeaDataArray.forEach(bubbleTeaData => {
		const key = bubbleTeaData.dominant.sort((a,b)=>context.layers.indexOf(a)-context.layers.indexOf(b)).join(",");
		if (key in layers) layers[key].push(bubbleTeaData);
	});

	let tableWidth = 1200;
	const bubbleSpacing = 30; // Spacing between bubble groups

	let totalHeight = 0;

	const svg = d3
		.create("svg")
		.attr("width", tableWidth);

	let grey_area = null;
	let grey_height = 0;
	if ("" in layers) {
		// draw the cross-cutting first
		const layerName = "Cross-cutting";
		const items = layers[""];

		if (items.length > 0) {

			const layer_group = svg.append("g")
				.attr("x", 0)
				.attr("y", 0);

			const fill = "hsl(0, 0%, 95%)";
			const stroke = "hsl(0, 0%, 40%)";

			// Render each item in this layer
			const bboxes = [];
			const groups = items.map(drawBubbleTea).filter(e => e != null).map(innerSvg => {

				const pkg_group = layer_group
					.append("g");
				pkg_group.html(innerSvg.node().innerHTML);
				// console.log(innerSvg.node());
				const bbox = measureSvgContent(innerSvg);
				bboxes.push(bbox);
				return pkg_group;
			});

			if (bboxes.length > 0) {
				const layerWidth = max(bboxes.map(b => b.width)) + 2 * bubbleSpacing;
				console.log(layerName, layerWidth);

				let yOffset = 2 * bubbleSpacing;

				layer_group
					.attr("transform", `translate(${tableWidth - layerWidth}, 0)`);

				groups.forEach((g, i) => {
					const bbox = bboxes[i];
					g.attr("transform", `translate(${(layerWidth - bbox.width)/2}, ${yOffset})`);
					yOffset += bbox.height + bubbleSpacing;
				});

				// Add layer title

				layer_group.insert("text", ":first-child")
					.attr("x", 10)
					.attr("y", 24)
					.attr("font-size", 20)
					.attr("font-weight", "bold")
					.attr("fill", "white")
					.text(layerName);

				layer_group.insert("rect", ":first-child")
					.attr("x", 0)
					.attr("y", 0)
					.attr("width", layerWidth)
					.attr("height", 36)
					.attr("fill", stroke);

				grey_area = layer_group.insert("rect", ":first-child")
					.attr("x", 0)
					.attr("y", 0)
					.attr("width", layerWidth)
					.attr("fill", fill);

				tableWidth -= layerWidth;
				grey_height = yOffset;
			}
		}
	}

	let last_rect = null;
	Object.entries(layers).filter(([layerName, _])=>layerName).forEach(([layerName, items]) => {
		if (items.length === 0) return;

		const layer_group = svg.append("g")
			.attr("x", 0)
			.attr("y", 0);

		const layerNames = layerName ? layerName.split(",") : [];
		const my_hue = average(layerNames.map(stringToHue));
		const fill = layerNames.length > 0 ? `hsl(${my_hue}, 50%, 90%)` : "hsl(0, 0%, 90%)";
		const stroke = layerNames.length > 0 ? `hsl(${my_hue}, 90%, 40%)` : "hsl(0, 0%, 40%)";

		// Add layer title
		layer_group
			.append("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", tableWidth)
			.attr("height", 36)
			.attr("fill", stroke);

		layer_group
			.append("text")
			.attr("x", 10)
			.attr("y", 24)
			.attr("font-size", 20)
			.attr("font-weight", "bold")
			.attr("fill", "white")
			.text(layerName);

		// Render each item in this layer
		const bboxes = [];
		const groups = items.map(drawBubbleTea).filter(e => e != null).map(innerSvg => {
				
			const pkg_group = layer_group
				.append("g");
			pkg_group.html(innerSvg.node().innerHTML);
			// console.log(innerSvg.node());
			const bbox = measureSvgContent(innerSvg);
			bboxes.push(bbox);
			return pkg_group;
		});

		const layerHeight = max(bboxes.map(b => b.height))+2*bubbleSpacing;
		console.log(layerName, layerHeight);

		let xOffset = bubbleSpacing;
		let yOffset = layerHeight;

		layer_group
			.attr("transform", `translate(0, ${totalHeight})`);
		totalHeight += layerHeight + bubbleSpacing;

		groups.forEach((g,i) => {
			const bbox = bboxes[i];
			if (xOffset + bbox.width + bubbleSpacing > tableWidth) {
				xOffset = bubbleSpacing;
				yOffset += layerHeight;
				totalHeight += layerHeight;
			}
			g.attr("transform", `translate(${xOffset - bbox.x}, ${yOffset - bbox.height})`);
			xOffset += bbox.width + bubbleSpacing;
		});

		last_rect = layer_group.insert("rect", ":first-child")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", tableWidth)
			.attr("height", yOffset + bubbleSpacing)
			.attr("fill", fill);
	});
	
	const final_height = max([grey_height, totalHeight]);
	svg.attr("height", final_height);

	svg.insert("rect", ":first-child")
		.attr("x", 0)
		.attr("y", 0)
		.attr("width", tableWidth)
		.attr("height", final_height)
		.attr("fill", last_rect.attr("fill"));

	if (grey_area) grey_area.attr("height", final_height);

	return svg;
}

function measureSvgContent(svg) {
	// Create an off-screen container
	const offscreenDiv = d3.select("body")
		.append("div")
		.attr("id", "dummy")
		.style("position", "absolute")
		.style("visibility", "hidden");

	// Append the SVG string to the container
	document.getElementById("dummy").appendChild(svg.node());
	// console.log(offscreenDiv.node());
	const svgNode2 = offscreenDiv.select("svg").node();
	// console.log(svgNode2);

	// Measure dimensions
	const bbox = svgNode2.getBBox();

	// Clean up
	offscreenDiv.remove();

	return bbox;
}

function wrapSvgContentInGroup(svg) {
	// Select all children of the SVG
	const children = svg.node().innerHTML;

	svg.node().innerHTML = "";
	// Append a new <g> to the SVG
	const group = svg.append("g");

	// Move all existing children into the <g>
	group.node().innerHTML = children;

	return group; // Return the newly created group
}



document.addEventListener('DOMContentLoaded', () => {
	function handleFileUpload(event) {
		const file = event.target.files[0]; // Get the file selected by the user

		if (!file) {
			alert("Please select a JSON file.");
			return;
		}

		const reader = new FileReader();

		reader.onload = function (e) {
			const jsonData = JSON.parse(e.target.result);
			if (jsonData && jsonData.elements && Array.isArray(jsonData.elements.nodes)) {

				const chartContainer = document.getElementById("chart-container");
				chartContainer.innerHTML = "";
				const context = {
					layers: [null, 'Presentation Layer', 'Service Layer', 'Domain Layer', 'Data Source Layer'],
					graph: jsonData
				};
				const packages = context.graph.elements.nodes.filter(node => node.data.labels.includes("Container") && !node.data.labels.includes("Structure"));
				const getBubbleTeaData = getBubbleTeaDataWithContext(context);
				const drawServingTable = drawServingTableWithContext(context);

				const svg = drawServingTable(packages.map(getBubbleTeaData));

				// packages.forEach(pkgNode => {
				// 	const bubbleTeaData = getBubbleTeaData(pkgNode);
				// 	const svgNode = drawBubbleTea(bubbleTeaData);

				if (svg) {
					const divWidth = chartContainer.clientWidth;
					const divHeight = chartContainer.clientHeight;
					const svgWidth = svg.attr("width");
					// const svgHeight = svg.attr("height");
					const scale = divWidth/svgWidth * 0.9;

					const g = wrapSvgContentInGroup(svg);
					g.attr("transform", `scale(${scale})`);
					svg
						.attr("width", divWidth)
						.attr("height", divHeight)
						.call(
							d3.zoom().on('zoom', ({ transform }) => {
								g.attr('transform', transform);
							})
						);;

					window.addEventListener('resize', () => {
						const newWidth = chartContainer.clientWidth;
						const newHeight = chartContainer.clientHeight;

						svg.attr("width", newWidth)
							.attr("height", newHeight);
					});

					chartContainer.appendChild(svg.node());
				}
				// });
			} else {
				alert("The JSON does not contain the expected structure.");
			}
		};

		// Read the file as a text
		reader.readAsText(file);
	}

	// Attach the event listener to the file input
	document.getElementById('file-selector').addEventListener('change', handleFileUpload);

	// Optionally, you can trigger the file input when the button is clicked (to give the user a clearer interface)
	document.getElementById('upload-button').addEventListener('click', () => {
		document.getElementById('file-selector').click();  // Trigger file input click when the button is clicked
	});
});

