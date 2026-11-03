import { describe, expect, it } from 'vitest';
import { calculateAttack, cancelGarbage, insertGarbageLines } from '../../src/lib/game/garbage';
import { createBoard, clearLines } from '../../src/lib/game/board';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../src/lib/game/constants';

describe('garbage and attack calculations', () => {
	it('calculates standard attack lines for line clears', () => {
		expect(calculateAttack(0)).toBe(0);
		expect(calculateAttack(1)).toBe(0);
		expect(calculateAttack(2)).toBe(1);
		expect(calculateAttack(3)).toBe(2);
		expect(calculateAttack(4)).toBe(4);
		expect(calculateAttack(4, true)).toBe(5); // Back-to-Back Tetris
	});

	it('adds combo bonuses correctly', () => {
		expect(calculateAttack(2, false, 0)).toBe(1);
		expect(calculateAttack(2, false, 1)).toBe(1);
		expect(calculateAttack(2, false, 2)).toBe(2); // combo 2 -> +1
		expect(calculateAttack(2, false, 4)).toBe(3); // combo 4 -> +2
		expect(calculateAttack(4, true, 4)).toBe(7); // Tetris + B2B + combo 4 -> 4 + 1 + 2 = 7
	});

	it('cancels incoming garbage against outgoing attacks', () => {
		// When pending garbage is larger than attack
		expect(cancelGarbage(4, 1)).toEqual({ remainingPending: 3, outgoingAttack: 0 });
		expect(cancelGarbage(4, 4)).toEqual({ remainingPending: 0, outgoingAttack: 0 });

		// When attack is larger than pending garbage
		expect(cancelGarbage(2, 5)).toEqual({ remainingPending: 0, outgoingAttack: 3 });
		expect(cancelGarbage(0, 4)).toEqual({ remainingPending: 0, outgoingAttack: 4 });
	});

	it('inserts garbage rows with holes at the bottom of the board', () => {
		const board = createBoard();
		expect(board.length).toBe(BOARD_HEIGHT);

		// Insert 2 garbage lines with hole at column 4
		insertGarbageLines(board, 2, 4);

		expect(board.length).toBe(BOARD_HEIGHT);

		const bottomRow = board[BOARD_HEIGHT - 1];
		const secondBottomRow = board[BOARD_HEIGHT - 2];

		// Check hole at column 4
		expect(bottomRow[4]).toBeNull();
		expect(secondBottomRow[4]).toBeNull();

		// Check garbage blocks at other columns
		for (let col = 0; col < BOARD_WIDTH; col++) {
			if (col !== 4) {
				expect(bottomRow[col]).toBe('G');
				expect(secondBottomRow[col]).toBe('G');
			}
		}

		// Fill the hole in the bottom row with a block and verify clearLines clears it
		bottomRow[4] = 'T';
		const cleared = clearLines(board);
		expect(cleared).toBe(1);
		expect(board.length).toBe(BOARD_HEIGHT);
	});
});
