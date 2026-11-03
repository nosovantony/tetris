import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, stop, waitForHttp } from '../../scripts/processes.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = 18788;
const url = `http://127.0.0.1:${port}`;
let child, state;
const rulesVersion = 'marathon-150-v1';
const result = {
	runId: 'run-1',
	guestId: 'guest-1',
	rulesVersion,
	playerName: 'Игрок',
	score: 1000,
	lines: 4,
	level: 1,
	durationTicks: 100,
	isClear: false,
	expiresAt: Date.now() + 86400000
};
async function save(value) {
	const response = await fetch(`${url}/results`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(value)
	});
	return { status: response.status, body: await response.json() };
}
async function get(path) {
	return (await fetch(url + path)).json();
}

before(async () => {
	state = await mkdtemp(join(tmpdir(), 'tetris-integration-'));
	child = launch(
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		[
			'--no-install',
			'wrangler',
			'dev',
			'--config',
			'workers/backend/wrangler.jsonc',
			'--local',
			'--ip',
			'127.0.0.1',
			'--port',
			String(port),
			'--inspector-port',
			'0',
			'--persist-to',
			state
		],
		{ cwd: root }
	);
	await waitForHttp(`${url}/health`, [child]);
});
after(async () => {
	if (child && child.exitCode === null) {
		const closed = new Promise((resolve) => child.once('close', resolve));
		stop(child);
		await closed;
	}
	if (state) await rm(state, { recursive: true, force: true });
});

test('SQLite: health, atomic acceptance, idempotency, best score, version separation', async () => {
	assert.equal((await get('/health')).storage, 'sqlite');
	assert.deepEqual((await save(result)).body, { accepted: true, duplicate: false, improved: true });
	const duplicate = await save({ ...result, score: 999999 });
	assert.equal(duplicate.body.duplicate, true);
	assert.equal(duplicate.body.improved, false);
	const conflict = await save({ ...result, guestId: 'another-guest' });
	assert.equal(conflict.status, 409);
	const worse = await save({ ...result, runId: 'run-2', score: 100 });
	assert.equal(worse.body.improved, false);
	const better = await save({ ...result, runId: 'run-3', score: 2000 });
	assert.equal(better.body.improved, true);
	const profile = await get(`/profile?guestId=guest-1&rulesVersion=${rulesVersion}`);
	assert.equal(profile.result.score, 2000);
	const privateResponse = await fetch(
		`${url}/profile?guestId=guest-1&rulesVersion=${rulesVersion}`
	);
	assert.equal(privateResponse.headers.get('cache-control'), 'private, no-store');
	await privateResponse.body.cancel();
	assert.equal((await get(`/leaderboard?rulesVersion=${rulesVersion}`)).entries.length, 1);
	await save({
		...result,
		runId: 'run-other-version',
		rulesVersion: 'marathon-150-v2',
		score: 3000
	});
	assert.equal((await get(`/leaderboard?rulesVersion=${rulesVersion}`)).entries[0].score, 2000);
	const invalid = await save({ ...result, runId: 'bad', score: -1 });
	assert.equal(invalid.status, 400);
	assert.equal((await get(`/profile?guestId=missing&rulesVersion=${rulesVersion}`)).result, null);
});
