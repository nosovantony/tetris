import type { Board } from './types';
import { BOARD_HEIGHT, BOARD_WIDTH } from './constants';

/**
 * Calculates attack lines based on lines cleared, Back-to-Back, and combo streak.
 */
export function calculateAttack(lines: number, isB2B = false, combo = 0): number {
	if (lines < 2) return 0;
	let attack = 0;
	if (lines === 2) attack = 1;
	else if (lines === 3) attack = 2;
	else if (lines === 4) attack = 4;

	if (lines === 4 && isB2B) {
		attack += 1;
	}

	if (combo >= 2 && combo <= 3) attack += 1;
	else if (combo >= 4 && combo <= 5) attack += 2;
	else if (combo >= 6 && combo <= 7) attack += 3;
	else if (combo >= 8) attack += 4;

	return attack;
}

/**
 * Cancels pending incoming garbage against newly generated attack lines.
 */
export function cancelGarbage(
	pendingGarbage: number,
	attack: number
): { remainingPending: number; outgoingAttack: number } {
	if (pendingGarbage >= attack) {
		return { remainingPending: pendingGarbage - attack, outgoingAttack: 0 };
	}
	return { remainingPending: 0, outgoingAttack: attack - pendingGarbage };
}

/**
 * Inserts garbage rows at the bottom of the board, shifting existing rows upward.
 */
export function insertGarbageLines(board: Board, lines: number, holeColumn?: number): void {
	if (lines <= 0) return;
	const count = Math.min(lines, BOARD_HEIGHT);
	const hole =
		holeColumn !== undefined && holeColumn >= 0 && holeColumn < BOARD_WIDTH
			? holeColumn
			: Math.floor(Math.random() * BOARD_WIDTH);

	for (let i = 0; i < count; i++) {
		board.shift();
		const row = Array.from({ length: BOARD_WIDTH }, (_, col) =>
			col === hole ? null : ('G' as const)
		);
		board.push(row);
	}
}
