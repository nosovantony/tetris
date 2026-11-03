import { LeaderboardDO } from './leaderboard-do';
import { ValidationDO } from './validation-do';
import { DuelRoomDO } from './duel-room-do';
import { MatchmakerDO } from './matchmaker-do';
import {
	issueRun,
	verifyRun,
	guestIdentity,
	TokenError,
	SigningUnavailable
} from '../../src/lib/server/run-crypto';
import { RULES_VERSION } from '../../src/lib/shared/leaderboard';
import { failure, HttpFailure, readLimited } from '../../src/lib/server/http';
import { MAX_FINISH_BYTES } from '../../src/lib/shared/runs';

export { LeaderboardDO, ValidationDO, DuelRoomDO, MatchmakerDO };

interface Env {
	LEADERBOARD: DurableObjectNamespace<LeaderboardDO>;
	VALIDATION: DurableObjectNamespace<ValidationDO>;
	DUEL_ROOM: DurableObjectNamespace<DuelRoomDO>;
	MATCHMAKER: DurableObjectNamespace<MatchmakerDO>;
	RUN_SIGNING_KEY?: string;
}

// No workers.dev, preview URLs or public routes. Only the private Service Binding.
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const path = new URL(request.url).pathname;
		try {
			if (path === '/duel/quick') {
				return await env.MATCHMAKER.getByName('global').fetch(request);
			}
			if (path === '/duel/ws') {
				const room = new URL(request.url).searchParams.get('room') || 'default';
				return await env.DUEL_ROOM.getByName(room).fetch(request);
			}
			if (request.method === 'GET' && path === '/me') {
				const guestId = await guestIdentity(
					env.RUN_SIGNING_KEY ?? '',
					request.headers.get('X-Guest-Token') ?? '',
					Date.now()
				);
				return await env.LEADERBOARD.getByName('global-v1').fetch(
					`https://internal/profile?guestId=${guestId}&rulesVersion=${RULES_VERSION}`
				);
			}
			if (request.method === 'POST' && path === '/runs') {
				const ticket = await issueRun(
					env.RUN_SIGNING_KEY ?? '',
					request.headers.get('X-Guest-Token') ?? '',
					Date.now()
				);
				return Response.json(ticket, { headers: { 'Cache-Control': 'private, no-store' } });
			}
			if (request.method === 'POST' && path === '/finish') {
				let body;
				try {
					body = JSON.parse(await readLimited(request, MAX_FINISH_BYTES));
				} catch (error) {
					if (error instanceof HttpFailure) throw error;
					throw new HttpFailure(400, 'Некорректный JSON');
				}
				if (
					!body ||
					typeof body.token !== 'string' ||
					typeof body.replay !== 'string' ||
					typeof body.playerName !== 'string' ||
					body.playerName.length > 80
				)
					throw new HttpFailure(400, 'Нужны token, replay и имя игрока');
				const claims = await verifyRun(
					env.RUN_SIGNING_KEY ?? '',
					body.token,
					request.headers.get('X-Guest-Token') ?? '',
					Date.now()
				);
				// Only authenticated, current, guest-bound claims reach the isolated validator.
				return await env.VALIDATION.getByName(claims.runId).fetch(
					'https://validation.internal/finish',
					{
						method: 'POST',
						body: JSON.stringify({ claims, replay: body.replay, playerName: body.playerName })
					}
				);
			}
			return await env.LEADERBOARD.getByName('global-v1').fetch(request);
		} catch (error) {
			if (error instanceof TokenError)
				return failure(
					new HttpFailure(401, 'Сессия истекла, повреждена или принадлежит другому браузеру')
				);
			if (error instanceof SigningUnavailable)
				return failure(new HttpFailure(503, 'Рейтинговые партии пока не настроены'));
			return failure(error);
		}
	}
} satisfies ExportedHandler<Env>;
