export const showTooltip = (sel) => {
	return function(node) {
		d3.select(sel)
			.style('display', 'block')
			.html(`<strong>${node.hasLabel("Structure")
				? node.property("simpleName")
				: node.property("qualifiedName")
				}</strong>`);
	};
}

export const updateTooltipPosition = (sel) => { 
	return function () {
		d3.select(sel)
			.style('left', `${this.pageX + 10}px`)
			.style('top', `${this.pageY + 10}px`); 
	};
}

export const hideTooltip = (sel) => {
	return function () {
		d3.select(sel)
			.style('display', 'none');
	};
}