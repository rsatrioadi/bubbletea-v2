/**
 * domUtils.js
 * 
 * A collection of DOM-specific utility functions, mostly for working with
 * SVG elements and their transforms.
 */

// ---- parseTransform ------------------------------------------------------

/**
 * Parses a transform attribute string and extracts the translate and scale values.
 * Example transform string: "translate(100, 200) scale(1.5)"
 * 
 * @param {string} transform - The transform string from an SVG element (e.g. g.attr("transform")).
 * @returns {{ x: number, y: number, k: number }} - The translation x, y, and scale k values.
 */
export function parseTransform(transform) {
	// Fallback if the attribute is missing or invalid
	if (!transform || typeof transform !== 'string') {
		return { x: 0, y: 0, k: 1 };
	}

	// Extract translate components
	const translateMatch = /translate\(([^,]+),?\s*([^,)]*)\)/.exec(transform);
	let x = 0, y = 0;
	if (translateMatch) {
		x = parseFloat(translateMatch[1]);
		y = translateMatch[2] !== '' ? parseFloat(translateMatch[2]) : 0;
	}

	// Extract scale component
	const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
	const k = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

	return { x, y, k };
}

// ---- setTransform --------------------------------------------------------

/**
 * Sets the transform of an SVG element using translate and scale.
 * This is an optional helper if you want to standardize how you apply transforms.
 * 
 * @param {d3.Selection} selection - The D3 selection for the element to transform.
 * @param {number} x - The x translation.
 * @param {number} y - The y translation.
 * @param {number} k - The scale factor.
 */
export function setTransform(selection, x, y, k = 1) {
	selection.attr('transform', `translate(${x}, ${y}) scale(${k})`);
}

// ---- translateElement ----------------------------------------------------

/**
 * Applies only a translation (no scaling) to the given selection.
 * 
 * @param {d3.Selection} selection - The D3 selection for the element to translate.
 * @param {number} x - The x translation.
 * @param {number} y - The y translation.
 */
export function translateElement(selection, x, y) {
	selection.attr('transform', `translate(${x}, ${y})`);
}

// ---- getTransformedPosition ---------------------------------------------

/**
 * Returns the actual position and size of an SVG <g> element after 
 * applying its transform. Useful for computing connector lines, etc.
 * 
 * @param {d3.Selection} g - A D3 selection for the <g> element.
 * @returns {Object} - An object with { x, y, width, height, cx, cy }
 *    where (x, y) is the top-left corner in screen coordinates,
 *    (cx, cy) is the center, and width/height are scaled dimensions.
 */
export function getTransformedPosition(g) {
	// Get bounding box of the <g> contents (untransformed)
	const bbox = g.node().getBBox ? g.node().getBBox() : { x: 0, y: 0, width: 0, height: 0 };

	// Parse out the transform (translate, scale)
	const { x: tx, y: ty, k } = parseTransform(g.attr("transform"));

	// Apply the transform to the bounding box
	const transformedX = tx + bbox.x * k;
	const transformedY = ty + bbox.y * k;
	const transformedWidth = bbox.width * k;
	const transformedHeight = bbox.height * k;

	// Calculate the center
	const cx = transformedX + transformedWidth / 2;
	const cy = transformedY + transformedHeight / 2;

	return {
		x: transformedX,
		y: transformedY,
		width: transformedWidth,
		height: transformedHeight,
		cx,
		cy
	};
}

// ---- bringToFront -------------------------------------------------------

/**
 * Moves an SVG element to the front of its parent container, 
 * so it is rendered on top of siblings.
 * 
 * @param {d3.Selection} selection - The D3 selection for the element to bring forward.
 */
export function bringToFront(selection) {
	selection.each(function () {
		if (this.parentNode) {
			this.parentNode.appendChild(this);
		}
	});
}

// ---- moveAfter ----------------------------------------------------------

/**
 * Moves 'selection' element in the DOM tree so it follows 'reference' element.
 * 
 * @param {d3.Selection} selection - The D3 selection to move.
 * @param {d3.Selection} reference - The D3 selection after which 'selection' should be placed.
 */
export function moveAfter(selection, reference) {
	const node = selection.node();
	const refNode = reference.node();
	if (node && refNode && refNode.parentNode) {
		refNode.parentNode.insertBefore(node, refNode.nextSibling);
	}
}

// ---- getOffsetPosition --------------------------------------------------

/**
 * (Optional) If you need to get the offset position of a DOM element
 * relative to the page (not purely an SVG transform). 
 * 
 * @param {HTMLElement} elem - The DOM element to measure.
 * @returns {{ left: number, top: number }}
 */
export function getOffsetPosition(elem) {
	const rect = elem.getBoundingClientRect();
	return {
		left: rect.left + window.scrollX,
		top: rect.top + window.scrollY
	};
}
