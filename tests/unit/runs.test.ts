import { describe, expect, it } from 'vitest';
import {
	issueRun,
	verifyRun,
	signToken,
	guestIdentity,
	TokenError
} from '../../src/lib/server/run-crypto';
import { fromBase64, toBase64, RUN_LIFETIME_MS, parseRunClaims } from '../../src/lib/shared/runs';
import { readLimited } from '../../src/lib/server/http';
import { createGame, stepGame } from '../../src/lib/game/engine';
import { encodeReplay } from '../../src/lib/game/codec';
import { simulateReplay } from '../../src/lib/game/simulator';
import { validateSubmission } from '../../workers/backend/validation';
import { makeCheckpoint } from '../../src/lib/game/checkpoint';
import { GameSession } from '../../src/lib/game/session';
import type { ReplayEvent } from '../../src/lib/game/types';
import { rankedFixture } from './fixtures/ranked-replay';

const secret = 'unit-test-key-only-01234567890123456789';
const now = Date.now();
async function ticket() {
	return issueRun(secret, '', now);
}

describe('signed run contracts', () => {
	it('issues fixed ranked config and guest-bound HMAC, reuses identity without database writes', async () => {
		const first = await ticket();
		const second = await issueRun(secret, first.guestToken, now + 1);
		expect(second.claims.guestId).toBe(first.claims.guestId);
		expect(second.claims.runId).not.toBe(first.claims.runId);
		expect(await verifyRun(secret, first.token, first.guestToken, now)).toEqual(first.claims);
		expect(await guestIdentity(secret, first.guestToken, now)).toBe(first.claims.guestId);
		expect(first.claims.config).toMatchObject({
			mode: 'ranked',
			startLevel: 1,
			dasTicks: 8,
			arrTicks: 1
		});
	});
	it('rejects forgery, wrong key, guest mismatch, expiry, future issuance and domain confusion', async () => {
		const first = await ticket(),
			other = await ticket();
		await expect(
			verifyRun(secret, first.token.slice(0, -2) + 'AA', first.guestToken, now)
		).rejects.toBeInstanceOf(TokenError);
		await expect(verifyRun(secret + 'other', first.token, first.guestToken, now)).rejects.toThrow();
		await expect(verifyRun(secret, first.token, other.guestToken, now)).rejects.toThrow();
		await expect(
			verifyRun(secret, first.token, first.guestToken, now + RUN_LIFETIME_MS)
		).rejects.toThrow();
		await expect(verifyRun(secret, first.token, first.guestToken, now - 2000)).rejects.toThrow();
		await expect(verifyRun(secret, first.guestToken, first.guestToken, now)).rejects.toThrow();
		const wrongRules = await signToken(secret, 'run', { ...first.claims, rulesVersion: 'old' });
		await expect(verifyRun(secret, wrongRules, first.guestToken, now)).rejects.toThrow();
	});
	it('fails closed without signing secret and rejects custom rules or training tokens', async () => {
		await expect(issueRun('', '', now)).rejects.toThrow('not configured');
		const first = await ticket();
		for (const config of [
			{ ...first.claims.config, mode: 'training' },
			{ ...first.claims.config, startLevel: 2 },
			{ ...first.claims.config, arrTicks: 0 },
			{ ...first.claims.config, seed: -1 }
		])
			expect(() => parseRunClaims({ ...first.claims, config })).toThrow();
	});
	it('validates canonical bounded base64url', () => {
		const bytes = Uint8Array.from([0, 127, 255, 254]);
		expect(fromBase64(toBase64(bytes), 4)).toEqual(bytes);
		for (const value of ['', 'a', 'AB', 'AA=', '+/', '____'])
			expect(() => fromBase64(value, 2)).toThrow();
	});
	it('bounds actual streamed bytes even without Content-Length', async () => {
		const request = new Request('https://test', { method: 'POST', body: 'abcdef' });
		await expect(readLimited(request, 3)).rejects.toMatchObject({ status: 413 });
		await expect(
			readLimited(new Request('https://test', { method: 'POST', body: '{}' }), 2)
		).resolves.toBe('{}');
	});
});

describe('authoritative replay result', () => {
	it('verifies an action-only multi-line fixture with level progression', async () => {
		const run = await ticket();
		const claims = { ...run.claims, config: { ...run.claims.config, seed: 42 } };
		const { state, events } = rankedFixture(claims.config);
		expect(state.lines).toBeGreaterThanOrEqual(10);
		expect(state.level).toBeGreaterThan(1);
		const result = await validateSubmission(
			{ claims, playerName: 'Игрок', replay: toBase64(encodeReplay(events, state.tick)) },
			now + 10000
		);
		expect(result).toMatchObject({
			lines: state.lines,
			score: state.score,
			level: state.level,
			durationTicks: state.tick
		});
	});
	it('computes loss scores from actions, not client claims, and restores finished ranked outbox', async () => {
		const run = await ticket();
		const state = createGame(run.claims.config);
		const events: ReplayEvent[] = [];
		while (state.status === 'playing') {
			events.push({ tick: state.tick, action: 'hard-drop' });
			stepGame(state, ['hard-drop']);
		}
		const result = await validateSubmission(
			{
				claims: run.claims,
				replay: toBase64(encodeReplay(events, state.tick)),
				playerName: '  Игрок  '
			},
			now + 1000
		);
		expect(result).toMatchObject({
			score: state.score,
			lines: state.lines,
			durationTicks: state.tick,
			playerName: 'Игрок',
			isClear: false
		});
		const session = new GameSession({ seed: 0 });
		session.restore(makeCheckpoint(state, events, true, now, run), now);
		expect(session.phase).toBe('finished');
		expect(session.ticket?.token).toBe(run.token);
	});
	it('rejects ongoing, continued-after-end, malformed and impossibly fast replays', async () => {
		const run = await ticket();
		const input = {
			claims: run.claims,
			replay: toBase64(encodeReplay([], 1)),
			playerName: 'Игрок'
		};
		await expect(validateSubmission(input, now)).rejects.toMatchObject({ status: 422 });
		await expect(validateSubmission({ ...input, replay: 'bad' }, now)).rejects.toMatchObject({
			status: 422
		});
		await expect(
			validateSubmission({ ...input, replay: toBase64(encodeReplay([], 1000)) }, now)
		).rejects.toMatchObject({ status: 422 });
		const state = createGame(run.claims.config),
			events: ReplayEvent[] = [];
		while (state.status === 'playing') {
			events.push({ tick: state.tick, action: 'hard-drop' });
			stepGame(state, ['hard-drop']);
		}
		await expect(
			validateSubmission(
				{ ...input, replay: toBase64(encodeReplay(events, state.tick + 1)) },
				now + 1000
			)
		).rejects.toMatchObject({ status: 422 });
	});
	it('ranked recovery requires ticket/config agreement; local state is never trusted for a score', async () => {
		const run = await ticket();
		const state = createGame(run.claims.config);
		const checkpoint = makeCheckpoint(state, [], true, now, run);
		checkpoint.game.config.seed ^= 1;
		expect(() => new GameSession({ seed: 1 }).restore(checkpoint, now)).toThrow();
	});
	it('matches reference simulation for seeded terminal streams and maximum-action batches', async () => {
		const run = await ticket();
		for (let seed = 0; seed < 12; seed++) {
			const claims = { ...run.claims, config: { ...run.claims.config, seed } };
			const state = createGame(claims.config),
				events: ReplayEvent[] = [];
			while (state.status === 'playing') {
				const actions =
					state.tick % 2 === 0
						? ['rotate-cw' as const, 'left-down' as const, 'left-up' as const, 'hard-drop' as const]
						: ['hard-drop' as const];
				for (const action of actions) events.push({ tick: state.tick, action });
				stepGame(state, actions);
			}
			const reference = simulateReplay(claims.config, events, state.tick);
			const result = await validateSubmission(
				{ claims, playerName: 'Игрок', replay: toBase64(encodeReplay(events, state.tick)) },
				now + 1000
			);
			expect(result.score).toBe(reference.score);
			expect(result.durationTicks).toBe(reference.tick);
		}
	});
});
