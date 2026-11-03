import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	timeout: 30000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL: 'http://127.0.0.1:18795', trace: 'retain-on-failure' },
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'node scripts/e2e-server.mjs',
		url: 'http://127.0.0.1:18795/api/health',
		gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
		reuseExistingServer: false,
		timeout: 60000
	}
});
