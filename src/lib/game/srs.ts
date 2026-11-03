import type { PieceType, Point, Rotation } from './types';

// SRS source offsets use +y UP. Convert exactly once to the board's +y DOWN.
const JLSTZ: Record<string, readonly Point[]> = {
	'0>1': [
		[0, 0],
		[-1, 0],
		[-1, 1],
		[0, -2],
		[-1, -2]
	],
	'1>0': [
		[0, 0],
		[1, 0],
		[1, -1],
		[0, 2],
		[1, 2]
	],
	'1>2': [
		[0, 0],
		[1, 0],
		[1, -1],
		[0, 2],
		[1, 2]
	],
	'2>1': [
		[0, 0],
		[-1, 0],
		[-1, 1],
		[0, -2],
		[-1, -2]
	],
	'2>3': [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, -2],
		[1, -2]
	],
	'3>2': [
		[0, 0],
		[-1, 0],
		[-1, -1],
		[0, 2],
		[-1, 2]
	],
	'3>0': [
		[0, 0],
		[-1, 0],
		[-1, -1],
		[0, 2],
		[-1, 2]
	],
	'0>3': [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, -2],
		[1, -2]
	]
};
const I: Record<string, readonly Point[]> = {
	'0>1': [
		[0, 0],
		[-2, 0],
		[1, 0],
		[-2, -1],
		[1, 2]
	],
	'1>0': [
		[0, 0],
		[2, 0],
		[-1, 0],
		[2, 1],
		[-1, -2]
	],
	'1>2': [
		[0, 0],
		[-1, 0],
		[2, 0],
		[-1, 2],
		[2, -1]
	],
	'2>1': [
		[0, 0],
		[1, 0],
		[-2, 0],
		[1, -2],
		[-2, 1]
	],
	'2>3': [
		[0, 0],
		[2, 0],
		[-1, 0],
		[2, 1],
		[-1, -2]
	],
	'3>2': [
		[0, 0],
		[-2, 0],
		[1, 0],
		[-2, -1],
		[1, 2]
	],
	'3>0': [
		[0, 0],
		[1, 0],
		[-2, 0],
		[1, -2],
		[-2, 1]
	],
	'0>3': [
		[0, 0],
		[-1, 0],
		[2, 0],
		[-1, 2],
		[2, -1]
	]
};

export function kickTests(type: PieceType, from: Rotation, to: Rotation): readonly Point[] {
	if (type === 'O') return [[0, 0]];
	const tests = (type === 'I' ? I : JLSTZ)[`${from}>${to}`];
	if (!tests) throw new RangeError('SRS supports only adjacent quarter turns');
	return tests.map(([x, y]): Point => [x, -y]);
}
