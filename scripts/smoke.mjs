import { launch, stop, waitForHttp } from './processes.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const built = process.argv.includes('--built');
const state = await mkdtemp(join(tmpdir(), 'tetris-smoke-'));
const child = launch(process.execPath, ['scripts/dev.mjs', ...(built ? ['--built'] : [])], {
	env: { ...process.env, DEV_PORT: '18793', BACKEND_PORT: '18794', TETRIS_STATE_DIR: state }
});
const base = 'http://127.0.0.1:18793';
try {
	await waitForHttp(`${base}/api/health`, [child], 60000);
	const health = await (await fetch(`${base}/api/health`)).json();
	assert.equal(health.backend.storage, 'sqlite');
	const top = await fetch(`${base}/api/leaderboard`);
	assert.equal(top.status, 200);
	assert.equal(top.headers.get('cache-control'), 'public, max-age=0, s-maxage=30');
	assert.deepEqual((await top.json()).entries, []);
	const home = await (await fetch(base)).text();
	assert.ok(home.includes('Начать игру'));
	assert.ok(home.includes('data-testid="board"'));
	const leaderboard = await (await fetch(`${base}/leaderboard`)).text();
	assert.ok(leaderboard.includes('Первый рекорд ещё впереди'));
	const forbidden = await fetch(`${base}/api/runs/finish`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{"score":999999}'
	});
	assert.equal(forbidden.status, 403);
	await forbidden.body.cancel();
	console.log(
		`Smoke passed (${built ? 'built Worker' : 'Vite'}): web → Service Binding → SQLite; pages; cross-origin score submission denied.`
	);
} finally {
	if (child.exitCode === null && child.signalCode === null) {
		const closed = new Promise((resolve) => child.once('close', resolve));
		stop(child);
		await closed;
	}
	await rm(state, { recursive: true, force: true });
}
