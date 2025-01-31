import { layerCompositionComparatorWithContext, dominatingLayersWithContext } from '../model/composition.js';
import { drawBubbleWithContext } from './bubbleRender.js';
import { average, stringToHue } from '../utils/utils.js';
import { createSignal } from '../signal/signal.js';
import { calculatePositions, calculateLayoutDimensions, drawLayoutContainer } from './layoutUtils.js';

/**
 * drawBubbleTeaWithContext(context)
 *   - Returns a function that, given one "bubbleTeaData" object, renders
 *     a labeled container holding multiple bubbles (pie charts),
 *     sorted and arranged in a grid-like layout.
 *
 * @param {Object} context - Your global config object, e.g. { layers, arrowRenderer, infoPanel, ... }
 * @returns {(bubbleTeaData: Object) => d3.Selection<SVGGElement, unknown, null, undefined> | null}
 */
export function drawBubbleTeaWithContext(context) {
	// We do partial application: pass in 'context' first, get back a function
	return (bubbleTeaData) => {
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
	
		return g;
	};
}
