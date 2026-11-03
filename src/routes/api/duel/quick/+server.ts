import { backend } from '#lib/server/backend.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	return backend().fetch('https://backend.internal/duel/quick', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});
};
