function nodeName(node) {
	return node.data.properties.simpleName;
}

function nodeId(node) {
	return node.data.id;
}


function classes(graph, pkg) {
	// Step 1: Collect the target node IDs from edges where source is clasz.data.id and label is "hasScript"
	const targetIds = graph.elements.edges
		.filter(edge => edge.data.source === pkg.data.id && edge.data.label === "contains")
		.map(edge => edge.data.target);  // Collect the target IDs

	// Step 2: Find the nodes in graph.elements.nodes whose IDs match the target node IDs
	const targetNodes = graph.elements.nodes
		.filter(node => targetIds.includes(node.data.id))  // Filter nodes whose ID is in the targetIds array
		.filter(node => node.data.labels.includes("Structure"));

	return targetNodes;  // Return the array of target nodes
}

function methods(graph, clasz) {
	// Step 1: Collect the target node IDs from edges where source is clasz.data.id and label is "hasScript"
	const targetIds = graph.elements.edges
		.filter(edge => edge.data.source === clasz.data.id && edge.data.label === "hasScript")
		.map(edge => edge.data.target);  // Collect the target IDs

	// Step 2: Find the nodes in graph.elements.nodes whose IDs match the target node IDs
	const targetNodes = graph.elements.nodes
		.filter(node => targetIds.includes(node.data.id));  // Filter nodes whose ID is in the targetIds array

	return targetNodes;  // Return the array of target nodes
}

function layer(graph, method) {
	// In a later version, the implementation may change and involve graph, so let the parameter there.
	return method.data.properties.layer;
}

// Function to hash a string into a hue value between 0 and 359
function stringToHue(str) {
	switch (str) {
		case 'Presentation Layer': return 0;
		case 'Service Layer': return 50;
		case 'Domain Layer': return 120;
		case 'Data Source Layer': return 240;
		default: {
			let hash = 0;
			for (let i = 0; i < str.length; i++) {
				hash = (hash << 5) - hash + str.charCodeAt(i);  // Basic hash function
				hash = hash & hash; // Convert to 32-bit integer
			}
			return (Math.abs(hash) % 18) * 20; // Ensure the hue is between 0 and 359
		}
	}
}

function getBubbleData(graph, clasz) {

	// console.log(clasz.data.id);
	// Retrieve and analyze methods from the clasz object
	const methodList = methods(graph, clasz);

	// Create an object to store counts of each unique layer type
	const layerCounts = {};

	methodList.forEach(method => {
		const layerType = layer(graph, method);  // Get the layer type of the current method

		// console.log(method.data.id + ": " + layerType);
		if (layerCounts[layerType] === undefined) {
			layerCounts[layerType] = 0;  // Initialize the count for this layer type if not already
		}

		// Increment the count for the corresponding layer type
		layerCounts[layerType]++;
	});

	// Convert the layerCounts object into an array for D3 to use in the pie chart
	const data = Object.keys(layerCounts).map(layerType => {
		const hue = stringToHue(layerType);  // Hash the layer name to a hue value

		const result = {
			layer: layerType,
			count: layerCounts[layerType],
			hue
		};
		// console.log(result);
		return result;
	});
	return {class:clasz, bubbleData:data};
}

function dominatingLayers(layers) {
	return function(bubbleData) {
		if (bubbleData.length < 1) return [];

		// Find the top two highest counts
		let max1 = -Infinity, max2 = -Infinity;
		let layer1 = null, layer2 = null;

		for (const { count, layer } of bubbleData) {
			if (count > max1) {
				max2 = max1; // max2 becomes previous max1
				layer2 = layer1;
				max1 = count;
				layer1 = layer;
			} else if (count > max2) {
				max2 = count;
				layer2 = layer;
			}
		}

		if (max2 === -Infinity) {
			// Only one element in the array
			return [layer1];
		}

		// Check the dominance condition
		if (max1 > 1.5 * max2) {
			return [layer1];
		}

		// If there are only two layers or both max1 and max2 are dominant over any others
		if (bubbleData.length === 2 || bubbleData.some(({ count }) => count * 1.5 < max1)) {
			if (Math.abs(layers.indexOf(layer1)-layers.indexOf(layer2))<2) {
				return [layer1, layer2];
			}
		}

		return [];
	}
}

// Function to draw the pie chart for a given clasz object
function drawBubble(data) {

	const {class:clasz,bubbleData} = data;

	// console.log(bubbleData);
	// Set up the pie chart
	const width = 30;
	const radius = width / 2;

		// Create an SVG circle
		const svg = d3.create("svg")
			.attr("width", width+5)
			.attr("height", width+5)
			.append("g")
			.attr("transform", `translate(${(width+5) / 2}, ${(width+5) / 2})`);

		svg.append("circle")
			.attr("r", radius+5/2)
			.attr("fill-opacity", 0.3)
			.attr("fill", "black"); // Fill the circle with black

	// If methodList is empty, return a black circle
	if (bubbleData.length === 0) {

		svg.append("circle")
			.attr("r", radius)
			.attr("fill", "black"); // Fill the circle with black


		svg.append("circle")
			.attr("r", radius)
			.attr("fill", "url(#gradient)");

		return svg.node();  // Return the black circle
	}

	const pie = d3.pie().value(d => d.count).sort((a, b) => LAYERS.indexOf(b.layer) - LAYERS.indexOf(a.layer));
	const arc = d3.arc().innerRadius(0).outerRadius(radius);

	svg.selectAll("path")
		.data(pie(bubbleData))
		.enter()
		.append("path")
		.attr("d", arc)
		.attr("fill", d=> `hsl(${d.data.hue}, 90%, 40%)`);

	svg.append("circle")
		.attr("r", radius)
		.attr("fill", "url(#gradient)");

	return svg.node();  // Return the pie chart SVG element
}

const LAYERS = [null, 'Presentation Layer', 'Service Layer', 'Domain Layer', 'Data Source Layer'];

function arraysEqual(arr1, arr2) {
	if (arr1.length !== arr2.length) {
		return false; // If lengths are different, arrays are not equal
	}

	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i]) {
			return false; // If any element is different, arrays are not equal
		}
	}

	return true; // Arrays are equal if no differences found
}

function layerCompositionComparator(layers) {
	return function (a, b) {
		const da = dominatingLayers(layers)(a);
		const db = dominatingLayers(layers)(b);

		let ia, ib;

		if (arraysEqual(da, db)) {
			ib = a.filter((layer) => da.includes(layer.layer)).map((layer) => layer.count).reduce((acc, cur) => acc + cur, 0) /
				a.map((layer) => layer.count).reduce((acc, cur) => acc + cur, 0);
			ia = b.filter((layer) => db.includes(layer.layer)).map((layer) => layer.count).reduce((acc, cur) => acc + cur, 0) /
				b.map((layer) => layer.count).reduce((acc, cur) => acc + cur, 0);
		} else {
			ia = (da.length == 0 ? 100 : da.length == 1 ? layers.indexOf(da[0]) : (layers.indexOf(da[0]) + layers.indexOf(da[1])) / 2);
			ib = (db.length == 0 ? 100 : db.length == 1 ? layers.indexOf(db[0]) : (layers.indexOf(db[0]) + layers.indexOf(db[1])) / 2);
		}

		return ia - ib;
	}
}

// function getBubbleTeaData(graph,pkg) {
// TODO separate from drawBubbleTea
// }

function average(arr) {
	if (arr.length === 0) return 0; // Handle empty array case
	const sum = arr.reduce((acc, val) => acc + val, 0);
	return sum / arr.length;
}


function drawBubbleTea(graph, pkg) {

	const claszList = classes(graph, pkg);  // Get all clasz objects
	const pkgName = nodeName(pkg);  // Get the package name

	const data = claszList.map((clasz) => getBubbleData(graph, clasz));

	if (data.length == 0) {
		return null;
	}

	const pkgBubbleData = data.map(d => {
		const totalCount = d.bubbleData.reduce((sum, e) => sum + e.count, 0);
		return d.bubbleData.map(e => ({
			layer: e.layer,
			count: e.count / totalCount // Calculate normalized count
		}));
	});

	const uniqueLayers = Array.from(
		new Set(
			data
				.map(d => d.bubbleData)
				.flat(2)                // Flatten the array to a single level
				.map(e => e.layer)       // Map to extract only the 'layer' property
				.filter(layer => layer != null)  // Exclude null and undefined values
		)
	);

	const averageCounts = uniqueLayers.map(layer => {
		const layerData = pkgBubbleData.flat(2).filter(e => e.layer === layer);
		const totalCount = layerData.reduce((sum, e) => sum + e.count, 0);
		const count = pkgBubbleData.length;
		const averageCount = count > 0 ? totalCount / count : 0;
		return { layer, count: averageCount };
	});

	const dominant = dominatingLayers(LAYERS)(averageCounts);

	// Define the number of rows and columns for the grid
	const numPies = data.length;
	const numCols = Math.ceil(Math.sqrt(numPies));  // Number of rows and columns (square-like grid)
	const twoRowNumCols = numCols * 2 - 1;
	const bubbleRadius = 30;
	const padding = 10;

	let positions = [];
	for (let index = 0; index < numPies; index++) {
		const drow = (index / twoRowNumCols) | 0;
		const irow = ((index % twoRowNumCols) / numCols) | 0;
		const x = bubbleRadius / 2 + padding * 1.5 + irow * ((bubbleRadius+padding) / 2) + (index % twoRowNumCols - irow * numCols) * (bubbleRadius + padding);
		const y = bubbleRadius * 2.5 + padding * 1.5 + (drow * 2 + irow) * (bubbleRadius + padding / 3);
		positions.push([x, y]);
	}
	let maxX = 0;
	let maxY = 0;
	for (let index = 0; index < positions.length; index++) {
		const element = positions[index];
		if (element[0] > maxX) maxX = element[0];
		if (element[1] > maxY) maxY = element[1];
	}
	maxX += bubbleRadius / 2 + padding * 1.5;
	maxY += bubbleRadius / 2 + padding * 1.5;
	// console.log(maxX, maxY);

	// Define dimensions for the overall layout
	const layoutWidth = maxX;
	const layoutHeight = maxY + 20;

	// Create an SVG container for the entire layout
	const svg = d3.create("svg")
		.attr("width", layoutWidth)
		.attr("height", layoutHeight);

	const defs = svg.append("svg:defs");

	const grad = defs
		.append("svg:radialGradient")
		.attr("gradientUnits", "objectBoundingBox")
		.attr("cx", "25%")
		.attr("cy", "25%")
		.attr("r", "100%")
		.attr("id", "gradient");

	grad.append("stop").attr("offset", "0%").style("stop-color", "rgba(255,255,255,0.7)");

	grad.append("stop").attr("offset", "75%").style("stop-color", "rgba(255,255,255,0)");

	const width = maxX;
	const height = maxY;
	const bottomCornerRadius = 20;
	svg.append("rect")
		.attr("x", padding/2)
		.attr("y", padding/2)
		.attr("width", width-padding)
		.attr("height", bubbleRadius)
		.attr("fill", "none")
		.attr("stroke", "black");
	svg.append("path")
		.attr("d", `
			M${padding / 2},${padding / 2+bubbleRadius}
			h${width - padding}
			v${height - bottomCornerRadius - padding - bubbleRadius}
			a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},${bottomCornerRadius}
			h-${width - 2 * bottomCornerRadius - padding}
			a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},-${bottomCornerRadius}
			V${padding / 2+bubbleRadius} Z
		`)
		.attr("fill", dominant.length>0?`hsl(${average(dominant.map(stringToHue))}, 70%, 81%)`:"hsl(0, 0%, 81%)")
		.attr("stroke", "black");

	// Calculate positions for each pie chart in a grid-like layout
	data.sort((a,b)=>layerCompositionComparator(LAYERS)(a.bubbleData,b.bubbleData));
	data.forEach((d, index) => {
		// console.log(pkgName, d);

		// Calculate the X and Y positions of each pie in the grid
		const xPos = positions[index][0];
		const yPos = positions[index][1];

		// Create and position each pie chart
		const pieChart = drawBubble(d);
		svg.node().appendChild(pieChart);  // Append the pie chart to the main SVG container

		// Position the pie chart at the calculated x, y
		d3.select(pieChart).attr("transform", `translate(${xPos}, ${yPos})`);
	});

	// Add the package name at the top
	svg.append("text")
		.attr("x", maxX / 2)
		.attr("y", padding/2+20)
		.attr("text-anchor", "middle")
		.style("font-size", "20px")
		.text(pkgName);

	return svg.node();
}


document.addEventListener('DOMContentLoaded', () => {
	// Function to handle file upload and extract the clasz object
	function handleFileUpload(event) {
		const file = event.target.files[0]; // Get the file selected by the user

		if (!file) {
			alert("Please select a JSON file.");
			return;
		}

		const reader = new FileReader();

		// When the file is read successfully, parse the JSON and extract the clasz object
		reader.onload = function (e) {
			// try {
				const jsonData = JSON.parse(e.target.result);
				if (jsonData && jsonData.elements && Array.isArray(jsonData.elements.nodes)) {
					// Filter the nodes where data.labels contains "Structure"
					const packages = jsonData.elements.nodes.filter(node => node.data.labels.includes("Container"));

					packages.forEach(pkgNode => {
						const svgNode = drawBubbleTea(jsonData, pkgNode);  // Call the function to draw the pie chart with clasz
						// Append the entire layout to the DOM (e.g., body or specific container)
						if (svgNode) document.getElementById("chart-container").appendChild(svgNode);
					});
				} else {
					alert("The JSON does not contain the expected structure.");
				}
			// } catch (err) {
			// 	alert("Error parsing the JSON file: " + err.message);
			// }
		};

		// Read the file as a text
		reader.readAsText(file);
	}

	// Attach the event listener to the file input
	document.getElementById('file-input').addEventListener('change', handleFileUpload);

	// Optionally, you can trigger the file input when the button is clicked (to give the user a clearer interface)
	document.getElementById('upload-button').addEventListener('click', () => {
		document.getElementById('file-input').click();  // Trigger file input click when the button is clicked
	});
});

