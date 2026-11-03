import { describe, expect, it } from 'vitest';
import { encodeReplay, decodeReplay, MAX_REPLAY_BYTES } from '../../src/lib/game/codec';
import { createGame, stepGame } from '../../src/lib/game/engine';
import { simulateReplay } from '../../src/lib/game/simulator';
import { ACTIONS, type Action, type ReplayEvent } from '../../src/lib/game/types';
import { cells, collides } from '../../src/lib/game/board';
import { nextRandom } from '../../src/lib/game/random';

describe('versioned canonical LEB128 replay codec', () => {
	it('has a stable golden binary format, preserving order on the same tick', () => {
		const events: ReplayEvent[] = [
			{ tick: 0, action: 'rotate-cw' },
			{ tick: 0, action: 'hard-drop' },
			{ tick: 128, action: 'hold' }
		];
		const binary = encodeReplay(events, 129);
		expect([...binary]).toEqual([84, 82, 1, 129, 1, 3, 0, 6, 0, 8, 128, 1, 9]);
		expect(decodeReplay(binary)).toEqual({ events, durationTicks: 129 });
		expect(decodeReplay(encodeReplay([], 0))).toEqual({ events: [], durationTicks: 0 });
	});
	it.each(
		[
			[],
			[84, 82, 2, 0, 0],
			[84, 82, 1],
			[84, 82, 1, 128, 0, 0],
			[84, 82, 1, 1, 1, 0],
			[84, 82, 1, 1, 1, 0, 10],
			[84, 82, 1, 1, 0, 0],
			[84, 82, 1, 1, 1, 1, 8],
			[84, 82, 1, 255, 255, 255, 255, 255, 255]
		].map((bytes) => ({ bytes }))
	)('rejects malformed bytes $bytes', ({ bytes }) =>
		expect(() => decodeReplay(Uint8Array.from(bytes))).toThrow()
	);
	it('rejects oversized payloads before decoding', () => {
		expect(() => decodeReplay(new Uint8Array(MAX_REPLAY_BYTES + 1))).toThrow();
	});
	it('roundtrips the 50000-event boundary and rejects one event more', () => {
		const events: ReplayEvent[] = Array.from({ length: 50000 }, (_, tick) => ({
			tick,
			action: 'left-up'
		}));
		const bytes = encodeReplay(events, 50000);
		expect(bytes.byteLength).toBeLessThan(MAX_REPLAY_BYTES);
		expect(decodeReplay(bytes).events).toEqual(events);
		expect(() => encodeReplay([...events, { tick: 50000, action: 'left-up' }], 50001)).toThrow();
	});
	it('roundtrips three-byte duration and delta integers up to the time boundary', () => {
		const events: ReplayEvent[] = [{ tick: 647999, action: 'hold' }];
		expect(decodeReplay(encodeReplay(events, 648000))).toEqual({ events, durationTicks: 648000 });
		expect(() => encodeReplay([], 648001)).toThrow();
	});
	it('rejects unordered, out-of-bounds, overfull or unknown events before encoding', () => {
		for (const events of [
			[
				{ tick: 2, action: 'hold' },
				{ tick: 1, action: 'hold' }
			],
			[{ tick: 3, action: 'hold' }],
			[{ tick: -1, action: 'hold' }],
			[{ tick: 0.5, action: 'hold' }],
			[{ tick: 0, action: 'invalid' }],
			Array(33).fill({ tick: 0, action: 'hold' })
		])
			expect(() => encodeReplay(events as ReplayEvent[], 3)).toThrow();
	});
});

describe('deterministic reference simulation', () => {
	it('matches stepped, binary-roundtripped and JSON-resumed state exactly', () => {
		const events: ReplayEvent[] = [
			{ tick: 0, action: 'left-down' },
			{ tick: 11, action: 'left-up' },
			{ tick: 12, action: 'rotate-cw' },
			{ tick: 13, action: 'hard-drop' },
			{ tick: 14, action: 'hold' },
			{ tick: 15, action: 'soft-drop-down' },
			{ tick: 32, action: 'soft-drop-up' },
			{ tick: 33, action: 'hard-drop' }
		];
		const config = { seed: 42 };
		const state = createGame(config);
		for (let tick = 0; tick < 40; tick++)
			stepGame(
				state,
				events.filter((e) => e.tick === tick).map((e) => e.action)
			);
		const decoded = decodeReplay(encodeReplay(events, 40));
		expect(simulateReplay(config, decoded.events, decoded.durationTicks)).toEqual(state);
		const resumed = JSON.parse(JSON.stringify(state));
		for (let tick = 0; tick < 100; tick++) {
			const actions: Action[] = tick === 55 ? ['rotate-ccw', 'hard-drop'] : [];
			stepGame(state, actions);
			stepGame(resumed, actions);
		}
		expect(resumed).toEqual(state);
	});
	it('rejects replay continuation after top-out rather than simulating free extra time', () => {
		const events = Array.from({ length: 40 }, (_, tick): ReplayEvent => ({
			tick,
			action: 'hard-drop'
		}));
		expect(() => simulateReplay({ seed: 1 }, events, 40)).toThrow('after game end');
	});
	it(
		'runs seeded adversarial input streams with identical states and valid invariants',
		{ timeout: 30000 },
		() => {
			for (let seed = 0; seed < 30; seed++) {
				const config = {
					seed,
					mode: 'training' as const,
					startLevel: [1, 31, 80, 81, 150][seed % 5],
					arrTicks: seed % 3
				};
				const first = createGame(config),
					second = createGame(config);
				let rng = seed;
				const events: ReplayEvent[] = [];
				let duration = 0;
				while (first.status === 'playing' && duration < 3000) {
					const next = nextRandom(rng);
					rng = next.state;
					const actions: Action[] =
						next.value % 3 === 0 ? [ACTIONS[(next.value >>> 8) % ACTIONS.length]] : [];
					for (const action of actions) events.push({ tick: duration, action });
					stepGame(first, actions);
					stepGame(second, actions);
					duration++;
					expect(first).toEqual(second);
					expect(first.next).toHaveLength(5);
					expect(first.board).toHaveLength(22);
					expect(Number.isSafeInteger(first.score)).toBe(true);
					expect(first.score).toBeGreaterThanOrEqual(0);
					expect(first.lockResets).toBeLessThanOrEqual(15);
					if (first.active) {
						expect(collides(first.board, first.active)).toBe(false);
						expect(new Set(cells(first.active).map(String)).size).toBe(4);
					}
				}
				const decoded = decodeReplay(encodeReplay(events, duration));
				expect(simulateReplay(config, decoded.events, decoded.durationTicks)).toEqual(first);
			}
		}
	);
});
