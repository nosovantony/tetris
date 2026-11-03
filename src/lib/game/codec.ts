import { ACTIONS, type ReplayEvent } from './types';
import { validateReplay, MAX_REPLAY_EVENTS } from './simulator';
import { MAX_TICKS } from './constants';

export const MAX_REPLAY_BYTES = 128 * 1024;
const MAGIC = [0x54, 0x52, 1]; // TR + codec version, independent of rulesVersion.

function writeUint(bytes: number[], value: number): void {
	do {
		const low = value % 128;
		value = Math.floor(value / 128);
		bytes.push(low | (value > 0 ? 128 : 0));
	} while (value > 0);
}

export function encodeReplay(events: readonly ReplayEvent[], durationTicks: number): Uint8Array {
	validateReplay(events, durationTicks);
	const bytes = [...MAGIC];
	writeUint(bytes, durationTicks);
	writeUint(bytes, events.length);
	let tick = 0;
	for (const event of events) {
		writeUint(bytes, event.tick - tick);
		bytes.push(ACTIONS.indexOf(event.action));
		tick = event.tick;
	}
	if (bytes.length > MAX_REPLAY_BYTES) throw new RangeError('Replay is too large');
	return Uint8Array.from(bytes);
}

export function decodeReplay(bytes: Uint8Array): { events: ReplayEvent[]; durationTicks: number } {
	if (bytes.length > MAX_REPLAY_BYTES || MAGIC.some((b, i) => bytes[i] !== b)) {
		throw new RangeError('Invalid replay header or size');
	}
	let cursor = MAGIC.length;
	function readUint(maximum: number): number {
		let value = 0;
		for (let i = 0; i < 5; i++) {
			if (cursor >= bytes.length) throw new RangeError('Truncated replay');
			const byte = bytes[cursor++];
			value += (byte & 127) * 2 ** (7 * i);
			if (value > maximum) throw new RangeError('Replay integer overflow');
			if (byte < 128) {
				if (i > 0 && byte === 0) throw new RangeError('Non-canonical LEB128');
				return value;
			}
		}
		throw new RangeError('Invalid LEB128');
	}
	const durationTicks = readUint(MAX_TICKS);
	const count = readUint(MAX_REPLAY_EVENTS);
	const events: ReplayEvent[] = [];
	let tick = 0;
	for (let i = 0; i < count; i++) {
		tick += readUint(MAX_TICKS);
		const id = readUint(ACTIONS.length - 1);
		events.push({ tick, action: ACTIONS[id] });
	}
	if (cursor !== bytes.length) throw new RangeError('Trailing replay bytes');
	validateReplay(events, durationTicks);
	return { events, durationTicks };
}
