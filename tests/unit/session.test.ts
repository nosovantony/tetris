import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/lib/game/session';
import { simulateReplay } from '../../src/lib/game/simulator';

describe('fixed-step local session', () => {
	it('advances the same ticks at 60Hz and 120Hz', () => {
		const slow = new GameSession({ seed: 42 });
		const fast = new GameSession({ seed: 42 });
		for (const session of [slow, fast]) {
			session.start({ seed: 42 });
			session.frame(0);
		}
		for (let i = 1; i <= 120; i++) fast.frame((i * 1000) / 120);
		for (let i = 1; i <= 60; i++) slow.frame((i * 1000) / 60);
		expect(slow.game.tick).toBe(60);
		expect(fast.game).toEqual(slow.game);
	});
	it('pauses without advancing time, resumes after 3 seconds, records releases for exact replay', () => {
		const session = new GameSession({ seed: 1 });
		session.start({ seed: 1 });
		session.frame(0);
		session.enqueue('left-down');
		session.frame(17);
		expect(session.game.input.left).toBe(true);
		session.pause();
		session.frame(9000);
		expect(session.game.tick).toBe(1);
		session.enqueue('hard-drop'); // paused input ignored
		session.resume(10000);
		session.frame(12000);
		expect(session.countdown).toBe(1);
		expect(session.game.tick).toBe(1);
		session.frame(13000);
		session.frame(13017);
		expect(session.game.input.left).toBe(false);
		expect(session.game.piecesLocked).toBe(0);
		expect(simulateReplay({ seed: 1 }, session.events, session.game.tick)).toEqual(session.game);
	});
	it('pauses on long/negative frame deltas and bounded input overflow, never loses a release', () => {
		const session = new GameSession({ seed: 1 });
		session.start({ seed: 1 });
		session.frame(0);
		session.frame(1000);
		expect(session.phase).toBe('paused');
		expect(session.game.tick).toBe(0);
		session.start({ seed: 1 });
		session.frame(100);
		session.frame(50);
		expect(session.phase).toBe('paused');
		session.start({ seed: 1 });
		for (let i = 0; i < 33; i++) session.enqueue('rotate-cw');
		expect(session.phase).toBe('paused');
	});
	it('does not skip ticks after a hard drop and freezes after terminal state', () => {
		const session = new GameSession({ seed: 1 });
		session.start({ seed: 1 });
		session.frame(0);
		session.enqueue('hard-drop');
		session.frame(50);
		expect(session.game.piecesLocked).toBe(1);
		expect(session.game.tick).toBe(3);
		session.game.tick = 647999;
		session.frame(67);
		expect(session.phase).toBe('finished');
		const snapshot = structuredClone(session.game);
		session.enqueue('hard-drop');
		session.frame(1000);
		expect(session.game).toEqual(snapshot);
	});
	it('keeps local gameplay running when the bounded replay buffer fills', () => {
		const session = new GameSession({ seed: 1 });
		session.start({ seed: 1 });
		session.frame(0);
		session.events = Array(50000).fill({ tick: 0, action: 'left-up' });
		session.enqueue('hard-drop');
		session.frame(17);
		expect(session.replayAvailable).toBe(false);
		expect(session.events).toHaveLength(0);
		expect(session.phase).toBe('running');
		expect(session.game.piecesLocked).toBe(1);
	});
});
