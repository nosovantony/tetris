import { env } from 'cloudflare:workers';
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (!building && (env as unknown as { DEPLOYMENT_ENV?: string }).DEPLOYMENT_ENV === 'staging') {
		response.headers.set('X-Marathon-Environment', 'staging');
		response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	}
	return response;
};
