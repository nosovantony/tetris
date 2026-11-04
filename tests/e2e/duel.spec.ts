import { expect, test } from '@playwright/test';

test.describe('Duel 1v1 Mode', () => {
	test('navigates to duel lobby from navigation link', async ({ page }) => {
		await page.goto('/');
		const duelNav = page.getByRole('link', { name: /Дуэль|Duel/i });
		await expect(duelNav).toBeVisible();
		await duelNav.click();

		await expect(page).toHaveURL(/\/duel/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			/Дуэль 1 на 1|1v1 Tetris Duel/
		);
	});

	test('renders duel lobby with name input, modes and join box', async ({ page }) => {
		await page.goto('/duel');

		const nameInput = page.locator('#player-name-input');
		await expect(nameInput).toBeVisible();
		await nameInput.fill('Тестер');

		const quickBtn = page.getByRole('button', { name: /Быстрая игра|Quick Play/i });
		await expect(quickBtn).toBeVisible();

		const createBtn = page.getByRole('button', { name: /Создать комнату|Create Private Room/i });
		await expect(createBtn).toBeVisible();

		const joinInput = page.locator('.join-input');
		await expect(joinInput).toBeVisible();
	});

	test('creates private room and displays waiting screen with copyable link', async ({ page }) => {
		await page.goto('/duel');

		const createBtn = page.getByRole('button', { name: /Создать комнату|Create Private Room/i });
		await createBtn.click();

		await expect(page.locator('.waiting-title')).toBeVisible();
		await expect(page.locator('.room-code')).toContainText(/room-/);

		const shareInput = page.locator('.share-input');
		await expect(shareInput).toBeVisible();
		const shareVal = await shareInput.inputValue();
		expect(shareVal).toContain('/duel?room=room-');

		const cancelBtn = page.getByRole('button', { name: /Отмена|Cancel/i });
		await expect(cancelBtn).toBeVisible();
		await cancelBtn.click();

		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	test('toggles interface language between Russian and English on duel page', async ({ page }) => {
		await page.goto('/duel');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Дуэль 1 на 1');

		const langToggle = page.getByRole('button', {
			name: /Switch to English|Переключить на русский/i
		});
		await langToggle.click();

		await expect(page.getByRole('heading', { level: 1 })).toContainText('1v1 Tetris Duel');
		await expect(page.getByRole('button', { name: /Quick Play/i })).toBeVisible();

		// Switch back to Russian
		await langToggle.click();
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Дуэль 1 на 1');
	});

	test('two players connect to the same room, trigger countdown and play duel', async ({
		browser
	}) => {
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const page1 = await context1.newPage();
		const page2 = await context2.newPage();

		const roomId = 'room-match-' + Math.random().toString(36).slice(2, 7);

		await page1.goto(`/duel?room=${roomId}`);
		await expect(page1.locator('.waiting-title')).toBeVisible();

		await page2.goto(`/duel?room=${roomId}`);

		// Once both players connect, countdown starts
		await expect(page1.locator('.countdown-num')).toBeVisible({ timeout: 10000 });
		await expect(page2.locator('.countdown-num')).toBeVisible({ timeout: 10000 });

		// Verify both see the opponent board
		await expect(page1.locator('.opponent-panel')).toBeVisible();
		await expect(page2.locator('.opponent-panel')).toBeVisible();

		// Wait for countdown to finish and game to begin
		await expect(page1.locator('.countdown-num')).not.toBeVisible({ timeout: 10000 });
		await expect(page2.locator('.countdown-num')).not.toBeVisible({ timeout: 10000 });

		// Joining a room must not cancel the local fixed-step loop. At level 1
		// the active piece moves down without any user input.
		const activeCell = page1.locator('[data-testid="active-cell"]').first();
		const beforeY = await activeCell.getAttribute('y');
		const beforeTick = await page1.locator('.board-wrapper').getAttribute('data-game-tick');
		await page1.waitForTimeout(1300);
		const afterY = await activeCell.getAttribute('y');
		const afterTick = await page1.locator('.board-wrapper').getAttribute('data-game-tick');
		expect(Number(afterTick)).toBeGreaterThan(Number(beforeTick));
		expect(afterY).not.toBe(beforeY);

		// Player 1 drops piece
		await page1.keyboard.press('Space');
		await page1.waitForTimeout(500);

		// Opponent sees the piece on their opponent board
		await expect(page2.locator('.opponent-panel svg')).toBeVisible();

		await context1.close();
		await context2.close();
	});

	test('quick play starts a room and advances both local game loops', async ({ browser }) => {
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const page1 = await context1.newPage();
		const page2 = await context2.newPage();

		try {
			await page1.goto('/duel');
			await page2.goto('/duel');
			await page1.getByRole('button', { name: /Быстрая игра|Quick Play/i }).click();
			await expect(page1.locator('.waiting-title')).toBeVisible();
			await page2.getByRole('button', { name: /Быстрая игра|Quick Play/i }).click();

			await expect(page1.locator('.countdown-num')).toBeVisible({ timeout: 10000 });
			await expect(page2.locator('.countdown-num')).toBeVisible({ timeout: 10000 });
			await expect(page1.locator('.countdown-num')).not.toBeVisible({ timeout: 10000 });
			await expect(page2.locator('.countdown-num')).not.toBeVisible({ timeout: 10000 });

			const tick1 = Number(await page1.locator('.board-wrapper').getAttribute('data-game-tick'));
			const tick2 = Number(await page2.locator('.board-wrapper').getAttribute('data-game-tick'));
			await page1.waitForTimeout(1000);
			expect(tick1).toBeLessThan(
				Number(await page1.locator('.board-wrapper').getAttribute('data-game-tick'))
			);
			expect(tick2).toBeLessThan(
				Number(await page2.locator('.board-wrapper').getAttribute('data-game-tick'))
			);
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('automatically starts the round and forfeits an opponent who never moves', async ({
		browser
	}) => {
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const page1 = await context1.newPage();
		const page2 = await context2.newPage();
		try {
			const roomId = 'room-afk-' + Math.random().toString(36).slice(2, 7);
			await page1.goto(`/duel?room=${roomId}`);
			await page2.goto(`/duel?room=${roomId}`);
			await expect(page1.locator('.countdown-num')).toBeVisible({ timeout: 10000 });
			await expect(page1.locator('.countdown-num')).not.toBeVisible({ timeout: 10000 });

			// No ready/start button is needed. Player 1 makes one real move;
			// the server awards the round when player 2 remains untouched.
			await page1.keyboard.press('ArrowLeft');
			await expect(page1.locator('.round-overlay')).toBeVisible({ timeout: 15000 });
			await expect(page1.locator('.round-overlay')).toContainText(/побед|выигран|won/i);
		} finally {
			await context1.close();
			await context2.close();
		}
	});

	test('allows selecting Best of 1 format and playing a 1-win match', async ({ browser }) => {
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();
		const page1 = await context1.newPage();
		const page2 = await context2.newPage();

		await page1.goto('/duel');
		const bestOf1Btn = page1.getByRole('button', { name: /До 1 победы|First to 1 win/i });
		await expect(bestOf1Btn).toBeVisible();
		await bestOf1Btn.click();
		await expect(bestOf1Btn).toHaveClass(/active/);

		const createBtn = page1.getByRole('button', { name: /Создать комнату|Create Private Room/i });
		await createBtn.click();

		const shareInput = page1.locator('.share-input');
		await expect(shareInput).toBeVisible();
		const shareUrl = await shareInput.inputValue();
		expect(shareUrl).toContain('wins=1');

		// Second player joins via that link
		await page2.goto(shareUrl);

		// Both receive countdown and see "до 1 победы" / 1 star in HUD
		await expect(page1.locator('.countdown-num')).toBeVisible({ timeout: 10000 });
		await expect(page2.locator('.countdown-num')).toBeVisible({ timeout: 10000 });

		await expect(page1.locator('.round-badge')).toContainText(/до 1 победы|first to 1/i);
		await expect(page1.locator('.player-hud.you .star')).toHaveCount(1);
		await expect(page1.locator('.player-hud.opp .star')).toHaveCount(1);

		await context1.close();
		await context2.close();
	});
});
