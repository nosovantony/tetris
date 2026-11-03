import { createGame } from './engine';
import { collides } from './board';
import { MAX_TICKS, PIECES } from './constants';
import { validateReplay } from './simulator';
import { RULES_VERSION } from '../shared/leaderboard';
import type { GameConfig, GameState, PieceType, ReplayEvent } from './types';
import { parseTicket, type RunTicket } from '../shared/runs';

export interface Checkpoint {
	version: 1;
	savedAt: number;
	game: GameState;
	events: ReplayEvent[];
	replayAvailable: boolean;
	ticket?: RunTicket;
}

export function makeCheckpoint(
	game: GameState,
	events: ReplayEvent[],
	replayAvailable: boolean,
	now = Date.now(),
	ticket?: RunTicket
): Checkpoint {
	return structuredClone({
		version: 1,
		savedAt: now,
		game,
		events,
		replayAvailable,
		...(ticket ? { ticket } : {})
	});
}

/** Local recovery only, NEVER evidence for leaderboard acceptance. */
export function parseCheckpoint(value: unknown, now = Date.now()): Checkpoint {
	function require(condition: unknown): asserts condition {
		if (!condition) throw new Error('Invalid or incompatible checkpoint');
	}
	function integer(value: unknown, min: number, max: number): value is number {
		return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
	}
	function piece(value: unknown): value is PieceType {
		return PIECES.includes(value as PieceType);
	}
	require(value && typeof value === 'object');
	const c = value as Checkpoint;
	require(c.version === 1 && integer(c.savedAt, 0, now + 60000));
	require(now - c.savedAt <= 7 * 86400000);
	require(c.game && typeof c.game === 'object');
	const g = c.game;
	require(g.rulesVersion === RULES_VERSION && g.config);
	if (c.ticket) {
		const ticket = parseTicket(c.ticket);
		require(
			Object.keys(ticket.claims.config).every(
				(key) => ticket.claims.config[key as keyof GameConfig] === g.config[key as keyof GameConfig]
			)
		);
		require(['playing', 'won', 'lost', 'timeout'].includes(g.status));
	} else require(g.config.mode === 'training' && g.status === 'playing');
	require(
		g.status === 'lost' ? ['block-out', 'lock-out'].includes(g.topOut ?? '') : g.topOut === null
	);
	const initial = createGame(g.config as GameConfig);
	require(
		(Object.keys(initial.config) as (keyof GameConfig)[]).every(
			(key) => initial.config[key] === g.config[key]
		)
	);
	require(
		Array.isArray(g.board) &&
			g.board.length === 22 &&
			g.board.every(
				(row) =>
					Array.isArray(row) &&
					row.length === 10 &&
					row.every((cell) => cell === null || piece(cell))
			)
	);
	require(Array.isArray(g.next) && g.next.length === 5 && g.next.every(piece));
	require(g.bag && integer(g.bag.randomState, 0, 0xffffffff) && Array.isArray(g.bag.remaining));
	require(
		g.bag.remaining.length <= 6 &&
			g.bag.remaining.every(piece) &&
			new Set(g.bag.remaining).size === g.bag.remaining.length
	);
	require(g.hold === null || piece(g.hold));
	require(
		typeof g.holdUsed === 'boolean' &&
			typeof g.backToBack === 'boolean' &&
			typeof g.hasTouchedGround === 'boolean'
	);
	require(
		(g.active === null && g.status !== 'playing') ||
			(g.active &&
				piece(g.active.type) &&
				integer(g.active.rotation, 0, 3) &&
				integer(g.active.x, -3, 9) &&
				integer(g.active.y, -4, 19))
	);
	if (g.status === 'playing') require(g.active && !collides(g.board, g.active));
	for (const key of [
		'tick',
		'score',
		'lines',
		'level',
		'piecesLocked',
		'combo',
		'gravityTicks',
		'lockTicks',
		'lockResets',
		'timeBonus'
	] as const) {
		require(integer(g[key], key === 'combo' ? -1 : 0, Number.MAX_SAFE_INTEGER));
	}
	require(
		g.tick <= MAX_TICKS &&
			(g.status !== 'playing' || g.tick < MAX_TICKS) &&
			g.lines <= (151 - g.config.startLevel) * 10 + 3 &&
			(g.status === 'won'
				? g.lines >= (151 - g.config.startLevel) * 10
				: g.lines < (151 - g.config.startLevel) * 10) &&
			g.level === Math.min(150, g.config.startLevel + Math.floor(g.lines / 10)) &&
			g.lockResets <= 15 &&
			g.lockTicks <= MAX_TICKS &&
			g.gravityTicks <= 60 &&
			(g.status === 'won' || g.timeBonus === 0)
	);
	require(
		g.input &&
			['left', 'right', 'softDrop'].every((key) => typeof g.input[key as 'left'] === 'boolean')
	);
	require([-1, 0, 1].includes(g.input.direction) && integer(g.input.horizontalAge, -1, MAX_TICKS));
	require(g.lastRotation === null || (g.lastRotation && integer(g.lastRotation.kickIndex, 0, 4)));
	if (g.lastClear !== null) {
		require(
			g.lastClear &&
				integer(g.lastClear.lines, 0, 4) &&
				['none', 'mini', 'full'].includes(g.lastClear.spin) &&
				integer(g.lastClear.basePoints, 0, Number.MAX_SAFE_INTEGER) &&
				integer(g.lastClear.comboPoints, 0, Number.MAX_SAFE_INTEGER) &&
				typeof g.lastClear.backToBackBonus === 'boolean'
		);
	}
	require(Array.isArray(c.events) && typeof c.replayAvailable === 'boolean');
	validateReplay(c.events, g.tick);
	require(c.replayAvailable || c.events.length === 0);
	return structuredClone(c);
}
