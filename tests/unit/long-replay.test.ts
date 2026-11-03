import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeReplay, encodeReplay } from '../../src/lib/game/codec';
import { simulateReplay } from '../../src/lib/game/simulator';
import { toBase64, RUN_LIFETIME_MS, type RunClaims } from '../../src/lib/shared/runs';
import { validateSubmission } from '../../workers/backend/validation';
import { makeCheckpoint, parseCheckpoint } from '../../src/lib/game/checkpoint';
import manifest from '../fixtures/replays/manifest.json';
import heavyManifest from '../fixtures/replays-heavy/manifest.json';

describe('archived action-only long replays', () => {
	for (const fixture of [
		...manifest.fixtures.map((f) => ({ ...f, directory: 'replays' })),
		...heavyManifest.fixtures.map((f) => ({ ...f, directory: 'replays-heavy' }))
	]) {
		it(
			`${fixture.name}: canonical bytes, exact reference state, server result and recovery`,
			{ timeout: 20000 },
			async () => {
				const bytes = readFileSync(
					new URL(`../fixtures/${fixture.directory}/${fixture.file}`, import.meta.url)
				);
				expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
				expect(bytes.length).toBe(fixture.bytes);
				const replay = decodeReplay(bytes);
				expect(replay.events.length).toBe(fixture.events);
				expect(encodeReplay(replay.events, replay.durationTicks)).toEqual(new Uint8Array(bytes));
				const config = fixture.config as RunClaims['config'];
				const state = simulateReplay(config, replay.events, replay.durationTicks);
				expect(createHash('sha256').update(JSON.stringify(state)).digest('hex')).toBe(
					fixture.stateSha256
				);
				expect({
					status: state.status,
					score: state.score,
					lines: state.lines,
					level: state.level,
					durationTicks: state.tick,
					piecesLocked: state.piecesLocked,
					timeBonus: state.timeBonus
				}).toEqual(fixture.expected);
				const now = Date.now();
				const issuedAt = now - 3 * 60 * 60 * 1000;
				const claims: RunClaims = {
					v: 1,
					runId: crypto.randomUUID(),
					guestId: crypto.randomUUID(),
					rulesVersion: manifest.rulesVersion,
					issuedAt,
					expiresAt: issuedAt + RUN_LIFETIME_MS,
					config
				};
				const result = await validateSubmission(
					{ claims, replay: toBase64(bytes), playerName: 'Fixture' },
					now
				);
				expect(result).toMatchObject({
					score: state.score,
					lines: state.lines,
					level: state.level,
					durationTicks: state.tick,
					isClear: state.status === 'won'
				});
				expect(
					parseCheckpoint(
						makeCheckpoint(state, replay.events, true, now, { claims, token: 'fixture.signature' }),
						now
					).game
				).toEqual(state);
			}
		);
	}
	it(
		'rejects almost-three-hour unfinished replay after full simulation',
		{ timeout: 20000 },
		async () => {
			const fixture = manifest.fixtures.find((f) => f.name === 'adversarial')!;
			const replay = decodeReplay(
				readFileSync(new URL(`../fixtures/replays/${fixture.file}`, import.meta.url))
			);
			const now = Date.now(),
				issuedAt = now - 3 * 60 * 60 * 1000;
			const claims: RunClaims = {
				v: 1,
				runId: crypto.randomUUID(),
				guestId: crypto.randomUUID(),
				rulesVersion: manifest.rulesVersion,
				issuedAt,
				expiresAt: issuedAt + RUN_LIFETIME_MS,
				config: fixture.config as RunClaims['config']
			};
			const ticks = replay.durationTicks - 1;
			await expect(
				validateSubmission(
					{
						claims,
						playerName: 'Fixture',
						replay: toBase64(
							encodeReplay(
								replay.events.filter((e) => e.tick < ticks),
								ticks
							)
						)
					},
					now
				)
			).rejects.toMatchObject({ status: 422 });
		}
	);
});
