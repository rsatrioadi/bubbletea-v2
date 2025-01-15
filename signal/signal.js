export const SignalPrototype = {
	connect(slot) {
		this.slots.add(slot);
	},
	disconnect(slot) {
		this.slots.delete(slot);
	},
	emit(data) {
		this.slots.forEach(slot => slot(data));
	}
};

export const createSignal = () => {
	const signal = Object.create(SignalPrototype);
	signal.slots = new Set();
	return signal;
};
