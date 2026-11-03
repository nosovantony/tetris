import { createGame, stepGame } from '../../../src/lib/game/engine';
import type { Action, GameConfig, GameState, ReplayEvent } from '../../../src/lib/game/types';

function quality(state: GameState): number {
	const heights = Array.from({ length: 10 }, (_, x) => {
		const first = state.board.findIndex((row) => row[x] !== null);
		return first < 0 ? 0 : 22 - first;
	});
	let holes = 0;
	for (let x = 0; x < 10; x++) {
		let filled = false;
		for (const row of state.board) {
			if (row[x]) filled = true;
			else if (filled) holes++;
		}
	}
	return (
		(state.status === 'lost' ? -100000 : 0) +
		(state.lastClear?.lines ?? 0) * 50 -
		holes * 25 -
		heights.reduce((sum, h) => sum + h, 0) * 2 -
		heights.slice(1).reduce((sum, h, i) => sum + Math.abs(h - heights[i]), 0) * 2
	);
}

/** Legal action-only fixture. Not a winning marathon, human proof or benchmark claim. */
export function rankedFixture(config: GameConfig, placements = 100) {
	const state = createGame(config);
	const events: ReplayEvent[] = [];
	function apply(actions: Action[]) {
		for (const action of actions) events.push({ tick: state.tick, action });
		stepGame(state, actions);
	}
	for (let i = 0; i < placements && state.status === 'playing'; i++) {
		let best: Action[] = ['hard-drop'],
			highest = -Infinity;
		for (let rotation = 0; rotation < 4; rotation++)
			for (let shift = -5; shift <= 5; shift++) {
				const actions: Action[] = Array(rotation).fill('rotate-cw');
				for (let n = 0; n < Math.abs(shift); n++)
					actions.push(shift < 0 ? 'left-down' : 'right-down', shift < 0 ? 'left-up' : 'right-up');
				actions.push('hard-drop');
				const candidate = structuredClone(state);
				stepGame(candidate, actions);
				const score = quality(candidate);
				if (score > highest) {
					highest = score;
					best = actions;
				}
			}
		apply(best);
	}
	// Deliberately finish by stacking the centre; no fabricated board mutations.
	while (state.status === 'playing') apply(['hard-drop']);
	return { state, events };
}
