import { backend } from '#lib/server/backend.js';
import { GUEST_COOKIE } from '#lib/shared/runs.js';
import { failure } from '#lib/server/http.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	try {
		if (!cookies.get(GUEST_COOKIE))
			return Response.json({ result: null }, { headers: { 'Cache-Control': 'private, no-store' } });
		const response = await backend().fetch('https://backend.internal/me', {
			headers: { 'X-Guest-Token': cookies.get(GUEST_COOKIE)! }
		});
		return new Response(response.body, {
			status: response.status,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
		});
	} catch (error) {
		return failure(error);
	}
};
