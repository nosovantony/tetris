import { describe, expect, it } from 'vitest';
import { generateReplay } from '../../scripts/replay/generator';
import { stretchReplay, padReplay } from '../../scripts/replay/stretch';
import { simulateReplay } from '../../src/lib/game/simulator';
import { encodeReplay } from '../../src/lib/game/codec';
import { rotateHeavy } from '../../scripts/replay/heavy';

const config = { seed: 42, mode: 'ranked' as const };

describe('offline replay tooling', () => {
	it('records real hold actions and verifies rotation augmentation through reference replay', () => {
		const fixture = generateReplay(config, { maxPieces: 6, holdEvery: 2 });
		expect(fixture.events.filter((e) => e.action === 'hold')).toHaveLength(3);
		const heavy = rotateHeavy(config, fixture.events, fixture.state.tick, 1);
		expect(heavy.metrics.rotationAttempts).toBeGreaterThan(0);
		expect(rotateHeavy(config, fixture.events, fixture.state.tick, 1)).toEqual(heavy);
		expect(rotateHeavy(config, fixture.events, fixture.state.tick, 81).events).toEqual(
			fixture.events
		);
		expect(simulateReplay(config, heavy.events, heavy.state.tick)).toEqual(heavy.state);
		expect(heavy.state).toEqual(fixture.state);
	});
	it('produces reproducible action-only routes without relying on planner snapshots', () => {
		const first = generateReplay(config, { maxPieces: 5, lookahead: 2 });
		const second = generateReplay(config, { maxPieces: 5, lookahead: 2 });
		expect(first).toEqual(second);
		expect(first.state.piecesLocked).toBe(5);
		expect(simulateReplay(config, first.events, first.state.tick)).toEqual(first.state);
	});
	it('stretches using valid actions and ticks rather than rewriting timers', () => {
		const first = generateReplay(config, { maxPieces: 2 });
		const stretched = stretchReplay(config, first.events, first.state.tick);
		expect(stretched.state.tick).toBeGreaterThan(first.state.tick);
		expect(simulateReplay(config, stretched.events, stretched.state.tick)).toEqual(stretched.state);
	});
	it('pads idempotent releases without changing state, respecting per-tick limits', () => {
		const fixture = generateReplay(config, { maxPieces: 5 });
		const padded = padReplay(fixture.events, fixture.state.tick, fixture.events.length + 30);
		expect(padded).toHaveLength(fixture.events.length + 30);
		expect(simulateReplay(config, padded, fixture.state.tick)).toEqual(fixture.state);
		expect(() => encodeReplay(padded, fixture.state.tick)).not.toThrow();
		expect(() => padReplay(fixture.events, fixture.state.tick, 0)).toThrow();
		expect(() => padReplay(fixture.events, fixture.state.tick, 100000)).toThrow();
	});
});
