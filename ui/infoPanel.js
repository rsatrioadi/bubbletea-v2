import { methodsOf } from '../model/nodes.js';
import { stringToHue } from '../utils/utils.js';

const infoPanelPrototype = {
	initializePanel(element, context) {
		this.element = element;
		this.context = context;
	},
	prepareRenderData(nodeInfo) {
		const renderData = {
			title: `${nodeInfo.property("kind")}: ${nodeInfo.property("simpleName").replace(/([A-Z])/g, '\u200B$1')}`,
			properties: []
		};

		if (nodeInfo.hasProperty("qualifiedName")) {
			renderData.properties.push({
				key: "qualifiedName",
				value: nodeInfo.property("qualifiedName")
					.replace(/\./g, '.\u200B')
					.replace(/([A-Z])/g, '\u200B$1')
			});
		}

		if (nodeInfo.hasProperty("description")) {
			const d = d3.create('div');
			if (nodeInfo.hasProperty("title")) {
				d.append('p').append('b').text(nodeInfo.property("title"));
			}
			d.append('p').text(nodeInfo.property("description"));
			renderData.properties.push({
				key: "description",
				value: d.node().innerHTML
					.replace(/\./g, '.\u200B')
					.replace(/([A-Z])/g, '\u200B$1')
			});
		}

		const keys = ["docComment", "keywords", "layer", "roleStereotype", "dependencyProfile"];
		for (let key of keys) {
			if (nodeInfo.hasProperty(key)) {
				const property = {
					key: key,
					value: nodeInfo.property(key)
				};

				const hueKey = key + "Hues";
				if ((hueKey) in this.context && nodeInfo.property(key) in this.context[hueKey]) {
					property.style = `color: hsl(${this.context[hueKey][nodeInfo.property(key)]}, 100%, 30%); font-weight: bold;`;
				}

				renderData.properties.push(property);
			}
		}

		if (nodeInfo.hasLabel("Structure")) {
			const methods = [...methodsOf(nodeInfo)];
			methods.sort((a, b) => a.property("simpleName").localeCompare(b.property("simpleName")));

			renderData.properties.push({
				key: "methods",
				value: methods.map(m => {
					const d = d3.create('div');
					d.append('h3')
						.attr("class", "info")
						.text(m.property("simpleName"));

					d.append('div')
						.attr("class", "info")
						.attr("style", m.property("layer") ? `background-color: hsl(${stringToHue(m.property("layer"))}, 100%, 95%);` : null)
						.html(m.property("description"));


					return d.node().outerHTML;
				})
			});
		} else if (nodeInfo.hasLabel("Container")) {

			const incoming_tmp = nodeInfo.sources("dependsOn");
			const outgoing_tmp = nodeInfo.targets("dependsOn");

			const both = incoming_tmp.filter(item => outgoing_tmp.includes(item));
			const outgoing = outgoing_tmp.filter(item => !both.includes(item));
			const incoming = incoming_tmp.filter(item => !both.includes(item));

			const both_edges = both.map((n) => [
				nodeInfo._meta._graph.edges("dependsOn").find((e) => e.source().id() === n.id() && e.target().id() === nodeInfo.id()),
				nodeInfo._meta._graph.edges("dependsOn").find((e) => e.target().id() === n.id() && e.source().id() === nodeInfo.id())
			]);
			const incoming_edges = nodeInfo._meta._graph.edges("dependsOn", (e) => e.target().id() === nodeInfo.id() && incoming.map(n => n.id()).includes(e.source().id()));
			const outgoing_edges = nodeInfo._meta._graph.edges("dependsOn", (e) => e.source().id() === nodeInfo.id() && outgoing.map(n => n.id()).includes(e.target().id()));

			if (incoming_edges.length > 0) {
				renderData.properties.push({
					key: "incomingDependencies",
					value: incoming_edges.map(e => {
						const d = d3.create('div');
						d.append('h3')
							.attr("class", "info")
							.text(e.source().property("qualifiedName"));

						d.append('div')
							.attr("class", "info")
							.html(e.property("description"));


						return d.node().outerHTML;
					}),
					style: "background-color: hsl(120, 100%, 95%);"
				});
			}
			if (both_edges.length > 0) {
				renderData.properties.push({
					key: "coDependencies",
					value: both_edges.map(([e1, e2]) => {
						const d = d3.create('div');
						d.append('h3')
							.attr("class", "info")
							.text(e1.source().property("qualifiedName"));

						const innerd = d.append('div')
							.attr("class", "info");

						innerd.append("p")
							.html(e1.property("description"));
						innerd.append("p")
							.html(e2.property("description"));

						return d.node().outerHTML;
					}),
					style: "background-color: hsl(43, 100%, 95%);"
				});
			}
			if (outgoing_edges.length > 0) {
				renderData.properties.push({
					key: "outgoingDependencies",
					value: outgoing_edges.map(e => {
						const d = d3.create('div');
						d.append('h3')
							.attr("class", "info")
							.text(e.target().property("qualifiedName"));

						d.append('div')
							.attr("class", "info")
							.html(e.property("description"));


						return d.node().outerHTML;
					}),
					style: "background-color: hsl(240, 100%, 95%);"
				});
			}
		}

		return renderData;
	},
	renderInfo(nodeInfo) {
		const renderData = this.prepareRenderData(nodeInfo);

		this.element.innerHTML = "";
		const element = d3.select(this.element);

		// Render the title
		element.append('h2').html(renderData.title);

		// Render the properties
		const ul = element.append("ul");

		renderData.properties.forEach(prop => {
			const li = ul.append("li").attr("class", "info");

			li.append('h3')
				.attr("class", "info")
				.text(prop.key);

			const propContainer = li.append('div').attr("class", "info");

			if (prop.style) {
				propContainer.attr("style", prop.style);
			}

			if (Array.isArray(prop.value)) {
				// Nested list for arrays
				const innerUl = propContainer.append("ul");
				prop.value.forEach(item => {
					const innerLi = innerUl.append("li").attr("class", "info");
					innerLi.html(item);
				});
			} else {
				// Simple property value
				propContainer.html(prop.value);
			}
		});
	}
};

export const createInfoPanel = (context) => (element) => {
	const panel = Object.create(infoPanelPrototype);
	panel.initializePanel(element, context);
	return panel;
};
