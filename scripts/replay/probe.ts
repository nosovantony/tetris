import { DurableObject } from 'cloudflare:workers';
import { validateSubmission } from '../../workers/backend/validation';
import { readLimited, failure } from '../../src/lib/server/http';
import { MAX_FINISH_BYTES } from '../../src/lib/shared/runs';

interface Env {
	PROBE: DurableObjectNamespace<ReplayProbe>;
	PROBE_TOKEN?: string;
}

export class ReplayProbe extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		const id = new URL(request.url).searchParams.get('id');
		try {
			const input = JSON.parse(await readLimited(request, MAX_FINISH_BYTES));
			const result = await validateSubmission(input);
			console.log(JSON.stringify({ probe: 'replay-v1', id, status: 200, result }));
			return Response.json(result);
		} catch (error) {
			const response = failure(error);
			console.log(JSON.stringify({ probe: 'replay-v1', id, status: response.status }));
			return response;
		}
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/health') return Response.json({ probe: 'replay-v1' });
		// Fail closed until a secret is installed. No test result writes, no binding
		// to production, no client-selectable namespace name or unbounded route.
		if (!env.PROBE_TOKEN || request.headers.get('X-Probe-Token') !== env.PROBE_TOKEN)
			return new Response('Forbidden', { status: 403 });
		if (request.method !== 'POST' || url.pathname !== '/validate')
			return new Response('Not found', { status: 404 });
		const slot = url.searchParams.get('slot');
		if (slot !== null && !/^[0-2]$/.test(slot))
			return new Response('Invalid slot', { status: 400 });
		return env.PROBE.getByName(`bounded-replay-probe-${slot ?? 'sequential'}`).fetch(request);
	}
};
