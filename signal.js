export const SignalPrototype = {
	connect(slot) {
		this.slots.push(slot);
	},
	disconnect(slot) {
		this.slots = this.slots.filter(s => s !== slot);
	},
	emit(data) {
		this.slots.forEach(slot => slot(data));
	}
};

export const createSignal = () => {
	const signal = Object.create(SignalPrototype);
	signal.slots = []; // Initialize the slots array
	return signal;
}
