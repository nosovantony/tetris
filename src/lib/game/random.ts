// Mulberry32 with explicit uint32 state. No Date, Math.random or platform APIs.
export function nextRandom(state: number): { state: number; value: number } {
	const next = (state + 0x6d2b79f5) >>> 0;
	let t = Math.imul(next ^ (next >>> 15), 1 | next);
	t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
	return { state: next, value: (t ^ (t >>> 14)) >>> 0 };
}
