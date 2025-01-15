/**
 * model/bubbleTeaData.js
 *
 * Domain-level helper for summarizing packages (containers) into
 * "bubble tea data": average counts, dominant layers, etc.
 */

import { classesOf } from './nodes.js';
import {
	getBubbleDataWithContext,
	dominatingLayersWithContext
} from './composition.js';

/**
 * getBubbleTeaDataWithContext(context)
 *   - Returns a function that, given a package node, calculates:
 *       1) bubble data for each class inside
 *       2) normalized (package-level) average counts of each layer
 *       3) overall dominant layer(s) for the package
 *
 * @param {Object} context - Typically includes .layers and references to other config
 * @returns {(pkg: Object) => Object} - A function that, when given a package node,
 *          returns an object { package, dominant, bubbleTeaData, bubbleData }
 */
export function getBubbleTeaDataWithContext(context) {
	// Return a function so we can do partial application with `context`
	return (pkg) => {
		const getBubbleData = getBubbleDataWithContext(context);
		const dominatingLayers = dominatingLayersWithContext(context);

		// Step 1: find all class nodes within the package
		const claszList = classesOf(pkg);

		// Step 2: mark each class with a "package" property referencing this pkg
		claszList.forEach((cls) => {
			cls.property("package", pkg);
		});

		// Step 3: For each class, compute its bubble data
		const data = claszList.map((clasz) => getBubbleData(clasz));

		// Step 4: For each class's bubbleData, compute proportion of each layer
		//    e.g. normalizing counts so they add up to 1
		const pkgBubbleData = data.map(({ bubbleData }) => {
			const totalCount = bubbleData.reduce((acc, e) => acc + e.count, 0);
			return bubbleData.map(e => ({
				layer: e.layer,
				count: totalCount > 0 ? e.count / totalCount : 0
			}));
		});

		// Step 5: Gather all layers used by classes
		const uniqueLayers = Array.from(
			new Set(
				data
					.map(d => d.bubbleData)
					.flat(2)
					.map(e => e.layer)
					.filter(layer => layer != null)
			)
		);

		// Step 6: Compute average (normalized) usage for each layer across all classes
		const averageCounts = uniqueLayers.map(layer => {
			const layerData = pkgBubbleData.flat(2).filter(e => e.layer === layer);
			const totalCount = layerData.reduce((acc, e) => acc + e.count, 0);
			const count = pkgBubbleData.length; // number of classes
			const averageCount = count > 0 ? totalCount / count : 0;
			return { layer, count: averageCount };
		});

		// Step 7: Determine which layer(s) dominate overall package usage
		const dominant = dominatingLayers(averageCounts);

		// Step 8: Return a final object describing the package's bubble tea data
		return {
			package: pkg,
			dominant,
			bubbleTeaData: averageCounts, // average usage by layer across the package
			bubbleData: data              // array of per-class bubbleData
		};
	};
}
