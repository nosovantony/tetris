import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices, request as playwrightRequest } from '@playwright/test';
import { createServer } from 'vite';

// Deliberately fixed: this script writes synthetic results and must never be
// pointed at production via an environment override or CLI argument.
const base = 'https://tetris-web-staging.nosov-antony.workers.dev';
const report = { startedAt: new Date().toISOString(), base, checks: [] };
const headers = { Origin: base };
const contexts = [];
let browser;
const vite = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	appType: 'custom'
});
function checked(name, details = {}) {
	report.checks.push({ name, ...details });
	console.log(name);
}

try {
	const api = await playwrightRequest.newContext({ baseURL: base });
	const stranger = await playwrightRequest.newContext({ baseURL: base });
	contexts.push(api, stranger);
	const health = await api.get('/api/health');
	assert.equal(health.status(), 200);
	assert.equal(health.headers()['x-marathon-environment'], 'staging');
	assert.equal((await health.json()).backend.storage, 'sqlite');
	checked('staging web → private backend → SQLite');
	assert.equal(
		(
			await api.post('/api/runs', { headers: { Origin: 'https://foreign.invalid' }, data: {} })
		).status(),
		403
	);
	assert.equal((await api.post('/results', { headers, data: { score: 999999 } })).status(), 404);
	const issued = await api.post('/api/runs', { headers, data: {} });
	assert.equal(issued.status(), 200);
	assert.equal(issued.headers()['cache-control'], 'private, no-store');
	const ticket = await issued.json();
	assert.equal(ticket.claims.config.mode, 'ranked');
	assert.equal(ticket.claims.config.startLevel, 1);
	assert.equal(ticket.guestToken, undefined);
	const cookie = (await api.storageState()).cookies.find((c) => c.name === 'marathon_guest');
	assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Strict');
	checked('signed random-seed run and Secure HttpOnly guest cookie');
	const { createGame, stepGame } = await vite.ssrLoadModule('/src/lib/game/engine.ts');
	const { encodeReplay } = await vite.ssrLoadModule('/src/lib/game/codec.ts');
	const { toBase64 } = await vite.ssrLoadModule('/src/lib/shared/runs.ts');
	const state = createGame(ticket.claims.config),
		events = [];
	while (state.status === 'playing') {
		events.push({ tick: state.tick, action: 'hard-drop' });
		stepGame(state, ['hard-drop']);
	}
	const playerName = `Stage-${Date.now().toString(36)}`;
	const payload = {
		token: ticket.token,
		replay: toBase64(encodeReplay(events, state.tick)),
		playerName,
		score: 999999999,
		lines: 1500,
		level: 150
	};
	assert.equal((await stranger.post('/api/runs/finish', { headers, data: payload })).status(), 401);
	assert.equal(
		(
			await api.post('/api/runs/finish', {
				headers,
				data: { ...payload, token: ticket.token + 'A' }
			})
		).status(),
		401
	);
	checked('guestless and forged token rejection');
	const finish = await api.post('/api/runs/finish', { headers, data: payload });
	assert.equal(finish.status(), 200, await finish.text());
	assert.equal((await finish.json()).accepted, true);
	const duplicate = await api.post('/api/runs/finish', { headers, data: payload });
	assert.deepEqual(await duplicate.json(), { accepted: true, duplicate: true, improved: false });
	const personal = await api.get('/api/leaderboard/me');
	assert.equal(personal.headers()['cache-control'], 'private, no-store');
	const best = (await personal.json()).result;
	assert.equal(best.score, state.score);
	assert.equal(best.lines, state.lines);
	assert.equal(best.durationTicks, state.tick);
	assert.equal(best.playerName, playerName);
	assert.equal((await (await stranger.get('/api/leaderboard/me')).json()).result, null);
	checked('authoritative result, ignored client scores, idempotent receipt, private profile', {
		score: best.score,
		lines: best.lines,
		durationTicks: best.durationTicks
	});
	const top = await api.get('/api/leaderboard');
	assert.equal(top.status(), 200);
	assert.equal(top.headers()['set-cookie'], undefined);
	const entries = (await top.json()).entries;
	if (!entries.some((e) => e.playerName === playerName && e.score === state.score)) {
		// One bounded TTL wait makes repeat invocations safe without bypassing the
		// canonical cache key or weakening production cache semantics.
		await new Promise((resolve) => setTimeout(resolve, 31000));
		const refreshed = await api.get('/api/leaderboard');
		assert.ok(
			(await refreshed.json()).entries.some(
				(e) => e.playerName === playerName && e.score === state.score
			),
			'Verified result absent after public cache TTL'
		);
	}
	assert.ok(entries.every((e) => !('guestId' in e) && !('runId' in e)));
	const cached = await stranger.get('/api/leaderboard?ignored=staging-test');
	assert.equal(cached.headers()['x-leaderboard-cache'], 'HIT');
	assert.equal(cached.headers()['set-cookie'], undefined);
	checked('public top contains verified result, shared Cache API HIT without identity');
	const invalid = await api.post('/api/runs/finish', {
		headers,
		data: { token: 'invalid.invalid', replay: 'AAA', playerName }
	});
	assert.equal(invalid.status(), 401);
	assert.equal(
		(
			await api.post('/api/runs/finish', {
				headers,
				data: { ...payload, replay: 'A'.repeat(200000) }
			})
		).status(),
		413
	);
	const fresh = await (await api.post('/api/runs', { headers, data: {} })).json();
	assert.equal(
		(
			await api.post('/api/runs/finish', {
				headers,
				data: { token: fresh.token, replay: 'AAA', playerName }
			})
		).status(),
		422
	);
	checked('bounded payload and malformed replay rejection');
	browser = await chromium.launch({ headless: true });
	for (const [name, device] of [
		['desktop', devices['Desktop Chrome']],
		['mobile', devices['Pixel 7']]
	]) {
		const context = await browser.newContext(device);
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		try {
			await page.goto(base);
			await page.getByText('STAGING — тестовая версия.', { exact: false }).waitFor();
			await page.getByLabel('Режим', { exact: true }).selectOption('ranked');
			await page.getByRole('button', { name: 'Начать игру' }).click();
			await page.locator('.arena[data-phase="running"]').waitFor();
			await page.keyboard.press('Space');
			await page.getByRole('button', { name: 'Пауза', exact: true }).click();
			await page.getByTestId('storage-status').filter({ hasText: 'Партия сохранена' }).waitFor();
			await page.reload();
			await page.getByRole('heading', { name: 'Партия восстановлена' }).waitFor();
			await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
			await page.locator('.arena[data-phase="running"]').waitFor();
			for (
				let i = 0;
				i < 30 && (await page.locator('.arena').getAttribute('data-phase')) === 'running';
				i++
			) {
				await page.keyboard.press('Space');
				// Advance by a real rendering frame; server wall-time checks remain enabled.
				await page.evaluate(
					() =>
						new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
				);
			}
			await page.getByRole('button', { name: 'Отправить результат' }).waitFor();
			await page.reload();
			await page.getByRole('button', { name: 'Отправить результат' }).waitFor();
			await page.getByLabel('Имя в рейтинге').fill(`STG-${name}`);
			const submitted = page.waitForResponse((r) => r.url().endsWith('/api/runs/finish'));
			await page.getByRole('button', { name: 'Отправить результат' }).click();
			const response = await submitted;
			assert.equal(response.status(), 200, await response.text());
			assert.equal((await response.json()).accepted, true);
			const profile = await context.request.get(`${base}/api/leaderboard/me`);
			assert.equal((await profile.json()).result.playerName, `STG-${name}`);
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			assert.deepEqual(errors, []);
			await page.goto(`${base}/leaderboard`);
			await page.getByRole('heading', { name: 'Таблица рекордов' }).waitFor();
			await page.getByText('Ваш рекорд:', { exact: false }).waitFor();
			checked(`${name}: real signed play, IndexedDB recovery, finished outbox reload, UI submit`, {
				pageErrors: errors.length
			});
		} finally {
			await context.close();
		}
	}
	report.outcome = 'passed';
} catch (error) {
	report.outcome = 'failed';
	report.error = error.message;
	throw error;
} finally {
	await browser?.close();
	for (const context of contexts) await context.dispose();
	await vite.close();
	report.finishedAt = new Date().toISOString();
	await mkdir('docs/staging/2026-11-03', { recursive: true });
	await writeFile(
		'docs/staging/2026-11-03/smoke-results.json',
		JSON.stringify(report, null, 2) + '\n'
	);
}
