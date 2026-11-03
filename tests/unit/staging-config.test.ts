import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('staging isolation', () => {
	it('has separate Worker names, service and rate-limit namespace without remote DO bindings', () => {
		const web = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
		const backend = JSON.parse(readFileSync('workers/backend/wrangler.jsonc', 'utf8'));
		const stageWeb = web.env.staging,
			stageBackend = backend.env.staging;
		expect(stageWeb.name).toBe('tetris-web-staging');
		expect(stageBackend.name).toBe('tetris-backend-staging');
		expect(stageWeb.services).toEqual([{ binding: 'BACKEND', service: stageBackend.name }]);
		expect(stageWeb.ratelimits[0].namespace_id).not.toBe(web.ratelimits[0].namespace_id);
		expect(stageBackend.workers_dev).toBe(false);
		expect(stageBackend.preview_urls).toBe(false);
		expect(stageBackend.durable_objects.bindings).toEqual(backend.durable_objects.bindings);
		for (const binding of stageBackend.durable_objects.bindings) {
			expect(binding.script_name).toBeUndefined();
			expect(binding.environment).toBeUndefined();
		}
		expect(stageBackend.vars?.RUN_SIGNING_KEY).toBeUndefined();
		expect(stageWeb.vars).toEqual({ DEPLOYMENT_ENV: 'staging' });
	});
});
