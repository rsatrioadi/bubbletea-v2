import { createSignal } from '../signal/signal.js';

/**
 * drawBubbleWithContext(context)
 *   - returns a function that, given a data object { class, bubbleData },
 *     renders a <g> element containing either a pie chart or a single circle
 *     for the bubble, and attaches signals for interaction.
 *
 * @param {Object} context - your global context (layers, infoPanel, arrowRenderer, etc.)
 * @returns {(data: { class: Object, bubbleData: Array }) => d3.Selection<SVGGElement, unknown, null, undefined>}
 */
export function drawBubbleWithContext(context) {
	return (data) => {
		const { class: clasz, bubbleData } = data;

		// Basic bubble size
		const width = 20;
		const radius = width / 2;

		// Create a group for the bubble
		const bubble = d3.create('svg:g')
			.attr('class', 'bubble')
			.attr('id', clasz.id())
			.style('pointer-events', 'all')
			.datum(clasz);

		// A circle behind the pie slices (originally the role stereotype color, but now black for less clutter)
		const rsColor = 'black';
		bubble.append('circle')
			.attr('r', radius + 5 / 2)
			.attr('fill-opacity', 0.5)
			.attr('fill', rsColor);

		if (bubbleData.length === 0) {
			// If there's no bubbleData, just draw a black circle
			bubble.append('circle')
				.attr('r', radius)
				.attr('fill', 'black');
		} else {
			// Create a pie chart from bubbleData
			const pie = d3.pie()
				.value(d => d.count)
				.sort((a, b) => {
					// Sort slices in descending order by the layer's index in context.layers
					// or any custom sorting logic you prefer.
					return context.layers.indexOf(b.layer) - context.layers.indexOf(a.layer);
				});
			const arc = d3.arc().innerRadius(0).outerRadius(radius);

			bubble.selectAll('path')
				.data(pie(bubbleData))
				.enter()
				.append('path')
				.attr('d', arc)
				.attr('fill', d => d.data.valid
					? `hsl(${d.data.hue}, 90%, 40%)` // if valid, use hue
					: 'black'                       // if invalid, black
				);
		}

		// "Shine" circle with gradient fill
		bubble.append('circle')
			.attr('class', 'shine')
			.attr('r', radius)
			.attr('fill', 'url(#gradient)');

		return bubble;
	};
}
