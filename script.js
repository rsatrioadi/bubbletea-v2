function name(node) {
	return node.data.properties.simpleName;
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
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);  // Basic hash function
		hash = hash & hash; // Convert to 32-bit integer
	}
	return (Math.abs(hash) % 18)*20; // Ensure the hue is between 0 and 359
}

// Function to draw the pie chart for a given clasz object
function drawPieChart(graph, clasz) {
	// console.log(clasz.data.id);
	// Retrieve and analyze methods from the clasz object
	const methodList = methods(graph, clasz);

	// Set up the pie chart
	const width = 30;
	const radius = width / 2;

	// If methodList is empty, return a black circle
	if (methodList.length === 0) {

		// Create an SVG circle
		const svg = d3.create("svg")
			.attr("width", width)
			.attr("height", width)
			.append("g")
			.attr("transform", `translate(${width / 2}, ${width / 2})`);

		svg.append("circle")
			.attr("r", radius)
			.attr("fill", "black"); // Fill the circle with black

		return svg.node();  // Return the black circle
	}

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
		const color = `hsl(${hue}, 80%, 40%)`;  // Apply HSL color formula
		const test = "hsl(80, 80%, 40%)"

		const result = {
			layer: layerType,
			count: layerCounts[layerType],
			color: color
		};
		// console.log(result);
		return result;
	});

	const svg = d3.create("svg")
		.attr("width", width)
		.attr("height", width)
		.append("g")
		.attr("transform", `translate(${width / 2}, ${width / 2})`);

	const pie = d3.pie().value(d => d.count).sort(null);
	const arc = d3.arc().innerRadius(0).outerRadius(radius);

	svg.selectAll("path")
		.data(pie(data))
		.enter()
		.append("path")
		.attr("d", arc)
		.attr("fill", d => d.data.color);

	return svg.node();  // Return the pie chart SVG element
}

function drawHoneycombLayout(graph, pkg) {
	const claszList = classes(graph, pkg);  // Get all clasz objects
	const pkgName = name(pkg);  // Get the package name

	// Define the number of rows and columns for the grid
	const numPies = claszList.length;
	const numCols = Math.ceil(Math.sqrt(numPies));  // Number of rows and columns (square-like grid)
	const twoRowNumCols = numCols * 2 - 1;
	const pieWidth = 30;
	const padding = 10;

	let positions = [];
	for (let index = 0; index < numPies; index++) {
		const drow = (index/twoRowNumCols)|0;
		const irow = ((index%twoRowNumCols)/numCols)|0;
		const x = pieWidth / 2 + padding*1.5 + irow * (pieWidth/2) + (index%twoRowNumCols - irow*numCols)*(pieWidth+padding);
		const y = pieWidth*2 + padding*1.5 + (drow * 2 + irow) * (pieWidth + padding/3);
		positions.push([x,y]);
	}
	let maxX = 0;
	let maxY = 0;
	for (let index = 0; index < positions.length; index++) {
		const element = positions[index];
		if (element[0]>maxX) maxX = element[0];
		if (element[1]>maxY) maxY = element[1];
	}
	maxX += pieWidth/2 + padding*1.5;
	maxY += pieWidth/2 + padding*1.5;
	console.log(maxX, maxY);

	// Define dimensions for the overall layout
	const layoutWidth = maxX;
	const layoutHeight = maxY + 20;

	// Create an SVG container for the entire layout
	const svg = d3.create("svg")
		.attr("width", layoutWidth)
		.attr("height", layoutHeight);

	const width = maxX;
	const height = maxY;
	const bottomCornerRadius = 10;
	svg.append("path")
		.attr("d", `
			M0,0
			h${width}
			v${height - bottomCornerRadius}
			a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},${bottomCornerRadius}
			h-${width - 2 * bottomCornerRadius}
			a${bottomCornerRadius},${bottomCornerRadius} 0 0 1 -${bottomCornerRadius},-${bottomCornerRadius}
			V0 Z
		`)
		.attr("fill", "hsl(22, 55%, 81%)")
		.attr("stroke", "black");

	// Calculate positions for each pie chart in a grid-like layout
	claszList.forEach((clasz, index) => {

		// Calculate the X and Y positions of each pie in the grid
		const xPos = positions[index][0];
		const yPos = positions[index][1];

		// Create and position each pie chart
		const pieChart = drawPieChart(graph, clasz);
		svg.node().appendChild(pieChart);  // Append the pie chart to the main SVG container

		// Position the pie chart at the calculated x, y
		d3.select(pieChart).attr("transform", `translate(${xPos}, ${yPos})`);
	});

	// Add the package name below the grid
	svg.append("text")
		.attr("x", maxX / 2)
		.attr("y", maxY + 20)
		.attr("text-anchor", "middle")
		.style("font-size", "20px")
		.text(pkgName);

	// Append the entire layout to the DOM (e.g., body or specific container)
	document.body.appendChild(svg.node());
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
			try {
				const jsonData = JSON.parse(e.target.result);
				if (jsonData && jsonData.elements && Array.isArray(jsonData.elements.nodes)) {
					// Filter the nodes where data.labels contains "Structure"
					const pkgNode = jsonData.elements.nodes.find(node =>
						node.data.id === "ca.mcgill.cs.stg.solitaire.model"
					);

					if (pkgNode) {
						drawHoneycombLayout(jsonData, pkgNode);  // Call the function to draw the pie chart with clasz
					} else {
						alert("No node with 'Structure' label found.");
					}
				} else {
					alert("The JSON does not contain the expected structure.");
				}
			} catch (err) {
				alert("Error parsing the JSON file: " + err.message);
			}
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

