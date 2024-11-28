// Function to hash a string into a hue value between 0 and 359
export const stringToHue = (str) => {
	const hueMap = {
		'Presentation Layer': 0,
		'Service Layer': 50,
		'Domain Layer': 120,
		'Data Source Layer': 240,
	};

	const getHashHue = (s) =>
		Math.abs(
			[...s].reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0)
		) % 18 * 20;

	return hueMap[str] ?? getHashHue(str);
};

export const arraysEqual = (a) => (b) =>
	a.length === b.length && a.every((val, i) => val === b[i]);

export const sum = (arr) => arr.reduce((acc, val) => acc + val, 0);

export const average = (arr) => arr.length ? sum(arr) / arr.length : 0;

export const max = (arr) => arr.reduce((acc, val) => (val > acc ? val : acc), -Infinity);
