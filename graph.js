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
			const nodes = this._meta._graph.nodes();
			this._meta._source = null;
			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				if (node.id() === this.data.source) {
					this._meta._source = node;
					break;
				}
			}
		}
		return this._meta._source;
	},
	target() {
		if (this._meta._target === undefined && this.data.target) {
			const nodes = this._meta._graph.nodes();
			this._meta._target = null;
			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				if (node.id() === this.data.target) {
					this._meta._target = node;
					break;
				}
			}
		}
		return this._meta._target;
	}
};

// Graph Prototype
const graphPrototype = {
	addNode(nodeData) {
		nodeData._meta = {};
		attachNode(node, this);
		this.elements.nodes.push(node);

		// Update the nodes map
		this._meta._nodes[nodeData.id] = node;

		return node;
	},
	addEdge(sourceNode, targetNode, edgeLabel) {
		const edge = { data: { label: edgeLabel, source: sourceNode, target: targetNode, properties: {} }, _meta: {} };
		attachEdge(edge, this);
		this.elements.edges.push(edge);

		// Update the edges map
		if (!this._meta._edges[edgeLabel]) {
			this._meta._edges[edgeLabel] = [];
		}
		this._meta._edges[edgeLabel].push(edge);

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
	edges(label = undefined, predicate = undefined) {
		if (label) {
			if (predicate) {
				return this._meta._edges[label].filter(predicate);
			} else {
				return this._meta._edges[label];
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

export const compose = function (l1, l2, newlabel) {
	if (l1 && l2) {
		const mapping = new Map(
			l2.map(e => e.data).map((
				{ source, target, label, properties },
			) => [source, { target, label, weight: properties?.weight || 1 }]),
		);

		const result = [];
		const l1data = l1.map(e => e.data);
		for (const { source: s1, target: t1, label, properties } of l1data) {
			const mappingEntry = mapping.get(t1);

			if (mappingEntry) {
				const newWeight = mappingEntry.weight * (properties?.weight || 1);
				const existingEntryIndex = result.findIndex((obj) =>
					obj.data.source === s1 && obj.data.target === mappingEntry.target
				);

				if (existingEntryIndex === -1) {
					result.push({
						data: {
							source: s1,
							target: mappingEntry.target,
							label: newlabel || `${label}-${mappingEntry.label}`,
							properties: { weight: newWeight },
						}
					});
				} else {
					result[existingEntryIndex].data.properties.weight += newWeight;
				}
			}
		}

		return result;
	}
	return [];
}

export const lift = function (rel1, rel2, newlabel) {
	return compose(compose(rel1, rel2), invert(rel1), newlabel);
}
