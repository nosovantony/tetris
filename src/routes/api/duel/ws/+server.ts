import { backend } from '#lib/server/backend.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const upgrade = request.headers.get('Upgrade');
	if (upgrade?.toLowerCase() !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 });
	}

	const room = url.searchParams.get('room') || 'default';
	const name = url.searchParams.get('name') || 'Игрок';

	return backend().fetch(
		`https://backend.internal/duel/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`,
		request
	);
};
