import { createGame, stepGame } from '../../src/lib/game/engine';
import type { Action, GameConfig, GameState, ReplayEvent } from '../../src/lib/game/types';

// Offline fixture author, not gameplay code. Every selected move is reapplied to
// the reference engine; no board, queue, PRNG or timer mutation creates the replay.
function copy(state: GameState): GameState {
	return {
		...state,
		board: state.board.map((row) => [...row]),
		bag: { ...state.bag, remaining: [...state.bag.remaining] },
		next: [...state.next],
		active: state.active ? { ...state.active } : null,
		input: { ...state.input }
	};
}

function quality(state: GameState): number {
	if (state.status === 'lost') return -1e9;
	if (state.status === 'won') return 1e9;
	const board = state.board;
	const heights: number[] = [];
	let holes = 0,
		covered = 0,
		rowTransitions = 0,
		columnTransitions = 0,
		wells = 0;
	for (let x = 0; x < 10; x++) {
		let height = 0,
			above = 0,
			previous = true;
		for (let y = 0; y < 22; y++) {
			const filled = board[y][x] !== null;
			if (filled && !height) height = 22 - y;
			if (filled) above++;
			else if (above) {
				holes++;
				covered += above;
			}
			if (filled !== previous) columnTransitions++;
			previous = filled;
		}
		if (!previous) columnTransitions++;
		heights.push(height);
	}
	for (let y = 0; y < 22; y++) {
		let previous = true;
		for (let x = 0; x < 10; x++) {
			const filled = board[y][x] !== null;
			if (filled !== previous) rowTransitions++;
			previous = filled;
		}
		if (!previous) rowTransitions++;
	}
	for (let x = 0; x < 10; x++) {
		const depth = Math.max(
			0,
			Math.min(x ? heights[x - 1] : 22, x < 9 ? heights[x + 1] : 22) - heights[x]
		);
		wells += (depth * (depth + 1)) / 2;
	}
	return (
		-holes * 30 -
		covered * 2 -
		heights.reduce((sum, h) => sum + h, 0) * 1.2 -
		Math.max(...heights) * 2 -
		rowTransitions * 2 -
		columnTransitions * 3 -
		wells * 2
	);
}

type Placement = { state: GameState; path: Action[][]; quality: number };
const MOVES: Action[][] = [
	['left-down', 'left-up'],
	['right-down', 'right-up'],
	['rotate-cw'],
	['rotate-ccw']
];

function placements(state: GameState): Placement[] {
	const queue = [{ state, path: [] as Action[][] }];
	const visited = new Set<string>();
	const boards = new Map<string, Placement>();
	for (let cursor = 0; cursor < queue.length; cursor++) {
		const node = queue[cursor];
		if (
			!node.state.active ||
			node.state.status !== 'playing' ||
			node.state.piecesLocked !== state.piecesLocked
		)
			continue;
		const p = node.state.active;
		const key = `${p.x},${p.y},${p.rotation}`;
		if (visited.has(key)) continue;
		visited.add(key);
		const dropped = copy(node.state);
		stepGame(dropped, ['hard-drop']);
		const result: Placement = {
			state: dropped,
			path: [...node.path, ['hard-drop']],
			quality: quality(dropped)
		};
		const boardKey = dropped.board.map((row) => row.map((c) => (c ? '1' : '0')).join('')).join('');
		const old = boards.get(boardKey);
		if (!old || old.path.length > result.path.length) boards.set(boardKey, result);
		if (node.path.length >= 12) continue;
		for (const actions of MOVES) {
			const next = copy(node.state);
			stepGame(next, actions);
			queue.push({ state: next, path: [...node.path, actions] });
		}
	}
	return [...boards.values()].sort((a, b) => b.quality - a.quality);
}

export function generateReplay(
	config: GameConfig,
	options: {
		maxPieces?: number;
		lookahead?: number;
		holdEvery?: number;
		progress?: (state: GameState) => void;
	} = {}
) {
	const state = createGame(config);
	const events: ReplayEvent[] = [];
	while (state.status === 'playing' && state.piecesLocked < (options.maxPieces ?? 5000)) {
		if (options.holdEvery && state.piecesLocked % options.holdEvery === 0 && !state.holdUsed) {
			events.push({ tick: state.tick, action: 'hold' });
			stepGame(state, ['hold']);
			if (state.status !== 'playing') break;
		}
		const choices = placements(state);
		let best = choices[0];
		if (!best) throw new Error('No reachable placement');
		if (options.lookahead) {
			let highest = -Infinity;
			for (const choice of choices.slice(0, options.lookahead)) {
				const next =
					choice.state.status === 'playing'
						? (placements(choice.state)[0]?.quality ?? -1e9)
						: choice.quality;
				const score = next + choice.quality * 0.2;
				if (score > highest) {
					highest = score;
					best = choice;
				}
			}
		}
		for (const actions of best.path) {
			for (const action of actions) events.push({ tick: state.tick, action });
			stepGame(state, actions);
		}
		if (state.piecesLocked % 100 === 0) options.progress?.(state);
	}
	return { state, events };
}
