export function createTooltipManager(tooltipSelector) {
	// Grab the <div> or <span> used as the tooltip container
	const tooltip = d3.select(tooltipSelector);

	// Return an object with a "connect" method to tie into a signal
	return {
		/**
		 * connect(hoverSignal):
		 *   - Listens for "mouseover", "mousemove", "mouseout" events from the signal
		 *   - Updates the tooltip accordingly.
		 *
		 * Each 'emit' to hoverSignal can pass an object like:
		 *   { type: 'mouseover' | 'mousemove' | 'mouseout', event, node }
		 */
		connect(hoverSignal) {
			hoverSignal.connect(({ type, event, node }) => {
				switch (type) {
					case 'mouseover':
						// Show the tooltip and set initial HTML content
						tooltip
							.style('display', 'block')
							.html(`<strong>${node.hasLabel("Structure")
									? node.property("simpleName")
									: node.property("qualifiedName")
								}</strong>`);
						break;
					case 'mousemove':
						// Update tooltip position
						tooltip
							.style('left', `${event.pageX + 10}px`)
							.style('top', `${event.pageY + 10}px`);
            			break;
					case 'mouseout':
						// Hide the tooltip
						tooltip.style('display', 'none');
						break;
				}
			});
		}
	};
}
