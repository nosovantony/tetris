import { RULES_VERSION } from '../shared/leaderboard';
import { createBag, drawPiece } from './bag';
import { cells, clearLines, collides, createBoard, ghostPiece, grounded } from './board';
import {
	ACTIONS,
	type Action,
	type GameConfig,
	type GameState,
	type InputState,
	type PieceType,
	type Rotation
} from './types';
import { HIDDEN_ROWS, MAX_ACTIONS_PER_TICK, MAX_LOCK_RESETS, MAX_TICKS } from './constants';
import {
	assertLevel,
	getGravityTicks,
	getLockDelayTicks,
	levelForLines,
	MARATHON_LINES
} from './levels';
import { detectSpin, scoreClear } from './scoring';
import { kickTests } from './srs';

function neutralInput(): InputState {
	return { left: false, right: false, softDrop: false, direction: 0, horizontalAge: 0 };
}

// Mutates an owned GameState; never mutate a snapshot supplied by untrusted clients.
// State contains all timers and PRNG state and can be structuredClone'd / JSON-serialized.
export function createGame(config: GameConfig): GameState {
	const mode = config.mode ?? 'ranked';
	const startLevel = config.startLevel ?? 1;
	const dasTicks = config.dasTicks ?? 8;
	const arrTicks = config.arrTicks ?? 1;
	assertLevel(startLevel);
	if (mode !== 'ranked' && mode !== 'training') throw new RangeError('Invalid game mode');
	if (mode === 'ranked' && startLevel !== 1) throw new RangeError('Ranked games start at level 1');
	if (
		!Number.isInteger(dasTicks) ||
		dasTicks < 1 ||
		dasTicks > 60 ||
		!Number.isInteger(arrTicks) ||
		arrTicks < 0 ||
		arrTicks > 60
	) {
		throw new RangeError('DAS must be 1–60 ticks and ARR 0–60 ticks');
	}
	const state: GameState = {
		rulesVersion: RULES_VERSION,
		config: { seed: config.seed, mode, startLevel, dasTicks, arrTicks },
		board: createBoard(),
		bag: createBag(config.seed),
		next: [],
		active: null,
		hold: null,
		holdUsed: false,
		input: neutralInput(),
		status: 'playing',
		topOut: null,
		tick: 0,
		score: 0,
		lines: 0,
		level: startLevel,
		piecesLocked: 0,
		combo: -1,
		backToBack: false,
		gravityTicks: 0,
		lockTicks: 0,
		lockResets: 0,
		hasTouchedGround: false,
		lastRotation: null,
		lastClear: null,
		timeBonus: 0
	};
	for (let i = 0; i < 5; i++) state.next.push(drawPiece(state.bag));
	spawn(state);
	return state;
}

function spawn(state: GameState, held?: PieceType): void {
	const type = held ?? state.next.shift()!;
	if (!held) state.next.push(drawPiece(state.bag));
	state.active = { type, x: 3, y: -2, rotation: 0 };
	state.gravityTicks = state.lockTicks = state.lockResets = 0;
	state.hasTouchedGround = false;
	state.lastRotation = null;
	if (collides(state.board, state.active)) {
		state.status = 'lost';
		state.topOut = 'block-out';
		state.active = null;
		return;
	}
	apply20G(state);
}

function apply20G(state: GameState): void {
	if (!state.active || getGravityTicks(state.level) !== 0) return;
	const ghost = ghostPiece(state.board, state.active);
	if (ghost.y !== state.active.y) state.lastRotation = null;
	state.active = ghost;
	state.hasTouchedGround = true;
}

function resetLock(state: GameState, wasGrounded: boolean): void {
	if (wasGrounded && state.lockResets < MAX_LOCK_RESETS) {
		state.lockTicks = 0;
		state.lockResets++;
	}
}

function move(state: GameState, dx: number, dy: number): boolean {
	const piece = state.active!;
	const candidate = { ...piece, x: piece.x + dx, y: piece.y + dy };
	if (collides(state.board, candidate)) return false;
	const wasGrounded = grounded(state.board, piece);
	state.active = candidate;
	state.lastRotation = null;
	if (dx !== 0) resetLock(state, wasGrounded);
	apply20G(state);
	return true;
}

function rotate(state: GameState, direction: 1 | -1): void {
	const piece = state.active!;
	if (piece.type === 'O') return; // No-op: O cannot farm lock resets.
	const to = ((piece.rotation + direction + 4) % 4) as Rotation;
	const tests = kickTests(piece.type, piece.rotation, to);
	for (let i = 0; i < tests.length; i++) {
		const [dx, dy] = tests[i];
		const candidate = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy };
		if (collides(state.board, candidate)) continue;
		resetLock(state, grounded(state.board, piece));
		state.active = candidate;
		state.lastRotation = { kickIndex: i };
		apply20G(state);
		return;
	}
}

function lock(state: GameState): void {
	const piece = state.active!;
	const spin = detectSpin(state.board, piece, state.lastRotation?.kickIndex ?? null);
	const blocks = cells(piece);
	for (const [x, y] of blocks) state.board[y + HIDDEN_ROWS][x] = piece.type;
	const count = clearLines(state.board);
	state.combo = count > 0 ? state.combo + 1 : -1;
	state.lastClear = scoreClear(count, spin, state.level, state.combo, state.backToBack);
	state.score += state.lastClear.basePoints + state.lastClear.comboPoints;
	if (count > 0) state.backToBack = count === 4 || spin !== 'none';
	state.lines += count;
	state.level = levelForLines(state.config.startLevel, state.lines);
	state.piecesLocked++;
	state.holdUsed = false;
	state.active = null;
	const target = MARATHON_LINES - (state.config.startLevel - 1) * 10;
	if (state.lines >= target) {
		state.status = 'won';
		state.timeBonus = Math.max(0, 1500000 - state.tick * 10);
		state.score += state.timeBonus;
	} else if (count === 0 && blocks.every(([, y]) => y < 0)) {
		state.status = 'lost';
		state.topOut = 'lock-out';
	} else spawn(state);
}

function release(state: GameState, action: Action): boolean {
	const input = state.input;
	if (action === 'soft-drop-up') {
		input.softDrop = false;
		return true;
	}
	if (action !== 'left-up' && action !== 'right-up') return false;
	const dir = action === 'left-up' ? -1 : 1;
	input[dir === -1 ? 'left' : 'right'] = false;
	if (input.direction === dir) {
		input.direction = input[dir === -1 ? 'right' : 'left'] ? (dir === -1 ? 1 : -1) : 0;
		input.horizontalAge = -1;
	}
	return true;
}

function pressDirection(state: GameState, direction: -1 | 1): void {
	const key = direction === -1 ? 'left' : 'right';
	if (state.input[key]) return; // Ignore browser auto-repeat / duplicate downs.
	state.input[key] = true;
	state.input.direction = direction;
	state.input.horizontalAge = -1;
	move(state, direction, 0);
}

/** Advance exactly one 1/60s tick. Actions are ordered and applied before timers.
 * Mutates and returns state. At most one lock per tick; after a hard drop only releases apply.
 * Invalid action batches fail before any state changes. Terminal states are stable.
 */
export function stepGame(state: GameState, actions: readonly Action[] = []): GameState {
	if (actions.length > MAX_ACTIONS_PER_TICK || actions.some((a) => !ACTIONS.includes(a))) {
		throw new RangeError('Invalid action batch');
	}
	if (state.status !== 'playing') return state;
	state.tick++;
	let locked = false;
	for (const action of actions) {
		if (release(state, action)) continue;
		if (locked || state.status !== 'playing') continue;
		switch (action) {
			case 'left-down':
				pressDirection(state, -1);
				break;
			case 'right-down':
				pressDirection(state, 1);
				break;
			case 'soft-drop-down':
				state.input.softDrop = true;
				break;
			case 'rotate-cw':
				rotate(state, 1);
				break;
			case 'rotate-ccw':
				rotate(state, -1);
				break;
			case 'hold': {
				if (state.holdUsed) break;
				const outgoing = state.active!.type;
				const incoming = state.hold;
				state.hold = outgoing;
				state.holdUsed = true;
				spawn(state, incoming ?? undefined);
				break;
			}
			case 'hard-drop': {
				const ghost = ghostPiece(state.board, state.active!);
				const distance = ghost.y - state.active!.y;
				state.score += distance * 2;
				if (distance > 0) state.lastRotation = null;
				state.active = ghost;
				lock(state);
				locked = true;
				break;
			}
		}
	}
	if (!locked && state.status === 'playing') {
		const input = state.input;
		if (input.direction) {
			input.horizontalAge++;
			const age = input.horizontalAge - state.config.dasTicks;
			if (age >= 0 && (state.config.arrTicks === 0 || age % state.config.arrTicks === 0)) {
				if (state.config.arrTicks === 0) {
					while (move(state, input.direction, 0)) {
						/* to wall */
					}
				} else move(state, input.direction, 0);
			}
		}
		const interval = getGravityTicks(state.level);
		if (interval === 0) apply20G(state);
		else {
			state.gravityTicks++;
			if (state.gravityTicks >= (input.softDrop ? 1 : interval)) {
				state.gravityTicks = 0;
				if (move(state, 0, 1) && input.softDrop) state.score++;
			}
		}
		if (grounded(state.board, state.active!)) state.hasTouchedGround = true;
		if (state.hasTouchedGround) state.lockTicks++;
		if (grounded(state.board, state.active!) && state.lockTicks >= getLockDelayTicks(state.level))
			lock(state);
	}
	if (state.status === 'playing' && state.tick >= MAX_TICKS) state.status = 'timeout';
	if (state.status !== 'playing') state.input = neutralInput();
	return state;
}
