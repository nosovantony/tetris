import { decodeReplay, MAX_REPLAY_BYTES } from '../../src/lib/game/codec';
import { createGame, stepGame } from '../../src/lib/game/engine';
import { fromBase64, type RunClaims } from '../../src/lib/shared/runs';
import { parseVerifiedResult, type VerifiedResult } from '../../src/lib/shared/leaderboard';
import { HttpFailure } from '../../src/lib/server/http';

export interface ValidationInput {
	claims: RunClaims;
	replay: string;
	playerName: string;
}

export function decodeSubmission(input: ValidationInput, now: number) {
	try {
		// Reject invalid names before any expensive simulation.
		parseVerifiedResult(
			{
				runId: input.claims.runId,
				guestId: input.claims.guestId,
				rulesVersion: input.claims.rulesVersion,
				playerName: input.playerName,
				score: 0,
				lines: 0,
				level: 1,
				durationTicks: 0,
				isClear: false,
				expiresAt: input.claims.expiresAt
			},
			now
		);
		const replay = decodeReplay(fromBase64(input.replay, MAX_REPLAY_BYTES));
		if (
			replay.durationTicks === 0 ||
			(replay.durationTicks * 1000) / 60 > now - input.claims.issuedAt + 1000
		)
			throw new Error('Impossible elapsed time');
		return replay;
	} catch {
		throw new HttpFailure(422, 'Некорректный replay или длительность партии');
	}
}

// Reference semantics, bounded by codec limits. Each chunk yields to the runtime;
// no event-driven optimization or full-marathon cloud CPU guarantee is implied.
export async function validateSubmission(
	input: ValidationInput,
	now = Date.now()
): Promise<VerifiedResult> {
	const { events, durationTicks } = decodeSubmission(input, now);
	const state = createGame(input.claims.config);
	let cursor = 0;
	const deadline = performance.now() + 15000;
	for (let tick = 0; tick < durationTicks; tick++) {
		if (state.status !== 'playing')
			throw new HttpFailure(422, 'Replay продолжается после завершения партии');
		const start = cursor;
		while (cursor < events.length && events[cursor].tick === tick) cursor++;
		stepGame(
			state,
			events.slice(start, cursor).map((event) => event.action)
		);
		if ((tick + 1) % 4096 === 0) {
			if (performance.now() > deadline)
				throw new HttpFailure(503, 'Проверка превысила бюджет; результат не записан');
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	if (state.status === 'playing')
		throw new HttpFailure(422, 'Принимаются только завершённые партии');
	try {
		return parseVerifiedResult(
			{
				runId: input.claims.runId,
				guestId: input.claims.guestId,
				rulesVersion: state.rulesVersion,
				playerName: input.playerName,
				score: state.score,
				lines: state.lines,
				level: state.level,
				durationTicks: state.tick,
				isClear: state.status === 'won',
				expiresAt: input.claims.expiresAt
			},
			Math.max(now, Date.now())
		);
	} catch {
		throw new HttpFailure(422, 'Некорректное имя или истёк срок отправки');
	}
}
