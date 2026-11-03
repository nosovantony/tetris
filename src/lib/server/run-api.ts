import { backend } from './backend';
import { failure, HttpFailure, readLimited } from './http';
import { GUEST_COOKIE, MAX_FINISH_BYTES } from '../shared/runs';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';

export async function runApi(event: RequestEvent, kind: 'start' | 'finish'): Promise<Response> {
	try {
		const { request, url, cookies } = event;
		if (
			request.headers.get('origin') !== url.origin ||
			request.headers.get('sec-fetch-site') === 'cross-site'
		)
			throw new HttpFailure(403, 'Разрешены только запросы с этого сайта');
		if (
			request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' ||
			request.headers.has('content-encoding')
		)
			throw new HttpFailure(415, 'Нужен application/json без сжатия');
		const limiter = (env as unknown as App.Platform['env']).RUN_RATE;
		if (!limiter) throw new HttpFailure(503, 'Защита API не настроена');
		const ip = request.headers.get('cf-connecting-ip') ?? 'local';
		if (!(await limiter.limit({ key: `${kind}:${ip}` }).then((result) => result.success)))
			throw new HttpFailure(429, 'Слишком много запросов; повторите через минуту');
		const body = await readLimited(request, kind === 'start' ? 128 : MAX_FINISH_BYTES);
		if (kind === 'start') {
			try {
				const value = JSON.parse(body);
				if (
					!value ||
					typeof value !== 'object' ||
					Array.isArray(value) ||
					Object.keys(value).length
				)
					throw new Error();
			} catch {
				throw new HttpFailure(400, 'Стартовый запрос должен быть пустым JSON-объектом');
			}
		}
		const response = await backend().fetch(
			`https://backend.internal/${kind === 'start' ? 'runs' : 'finish'}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Guest-Token': cookies.get(GUEST_COOKIE) ?? ''
				},
				body
			}
		);
		if (kind === 'start' && response.ok) {
			const { guestToken, ...ticket } = (await response.json()) as {
				guestToken: string;
				token: string;
				claims: unknown;
			};
			cookies.set(GUEST_COOKIE, guestToken, {
				path: '/',
				httpOnly: true,
				secure: url.protocol === 'https:',
				sameSite: 'strict',
				maxAge: 365 * 86400
			});
			return Response.json(ticket, { headers: { 'Cache-Control': 'private, no-store' } });
		}
		return new Response(response.body, {
			status: response.status,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
		});
	} catch (error) {
		return failure(error);
	}
}
