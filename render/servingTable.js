import { drawBubbleTeaWithContext } from "./bubbleTeaRender.js";
import { average, max, stringToHue } from "../utils/utils.js";
import { createGradient, createHighlighter, createShadow } from './layoutUtils.js';

export const drawServingTableWithContext = (context) => (bubbleTeaDataArray) => {

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

export function measureSvgContent(g) {
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
