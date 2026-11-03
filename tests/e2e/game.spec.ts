import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled();
	await page.clock.install();
});

test('starts, accepts physical keyboard controls, holds, drops and has no horizontal overflow', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.clock.runFor(50);
	const arena = page.getByRole('region', { name: 'Управление игрой с клавиатуры' });
	await expect(arena).toHaveAttribute('data-phase', 'running');
	const active = page.getByTestId('active-cell').first();
	const before = Number(await active.getAttribute('x'));
	await page.keyboard.press('ArrowLeft');
	await page.clock.runFor(20);
	await expect(active).toHaveAttribute('x', String(before - 10));
	await page.keyboard.press('Space');
	await page.clock.runFor(20);
	await expect(page.getByTestId('locked-cell')).toHaveCount(4);
	await expect(page.getByTestId('score')).not.toHaveText('0');
	await page.evaluate(() => {
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'с', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', key: 'с', bubbles: true }));
	});
	await page.clock.runFor(20);
	await expect(page.locator('.hold svg')).not.toHaveAttribute('aria-label', 'Пусто');
	const size = await page.evaluate(() => ({
		content: document.documentElement.scrollWidth,
		width: innerWidth
	}));
	expect(size.content).toBeLessThanOrEqual(size.width);
	expect(errors).toEqual([]);
});

test('pauses, hides pieces, counts down and releases held keys on resume', async ({ page }) => {
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.keyboard.down('ArrowLeft');
	await page.clock.runFor(20);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('active-cell')).toHaveCount(0);
	await expect(page.getByTestId('ghost-cell')).toHaveCount(0);
	const time = await page.getByTestId('time').textContent();
	await page.clock.runFor(4000);
	await expect(page.getByTestId('time')).toHaveText(time!);
	await page.keyboard.up('ArrowLeft');
	await page.getByRole('button', { name: 'Продолжить' }).click();
	await expect(page.locator('.countdown')).toHaveText('3');
	await page.clock.runFor(3100);
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'running');
	const x = await page.getByTestId('active-cell').first().getAttribute('x');
	await page.clock.runFor(300);
	await expect(page.getByTestId('active-cell').first()).toHaveAttribute('x', x!);
});

test('blur cancels countdown and slow frames do not fast-forward a game', async ({ page }) => {
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.clock.runFor(20);
	await page.evaluate(() => window.dispatchEvent(new Event('blur')));
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'paused');
	await page.getByRole('button', { name: 'Продолжить' }).click();
	await page.evaluate(() => window.dispatchEvent(new Event('blur')));
	await page.clock.runFor(4000);
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'paused');
	await page.getByRole('button', { name: 'Продолжить' }).click();
	await page.clock.runFor(3100);
	await page.clock.fastForward(1000);
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'paused');
});

test('level selection starts 20G training; game over offers a clean restart', async ({ page }) => {
	await page.getByLabel('Стартовый уровень').selectOption('150');
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.clock.runFor(50);
	await expect(page.getByTestId('level')).toHaveText('150');
	for (
		let i = 0;
		i < 16 && (await page.locator('.arena').getAttribute('data-phase')) === 'running';
		i++
	) {
		await page.keyboard.press('Space');
		await page.clock.runFor(20);
	}
	await expect(page.getByRole('button', { name: 'Играть снова' })).toBeVisible();
	await page.getByLabel('Стартовый уровень').selectOption('1');
	await page.getByRole('button', { name: 'Играть снова' }).click();
	await expect(page.getByTestId('level')).toHaveText('01');
	await expect(page.getByTestId('locked-cell')).toHaveCount(0);
	await expect(page.getByTestId('score')).toHaveText('0');
});

test('text fields keep native keys and focus automatically pauses gameplay', async ({ page }) => {
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.clock.runFor(20);
	await page.evaluate(() => {
		const input = document.createElement('input');
		input.setAttribute('aria-label', 'Тестовое имя');
		document.querySelector('main')!.appendChild(input);
	});
	await page.getByLabel('Тестовое имя').fill('Player');
	await page.keyboard.press('Space');
	await expect(page.getByLabel('Тестовое имя')).toHaveValue('Player ');
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'paused');
	await expect(page.getByTestId('locked-cell')).toHaveCount(0);
});

test('small mobile viewport fits the field and controls without horizontal scrolling', async ({
	page,
	isMobile
}) => {
	test.skip(!isMobile, 'Narrow touch layout');
	await page.setViewportSize({ width: 320, height: 640 });
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.clock.runFor(20);
	const board = (await page.getByTestId('board').boundingBox())!;
	expect(Math.abs(board.height / board.width - 2)).toBeLessThan(0.05);
	const size = await page.evaluate(() => ({
		content: document.documentElement.scrollWidth,
		width: innerWidth
	}));
	expect(size.content).toBeLessThanOrEqual(size.width);
	await expect(page.getByRole('button', { name: 'Сбросить', exact: true })).toBeVisible();
});

test('touch joystick supports dragging, deadzone, cancellation and independent action buttons', async ({
	page,
	isMobile
}) => {
	test.skip(!isMobile, 'Touch layout');
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.clock.runFor(50);
	const stick = page.getByRole('button', { name: 'Джойстик: влево, вправо, вниз' });
	const rect = (await stick.boundingBox())!;
	const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
	const cdp = await page.context().newCDPSession(page);
	const touch = (
		type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
		points: { x: number; y: number; id: number }[]
	) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
	const before = Number(await page.getByTestId('active-cell').first().getAttribute('x'));
	await touch('touchStart', [{ ...center, id: 1 }]);
	await page.clock.runFor(20);
	await expect(stick).toHaveAttribute('data-direction', 'neutral');
	await touch('touchMove', [{ x: center.x - 50, y: center.y, id: 1 }]);
	await page.clock.runFor(20);
	await expect(page.getByTestId('active-cell').first()).toHaveAttribute('x', String(before - 10));
	// A second finger can rotate while the first finger still holds the stick.
	const rotate = (await page
		.getByRole('button', { name: 'Поворот ↻', exact: true })
		.boundingBox())!;
	const firstFinger = { x: center.x - 50, y: center.y, id: 1 };
	await touch('touchStart', [
		firstFinger,
		{ x: rotate.x + rotate.width / 2, y: rotate.y + rotate.height / 2, id: 2 }
	]);
	await page.clock.runFor(20);
	await expect(stick).toHaveAttribute('data-direction', 'left');
	await touch('touchEnd', [firstFinger]);
	await touch('touchCancel', []);
	await expect(stick).toHaveAttribute('data-direction', 'neutral');
	const cancelledX = await page.getByTestId('active-cell').first().getAttribute('x');
	await page.clock.runFor(250);
	await expect(page.getByTestId('active-cell').first()).toHaveAttribute('x', cancelledX!);
	await page.getByRole('button', { name: 'Поворот ↻', exact: true }).tap();
	await page.clock.runFor(20);
	await page.getByRole('button', { name: 'Сбросить', exact: true }).tap();
	await page.clock.runFor(20);
	await expect(page.getByTestId('locked-cell')).toHaveCount(4);
	await cdp.detach();
});

test('opens settings modal, modifies controls and audio, and persists choices', async ({
	page
}) => {
	await page.getByRole('button', { name: 'Настройки' }).first().click();
	const modal = page.getByRole('dialog', { name: 'Настройки' });
	await expect(modal).toBeVisible();

	// Switch to Audio tab
	await modal.getByRole('button', { name: '🔊 Звук' }).click();
	await expect(modal.getByRole('heading', { name: 'Звуковая система' })).toBeVisible();

	// Toggle SFX off
	const sfxCheckbox = modal.locator('input[type="checkbox"]').first();
	await sfxCheckbox.click();

	// Switch back to Controls tab
	await modal.getByRole('button', { name: '🎮 Управление' }).click();
	await expect(modal.getByRole('heading', { name: 'Клавиатура' })).toBeVisible();

	// Close settings modal
	await modal.getByRole('button', { name: 'Готово' }).click();
	await expect(modal).not.toBeVisible();

	// Check localStorage persistence
	const stored = await page.evaluate(() => localStorage.getItem('tetris:settings:v1'));
	expect(stored).not.toBeNull();
	const parsed = JSON.parse(stored!);
	expect(parsed.audio.sfxMuted).toBe(true);
});

test('switches language between Russian and English via header toggle and settings modal', async ({
	page
}) => {
	// Verify default Russian labels
	await expect(page.getByRole('link', { name: 'Играть', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Рекорды', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeVisible();

	// Click header language toggle to switch to English
	await page.locator('.lang-switch-btn').click();

	// Verify English labels
	await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Leaderboard', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();

	// Check localStorage persistence
	const storedEn = await page.evaluate(() => localStorage.getItem('tetris:settings:v1'));
	expect(storedEn).not.toBeNull();
	expect(JSON.parse(storedEn!).language).toBe('en');

	// Open Settings Modal in English
	await page.getByRole('button', { name: 'Settings' }).first().click();
	const modal = page.getByRole('dialog');
	await expect(modal).toBeVisible();

	// Switch to Language tab
	await modal.getByRole('button', { name: '🌐 Language' }).click();
	await expect(modal.getByRole('heading', { name: 'Interface Language' })).toBeVisible();

	// Select Russian
	await modal.getByRole('button', { name: /Русский/ }).click();

	// Modal and page should now be in Russian
	await expect(modal.getByRole('heading', { name: 'Язык интерфейса' })).toBeVisible();
	await modal.getByRole('button', { name: 'Готово' }).click();
	await expect(modal).not.toBeVisible();

	// Verify Russian returned
	await expect(page.getByRole('link', { name: 'Играть', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeVisible();
});

test('allows selecting custom music source and uploading custom audio track', async ({ page }) => {
	// Open Settings Modal
	await page.getByRole('button', { name: 'Настройки' }).first().click();
	const modal = page.getByRole('dialog', { name: 'Настройки' });
	await expect(modal).toBeVisible();

	// Switch to Audio tab
	await modal.getByRole('button', { name: '🔊 Звук' }).click();
	await expect(modal.getByRole('heading', { name: 'Звуковая система' })).toBeVisible();

	// Select "Своя музыка"
	await modal.getByRole('button', { name: 'Своя музыка' }).click();
	await expect(modal.locator('.custom-track-card')).toBeVisible();
	await expect(modal.getByRole('button', { name: /Выбрать трек/ })).toBeVisible();

	// Create a fake audio file to upload
	const buffer = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
	const fileInput = modal.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: 'my_awesome_track.mp3',
		mimeType: 'audio/mpeg',
		buffer
	});

	// Check that track info appears
	await expect(modal.locator('.track-name')).toHaveText('my_awesome_track.mp3');
	await expect(modal.getByRole('button', { name: 'Удалить трек' })).toBeVisible();

	// Close settings modal
	await modal.getByRole('button', { name: 'Готово' }).click();
	await expect(modal).not.toBeVisible();

	// Verify persistence in localStorage
	const stored = await page.evaluate(() => localStorage.getItem('tetris:settings:v1'));
	expect(stored).not.toBeNull();
	expect(JSON.parse(stored!).audio.bgmSource).toBe('custom');
});
