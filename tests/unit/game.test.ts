import { describe, expect, it } from 'vitest';
import { createBag, drawPiece } from '../../src/lib/game/bag';
import {
	cells,
	clearLines,
	collides,
	createBoard,
	ghostPiece,
	grounded
} from '../../src/lib/game/board';
import {
	BOARD_HEIGHT,
	MAX_LOCK_RESETS,
	MAX_TICKS,
	PIECES,
	shape
} from '../../src/lib/game/constants';
import { createGame, stepGame } from '../../src/lib/game/engine';
import { getGravityTicks, getLockDelayTicks } from '../../src/lib/game/levels';
import { nextRandom } from '../../src/lib/game/random';
import { detectSpin, scoreClear } from '../../src/lib/game/scoring';
import { kickTests } from '../../src/lib/game/srs';
import type { Action, ActivePiece, GameState, PieceType, Rotation } from '../../src/lib/game/types';

function advance(state: GameState, count: number, actions: readonly Action[] = []): void {
	for (let i = 0; i < count; i++) stepGame(state, actions);
}
function place(
	state: GameState,
	type: PieceType,
	x: number,
	y: number,
	rotation: Rotation = 0
): void {
	state.active = { type, x, y, rotation };
	state.gravityTicks = state.lockTicks = state.lockResets = 0;
	state.hasTouchedGround = false;
	state.lastRotation = null;
}
function tetrisWell(state: GameState): void {
	state.board = createBoard();
	for (let row = 18; row < 22; row++) state.board[row].fill('J');
	for (let row = 18; row < 22; row++) state.board[row][5] = null;
	place(state, 'I', 3, 16, 1);
}

describe('geometry, PRNG and 7-bag', () => {
	it('has a golden Mulberry32 vector and uint32 wraparound', () => {
		expect(nextRandom(1)).toEqual({ state: 1831565814, value: 2693262067 });
		expect(nextRandom(0xffffffff).state).toBe(1831565812);
	});
	it('emits every piece once per bag, preserves state, bounds droughts', () => {
		for (const seed of [0, 1, 42, 0xffffffff]) {
			const bag = createBag(seed);
			const stream = Array.from({ length: 700 }, () => drawPiece(bag));
			for (let i = 0; i < stream.length; i += 7)
				expect(stream.slice(i, i + 7).sort()).toEqual([...PIECES].sort());
			for (const type of PIECES) {
				const positions = stream.flatMap((p, i) => (p === type ? [i] : []));
				for (let i = 1; i < positions.length; i++)
					expect(positions[i] - positions[i - 1]).toBeLessThanOrEqual(13);
			}
			const clone = JSON.parse(JSON.stringify(bag));
			expect(Array.from({ length: 100 }, () => drawPiece(bag))).toEqual(
				Array.from({ length: 100 }, () => drawPiece(clone))
			);
		}
	});
	it.each(PIECES)('%s has four distinct cells in each SRS orientation', (type) => {
		for (const rotation of [0, 1, 2, 3] as const) {
			expect(new Set(shape(type, rotation).map(String)).size).toBe(4);
			expect(
				shape(type, rotation).every(([x, y]) => Number.isInteger(x) && Number.isInteger(y))
			).toBe(true);
		}
	});
	it('creates independent board rows, detects all four boundaries and a block', () => {
		const board = createBoard();
		board[21][0] = 'Z';
		expect(board[20][0]).toBeNull();
		for (const [x, y] of [
			[-2, 0],
			[8, 0],
			[0, -3],
			[0, 19]
		]) {
			expect(collides(board, { type: 'O', rotation: 0, x, y })).toBe(true);
		}
		expect(collides(board, { type: 'O', rotation: 0, x: -1, y: 18 })).toBe(true);
	});
	it('clears adjacent/nonadjacent rows including hidden rows, retaining order', () => {
		const board = createBoard();
		for (const row of [0, 19, 21]) board[row].fill('Z');
		board[20][3] = 'T';
		expect(clearLines(board)).toBe(3);
		expect(board.length).toBe(BOARD_HEIGHT);
		expect(board[21][3]).toBe('T');
		expect(
			board
				.slice(0, 3)
				.flat()
				.every((cell) => cell === null)
		).toBe(true);
	});
	it('ghost projection neither mutates state nor intersects the stack', () => {
		const state = createGame({ seed: 1 });
		const snapshot = structuredClone(state);
		const ghost = ghostPiece(state.board, state.active!);
		expect(state).toEqual(snapshot);
		expect(collides(state.board, ghost)).toBe(false);
		expect(grounded(state.board, ghost)).toBe(true);
	});
});

describe('SRS rotation', () => {
	it.each(PIECES)('%s returns to its starting geometry after four free turns', (type) => {
		const state = createGame({ seed: 3 });
		place(state, type, 3, 5);
		const before = cells(state.active!);
		advance(state, 4, ['rotate-cw']);
		expect(cells(state.active!)).toEqual(before);
	});
	it('uses JLSTZ left-wall kick and the opposite turn', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', -1, 4, 1);
		stepGame(state, ['rotate-ccw']);
		expect(state.active).toMatchObject({ x: 0, y: 4, rotation: 0 });
		expect(state.lastRotation).toEqual({ kickIndex: 1 });
	});
	it('uses distinct I kicks at the left wall', () => {
		const state = createGame({ seed: 1 });
		place(state, 'I', -2, 4, 1);
		stepGame(state, ['rotate-ccw']);
		expect(state.active).toMatchObject({ x: 0, y: 4, rotation: 0 });
	});
	it('converts upward floor kicks to negative board y', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', 3, 18);
		stepGame(state, ['rotate-cw']);
		expect(state.active).toMatchObject({ x: 2, y: 17, rotation: 1 });
		expect(state.lastRotation).toEqual({ kickIndex: 2 });
	});
	it('rejects a rotation if every candidate is blocked', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', 3, 8);
		for (const row of state.board) row.fill('J');
		for (const [x, y] of cells(state.active!)) state.board[y + 2][x] = null;
		const before = { ...state.active! };
		stepGame(state, ['rotate-cw']);
		expect(state.active).toEqual(before);
		expect(state.lockResets).toBe(0);
	});
	it('has all eight transitions in both kick families, not 180-degree kicks', () => {
		for (const type of ['I', 'T'] as const)
			for (const from of [0, 1, 2, 3] as const) {
				for (const dir of [-1, 1])
					expect(kickTests(type, from, ((from + dir + 4) % 4) as Rotation)).toHaveLength(5);
			}
		expect(() => kickTests('T', 0, 2)).toThrow();
	});
});

describe('ticks, input and lock delay', () => {
	it('waits precisely 60 ticks for gravity and uses integer progression', () => {
		const state = createGame({ seed: 1 });
		advance(state, 59);
		expect(state.active!.y).toBe(-2);
		stepGame(state);
		expect(state.active!.y).toBe(-1);
		const gravity = Array.from({ length: 150 }, (_, i) => getGravityTicks(i + 1));
		expect([gravity[0], gravity[29], gravity[30], gravity[79], gravity[80], gravity[149]]).toEqual([
			60, 6, 5, 1, 0, 0
		]);
		for (let i = 1; i < 150; i++) expect(gravity[i]).toBeLessThanOrEqual(gravity[i - 1]);
		expect(getLockDelayTicks(120)).toBe(30);
		expect(getLockDelayTicks(150)).toBe(15);
	});
	it('awards one point per soft-dropped cell, two per hard-dropped cell', () => {
		const soft = createGame({ seed: 2 });
		stepGame(soft, ['soft-drop-down']);
		expect(soft.active!.y).toBe(-1);
		expect(soft.score).toBe(1);
		stepGame(soft, ['soft-drop-up']);
		expect(soft.score).toBe(1);
		const hard = createGame({ seed: 2 });
		const distance = ghostPiece(hard.board, hard.active!).y - hard.active!.y;
		stepGame(hard, ['hard-drop']);
		expect(hard.score).toBe(distance * 2);
		expect(hard.piecesLocked).toBe(1);
	});
	it('DAS waits 8 ticks; duplicate downs do not reset it; release cancels it', () => {
		const state = createGame({ seed: 1 });
		stepGame(state, ['left-down']);
		expect(state.active!.x).toBe(2);
		advance(state, 7, ['left-down']);
		expect(state.active!.x).toBe(2);
		stepGame(state);
		expect(state.active!.x).toBe(1);
		stepGame(state, ['left-up']);
		advance(state, 8);
		expect(state.active!.x).toBe(1);
	});
	it('ARR 0 moves to the wall only after DAS, and last pressed direction wins', () => {
		const state = createGame({ seed: 1, arrTicks: 0 });
		place(state, 'O', 3, 5);
		stepGame(state, ['left-down']);
		advance(state, 8);
		expect(state.active!.x).toBe(-1);
		stepGame(state, ['right-down']);
		expect(state.active!.x).toBe(0);
		stepGame(state, ['right-up']);
		expect(state.input.direction).toBe(-1);
		stepGame(state, ['left-up']);
		expect(state.input.direction).toBe(0);
	});
	it('spawns on the floor in 20G, grants 30/15 lock ticks and no drop points', () => {
		for (const level of [81, 150]) {
			const state = createGame({ seed: 4, mode: 'training', startLevel: level });
			expect(grounded(state.board, state.active!)).toBe(true);
			advance(state, getLockDelayTicks(level) - 1);
			expect(state.piecesLocked).toBe(0);
			stepGame(state);
			expect(state.piecesLocked).toBe(1);
			expect(state.score).toBe(0);
		}
	});
	it('counts at most 15 successful grounded lock resets; failed moves do not reset', () => {
		const state = createGame({ seed: 1 });
		place(state, 'O', 3, 18);
		advance(state, 20);
		for (let i = 0; i < MAX_LOCK_RESETS; i++) {
			const direction = i % 2 === 0 ? 'left' : 'right';
			stepGame(state, ['left-up', 'right-up', `${direction}-down`]);
			expect(state.lockTicks).toBe(1);
		}
		expect(state.lockResets).toBe(15);
		stepGame(state, ['left-up', 'right-up', 'right-down']);
		expect(state.lockTicks).toBe(2);
		advance(state, 28);
		expect(state.piecesLocked).toBe(1);
		place(state, 'O', -1, 18);
		stepGame(state, ['right-up', 'left-down']);
		expect(state.lockResets).toBe(0);
		stepGame(state, ['rotate-cw']);
		expect(state.lockResets).toBe(0);
	});
	it('does not get unlimited airborne time by lifting off a ledge after reset cap', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', 3, 16);
		state.board[20][3] = 'J';
		state.hasTouchedGround = true;
		state.lockResets = 15;
		state.lockTicks = 29;
		stepGame(state, ['right-down']);
		expect(state.lockTicks).toBe(30);
		advance(state, 200);
		expect(state.piecesLocked).toBeGreaterThanOrEqual(1);
	});
	it('holds once per piece, resets orientation, consumes queue only for empty Hold', () => {
		const state = createGame({ seed: 42 });
		const original = state.active!.type;
		const incoming = state.next[0];
		stepGame(state, ['rotate-cw', 'hold']);
		expect(state.hold).toBe(original);
		expect(state.active).toMatchObject({ type: incoming, rotation: 0 });
		const snapshot = structuredClone(state.next);
		stepGame(state, ['hold']);
		expect(state.active!.type).toBe(incoming);
		expect(state.next).toEqual(snapshot);
		stepGame(state, ['hard-drop']);
		const queue = [...state.next];
		stepGame(state, ['hold']);
		expect(state.active!.type).toBe(original);
		expect(state.next).toEqual(queue);
		expect(state.next).toHaveLength(5);
	});
	it('locks at most once per tick and applies releases after hard drop', () => {
		const state = createGame({ seed: 5 });
		stepGame(state, ['left-down', 'hard-drop', 'hard-drop', 'hold', 'left-up']);
		expect(state.piecesLocked).toBe(1);
		expect(state.hold).toBeNull();
		expect(state.input.left).toBe(false);
		expect(state.lockTicks).toBe(0);
	});
	it('times out at 3 hours, keeps terminal states stable, rejects invalid batches atomically', () => {
		const state = createGame({ seed: 1 });
		const copy = structuredClone(state);
		expect(() => stepGame(state, Array(33).fill('rotate-cw'))).toThrow();
		expect(() => stepGame(state, ['bogus' as Action])).toThrow();
		expect(state).toEqual(copy);
		state.tick = MAX_TICKS - 1;
		stepGame(state);
		expect(state.status).toBe('timeout');
		const terminal = structuredClone(state);
		stepGame(state, ['hard-drop']);
		expect(state).toEqual(terminal);
	});
	it.each([
		{ seed: -1 },
		{ seed: 2 ** 32 },
		{ seed: 0.5 },
		{ seed: 1, startLevel: 2 },
		{ seed: 1, startLevel: 151 },
		{ seed: 1, dasTicks: 0 },
		{ seed: 1, arrTicks: -1 }
	])('rejects invalid config %j', (config) => expect(() => createGame(config)).toThrow());
});

describe('scoring, progress and end states', () => {
	it.each([
		[1, 100],
		[2, 300],
		[3, 500],
		[4, 800]
	])('scores %i normal lines', (lines, points) => {
		expect(scoreClear(lines, 'none', 2, 0, false).basePoints).toBe(points * 2);
	});
	it.each([
		[0, 400],
		[1, 800],
		[2, 1200],
		[3, 1600]
	])('scores T-spin %i', (lines, points) => {
		expect(scoreClear(lines, 'full', 1, 0, false).basePoints).toBe(points);
	});
	it('scores mini, B2B and Combo independently and excludes empty spins from B2B bonus', () => {
		expect(scoreClear(0, 'mini', 1, -1, true).basePoints).toBe(100);
		expect(scoreClear(1, 'mini', 1, 1, true)).toMatchObject({ basePoints: 300, comboPoints: 50 });
		expect(scoreClear(2, 'mini', 1, 0, false).basePoints).toBe(400);
		expect(scoreClear(4, 'none', 3, 2, true)).toMatchObject({ basePoints: 3600, comboPoints: 300 });
	});
	it('recognizes three corners, front corners, fifth kick and nonrotation', () => {
		const board = createBoard();
		const piece: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 15 };
		for (const [x, y] of [
			[3, 15],
			[5, 15],
			[3, 17]
		])
			board[y + 2][x] = 'J';
		expect(detectSpin(board, piece, 0)).toBe('full');
		expect(detectSpin(board, { ...piece, rotation: 2 }, 0)).toBe('mini');
		expect(detectSpin(board, { ...piece, rotation: 2 }, 4)).toBe('full');
		expect(detectSpin(board, piece, null)).toBe('none');
		board[17][3] = null;
		expect(detectSpin(board, piece, 0)).toBe('none');
	});
	it('preserves spin on zero-distance hard drop and scores a T-spin single through engine', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', 3, 18);
		state.board[21].fill('J');
		for (const x of [3, 4, 5]) state.board[21][x] = null;
		state.board[20][3] = state.board[20][5] = 'J';
		state.lastRotation = { kickIndex: 0 };
		stepGame(state, ['hard-drop']);
		expect(state.lastClear).toMatchObject({ lines: 1, spin: 'full', basePoints: 800 });
		expect(state.score).toBe(800);
	});
	it('chains tetrises, resets Combo on empty locks, preserves B2B on empty locks', () => {
		const state = createGame({ seed: 1 });
		tetrisWell(state);
		stepGame(state, ['hard-drop']);
		expect(state.score).toBe(800);
		tetrisWell(state);
		stepGame(state, ['hard-drop']);
		expect(state.score).toBe(2050);
		expect(state.lines).toBe(8);
		state.board = createBoard();
		place(state, 'O', 3, 18);
		stepGame(state, ['hard-drop']);
		expect(state.combo).toBe(-1);
		expect(state.backToBack).toBe(true);
		tetrisWell(state);
		stepGame(state, ['hard-drop']);
		expect(state.level).toBe(2);
		expect(state.lastClear!.basePoints).toBe(1200); // level before clear
	});
	it('recognizes an actual SRS rotation into a T-spin slot, then locks and clears', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', 3, 17, 3);
		state.board[20].fill('J');
		for (const x of [3, 4, 5]) state.board[20][x] = null;
		for (const row of [19, 21]) state.board[row][3] = state.board[row][5] = 'J';
		expect(collides(state.board, state.active!)).toBe(false);
		stepGame(state, ['rotate-cw', 'hard-drop']);
		expect(state.lastClear).toMatchObject({ lines: 1, spin: 'full', basePoints: 800 });
		expect(state.lines).toBe(1);
	});
	it('a successful translation invalidates a previous rotation for spin scoring', () => {
		const state = createGame({ seed: 1 });
		place(state, 'T', 3, 5);
		stepGame(state, ['rotate-cw', 'right-down']);
		expect(state.lastRotation).toBeNull();
	});
	it('normal singles break B2B; blocked spawn and wholly hidden lock top out', () => {
		const state = createGame({ seed: 1 });
		state.backToBack = true;
		state.board[21].fill('J');
		state.board[21][4] = state.board[21][5] = null;
		place(state, 'O', 3, 18);
		stepGame(state, ['hard-drop']);
		expect(state.backToBack).toBe(false);
		const blocked = createGame({ seed: 1 });
		for (let y = 0; y < 2; y++) blocked.board[y].fill('J');
		stepGame(blocked, ['hold']);
		expect(blocked.topOut).toBe('block-out');
		const hidden = createGame({ seed: 1 });
		place(hidden, 'O', 3, -2);
		hidden.board[2][4] = 'J';
		stepGame(hidden, ['hard-drop']);
		expect(hidden.topOut).toBe('lock-out');
		expect(hidden.status).toBe('lost');
	});
	it('wins at 1500 lines including overshoot, clamps level and grants time bonus only once', () => {
		const state = createGame({ seed: 1 });
		state.lines = 1499;
		state.level = 150;
		tetrisWell(state);
		stepGame(state, ['hard-drop']);
		expect(state.lines).toBe(1503);
		expect(state.level).toBe(150);
		expect(state.status).toBe('won');
		expect(state.timeBonus).toBe(1499990);
		expect(state.score).toBe(800 * 150 + state.timeBonus);
		const score = state.score;
		stepGame(state, ['hard-drop']);
		expect(state.score).toBe(score);
	});
	it('training counts only remaining levels and cannot be configured as a ranked shortcut', () => {
		const state = createGame({ seed: 1, mode: 'training', startLevel: 150 });
		state.lines = 8;
		tetrisWell(state);
		stepGame(state, ['hard-drop']);
		expect(state.status).toBe('won');
		expect(state.config.mode).toBe('training');
		expect(state.lines).toBe(12);
	});
	it('clears a wholly hidden lock before testing the next spawn', () => {
		const state = createGame({ seed: 1 });
		place(state, 'I', 3, -2);
		state.board[1].fill('J');
		for (const x of [3, 4, 5, 6]) state.board[1][x] = null;
		state.board[2][3] = 'J';
		stepGame(state, ['hard-drop']);
		expect(state.lines).toBe(1);
		expect(state.status).toBe('playing');
		expect(state.topOut).toBeNull();
	});
	it('gives no time bonus after 150000 active ticks and permits a last-tick win', () => {
		const state = createGame({ seed: 1 });
		state.tick = MAX_TICKS - 1;
		state.lines = 1496;
		state.level = 150;
		tetrisWell(state);
		stepGame(state, ['hard-drop']);
		expect(state.status).toBe('won');
		expect(state.timeBonus).toBe(0);
	});
});
