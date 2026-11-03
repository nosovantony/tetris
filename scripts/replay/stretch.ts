import { createGame, stepGame } from '../../src/lib/game/engine';
import { ghostPiece } from '../../src/lib/game/board';
import { MAX_TICKS } from '../../src/lib/game/constants';
import type { Action, GameConfig, GameState, ReplayEvent } from '../../src/lib/game/types';

// Extend a known legal route with real idle ticks and reversible lock resets.
// Each attempted tick is first checked on a clone. The output is still solely
// actions + time; no snapshot is used as input to the validator.
export function stretchReplay(
	config: GameConfig,
	events: ReplayEvent[],
	durationTicks: number,
	fromLevel = 1
) {
	const state = createGame(config);
	const output: ReplayEvent[] = [];
	let cursor = 0;
	function apply(actions: Action[]) {
		for (const action of actions) output.push({ tick: state.tick, action });
		stepGame(state, actions);
	}
	const resets: Action[][] = [
		['rotate-cw', 'rotate-ccw'],
		['rotate-ccw', 'rotate-cw'],
		['left-down', 'left-up', 'right-down', 'right-up'],
		['right-down', 'right-up', 'left-down', 'left-up']
	];
	for (let tick = 0; tick < durationTicks && state.status === 'playing'; tick++) {
		const actions: Action[] = [];
		while (cursor < events.length && events[cursor].tick === tick)
			actions.push(events[cursor++].action);
		if (state.level >= fromLevel && actions.length === 1 && actions[0] === 'hard-drop') {
			while (state.status === 'playing') {
				const idle = structuredClone(state);
				stepGame(idle, []);
				if (idle.piecesLocked === state.piecesLocked) {
					apply([]);
					if (state.status !== 'playing') break;
					continue;
				}
				let reset: Action[] | undefined;
				const target = ghostPiece(state.board, state.active!);
				for (const attempt of resets) {
					const candidate = structuredClone(state);
					stepGame(candidate, attempt);
					if (
						candidate.status !== 'playing' ||
						!candidate.active ||
						candidate.piecesLocked !== state.piecesLocked
					)
						continue;
					const landing = ghostPiece(candidate.board, candidate.active);
					if (
						candidate.lockResets > state.lockResets &&
						candidate.lockTicks < state.lockTicks &&
						landing.x === target.x &&
						landing.y === target.y &&
						landing.rotation === target.rotation
					) {
						reset = attempt;
						break;
					}
				}
				if (!reset) break;
				apply(reset);
			}
		}
		if (state.status === 'playing') apply(actions);
	}
	if (state.tick > MAX_TICKS) throw new Error('Exceeded active time limit');
	return { state, events: output };
}

export function padReplay(
	events: ReplayEvent[],
	durationTicks: number,
	count: number
): ReplayEvent[] {
	const output: ReplayEvent[] = [];
	let cursor = 0,
		remaining = count - events.length;
	if (remaining < 0) throw new Error('Padding cannot remove actions');
	for (let tick = 0; tick < durationTicks; tick++) {
		const batch: ReplayEvent[] = [];
		while (cursor < events.length && events[cursor].tick === tick) batch.push(events[cursor++]);
		const add = Math.min(32 - batch.length, remaining);
		// Releasing an already released key has no effect, even after a hard drop.
		for (let n = 0; n < add; n++) output.push({ tick, action: 'soft-drop-up' });
		output.push(...batch);
		remaining -= add;
	}
	if (remaining) throw new Error('Insufficient ticks for requested padding');
	return output;
}
