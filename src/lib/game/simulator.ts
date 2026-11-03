import { createGame, stepGame } from './engine';
import { ACTIONS, type GameConfig, type GameState, type ReplayEvent } from './types';
import { MAX_ACTIONS_PER_TICK, MAX_TICKS } from './constants';

export const MAX_REPLAY_EVENTS = 50000;

export function validateReplay(events: readonly ReplayEvent[], durationTicks: number): void {
	if (
		!Number.isInteger(durationTicks) ||
		durationTicks < 0 ||
		durationTicks > MAX_TICKS ||
		events.length > MAX_REPLAY_EVENTS
	)
		throw new RangeError('Replay limit exceeded');
	let previous = -1,
		batch = 0;
	for (const event of events) {
		if (
			!Number.isInteger(event.tick) ||
			event.tick < 0 ||
			event.tick < previous ||
			event.tick >= durationTicks ||
			!ACTIONS.includes(event.action)
		) {
			throw new RangeError('Invalid replay event');
		}
		batch = event.tick === previous ? batch + 1 : 1;
		if (batch > MAX_ACTIONS_PER_TICK) throw new RangeError('Too many actions in one tick');
		previous = event.tick;
	}
}

// Deliberately slow reference implementation. No event-driven CPU budget claim.
// Event tick 0 is applied in the first step; state.tick counts completed active ticks.
export function simulateReplay(
	config: GameConfig,
	events: readonly ReplayEvent[],
	durationTicks: number
): GameState {
	validateReplay(events, durationTicks);
	const state = createGame(config);
	let cursor = 0;
	for (let tick = 0; tick < durationTicks; tick++) {
		if (state.status !== 'playing') throw new RangeError('Replay continues after game end');
		const start = cursor;
		while (cursor < events.length && events[cursor].tick === tick) cursor++;
		stepGame(
			state,
			events.slice(start, cursor).map((event) => event.action)
		);
	}
	return state;
}
