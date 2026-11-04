import { backend } from '#lib/server/backend.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const upgrade = request.headers.get('Upgrade');
	if (upgrade?.toLowerCase() !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 });
	}

	const room = url.searchParams.get('room') || 'default';
	const name = url.searchParams.get('name') || 'Игрок';
	const targetWins = url.searchParams.get('targetWins') || url.searchParams.get('wins') || '2';

	const response = await backend().fetch(
		`https://backend.internal/duel/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}&targetWins=${encodeURIComponent(targetWins)}`,
		request
	);

	// Service Binding responses can expose immutable headers. SvelteKit may
	// append route headers while finalizing an endpoint response, so clone the
	// response while preserving the Cloudflare WebSocket upgrade.
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: new Headers(response.headers),
		webSocket: response.webSocket
	});
};
