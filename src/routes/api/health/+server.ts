import { json } from '@sveltejs/kit';
import { backend } from '#lib/server/backend.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const response = await backend().fetch('https://backend.internal/health');
		if (!response.ok) throw new Error('Backend health check failed');
		const storage = await response.json();
		return json({ status: 'ok', backend: storage }, { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json(
			{ status: 'unavailable' },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } }
		);
	}
};
