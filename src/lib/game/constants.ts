import type { PieceType, Point, Rotation } from './types';

export const BOARD_WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
export const HIDDEN_ROWS = 2;
export const BOARD_HEIGHT = VISIBLE_HEIGHT + HIDDEN_ROWS;
export const TICKS_PER_SECOND = 60;
export const MAX_TICKS = 3 * 60 * 60 * TICKS_PER_SECOND;
export const MAX_LOCK_RESETS = 15;
export const MAX_ACTIONS_PER_TICK = 32;
export const PIECES: readonly PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const SPAWN: Record<PieceType, readonly Point[]> = {
	I: [
		[0, 1],
		[1, 1],
		[2, 1],
		[3, 1]
	],
	J: [
		[0, 0],
		[0, 1],
		[1, 1],
		[2, 1]
	],
	L: [
		[2, 0],
		[0, 1],
		[1, 1],
		[2, 1]
	],
	O: [
		[1, 0],
		[2, 0],
		[1, 1],
		[2, 1]
	],
	S: [
		[1, 0],
		[2, 0],
		[0, 1],
		[1, 1]
	],
	T: [
		[1, 0],
		[0, 1],
		[1, 1],
		[2, 1]
	],
	Z: [
		[0, 0],
		[1, 0],
		[1, 1],
		[2, 1]
	]
};

// Integer coordinates; I rotates around (1.5, 1.5), JLSTZ around (1, 1).
function rotationsFor(type: PieceType): readonly (readonly Point[])[] {
	const rotations: Point[][] = [SPAWN[type].map(([x, y]) => [x, y])];
	for (let r = 1; r < 4; r++) {
		rotations.push(
			type === 'O'
				? rotations[0]
				: rotations[r - 1].map(([x, y]): Point => [(type === 'I' ? 3 : 2) - y, x])
		);
	}
	return rotations;
}

const SHAPES: Record<PieceType, readonly (readonly Point[])[]> = {
	I: rotationsFor('I'),
	J: rotationsFor('J'),
	L: rotationsFor('L'),
	O: rotationsFor('O'),
	S: rotationsFor('S'),
	T: rotationsFor('T'),
	Z: rotationsFor('Z')
};

export function shape(type: PieceType, rotation: Rotation): readonly Point[] {
	return SHAPES[type][rotation];
}
