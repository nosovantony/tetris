import { backend } from '#lib/server/backend.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url }) => {
	const targetWins = url.searchParams.get('targetWins') || url.searchParams.get('wins') || '2';
	return backend().fetch(
		`https://backend.internal/duel/quick?targetWins=${encodeURIComponent(targetWins)}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		}
	);
};
