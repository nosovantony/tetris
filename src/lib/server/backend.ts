import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';

export function backend(): Fetcher {
	const binding = (env as unknown as App.Platform['env']).BACKEND;
	if (!binding) error(503, 'Хранилище временно недоступно');
	return binding;
}
