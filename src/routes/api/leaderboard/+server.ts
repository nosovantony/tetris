import { json } from '@sveltejs/kit';
import { backend } from '#lib/server/backend.js';
import { RULES_VERSION } from '#lib/shared/leaderboard.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const cache =
			typeof caches !== 'undefined'
				? (caches as CacheStorage & { default?: Cache }).default
				: undefined;
		// Canonical key ignores cookies and arbitrary queries. Public data only.
		const key = new Request(`${url.origin}/api/leaderboard?rulesVersion=${RULES_VERSION}`);
		const cached = await cache?.match(key);
		if (cached)
			return new Response(cached.body, {
				headers: { ...Object.fromEntries(cached.headers), 'X-Leaderboard-Cache': 'HIT' }
			});
		const response = await backend().fetch(
			`https://backend.internal/leaderboard?rulesVersion=${RULES_VERSION}`
		);
		if (!response.ok) throw new Error('Backend request failed');
		const result = json(await response.json(), {
			headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' }
		});
		if (cache) {
			const put = cache.put(key, result.clone()).catch(() => {});
			await put;
		}
		result.headers.set('X-Leaderboard-Cache', cache ? 'MISS' : 'BYPASS');
		return result;
	} catch {
		return json(
			{ error: 'Таблица рекордов временно недоступна' },
			{
				status: 503,
				headers: { 'Cache-Control': 'no-store' }
			}
		);
	}
};
