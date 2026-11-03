import { occupied } from './board';
import type { ActivePiece, Board, ClearEvent, Spin } from './types';

export function detectSpin(board: Board, piece: ActivePiece, kickIndex: number | null): Spin {
	if (piece.type !== 'T' || kickIndex === null) return 'none';
	const x = piece.x + 1,
		y = piece.y + 1;
	// Clockwise from upper-left. Sides of the playfield count as occupied corners.
	const corners = [
		occupied(board, x - 1, y - 1),
		occupied(board, x + 1, y - 1),
		occupied(board, x + 1, y + 1),
		occupied(board, x - 1, y + 1)
	];
	if (corners.filter(Boolean).length < 3) return 'none';
	const front = [
		[0, 1],
		[1, 2],
		[2, 3],
		[3, 0]
	][piece.rotation];
	return (corners[front[0]] && corners[front[1]]) || kickIndex === 4 ? 'full' : 'mini';
}

export function scoreClear(
	lines: number,
	spin: Spin,
	level: number,
	combo: number,
	backToBack: boolean
): ClearEvent {
	if (!Number.isInteger(lines) || lines < 0 || lines > 4 || (spin !== 'none' && lines > 3))
		throw new RangeError('Invalid line clear');
	if (spin === 'mini' && lines === 3) spin = 'full';
	const base = (
		spin === 'full'
			? [400, 800, 1200, 1600]
			: spin === 'mini'
				? [100, 200, 400]
				: [0, 100, 300, 500, 800]
	)[lines];
	const difficult = lines > 0 && (spin !== 'none' || lines === 4);
	const backToBackBonus = difficult && backToBack;
	return {
		lines,
		spin,
		basePoints: (base * level * (backToBackBonus ? 3 : 2)) / 2,
		comboPoints: lines > 0 ? Math.max(0, combo) * 50 * level : 0,
		backToBackBonus
	};
}
