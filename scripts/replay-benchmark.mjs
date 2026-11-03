import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import { launch, stop, waitForHttp } from './processes.mjs';

const cloud = process.argv.includes('--cloud');
const heavy = process.argv.includes('--heavy');
const fixturesDirectory = heavy ? 'tests/fixtures/replays-heavy' : 'tests/fixtures/replays';
const name = 'tetris-replay-measure-20261103';
const directory = heavy ? 'docs/measurements/2026-11-03-heavy' : 'docs/measurements/2026-11-03';
const config = 'scripts/replay/wrangler.jsonc';
const cli = 'node_modules/wrangler/bin/wrangler.js';
const token = cloud ? randomBytes(32).toString('base64url') : 'local-replay-probe-only';
const base = cloud ? `https://${name}.nosov-antony.workers.dev` : 'http://127.0.0.1:18933';
const telemetry = [];
const result = {
	startedAt: new Date().toISOString(),
	runtime: cloud ? 'Cloudflare Durable Object' : 'local workerd',
	caveat:
		'HTTP and application wall times are not CPU time. CPU is reported only by Cloudflare tail, if available. Synthetic bots, not human play or worst-case proof.',
	requests: [],
	cleanup: null
};
let child,
	tail,
	localState,
	deployed = false;
let readyTail;
const tailReady = new Promise((resolve) => {
	readyTail = resolve;
});

function command(args, input) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cli, ...args], {
			stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit']
		});
		if (input) child.stdin.end(input);
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`Wrangler ${args[0]} exited ${code}`))
		);
	});
}

// Tail emits adjacent pretty-printed JSON objects. Keep only CPU/outcome and our
// own bounded logs, never request headers/bodies (which contain the probe secret).
let buffer = '';
function consume(chunk) {
	buffer += chunk.toString();
	while (true) {
		const start = buffer.indexOf('{');
		if (start < 0) {
			buffer = '';
			return;
		}
		let depth = 0,
			quoted = false,
			escape = false,
			end = -1;
		for (let i = start; i < buffer.length; i++) {
			const c = buffer[i];
			if (quoted) {
				if (escape) escape = false;
				else if (c === '\\') escape = true;
				else if (c === '"') quoted = false;
			} else if (c === '"') quoted = true;
			else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) {
				end = i + 1;
				break;
			}
		}
		if (end < 0) {
			buffer = buffer.slice(start);
			return;
		}
		const text = buffer.slice(start, end);
		buffer = buffer.slice(end);
		try {
			const event = JSON.parse(text);
			const messages = (event.logs ?? []).flatMap((log) =>
				(log.message ?? []).flatMap((message) => {
					try {
						const parsed = JSON.parse(message);
						return parsed.probe === 'replay-v1' ? [parsed] : [];
					} catch {
						return [];
					}
				})
			);
			if (messages.length || event.cpuTimeMs !== undefined)
				telemetry.push({
					eventTimestamp: event.eventTimestamp,
					executionModel: event.executionModel,
					cpuTimeMs: event.cpuTimeMs,
					wallTimeMs: event.wallTimeMs,
					outcome: event.outcome,
					truncated: event.truncated,
					messages,
					exceptions: (event.exceptions ?? []).map((e) => ({ name: e.name, message: e.message }))
				});
		} catch {
			/* Ignore non-JSON CLI diagnostics. */
		}
	}
}

const vite = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	appType: 'custom'
});
try {
	await mkdir(directory, { recursive: true });
	const manifest = JSON.parse(await readFile(`${fixturesDirectory}/manifest.json`, 'utf8'));
	result.fixtureManifestSha256 = createHash('sha256')
		.update(await readFile(`${fixturesDirectory}/manifest.json`))
		.digest('hex');
	result.sources = {};
	const sources = [
		...(await readdir('src/lib/game'))
			.filter((file) => file.endsWith('.ts'))
			.map((file) => `src/lib/game/${file}`),
		'src/lib/shared/runs.ts',
		'src/lib/shared/leaderboard.ts',
		'src/lib/server/http.ts',
		'workers/backend/validation.ts',
		'scripts/replay/probe.ts'
	];
	for (const path of sources)
		result.sources[path] = createHash('sha256')
			.update(await readFile(path))
			.digest('hex');
	const { decodeReplay, encodeReplay } = await vite.ssrLoadModule('/src/lib/game/codec.ts');
	const { toBase64, RUN_LIFETIME_MS } = await vite.ssrLoadModule('/src/lib/shared/runs.ts');
	if (cloud) {
		await command(['deploy', '--config', config]);
		deployed = true;
		await command(['secret', 'put', 'PROBE_TOKEN', '--config', config], token + '\n');
		tail = launch(
			process.execPath,
			[cli, 'tail', name, '--format', 'json', '--sampling-rate', '0.999'],
			{ stdio: ['ignore', 'pipe', 'pipe'] }
		);
		tail.stdout.on('data', consume);
		tail.stderr.on('data', (chunk) => {
			if (/Connected|tail|Successfully/i.test(chunk.toString())) readyTail();
		});
		// Finite startup grace period, not a monitoring loop.
		await Promise.race([tailReady, new Promise((resolve) => setTimeout(resolve, 6000))]);
	} else {
		await mkdir('/tmp/opencode', { recursive: true });
		localState = await mkdtemp('/tmp/opencode/tetris-replay-');
		child = launch(process.execPath, [
			cli,
			'dev',
			'--config',
			config,
			'--local',
			'--ip',
			'127.0.0.1',
			'--port',
			'18933',
			'--inspector-port',
			'0',
			'--persist-to',
			localState,
			'--var',
			`PROBE_TOKEN:${token}`
		]);
		await waitForHttp(`${base}/health`, [child]);
	}
	for (const fixture of manifest.fixtures) {
		const bytes = await readFile(`${fixturesDirectory}/${fixture.file}`);
		if (createHash('sha256').update(bytes).digest('hex') !== fixture.sha256)
			throw new Error('Fixture hash mismatch');
		const replay = decodeReplay(bytes);
		const variants = [{ name: fixture.name, bytes, expectedStatus: 200 }];
		if (fixture.name === 'adversarial')
			variants.push({
				name: 'unfinished-max-duration',
				expectedStatus: 422,
				bytes: encodeReplay(
					replay.events.filter((e) => e.tick < replay.durationTicks - 1),
					replay.durationTicks - 1
				)
			});
		for (const variant of variants)
			for (let sample = 0; sample < 3; sample++) {
				const id = `${variant.name}-${sample}`;
				const now = Date.now(),
					issuedAt = now - 4 * 60 * 60 * 1000;
				const claims = {
					v: 1,
					runId: randomUUID(),
					guestId: randomUUID(),
					rulesVersion: manifest.rulesVersion,
					issuedAt,
					expiresAt: issuedAt + RUN_LIFETIME_MS,
					config: fixture.config
				};
				const started = performance.now();
				const response = await fetch(`${base}/validate?id=${id}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Probe-Token': token
					},
					body: JSON.stringify({
						claims,
						replay: toBase64(variant.bytes),
						playerName: 'Measurement fixture'
					}),
					signal: AbortSignal.timeout(30000)
				});
				const text = await response.text();
				let body;
				try {
					body = JSON.parse(text);
				} catch {
					body = { error: text.slice(0, 300) };
				}
				const record = {
					id,
					status: response.status,
					expectedStatus: variant.expectedStatus,
					wallMs: performance.now() - started,
					bytes: variant.bytes.length,
					body
				};
				result.requests.push(record);
				console.log(
					JSON.stringify({ id, status: response.status, wallMs: Math.round(record.wallMs) })
				);
				if (response.status !== variant.expectedStatus)
					throw new Error(`Unexpected status for ${id}`);
				if (
					response.ok &&
					(body.score !== fixture.expected.score ||
						body.lines !== fixture.expected.lines ||
						body.durationTicks !== fixture.expected.durationTicks ||
						body.isClear !== (fixture.expected.status === 'won'))
				)
					throw new Error(`Incorrect computed result for ${id}`);
			}
	}
	if (heavy) {
		const fixture = manifest.fixtures.find((f) => f.name === 'rotate-20g');
		const bytes = await readFile(`${fixturesDirectory}/${fixture.file}`);
		// One finite burst, three separate objects; not an account capacity test.
		const burst = await Promise.allSettled(
			[0, 1, 2].map(async (slot) => {
				const issuedAt = Date.now() - 4 * 60 * 60 * 1000;
				const started = performance.now();
				const response = await fetch(`${base}/validate?id=concurrent-${slot}&slot=${slot}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'X-Probe-Token': token },
					body: JSON.stringify({
						claims: {
							v: 1,
							runId: randomUUID(),
							guestId: randomUUID(),
							rulesVersion: manifest.rulesVersion,
							issuedAt,
							expiresAt: issuedAt + RUN_LIFETIME_MS,
							config: fixture.config
						},
						replay: toBase64(bytes),
						playerName: 'Concurrent fixture'
					}),
					signal: AbortSignal.timeout(30000)
				});
				const body = await response.json();
				result.requests.push({
					id: `concurrent-${slot}`,
					status: response.status,
					expectedStatus: 200,
					wallMs: performance.now() - started,
					bytes: bytes.length,
					body
				});
				if (
					response.status !== 200 ||
					body.score !== fixture.expected.score ||
					body.lines !== fixture.expected.lines ||
					body.level !== fixture.expected.level ||
					body.durationTicks !== fixture.expected.durationTicks ||
					body.isClear !== true
				)
					throw new Error(`Concurrent validation ${slot} failed`);
			})
		);
		if (burst.some((r) => r.status === 'rejected'))
			throw new Error('Bounded concurrency test failed');
	}
	if (cloud) await new Promise((resolve) => setTimeout(resolve, 4000));
	result.outcome = 'passed';
} catch (error) {
	result.outcome = 'failed';
	result.error = error.message;
	throw error;
} finally {
	stop(child);
	stop(tail);
	await vite.close();
	if (localState) await rm(localState, { recursive: true, force: true });
	if (deployed) {
		try {
			await command(['deploy', '--config', 'scripts/replay/cleanup.jsonc']);
			await command(['delete', '--config', 'scripts/replay/cleanup.jsonc', '--force']);
			result.cleanup = { workerDeleted: true, durableObjectClassDeletedViaMigration: true };
		} catch (error) {
			result.cleanup = { error: error.message };
			process.exitCode = 1;
		}
	}
	result.finishedAt = new Date().toISOString();
	if (cloud)
		result.cpuTelemetry = telemetry.some((event) => Number.isFinite(event.cpuTimeMs))
			? 'Cloudflare tail supplied CPU fields; see sanitized events.'
			: 'Cloudflare tail supplied no CPU fields. HTTP success and wall times do not establish CPU cost or worst-case headroom.';
	await writeFile(
		`${directory}/${cloud ? 'cloud' : 'workerd-local'}-results.json`,
		JSON.stringify(result, null, 2) + '\n'
	);
	if (cloud)
		await writeFile(
			`${directory}/cloud-tail-sanitized.json`,
			JSON.stringify(telemetry, null, 2) + '\n'
		);
}
