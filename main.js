import { stringToHue, arraysEqual, average, sum, max } from './utils.js';
import { createSignal } from './signal.js';
import { createGraph, lift } from './graph.js';

const classDepsOf = (clasz) => {
	return {
		outgoing: clasz.targets("calls"),
		incoming: clasz.sources("calls")
	}
};

const pkgDepsOf = (node) => {
	if (node.hasLabel("Structure")) {
		const acc = classDepsOf(node);
		acc.outgoing = [...new Set([...acc.outgoing.map((n) => n.property("package"))])];
		acc.incoming = [...new Set([...acc.incoming.map((n) => n.property("package"))])];
		return acc;
	} else if (node.hasLabel("Container")) {
		const classDeps = classesOf(node).map(classDepsOf).reduce((acc, { outgoing, incoming }) => {
			// Add outgoing to the accumulated outgoing array, avoiding duplicates
			acc.outgoing = [...new Set([...acc.outgoing, ...outgoing.map((n) => n.property("package"))])];

			// Add incoming to the accumulated incoming array, avoiding duplicates
			acc.incoming = [...new Set([...acc.incoming, ...incoming.map((n) => n.property("package"))])];

			return acc;
		}, { outgoing: [], incoming: [] });

		return classDeps;
	} else {
		return { outgoing: [], incoming: [] };
	}
};

const classesOf = (pkg) => {
	return pkg.targets("contains").filter((n) => n.hasLabel("Structure"));
};

const methodsOf = (clasz) => {
	return clasz.targets("hasScript");
};

const layerOf = (method) => {
	return method.property("layer") || "Undefined";
}

const getBubbleDataWithContext = (context) => (clasz) => {

	const methodList = methodsOf(clasz);

	if (methodList.length > 0) {
		// Use reduce to accumulate layer counts without mutating state
		const layerCounts = methodList.reduce((counts, method) => {
			const layerType = layerOf(method);
			return {
				...counts,
				[layerType]: (counts[layerType] || 0) + 1
			};
		}, {});

		// Transform layerCounts into the desired array structure
		const bubbleData = Object.entries(layerCounts).map(([layerType, count]) => ({
			layer: layerType,
			count,
			valid: context.layers.includes(layerType),
			hue: stringToHue(layerType)
		}));

		return { class: clasz, bubbleData };
	} else {

		const bubbleData = [{
			layer: "Undefined",
			count: 1,
			valid: false,
			hue: 0
		}];

		return { class: clasz, bubbleData };
	}
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
		if (Math.abs(layers.indexOf(layer1) - layers.indexOf(layer2)) < 2) {
			return [layer1, layer2];
		}
	}

	return [];
}

const drawBubbleWithContext = (context) => (data) => {
	const { class: clasz, bubbleData } = data;

	const width = 20;
	const radius = width / 2;

	const bubble = d3.create("svg:g") // Create a group for easier composition
		.attr("class", "bubble")
		.attr("id", clasz.id())
		.style("pointer-events", "all")
		.datum(clasz);

	// const rsColor = "roleStereotype" in clasz.data.properties ? `hsl(${context.roleStereotypeHues[clasz.data.properties["roleStereotype"]]}, 100%, 70%)` : "hsl(0, 0%, 60%)";
	const rsColor = "black";
	const rs = bubble.append("circle")
		.attr("r", radius + 5 / 2)
		.attr("fill-opacity", 0.5)
		.attr("fill", rsColor);

	if (bubbleData.length === 0) {
		bubble.append("circle")
			.attr("r", radius)
			.attr("fill", "black");
	} else {
		const pie = d3.pie().value(d => d.count).sort((a, b) => context.layers.indexOf(b.layer) - context.layers.indexOf(a.layer));
		const arc = d3.arc().innerRadius(0).outerRadius(radius);

		bubble.selectAll("path")
			.data(pie(bubbleData))
			.enter()
			.append("path")
			.attr("d", arc)
			.attr("fill", d => d.data.valid ? `hsl(${d.data.hue}, 90%, 40%)` : "black");
	}

	clasz.signal = createSignal();
	clasz.signal.connect(context.infoPanel.renderInfo.bind(context.infoPanel));
	clasz.signal.connect(context.arrowRenderer);

	const circle = bubble.append("circle")
		.attr("class", "shine")
		.attr("r", radius)
		.attr("fill", "url(#gradient)");

	return bubble;
};

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

	const calculateProportion = (arr) => (dominantLayers) => {
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

	const getBubbleData = getBubbleDataWithContext(context);
	const dominatingLayers = dominatingLayersWithContext(context);

	const claszList = classesOf(pkg);  // Get all clasz objects

	claszList.forEach((cls) => {
		cls.property("package", pkg);
	});

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

	const result = {
		package: pkg,
		dominant,
		bubbleTeaData: averageCounts,
		bubbleData: data
	};

	return result;
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

const createShadow = (svg) => {
	const defs = svg.select("defs");
	const filter = defs.append("filter")
		.attr("id", "dropShadow")
		.attr("x", "-50%")
		.attr("y", "-50%")
		.attr("width", "200%")
		.attr("height", "200%");

	// Create the shadow blur
	filter.append("feGaussianBlur")
		.attr("in", "SourceAlpha")
		.attr("stdDeviation", 32) // Soft blur for the shadow
		.attr("result", "blur");

	// Offset the shadow
	filter.append("feOffset")
		.attr("in", "blur")
		.attr("dx", 0) // Horizontal offset
		.attr("dy", 16) // Vertical offset
		.attr("result", "offsetBlur");

	// Add a slight gradient to the shadow color
	filter.append("feFlood")
		.attr("flood-color", "rgba(0, 0, 0, 0.25)") // Subtle black with opacity
		.attr("result", "shadowColor");

	filter.append("feComposite")
		.attr("in", "shadowColor")
		.attr("in2", "offsetBlur")
		.attr("operator", "in")
		.attr("result", "coloredShadow");

	// Merge the shadow with the original graphic
	filter.append("feMerge")
		.selectAll("feMergeNode")
		.data(["coloredShadow", "SourceGraphic"])
		.enter()
		.append("feMergeNode")
		.attr("in", d => d);

};

const createHighlighter = (svg) => {
	const defs = svg.select("defs");
	const filter = defs.append("filter")
		.attr("id", "highlight")
		.attr("x", "-50%")
		.attr("y", "-50%")
		.attr("width", "200%")
		.attr("height", "200%");

	// Create a morphology-based outline (halo)
	filter.append("feMorphology")
		.attr("in", "SourceGraphic")
		.attr("operator", "dilate")
		.attr("radius", 5)
		.attr("result", "expanded");

	// Add a blur to the expanded region
	filter.append("feGaussianBlur")
		.attr("in", "expanded")
		.attr("stdDeviation", 2) // Adjust for more or less blur
		.attr("result", "blurredHalo");

	// Color the halo
	filter.append("feFlood")
		.attr("flood-color", "hsl(30, 100%, 50%)")
		.attr("flood-opacity", 1)
		.attr("result", "haloColor");

	// Combine the halo color with the blurred outline
	filter.append("feComposite")
		.attr("in", "haloColor")
		.attr("in2", "blurredHalo")
		.attr("operator", "in")
		.attr("result", "halo");

	// Merge the halo and the original graphic
	filter.append("feMerge")
		.selectAll("feMergeNode")
		.data(["halo", "SourceGraphic"])
		.enter()
		.append("feMergeNode")
		.attr("in", d => d);

};

// Helper function to create SVG gradients
const createGradient = (svg) => {
	const defs = svg.select("defs");
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
const drawLayoutContainer = (width, height, bubbleRadius, padding, fill, stroke) => {
	const bottomCornerRadius = 20;
	const g = d3.create("svg:g");
	g.append("rect")
		.attr("x", padding / 2)
		.attr("y", padding / 2)
		.attr("width", width - padding)
		.attr("height", bubbleRadius)
		.attr("fill", stroke)
		.attr("stroke", stroke)
		.attr("stroke-width", "2pt");

	g.append("path")
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
		.attr("stroke", stroke)
		.attr("stroke-width", "2pt");
	return g;
};

// Main function to create the bubble tea layout
const drawBubbleTeaWithContext = (context) => (bubbleTeaData) => {
	const compare = layerCompositionComparatorWithContext(context);
	const drawBubble = drawBubbleWithContext(context);
	const { package: pkg, dominant, bubbleData: data } = bubbleTeaData;

	if (data.length === 0) return null;

	const pkgName = pkg.property("simpleName");
	const bubbleRadius = 20;
	const padding = 10;

	// Calculate positions and layout dimensions
	const positions = calculatePositions(data.length, bubbleRadius, padding);
	const { layoutWidth, layoutHeight } = calculateLayoutDimensions(positions, bubbleRadius, padding);

	// Create SVG container
	// const svg = d3.create("svg");
	const g = d3.create("svg:g");

	// Draw layout container with calculated dimensions
	const my_hue = average(dominant.map(stringToHue));
	const fill = "hsl(24, 46%, 86%)";//dominant.length > 0 ? `hsl(${my_hue}, 60%, 80%)` : "hsl(0, 0%, 80%)";
	const stroke = dominant.length > 0 ? `hsl(${my_hue}, 50%, 30%)` : "hsl(0, 0%, 30%)";
	const pkgG = drawLayoutContainer(layoutWidth, layoutHeight, bubbleRadius, padding, fill, stroke);
	g
		.attr("class", "tea")
		.attr("id", pkg.id())
		.style("pointer-events", "all")
		.datum(pkg);
	g.node().appendChild(pkgG.node());
	// Sort and map bubble data to draw pie charts
	data
		.sort((a, b) => compare(a.bubbleData)(b.bubbleData))
		.forEach((d, index) => {
			const [xPos, yPos] = positions[index];
			const bubble = drawBubble(d);
			g.node().appendChild(bubble.node());
			d3.select(bubble.node())
				.attr("transform", `translate(${xPos}, ${yPos})`);
		});

	// Add package name text
	g.append("text")
		.attr("x", layoutWidth / 2)
		.attr("y", 0)
		.attr("text-anchor", "middle")
		.style("font-size", "20px")
		.text(pkgName);

	const pkgLayer = dominant.length == 0 ? "Cross-cutting" : dominant.join(", ");
	pkg.property("layer", pkgLayer);
	data.forEach(({ class: clasz, bubbleData }) => {
		const clsDominant = dominatingLayersWithContext(context)(bubbleData);
		const clsLayer = clsDominant.length == 0 ? "Cross-cutting" : clsDominant.join(", ");
		clasz.property("layer", clsLayer);
	});

	pkg.signal = createSignal();
	pkg.signal.connect(context.infoPanel.renderInfo.bind(context.infoPanel));
	pkg.signal.connect(context.arrowRenderer);

	return g;
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
	layerOrder.forEach(layer => (layers[layer.join(", ")] = []));

	// Categorize bubbleTeaData objects into layers based on `dominant`
	bubbleTeaDataArray.forEach(bubbleTeaData => {
		const key = bubbleTeaData.dominant.sort((a, b) => context.layers.indexOf(a) - context.layers.indexOf(b)).join(", ");
		if (key in layers) { 
			layers[key].push(bubbleTeaData); 
		} else { 
			bubbleTeaData.dominant = [];
			layers[''].push(bubbleTeaData); 
		}
	});

	const svgWidth = 1200;
	let tableWidth = svgWidth;
	const bubbleSpacing = 30; // Spacing between bubble groups

	let totalHeight = 0;

	const servingTable = d3.create("svg");
	const servingTableG = servingTable
		.append("g")
		.attr("id", "serving-table")
		.attr("x", 0)
		.attr("y", 0);
	// .attr("width", tableWidth);


	servingTable.append("defs");
	// Create gradient
	createShadow(servingTable);
	createGradient(servingTable);
	createHighlighter(servingTable);

	let grey_area = null;
	let grey_height = 0;
	if ("" in layers) {
		// draw the cross-cutting first
		const layerName = "Cross-cutting";
		const items = layers[""];

		if (items.length > 0) {

			const layer_group = servingTableG.insert("g", ":first-child")
				.attr("x", 0)
				.attr("y", 0);

			const fill = "hsl(0, 0%, 95%)";
			const stroke = "hsl(0, 0%, 40%)";

			// Render each item in this layer
			const bboxes = [];
			const groups = items.map(drawBubbleTea).filter(e => e != null).map(tea => {
				const bbox = measureSvgContent(tea);
				bboxes.push(bbox);
				return tea;
			});

			if (bboxes.length > 0) {
				const layerWidth = max(bboxes.map(b => b.width)) + 2 * bubbleSpacing;

				let yOffset = 2 * bubbleSpacing;

				layer_group
					.attr("transform", `translate(${tableWidth - layerWidth}, 0)`);

				groups.forEach((g, i) => {
					servingTableG.node().append(g.node());
					const bbox = bboxes[i];
					g.attr("transform", `translate(${(tableWidth - layerWidth) + (layerWidth - bbox.width) / 2}, ${yOffset + bubbleSpacing / 2})`);
					yOffset += bbox.height + bubbleSpacing;
				});

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
	Object.entries(layers).filter(([layerName, _]) => layerName).forEach(([layerName, items]) => {
		if (items.length === 0) return;

		const layer_group = servingTableG.insert("g", ":first-child")
			.attr("x", 0)
			.attr("y", 0);

		const layerNames = layerName ? layerName.split(", ") : [];
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
		const groups = items.map(drawBubbleTea).filter(e => e != null).map(tea => {

			const bbox = measureSvgContent(tea);
			bboxes.push(bbox);
			return tea;
		});

		const maxTeaHeight = max(bboxes.map(b => b.height));

		const layerHeight = maxTeaHeight + 2 * bubbleSpacing;

		let xOffset = bubbleSpacing;
		let yOffset = layerHeight;
		const layerOffset = totalHeight;

		layer_group
			.attr("transform", `translate(0, ${totalHeight})`);
		totalHeight += layerHeight + bubbleSpacing;

		groups.forEach((g, i) => {
			servingTableG.node().append(g.node());
			const bbox = bboxes[i];
			if (xOffset + bbox.width + bubbleSpacing > tableWidth) {
				xOffset = bubbleSpacing;
				yOffset += layerHeight;
				totalHeight += layerHeight;
			}
			g.attr("transform", `translate(${xOffset - bbox.x}, ${layerOffset + yOffset - maxTeaHeight + bubbleSpacing / 2})`);
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

	servingTableG.insert("rect", ":first-child")
		.attr("x", 0)
		.attr("y", 0)
		.attr("width", tableWidth)
		.attr("height", final_height)
		.attr("fill", last_rect.attr("fill"));

	if (grey_area) grey_area.attr("height", final_height);

	servingTableG
		.attr("x", 0)
		.attr("y", 0)
		.attr("width", svgWidth)
		.attr("height", final_height)
		.attr("filter", "url(#dropShadow)");

	return servingTable;
}

function measureSvgContent(g) {
	// Create an off-screen container
	const offscreenDiv = d3.select("body")
		.append("div")
		.attr("id", "dummy")
		.style("position", "absolute")
		.style("visibility", "hidden");

	// Append the SVG string to the container
	const svg = offscreenDiv.append("svg");
	const gClone = g.node().cloneNode(true);
	svg.node().appendChild(gClone);

	// Measure dimensions
	const bbox = svg.node().getBBox();

	// Clean up
	offscreenDiv.remove();

	return bbox;
}

const infoPanelPrototype = {
	initializePanel(element, context) {
		this.element = element;
		this.context = context;
	},
	prepareRenderData(nodeInfo) {
		const renderData = {
			title: `${nodeInfo.property("kind")}: ${nodeInfo.property("simpleName").replace(/([A-Z])/g, '\u200B$1')}`,
			properties: []
		};

		if (nodeInfo.hasProperty("qualifiedName")) {
			renderData.properties.push({
				key: "qualifiedName",
				value: nodeInfo.property("qualifiedName")
					.replace(/\./g, '.\u200B')
					.replace(/([A-Z])/g, '\u200B$1')
			});
		}

		if (nodeInfo.hasProperty("description")) {
			const d = d3.create('div');
			if (nodeInfo.hasProperty("title")) {
				d.append('p').append('b').text(nodeInfo.property("title"));
			}
			d.append('p').text(nodeInfo.property("description"));
			renderData.properties.push({
				key: "description",
				value: d.node().innerHTML
					.replace(/\./g, '.\u200B')
					.replace(/([A-Z])/g, '\u200B$1')
			});
		}

		const keys = ["docComment", "keywords", "layer", "roleStereotype", "dependencyProfile"];
		for (let key of keys) {
			if (nodeInfo.hasProperty(key)) {
				const property = {
					key: key,
					value: nodeInfo.property(key)
				};

				const hueKey = key + "Hues";
				if ((hueKey) in this.context && nodeInfo.property(key) in this.context[hueKey]) {
					property.style = `color: hsl(${this.context[hueKey][nodeInfo.property(key)]}, 100%, 30%); font-weight: bold;`;
				}

				renderData.properties.push(property);
			}
		}

		if (nodeInfo.hasLabel("Structure")) {
			const methods = [...methodsOf(nodeInfo)];
			methods.sort((a, b) => a.property("simpleName").localeCompare(b.property("simpleName")));

			renderData.properties.push({
				key: "methods",
				value: methods.map(m => {
					const d = d3.create('div');
					d.append('h3')
						.attr("class", "info")
						.text(m.property("simpleName"));

					d.append('div')
						.attr("class", "info")
						.attr("style", m.property("layer") ? `background-color: hsl(${stringToHue(m.property("layer"))}, 100%, 95%);` : null)
						.html(m.property("description"));


					return d.node().outerHTML;
				})
			});
		} else if (nodeInfo.hasLabel("Container")) {

			const incoming_tmp = nodeInfo.sources("dependsOn");
			const outgoing_tmp = nodeInfo.targets("dependsOn");

			const both = incoming_tmp.filter(item => outgoing_tmp.includes(item));
			const outgoing = outgoing_tmp.filter(item => !both.includes(item));
			const incoming = incoming_tmp.filter(item => !both.includes(item));

			const both_edges = both.map((n) => [
				nodeInfo._meta._graph.edges("dependsOn").find((e) => e.source().id() === n.id() && e.target().id() === nodeInfo.id()),
				nodeInfo._meta._graph.edges("dependsOn").find((e) => e.target().id() === n.id() && e.source().id() === nodeInfo.id())
			]);
			const incoming_edges = nodeInfo._meta._graph.edges("dependsOn", (e) => e.target().id() === nodeInfo.id() && incoming.map(n => n.id()).includes(e.source().id()));
			const outgoing_edges = nodeInfo._meta._graph.edges("dependsOn", (e) => e.source().id() === nodeInfo.id() && outgoing.map(n => n.id()).includes(e.target().id()));

			if (incoming_edges.length > 0) {
				renderData.properties.push({
					key: "incomingDependencies",
					value: incoming_edges.map(e => {
						const d = d3.create('div');
						d.append('h3')
							.attr("class", "info")
							.text(e.source().property("qualifiedName"));

						d.append('div')
							.attr("class", "info")
							.html(e.property("description"));


						return d.node().outerHTML;
					}),
					style: "background-color: hsl(120, 100%, 95%);"
				});
			}
			if (both_edges.length > 0) {
				renderData.properties.push({
					key: "coDependencies",
					value: both_edges.map(([e1, e2]) => {
						const d = d3.create('div');
						d.append('h3')
							.attr("class", "info")
							.text(e1.source().property("qualifiedName"));

						const innerd = d.append('div')
							.attr("class", "info");

						innerd.append("p")
							.html(e1.property("description"));
						innerd.append("p")
							.html(e2.property("description"));

						return d.node().outerHTML;
					}),
					style: "background-color: hsl(43, 100%, 95%);"
				});
			}
			if (outgoing_edges.length > 0) {
				renderData.properties.push({
					key: "outgoingDependencies",
					value: outgoing_edges.map(e => {
						const d = d3.create('div');
						d.append('h3')
							.attr("class", "info")
							.text(e.target().property("qualifiedName"));

						d.append('div')
							.attr("class", "info")
							.html(e.property("description"));


						return d.node().outerHTML;
					}),
					style: "background-color: hsl(240, 100%, 95%);"
				});
			}
		}

		return renderData;
	},
	renderInfo(nodeInfo) {
		const renderData = this.prepareRenderData(nodeInfo);

		this.element.innerHTML = "";
		const element = d3.select(this.element);

		// Render the title
		element.append('h2').html(renderData.title);

		// Render the properties
		const ul = element.append("ul");

		renderData.properties.forEach(prop => {
			const li = ul.append("li").attr("class", "info");

			li.append('h3')
				.attr("class", "info")
				.text(prop.key);

			const propContainer = li.append('div').attr("class", "info");

			if (prop.style) {
				propContainer.attr("style", prop.style);
			}

			if (Array.isArray(prop.value)) {
				// Nested list for arrays
				const innerUl = propContainer.append("ul");
				prop.value.forEach(item => {
					const innerLi = innerUl.append("li").attr("class", "info");
					innerLi.html(item);
				});
			} else {
				// Simple property value
				propContainer.html(prop.value);
			}
		});
	}
};

const createInfoPanel = (context) => (element) => {
	const panel = Object.create(infoPanelPrototype);
	panel.initializePanel(element, context);
	return panel;
};

function getIntersectionPoint(source, target) {
	const dx = target.cx - source.cx;
	const dy = target.cy - source.cy;
	const slope = dy / dx;

	let ix = target.cx; // intersection x
	let iy = target.cy; // intersection y

	if (Math.abs(dy) * target.width > Math.abs(dx) * target.height) {
		// Vertical intersection
		if (dy > 0) {
			iy = target.y; // top
		} else {
			iy = target.y + target.height; // bottom
		}
		ix = target.cx - dy / slope;
	} else {
		// Horizontal intersection
		if (dx > 0) {
			ix = target.x; // left
		} else {
			ix = target.x + target.width; // right
		}
		iy = target.cy - slope * dx;
	}

	return { x: ix, y: iy };
}

// Helper function to parse the transform string
function parseTransform(transform) {
	const translateMatch = /translate\(([^,]+),?([^,]*)\)/.exec(transform);
	const scaleMatch = /scale\(([^)]+)\)/.exec(transform);

	return {
		x: translateMatch ? parseFloat(translateMatch[1]) : 0,
		y: translateMatch && translateMatch[2] ? parseFloat(translateMatch[2]) : 0,
		k: scaleMatch ? parseFloat(scaleMatch[1]) : 1,
	};
}

function getTransformedPosition(g) {
	const bbox = g.node().getBBox(); // Get bounding box of the <g> element

	// Get the transformation matrix of the <g> element
	const { x, y, k } = parseTransform(g.attr("transform"));

	// Apply the transformation matrix to the bounding box to get actual position
	const transformedX = x + bbox.x * k;
	const transformedY = y + bbox.y * k;
	const transformedWidth = bbox.width * k;
	const transformedHeight = bbox.height * k;

	// Calculate the center based on the transformed position
	const center = {
		x: transformedX,
		y: transformedY,
		width: transformedWidth,
		height: transformedHeight,
		cx: transformedX + transformedWidth / 2,
		cy: transformedY + transformedHeight / 2
	};

	return center;
}

function bringToFront(selection) {
	selection.each(function () {
		this.parentNode.appendChild(this);
	});
}

function moveAfter(selection, reference) {
	const node = selection.node(); // The element to be moved
	const refNode = reference.node(); // The element to move after
	if (node && refNode && refNode.parentNode) {
		refNode.parentNode.insertBefore(node, refNode.nextSibling);
	}
}


function drawArrows(svg, source, dependencies) {

	// Find common elements between outgoing and incoming
	const both = dependencies.outgoing.filter(item => dependencies.incoming.includes(item));

	// Remove common elements from outgoing and incoming arrays
	const outgoing = dependencies.outgoing.filter(item => !both.includes(item));
	const incoming = dependencies.incoming.filter(item => !both.includes(item));

	const g = svg.select("g");
	const source_id = source.hasLabel("Structure") ? source.property("package").id() : source.id();
	const thisG = g.select(`g[id='${source_id}']`);
	const thisCenter = getTransformedPosition(thisG);

	g.selectAll(".dep-line").remove();

	// Draw outgoing arrows
	outgoing.forEach(node => {
		const targetG = g.select(`g[id='${node.id()}']`);
		if (!targetG.empty() && targetG.node() !== thisG.node()) {
			const targetCenter = getTransformedPosition(targetG);

			const line = g.append('line')
				.attr("class", "dep-line")
				.attr('x1', thisCenter.cx)
				.attr('y1', thisCenter.cy)
				.attr('x2', targetCenter.cx)
				.attr('y2', targetCenter.cy)
				.attr('stroke-width', '3pt')
				.attr('stroke-opacity', 0.5)
				.attr('stroke', 'blue');
			// .attr("stroke-dasharray", "21, 7")
			// .attr("stroke-dashoffset", 0);

			moveAfter(targetG, line);
		}
	});

	// Draw incoming arrows
	incoming.forEach(node => {
		const sourceG = g.select(`g[id='${node.id()}']`);
		if (!sourceG.empty() && sourceG.node() !== thisG.node()) {
			const sourceCenter = getTransformedPosition(sourceG);

			const line = g.append('line')
				.attr("class", "dep-line")
				.attr('x1', sourceCenter.cx)
				.attr('y1', sourceCenter.cy)
				.attr('x2', thisCenter.cx)
				.attr('y2', thisCenter.cy)
				.attr('stroke-width', '3pt')
				.attr('stroke-opacity', 0.5)
				.attr('stroke', 'green');
			// .attr("stroke-dasharray", "21, 7")
			// .attr("stroke-dashoffset", 0);

			moveAfter(sourceG, line);
		}
	});

	// Draw "both" arrows
	both.forEach(node => {
		const sourceG = g.select(`g[id='${node.id()}']`);
		if (!sourceG.empty() && sourceG.node() !== thisG.node()) {
			const sourceCenter = getTransformedPosition(sourceG);

			const line = g.append('line')
				.attr("class", "dep-line")
				.attr('x1', sourceCenter.cx)
				.attr('y1', sourceCenter.cy)
				.attr('x2', thisCenter.cx)
				.attr('y2', thisCenter.cy)
				.attr('stroke-width', '3pt')
				.attr('stroke-opacity', 0.6)
				.attr('stroke', 'goldenrod');

			moveAfter(sourceG, line);
		}
	});

	// d3.selectAll('line.dep-line').transition()
	// 	.duration(1000000)
	// 	.ease(d3.easeLinear)
	// 	.attr("stroke-dashoffset", -20000);

	bringToFront(thisG);
}

document.addEventListener('DOMContentLoaded', () => {
	function handleFileUpload(event) {
		const file = event.target.files[0];

		if (!file) {
			return;
		}

		const reader = new FileReader();

		reader.onload = function (e) {
			const jsonData = JSON.parse(e.target.result);
			if (jsonData && jsonData.elements && Array.isArray(jsonData.elements.nodes)) {

				document
					.getElementById("filename")
					.textContent = `BubbleTea 2.0 – ${file.name}`;

				const chartContainer = document.getElementById("chart-container");
				chartContainer.innerHTML = "";

				const invokes = jsonData.elements.edges.filter((e) => e.data.label === "invokes");
				const hasScript = jsonData.elements.edges.filter((e) => e.data.label === "hasScript");
				const calls = lift(hasScript, invokes, "calls").filter((e) => e.data.source !== e.data.target);
				jsonData.elements.edges = [...jsonData.elements.edges, ...calls];

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
				context.infoPanel = createInfoPanel(context)(document.getElementById("info-panel"));
				context.arrowRenderer = (nodeInfo) => {
					drawArrows(d3.select("svg"), nodeInfo, pkgDepsOf(nodeInfo));
				};


				const packages = context.graph.nodes(node => node.hasLabel("Container") && !node.hasLabel("Structure"));
				const getBubbleTeaData = getBubbleTeaDataWithContext(context);
				const drawServingTable = drawServingTableWithContext(context);

				const servingTable = drawServingTable(packages.map(getBubbleTeaData));

				if (servingTable) {

					const divWidth = chartContainer.clientWidth;
					const divHeight = chartContainer.clientHeight * 0.997;
					const g = servingTable.select("g");
					const svgWidth = g.attr("width");
					const scale = divWidth / svgWidth * 0.6;

					const zoom = d3.zoom().on('zoom', ({ transform }) => {
						g.attr('transform', transform);
					});

					servingTable
						.attr("width", divWidth)
						.attr("height", divHeight)
						.call(zoom);

					const initialTransform = d3.zoomIdentity.translate(divWidth * 0.2, 12).scale(scale);
					servingTable.call(zoom.transform, initialTransform);

					const resetZoom = document.createElement("button");
					resetZoom.id = "reset-zoom";
					resetZoom.textContent = "🧭";
					resetZoom.addEventListener("click", (_event) => {
						servingTable.call(zoom.transform, initialTransform);
					});

					chartContainer.appendChild(servingTable.node());
					chartContainer.appendChild(resetZoom);

					const resizeObserver = new ResizeObserver(entries => {
						for (let entry of entries) {
							if (entry.target === chartContainer) {
								servingTable
									.attr("width", entry.contentRect.width)
									.attr("height", entry.contentRect.height);
								initialTransform.x = entry.contentRect.width * 0.2;
								initialTransform.k = entry.contentRect.width / svgWidth * 0.6;
							}
						}
					});

					resizeObserver.observe(chartContainer);

					let lastSelection = null;

					d3.select("#serving-table").on("click", function (event) {
						d3.select(lastSelection).attr("filter", null);
						d3.selectAll(".dep-line").remove();
						lastSelection = null;
						document.getElementById("info-panel").innerHTML = "";
					});
					d3.selectAll(".bubble, .tea").on("click", function (event, d) {
						event.stopPropagation(); // Prevent interference from parent listeners
						d.signal.emit(d);
						d3.select(lastSelection).attr("filter", null);
						d3.select(this).attr("filter", "url(#highlight)");
						lastSelection = d3.select(this).node();
					});
					const tooltip = d3.select("#tooltip");
					d3.selectAll(".bubble, .tea")
						.on("mouseover", function (event, d) {
							// Show the tooltip and set its content
							event.stopPropagation(); // Prevent interference from parent listeners
							tooltip.style("display", "block")
								.html(`<strong>${d.hasLabel("Structure") ? d.property("simpleName") : d.property("qualifiedName")}</strong>`);
						})
						.on("mousemove", function (event) {
							// Position the tooltip near the mouse
							event.stopPropagation(); // Prevent interference from parent listeners
							tooltip.style("left", (event.pageX + 10) + "px")
								.style("top", (event.pageY + 10) + "px");
						})
						.on("mouseout", function () {
							// Hide the tooltip
							event.stopPropagation(); // Prevent interference from parent listeners
							tooltip.style("display", "none");
						});
				}
				// });
			} else {
				alert("The JSON does not contain the expected structure.");
			}
		};

		reader.readAsText(file);
	}

	document.getElementById('file-selector').addEventListener('change', handleFileUpload);

	document.getElementById('upload-button').addEventListener('click', () => {
		document.getElementById('file-selector').click();
	});
});

const resizer = document.querySelector(".resizer");
const leftPane = document.querySelector("#chart-container");
const rightPane = document.querySelector("#sidebar");

// Handle the dragging
resizer.addEventListener("mousedown", (e) => {
	document.body.style.cursor = "ew-resize";
	document.body.style.userSelect = "none";

	const startX = e.clientX;
	const startSidebarWidth = rightPane.offsetWidth;

	const onMouseMove = (e) => {
		const dx = -(e.clientX - startX);
		const newSidebarWidth = Math.min(480, Math.max(240, startSidebarWidth + dx));
		rightPane.style.width = `${newSidebarWidth}px`;
		leftPane.style.width = `calc(100vw - ${newSidebarWidth}px)`;
	};

	const onMouseUp = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	};

	document.addEventListener("mousemove", onMouseMove);
	document.addEventListener("mouseup", onMouseUp);
});
