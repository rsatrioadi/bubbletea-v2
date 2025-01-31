// Function to hash a string into a hue value between 0 and 359
export var hueMap = {
	'Presentation Layer': 0,
	'Service Layer': 50,
	'Domain Layer': 120,
	'Data Source Layer': 240,
};

export const stringToHue = (str) => {

	// Fallback hashing function if not in hueMap
	const hashHue = (s) => {
		const hash = [...s].reduce(
			(acc, char) => (acc << 5) - acc + char.charCodeAt(0),
			0
		);
		// Map hash to a limited range (0..359). 
		return Math.abs(hash) % 18 * 20;
	};

	return hueMap[str] ?? hashHue(str);
};

// Returns a function that checks if array b is equal to array a
export const arraysEqual = (a) => (b) =>
	a.length === b.length && a.every((val, i) => val === b[i]);

// Sum an array of numbers
export const sum = (arr) => arr.reduce((acc, val) => acc + val, 0);

// Compute the average of an array of numbers
export const average = (arr) => (arr.length ? sum(arr) / arr.length : 0);

// Return the maximum value of an array
export const max = (arr) =>
	arr.reduce((acc, val) => (val > acc ? val : acc), -Infinity);
