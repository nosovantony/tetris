import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				platformProxy: process.env.TETRIS_STATE_DIR
					? { persist: { path: process.env.TETRIS_STATE_DIR } }
					: undefined
			})
		})
	],
	server: { host: '127.0.0.1', port: Number(process.env.DEV_PORT || 5173), strictPort: true }
});
