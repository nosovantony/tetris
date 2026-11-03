import { expect, test } from '@playwright/test';

test('ranked game gets signed seed, survives reload and submits verified replay idempotently', async ({
	page
}) => {
	await page.goto('/');
	await page.getByLabel('Режим', { exact: true }).selectOption('ranked');
	await expect(page.getByLabel('Стартовый уровень')).toBeDisabled();
	await page.clock.install();
	const issued = page.waitForResponse(
		(response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST'
	);
	await page.getByRole('button', { name: 'Начать игру' }).click();
	const ticket = await (await issued).json();
	expect(ticket.claims.config).toMatchObject({ mode: 'ranked', startLevel: 1 });
	expect(ticket.guestToken).toBeUndefined();
	const cookies = await page.context().cookies();
	expect(cookies.find((cookie) => cookie.name === 'marathon_guest')).toMatchObject({
		httpOnly: true,
		sameSite: 'Strict'
	});
	await page.clock.runFor(50);
	await page.getByRole('button', { name: 'Пауза', exact: true }).click();
	await expect(page.getByTestId('storage-status')).toContainText('Партия сохранена');
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Партия восстановлена' })).toBeVisible();
	await page.getByRole('button', { name: 'Продолжить' }).click();
	await page.clock.runFor(3100);
	for (
		let i = 0;
		i < 25 && (await page.locator('.arena').getAttribute('data-phase')) === 'running';
		i++
	) {
		await page.keyboard.press('Space');
		await page.clock.runFor(20);
	}
	await expect(page.getByRole('button', { name: 'Отправить результат' })).toBeVisible();
	// A finished ranked replay remains in IndexedDB until an accepted response.
	await page.reload();
	await expect(page.getByRole('button', { name: 'Отправить результат' })).toBeVisible();
	const expectedScore = Number((await page.getByTestId('score').innerText()).replace(/\s/g, ''));
	await page.getByLabel('Имя в рейтинге').fill('<Игрок>');
	await page.route('**/api/runs/finish', (route) =>
		route.continue({
			postData: JSON.stringify({
				...JSON.parse(route.request().postData()!),
				score: 999999999,
				lines: 1500,
				level: 150
			})
		})
	);
	const finish = page.waitForResponse((response) => response.url().endsWith('/api/runs/finish'));
	await page.getByRole('button', { name: 'Отправить результат' }).click();
	const response = await finish;
	expect(response.status()).toBe(200);
	expect(await response.json()).toMatchObject({ accepted: true });
	await expect(page.getByTestId('api-status')).toContainText('сервером');
	const request = response.request();
	const retry = await page.request.post('/api/runs/finish', {
		headers: { Origin: 'http://127.0.0.1:18795', 'Content-Type': 'application/json' },
		data: request.postData()!
	});
	expect(await retry.json()).toMatchObject({ accepted: true, duplicate: true });
	const profile = await page.request.get('/api/leaderboard/me');
	expect(profile.headers()['cache-control']).toBe('private, no-store');
	expect((await profile.json()).result.playerName).toBe('<Игрок>');
	const authoritative = await page.request.get('/api/leaderboard/me');
	expect((await authoritative.json()).result.score).toBe(expectedScore);
});

test('API denies cross-origin, forged and guestless submissions and bounds streamed payloads', async ({
	request,
	browser
}) => {
	const base = 'http://127.0.0.1:18795';
	const origin = { Origin: base };
	expect(
		(
			await request.post('/api/runs', { headers: { Origin: 'https://foreign.test' }, data: {} })
		).status()
	).toBe(403);
	const issued = await request.post('/api/runs', { headers: origin, data: {} });
	expect(issued.status()).toBe(200);
	const ticket = await issued.json();
	expect(
		(
			await request.post('/api/runs', { headers: origin, data: { seed: 42, startLevel: 150 } })
		).status()
	).toBe(400);
	const foreign = await browser.newContext();
	try {
		const missingGuest = await foreign.request.post(`${base}/api/runs/finish`, {
			headers: origin,
			data: { token: ticket.token, replay: 'AAA', playerName: 'Игрок' }
		});
		expect(missingGuest.status()).toBe(401);
		await foreign.request.post(`${base}/api/runs`, { headers: origin, data: {} });
		const wrongGuest = await foreign.request.post(`${base}/api/runs/finish`, {
			headers: origin,
			data: { token: ticket.token, replay: 'AAA', playerName: 'Игрок' }
		});
		expect(wrongGuest.status()).toBe(401);
	} finally {
		await foreign.close();
	}
	const forged = await request.post('/api/runs/finish', {
		headers: origin,
		data: { token: ticket.token + 'A', replay: 'AAA', playerName: 'Игрок', score: 999999 }
	});
	expect(forged.status()).toBe(401);
	const oversized = await request.post('/api/runs/finish', {
		headers: origin,
		data: { token: ticket.token, replay: 'A'.repeat(200000), playerName: 'Игрок' }
	});
	expect(oversized.status()).toBe(413);
	const invalid = await request.post('/api/runs/finish', {
		headers: origin,
		data: { token: ticket.token, replay: 'AAA', playerName: 'Игрок' }
	});
	expect(invalid.status()).toBe(422);
});

test('bounded per-location API rate limit returns 429 without invoking validation', async ({
	request,
	isMobile
}) => {
	test.skip(isMobile, 'One shared limiter check is sufficient');
	let last = 0;
	for (let i = 0; i < 31; i++) {
		const response = await request.post('/api/runs/finish', {
			headers: { Origin: 'http://127.0.0.1:18795', 'CF-Connecting-IP': '198.51.100.150' },
			data: {}
		});
		last = response.status();
	}
	expect(last).toBe(429);
});

test('public cache is shared without private cookies and personal responses never cache', async ({
	request
}) => {
	const first = await request.get('/api/leaderboard?ignored=one');
	expect(first.status()).toBe(200);
	expect(first.headers()['cache-control']).toBe('public, max-age=0, s-maxage=30');
	const second = await request.get('/api/leaderboard?ignored=two');
	expect(second.headers()['x-leaderboard-cache']).toBe('HIT');
	expect(second.headers()['set-cookie']).toBeUndefined();
	const me = await request.get('/api/leaderboard/me');
	expect(me.headers()['cache-control']).toBe('private, no-store');
});
