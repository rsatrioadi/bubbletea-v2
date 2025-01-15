// Node Prototype
const nodePrototype = {
	id() {
		return this.data.id;
	},
	labels() {
		if (this.data.labels === undefined) {
			this.data.labels = [];
		}
		return this.data.labels;
	},
	hasLabel(label) {
		return this.data.labels.includes(label);
	},
	addLabel(label) {
		if (!this.hasLabel(label)) {
			this.data.labels.push(label);
		}
		return this;
	},
	removeLabel(label) {
		const index = this.data.labels.indexOf(label);
		if (index !== -1) {
			this.data.labels.splice(index, 1);
		}
		return this;
	},
	replaceLabel(oldLabel, newLabel) {
		const index = this.data.labels.indexOf(oldLabel);
		if (index !== -1) {
			this.data.labels[index] = newLabel;
		}
		return this;
	},
	hasProperty(key) {
		return (key in this.data.properties);
	},
	property(key, value = undefined) {
		if (this.data.properties === undefined) {
			this.data.properties = {};
		}
		if (value === undefined) {
			return this.data.properties[key];
		} else if (value === null) {
			delete this.data.properties[key];
			return this;
		} else {
			this.data.properties[key] = value;
			return this;
		}
	},
	sources(edgeLabel) {
		if (!this._meta._sources || !(edgeLabel in this._meta._sources)) {
			const source_nodes = this._meta._graph.edges(edgeLabel, (e) => e.target().id() === this.id())
				.map((e) => e.source());
			this._meta._sources[edgeLabel] = source_nodes;
		}
		return this._meta._sources[edgeLabel];
	},
	targets(edgeLabel) {
		if (!this._meta._targets || !(edgeLabel in this._meta._targets)) {
			const target_nodes = this._meta._graph.edges(edgeLabel, (e) => e.source().id() === this.id())
				.map((e) => e.target());
			this._meta._targets[edgeLabel] = target_nodes;
		}
		return this._meta._targets[edgeLabel];
	}
};

// Edge Prototype
const edgePrototype = {
	label(newLabel = undefined) {
		if (newLabel === undefined) {
			return this.data.label;
		} else {
			this.data.label = newLabel;
			return this;
		}
	},
	property(key, value = undefined) {
		if (this.data.properties === undefined) {
			this.data.properties = {};
		}
		if (value === undefined) {
			return this.data.properties[key];
		} else if (value === null) {
			delete this.data.properties[key];
			return this;
		} else {
			this.data.properties[key] = value;
			return this;
		}
	},
	source() {
		if (this._meta._source === undefined && this.data.source) {
			// direct map lookup
			this._meta._source = this._meta._graph._meta._nodes[this.data.source] ?? null;
		}
		return this._meta._source;
	},
	target() {
		if (this._meta._target === undefined && this.data.target) {
			this._meta._target = this._meta._graph._meta._nodes[this.data.target] ?? null;
		}
		return this._meta._target;
	}
};

// Graph Prototype
const graphPrototype = {
	addNode(nodeData) {
		if (!nodeData.id) {
			throw new Error('Node must have an "id" property');
		}

		// Check if the node ID already exists in this graph
		if (this._meta._nodes[nodeData.id]) {
			console.warn(`Node with id "${nodeData.id}" already exists. Overwriting...`);
		}

		// Initialize the node's _meta structure, if not present
		nodeData._meta = nodeData._meta || {};

		// Attach the node prototype, referencing this graph
		attachNode(nodeData, this);

		// Add to the array of nodes in the graph
		this.elements.nodes.push(nodeData);

		// Store in the node map by ID for fast lookup
		this._meta._nodes[nodeData.id] = nodeData;

		return nodeData;
	},
	addEdge(sourceNode, targetNode, edgeLabel) {
		// sourceNode/targetNode might be objects or IDs. If IDs, look up the node:
		const sNode = typeof sourceNode === 'string' ? this.node(sourceNode) : sourceNode;
		const tNode = typeof targetNode === 'string' ? this.node(targetNode) : targetNode;

		// Create the new edge object
		const edge = {
			data: {
				label: edgeLabel,
				source: sNode.id(),
				target: tNode.id(),
				properties: {}
			},
			_meta: {}
		};

		// Attach the edge prototype and add to the graph
		attachEdge(edge, this);
		this.elements.edges.push(edge);

		// Update the edges map
		if (!this._meta._edges[edgeLabel]) {
			this._meta._edges[edgeLabel] = [];
		}
		this._meta._edges[edgeLabel].push(edge);

		// ---- Invalidate cached sources/targets for the two nodes ----
		// So next time node.sources(...) or node.targets(...) is called, it recalculates.
		if (sNode && sNode._meta) {
			sNode._meta._sources = {};
			sNode._meta._targets = {};
		}
		if (tNode && tNode._meta) {
			tNode._meta._sources = {};
			tNode._meta._targets = {};
		}

		return edge;
	},
	node(nodeId) {
		return this._meta._nodes[nodeId];
	},
	nodes(predicate) {
		if (predicate) {
			return Object.values(this._meta._nodes).filter(predicate); // Use the nodes map for fast access
		}
		return this.elements.nodes;
	},
	edges(label, predicate) {
		if (label) {
			if (predicate) {
				return (this._meta._edges[label]??[]).filter(predicate);
			} else {
				return this._meta._edges[label]??[];
			}
		} else if (predicate) {
			return Object.values(this._meta._edges).flat().filter(predicate); // Use the edges map for fast access
		}
		return Object.values(this._meta._edges).flat();
	}
};

// Utility to attach node prototype
export const attachNode = (node, graph) => {
	node._meta = {};
	Object.setPrototypeOf(node, nodePrototype);
	graph._meta._nodes[node.id()] = node;
	node._meta._graph = graph;
	node._meta._sources = {};
	node._meta._targets = {};
};

// Utility to attach edge prototype
export const attachEdge = (edge, graph) => {
	edge._meta = {};
	Object.setPrototypeOf(edge, edgePrototype);
	if (!(edge.label() in graph._meta._edges)) {
		graph._meta._edges[edge.label()] = [];
	}
	graph._meta._edges[edge.label()].push(edge); // Store in the map
	edge._meta._graph = graph;
	edge._meta._source = undefined;
	edge._meta._target = undefined;
};

// Utility to create and attach the graph prototype
export const createGraph = (graphData = { elements: { nodes: [], edges: [] } }) => {
	Object.setPrototypeOf(graphData, graphPrototype);

	// Initialize meta structure for nodes and edges
	graphData._meta = {
		_nodes: {}, // Map of node IDs to node objects
		_edges: {}  // Map of edge labels to arrays of edges
	};

	// Populate the nodes map
	graphData.elements.nodes.forEach((node) => {
		attachNode(node, graphData);
	});

	// Populate the edges map
	graphData.elements.edges.forEach((edge) => {
		attachEdge(edge, graphData);
	});

	return graphData;
};

export const invert = (edgeList) =>
	edgeList.map(e => e.data).map(({ source, target, label, ...rest }) => ({
		data: {
			source: target,
			target: source,
			label: `inv_${label}`,
			...rest,
		}
	}));

/**
 * buildMapping:
 *   - Creates a Map keyed by "source" from the second edge list (l2).
 *   - Each entry is an array of { target, label, weight }.
 */
function buildMapping(l2) {
	const mapping = new Map();

	for (const { data: { source, target, label, properties } } of l2) {
		const weight = properties?.weight !== undefined ? properties.weight : 1;
		if (!mapping.has(source)) {
			mapping.set(source, []);
		}
		mapping.get(source).push({ target, label, weight });
	}

	return mapping;
}

/**
 * composeEdges:
 *   - Uses the mapping from l2 to connect edges from l1.
 *   - Aggregates weights in a Map for same source-target pairs.
 *
 * @param {Array} l1 - Array of edges (first relationship).
 * @param {Map} mapping - Output of buildMapping(l2).
 * @param {String} newlabel - Optional new label for the composed edges.
 * @returns {Array} - Composed edges (each with data: { source, target, label, properties }).
 */
function composeEdges(l1, mapping, newlabel) {
	const aggregatedEdges = new Map(); // key => edge object

	for (const { data: { source: s1, target: t1, label, properties } } of l1) {
		// Look up possible connections for t1 in the mapping
		const connections = mapping.get(t1);
		if (!connections) continue;

		for (const { target, label: secondLabel, weight: secondWeight } of connections) {
			const combinedWeight = secondWeight * (properties?.weight ?? 1);
			const key = `${s1}-${target}`; // unique key for aggregated pair

			if (!aggregatedEdges.has(key)) {
				// Create a new edge
				aggregatedEdges.set(key, {
					data: {
						source: s1,
						target,
						label: newlabel || `${label}-${secondLabel}`,
						properties: { weight: combinedWeight },
					}
				});
			} else {
				// Update existing edge's weight
				aggregatedEdges.get(key).data.properties.weight += combinedWeight;
			}
		}
	}

	return Array.from(aggregatedEdges.values());
}

/**
 * compose:
 *   - Composes two lists of edges (l1, l2) by chaining edges from l1 into edges from l2,
 *     multiplying weights, and optionally applying a new label.
 *
 * @param {Array} l1 - Array of edges (first relationship).
 * @param {Array} l2 - Array of edges (second relationship).
 * @param {String} newlabel - Optional label for new edges.
 * @returns {Array} - The composed edges.
 */
export const compose = function (l1, l2, newlabel) {
	if (!Array.isArray(l1) || !Array.isArray(l2)) {
		return [];
	}

	const mapping = buildMapping(l2);

	return composeEdges(l1, mapping, newlabel);
};


export const lift = function (rel1, rel2, newlabel) {
	return compose(compose(rel1, rel2), invert(rel1), newlabel);
};
