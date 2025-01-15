/**
 * model/nodes.js
 *
 * Domain-level (model) helpers for working with nodes in the graph.
 * These functions operate on node objects, using their .targets(), 
 * .sources(), and .property() methods.
 */

/**
 * Returns an object describing incoming and outgoing 'calls' edges 
 * for a given Structure-labeled node (a class).
 *
 * @param {Object} clasz - A node from the graph that presumably hasLabel("Structure").
 * @returns {{ outgoing: Array, incoming: Array }}
 */
export function classDepsOf(clasz) {
	return {
		outgoing: clasz.targets("calls"),   // classes this node calls
		incoming: clasz.sources("calls"),   // classes that call this node
	};
}

/**
 * Returns an object describing outgoing and incoming edges *by package*.
 * For example, if `node` is a class with label "Structure", it looks up 
 * the package property of the classes that are outgoing and incoming.
 * If `node` is a container with label "Container", it aggregates classDepsOf
 * for all classes inside that container.
 *
 * @param {Object} node - A node from the graph, can be "Structure" or "Container".
 * @returns {{ outgoing: Array, incoming: Array }}
 */
export function pkgDepsOf(node) {
	if (node.hasLabel("Structure")) {
		// A single class, collect unique packages from its deps
		const deps = classDepsOf(node);
		return {
			outgoing: [...new Set(deps.outgoing.map(n => n.property("package")))],
			incoming: [...new Set(deps.incoming.map(n => n.property("package")))],
		};
	} else if (node.hasLabel("Container")) {
		// A container, gather all class deps
		const allClasses = classesOf(node);  // e.g. "all structures inside the container"
		const aggregated = allClasses
			.map(classDepsOf)
			.reduce(
				(acc, { outgoing, incoming }) => {
					// Combine outgoing packages
					const nextOutgoing = outgoing.map(n => n.property("package"));
					acc.outgoing = [...new Set([...acc.outgoing, ...nextOutgoing])];

					// Combine incoming packages
					const nextIncoming = incoming.map(n => n.property("package"));
					acc.incoming = [...new Set([...acc.incoming, ...nextIncoming])];

					return acc;
				},
				{ outgoing: [], incoming: [] }
			);

		return aggregated;
	} else {
		// Not a recognized label, return empty
		return { outgoing: [], incoming: [] };
	}
}

/**
 * Returns all child structures (classes) of a given container node.
 * Typically used to gather classes of a package node with label "Container".
 *
 * @param {Object} pkg - A node from the graph, presumably hasLabel("Container").
 * @returns {Array} - An array of node objects with label "Structure".
 */
export function classesOf(pkg) {
	// We assume there's a "contains" edge label that links a container to the classes it holds
	return pkg.targets("contains").filter(n => n.hasLabel("Structure"));
}

/**
 * Returns all "method" nodes (or script nodes) of a given class node.
 *
 * @param {Object} clasz - A node from the graph, presumably hasLabel("Structure").
 * @returns {Array} - An array of node objects representing methods.
 */
export function methodsOf(clasz) {
	// We assume there's a "hasScript" edge label that links class -> method
	return clasz.targets("hasScript");
}

/**
 * Returns the layer property of a method node, or "Undefined" if not set.
 *
 * @param {Object} method - A node from the graph representing a method.
 * @returns {String} - The layer name if present, otherwise "Undefined".
 */
export function layerOf(method) {
	return method.property("layer") || "Undefined";
}
