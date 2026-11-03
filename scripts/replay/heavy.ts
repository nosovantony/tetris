import { createGame, stepGame } from '../../src/lib/game/engine';
import { MAX_REPLAY_EVENTS } from '../../src/lib/game/simulator';
import { MAX_ACTIONS_PER_TICK } from '../../src/lib/game/constants';
import type { Action, GameConfig, ReplayEvent } from '../../src/lib/game/types';

// Real rotations, not release padding. Only keep a batch if the original drop
// and the augmented drop leave exactly the same state, including scoring metadata.
export function rotateHeavy(
	config: GameConfig,
	events: ReplayEvent[],
	ticks: number,
	fromLevel = 81
) {
	const state = createGame(config),
		output: ReplayEvent[] = [];
	let cursor = 0,
		added = 0,
		rotationAttempts = 0,
		highGravityRotations = 0;
	for (let tick = 0; tick < ticks; tick++) {
		const batch: Action[] = [];
		while (cursor < events.length && events[cursor].tick === tick)
			batch.push(events[cursor++].action);
		let chosen = batch;
		if (state.level >= fromLevel && batch.includes('hard-drop') && state.active?.type !== 'O') {
			const count = Math.min(
				MAX_ACTIONS_PER_TICK - batch.length,
				MAX_REPLAY_EVENTS - events.length - added
			);
			const rotations: Action[] = Array.from({ length: count - (count % 2) }, (_, i) =>
				i % 2 ? 'rotate-ccw' : 'rotate-cw'
			);
			if (rotations.length) {
				const normal = structuredClone(state),
					candidate = structuredClone(state);
				stepGame(normal, batch);
				stepGame(candidate, [...rotations, ...batch]);
				if (JSON.stringify(normal) === JSON.stringify(candidate)) {
					chosen = [...rotations, ...batch];
					added += rotations.length;
					rotationAttempts += rotations.length;
					if (state.level >= 81) highGravityRotations += rotations.length;
				}
			}
		}
		for (const action of chosen) output.push({ tick, action });
		stepGame(state, chosen);
	}
	return { state, events: output, metrics: { added, rotationAttempts, highGravityRotations } };
}
