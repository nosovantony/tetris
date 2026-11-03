import { PIECES } from './constants';
import { nextRandom } from './random';
import type { BagState, PieceType } from './types';

export function createBag(seed: number): BagState {
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
		throw new RangeError('Seed must be a uint32');
	}
	return { randomState: seed, remaining: [] };
}

export function drawPiece(bag: BagState): PieceType {
	if (!bag.remaining.length) {
		bag.remaining = [...PIECES];
		for (let i = 6; i > 0; i--) {
			const bound = i + 1;
			const limit = 0x100000000 - (0x100000000 % bound);
			let value: number;
			do {
				const next = nextRandom(bag.randomState);
				bag.randomState = next.state;
				value = next.value;
			} while (value >= limit); // Rejection sampling avoids modulo bias.
			const j = value % bound;
			[bag.remaining[i], bag.remaining[j]] = [bag.remaining[j], bag.remaining[i]];
		}
	}
	return bag.remaining.pop()!;
}
