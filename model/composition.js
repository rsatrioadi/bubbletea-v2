/**
 * model/composition.js
 *
 * Domain-level helpers for computing “bubble” data and layer compositions.
 * These functions rely on:
 *   - methodsOf, layerOf (from model/nodes.js)
 *   - arraysEqual, sum, average, max, etc. (from utils/utils.js)
 * 
 * Then the functions are used in your rendering layer (e.g., bubbleRender.js)
 * or other model files as needed.
 */

import { methodsOf, layerOf } from './nodes.js';
import { stringToHue, arraysEqual, sum } from '../utils/utils.js';

/**
 * getBubbleDataWithContext(context):
 *   - Returns a function that, given a class node, computes an array of
 *     { layer, count, valid, hue } objects, summarizing layer usage for
 *     that class's methods.
 *
 * @param {Object} context - Contains domain info like context.layers
 * @returns {(clasz: Object) => { class: Object, bubbleData: Array }}
 */
export function getBubbleDataWithContext(context) {
	return (clasz) => {
		const methodList = methodsOf(clasz);

		if (methodList.length > 0) {
			// Reduce to accumulate layer counts (Presentation, Service, etc.)
			const layerCounts = methodList.reduce((counts, method) => {
				const layerType = layerOf(method);
				counts[layerType] = (counts[layerType] || 0) + 1;
				return counts;
			}, {});

			// Turn layerCounts into an array of { layer, count, valid, hue }
			const bubbleData = Object.entries(layerCounts).map(([layerType, count]) => ({
				layer: layerType,
				count,
				valid: context.layers.includes(layerType),
				hue: stringToHue(layerType)
			}));

			return { class: clasz, bubbleData };
		} else {
			// Class has no methods, fallback to "Undefined" layer
			const bubbleData = [{
				layer: "Undefined",
				count: 1,
				valid: false,
				hue: 0
			}];
			return { class: clasz, bubbleData };
		}
	};
}

/**
 * dominatingLayersWithContext(context):
 *   - Returns a function that, given bubbleData, computes the one or two
 *     top-occurring layers. Logic includes tie-breaking and threshold checks.
 *
 * @param {Object} context - The context with context.layers
 * @returns {(bubbleData: Array) => Array<String>}
 */
export function dominatingLayersWithContext(context) {
	return (bubbleData) => {
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

		// If there's only one or it strongly dominates, return just [layer1].
		if (max2 === -Infinity) {
			return [layer1];
		}
		if (max1 > 1.5 * max2) {
			return [layer1];
		}

		// If exactly 2 bubbleData or if some data is quite small,
		// consider returning [layer1, layer2].
		if (bubbleData.length === 2 || bubbleData.some(({ count }) => count * 1.5 < max1)) {
			if (Math.abs(layers.indexOf(layer1) - layers.indexOf(layer2)) < 2) {
				return [layer1, layer2];
			}
		}

		return [];
	};
}

/**
 * layerCompositionComparatorWithContext(context):
 *   - Returns a higher-order comparator function that can compare two
 *     sets of bubbleData based on their dominating layers and proportions.
 *
 * @param {Object} context - The context with context.layers
 * @returns {(aBubbleData: Array) => (bBubbleData: Array) => number}
 */
export function layerCompositionComparatorWithContext(context) {
	const { layers } = context;
	const dominatingLayers = dominatingLayersWithContext(context);

	// Helper to compute a numerical "layer dominance score"
	const calculateDominanceScore = (dominantLayers) => {
		if (dominantLayers.length === 0) return 100;  // fallback
		if (dominantLayers.length === 1) {
			return layers.indexOf(dominantLayers[0]);
		}
		// If two layers, average their indices
		return (layers.indexOf(dominantLayers[0]) + layers.indexOf(dominantLayers[1])) / 2;
	};

	// Helper to calculate proportion of dominant layers in the bubbleData
	const calculateProportion = (arr) => (dominantLayers) => {
		const total = sum(arr.map(layer => layer.count));
		const dominantCount = sum(
			arr.filter(layer => dominantLayers.includes(layer.layer)).map(layer => layer.count)
		);
		return dominantCount / total;
	};

	return (aBubbleData) => (bBubbleData) => {
		const da = dominatingLayers(aBubbleData);
		const db = dominatingLayers(bBubbleData);

		// If same dominating layers, compare by proportion
		if (arraysEqual(da)(db)) {
			const ia = calculateProportion(aBubbleData)(da);
			const ib = calculateProportion(bBubbleData)(db);
			return ib - ia; // descending order by proportion
		}

		// Otherwise compare by dominance score
		const ia = calculateDominanceScore(da);
		const ib = calculateDominanceScore(db);
		return ia - ib; // ascending order by score
	};
}
