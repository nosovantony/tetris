import { describe, expect, it } from 'vitest';
import { makeCheckpoint, parseCheckpoint } from '../../src/lib/game/checkpoint';
import { GameSession } from '../../src/lib/game/session';
import { simulateReplay } from '../../src/lib/game/simulator';

const now = 1793664000000;
function saved() {
	const session = new GameSession({ seed: 42, mode: 'training' });
	session.start({ seed: 42, mode: 'training' });
	session.frame(0);
	session.enqueue('hard-drop');
	session.frame(17);
	session.enqueue('left-down');
	session.frame(34);
	return makeCheckpoint(session.game, session.events, true, now);
}

describe('local recovery checkpoints', () => {
	it('restores all game/PRNG/timer state on pause and records releases on resumed tick', () => {
		const checkpoint = saved();
		const restored = new GameSession({ seed: 0 });
		restored.restore(JSON.parse(JSON.stringify(checkpoint)), now);
		expect(restored.game).toEqual(checkpoint.game);
		expect(restored.phase).toBe('paused');
		restored.frame(1000);
		expect(restored.game.tick).toBe(checkpoint.game.tick);
		restored.resume(1000);
		restored.frame(4000);
		restored.frame(4017);
		expect(restored.game.input.left).toBe(false);
		expect(simulateReplay(checkpoint.game.config, restored.events, restored.game.tick)).toEqual(
			restored.game
		);
	});
	it('clones checkpoints so later live mutations cannot alter a pending write', () => {
		const checkpoint = saved();
		const parsed = parseCheckpoint(checkpoint, now);
		checkpoint.game.board[21][0] = 'T';
		checkpoint.events.length = 0;
		expect(parsed.game.board[21][0]).toBeNull();
		expect(parsed.events).not.toHaveLength(0);
	});
	it.each([
		'version',
		'expired',
		'future',
		'rules',
		'board',
		'cell',
		'active',
		'bag',
		'level',
		'ticks',
		'score',
		'events',
		'ranked',
		'finished',
		'rotation'
	])('rejects malformed %s without replacing live state', (kind) => {
		const checkpoint = saved();
		switch (kind) {
			case 'version':
				checkpoint.version = 2 as 1;
				break;
			case 'expired':
				checkpoint.savedAt = now - 8 * 86400000;
				break;
			case 'future':
				checkpoint.savedAt = now + 120000;
				break;
			case 'rules':
				checkpoint.game.rulesVersion = 'old';
				break;
			case 'board':
				checkpoint.game.board.pop();
				break;
			case 'cell':
				checkpoint.game.board[0][0] = 'bad' as 'T';
				break;
			case 'active':
				checkpoint.game.active!.x = 100;
				break;
			case 'bag':
				checkpoint.game.bag.remaining = ['T', 'T'];
				break;
			case 'level':
				checkpoint.game.level = 100;
				break;
			case 'ticks':
				checkpoint.game.tick = 648000;
				break;
			case 'score':
				checkpoint.game.score = NaN;
				break;
			case 'events':
				checkpoint.events[0].tick = -1;
				break;
			case 'ranked':
				checkpoint.game.config.mode = 'ranked';
				break;
			case 'finished':
				checkpoint.game.status = 'won';
				break;
			case 'rotation':
				checkpoint.game.lastRotation = { kickIndex: 9 };
				break;
		}
		const session = new GameSession({ seed: 1 });
		const before = structuredClone(session.game);
		expect(() => session.restore(checkpoint, now)).toThrow();
		expect(session.game).toEqual(before);
	});
	it('rejects empty and non-object records; accepts local recovery after replay buffer limit', () => {
		for (const value of [null, {}, 0, [], 'bad'])
			expect(() => parseCheckpoint(value, now)).toThrow();
		const checkpoint = saved();
		checkpoint.replayAvailable = false;
		checkpoint.events = [];
		expect(parseCheckpoint(checkpoint, now).replayAvailable).toBe(false);
	});
});
