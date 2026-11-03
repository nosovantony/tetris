import { expect, test, type Page } from '@playwright/test';
import type { Checkpoint } from '../../src/lib/game/checkpoint';

async function checkpoint(page: Page): Promise<Checkpoint | null> {
	return page.evaluate(
		() =>
			new Promise<Checkpoint | null>((resolve, reject) => {
				const open = indexedDB.open('marathon-150', 1);
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('checkpoints', 'readonly');
					const get = tx.objectStore('checkpoints').get('unfinished');
					tx.oncomplete = () => {
						resolve(get.result ?? null);
						db.close();
					};
				};
			})
	);
}

test('IndexedDB restores board, Hold, queue and timers after reload, then releases stuck keys', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.keyboard.press('Space');
	await expect(page.getByTestId('locked-cell')).toHaveCount(4);
	await page.keyboard.press('KeyC');
	await page.keyboard.down('ArrowLeft');
	await page.getByRole('button', { name: 'Пауза', exact: true }).click();
	await expect.poll(async () => (await checkpoint(page))?.game.piecesLocked).toBe(1);
	const saved = await checkpoint(page);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Партия восстановлена' })).toBeVisible();
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'paused');
	await expect(page.getByTestId('score')).toHaveText(saved!.game.score.toLocaleString('ru-RU'));
	await expect(page.getByTestId('locked-cell')).toHaveCount(0); // concealed
	await page.clock.install();
	await page.getByRole('button', { name: 'Продолжить' }).click();
	await page.clock.runFor(3100);
	await expect(page.getByTestId('locked-cell')).toHaveCount(4);
	await expect(page.locator('.hold svg')).toHaveAttribute(
		'aria-label',
		`Фигура ${saved!.game.hold}`
	);
	const x = await page.getByTestId('active-cell').first().getAttribute('x');
	await page.clock.runFor(250);
	await expect(page.getByTestId('active-cell').first()).toHaveAttribute('x', x!);
});

test('autosaves active play without a pause and starts a fresh game after confirmed discard', async ({
	page
}) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled();
	await page.clock.install();
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.keyboard.press('Space');
	await page.clock.runFor(1100);
	await expect.poll(async () => (await checkpoint(page))?.game.piecesLocked).toBe(1);
	await expect
		.poll(async () => (await checkpoint(page))?.game.tick ?? 0)
		.toBeGreaterThanOrEqual(60);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Партия восстановлена' })).toBeVisible();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Новая партия' }).click();
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'running');
	await expect(page.getByTestId('score')).toHaveText('0');
	await expect.poll(async () => (await checkpoint(page))?.game.piecesLocked).toBe(0);
});

test('corrupt/incompatible saves are discarded with a visible explanation', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				const open = indexedDB.open('marathon-150', 1);
				open.onsuccess = () => {
					const db = open.result;
					const tx = db.transaction('checkpoints', 'readwrite');
					tx.objectStore('checkpoints').put({ version: 999 }, 'unfinished');
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
				};
			})
	);
	await page.reload();
	await expect(page.getByTestId('storage-status')).toContainText('устарело или повреждено');
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled();
	expect(await checkpoint(page)).toBeNull();
});

test('a second tab cannot overwrite the first tab save and remains playable', async ({
	page,
	context
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await page.getByRole('button', { name: 'Пауза', exact: true }).click();
	await expect.poll(async () => (await checkpoint(page))?.version).toBe(1);
	const saved = await checkpoint(page);
	const second = await context.newPage();
	await second.goto('/');
	await expect(second.getByTestId('storage-status')).toContainText('другой вкладкой');
	await second.getByRole('button', { name: 'Начать игру' }).click();
	await expect(second.locator('.arena')).toHaveAttribute('data-phase', 'running');
	expect((await checkpoint(second))!.game.config.seed).toBe(saved!.game.config.seed);
	await second.close();
});

test('disabled IndexedDB does not prevent local play', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'indexedDB', { get: () => undefined });
	});
	await page.goto('/');
	await expect(page.getByTestId('storage-status')).toContainText('недоступно');
	await page.getByRole('button', { name: 'Начать игру' }).click();
	await expect(page.locator('.arena')).toHaveAttribute('data-phase', 'running');
});

test('game over clears the unfinished save and reload does not resurrect it', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled();
	await page.clock.install();
	await page.getByRole('button', { name: 'Начать игру' }).click();
	for (
		let i = 0;
		i < 25 && (await page.locator('.arena').getAttribute('data-phase')) === 'running';
		i++
	) {
		await page.keyboard.press('Space');
		await page.clock.runFor(20);
	}
	await expect(page.getByRole('button', { name: 'Играть снова' })).toBeVisible();
	await expect.poll(() => checkpoint(page)).toBeNull();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Начать игру' })).toBeEnabled();
});
