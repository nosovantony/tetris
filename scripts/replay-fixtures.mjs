import { createServer } from 'vite';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Vite already belongs to the toolchain; use its TS loader without introducing a
// runtime dependency or relying on Node's experimental extension resolution.
const vite = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	appType: 'custom'
});
try {
	const { generateReplay } = await vite.ssrLoadModule('/scripts/replay/generator.ts');
	const { stretchReplay, padReplay } = await vite.ssrLoadModule('/scripts/replay/stretch.ts');
	const { encodeReplay, decodeReplay } = await vite.ssrLoadModule('/src/lib/game/codec.ts');
	const { simulateReplay } = await vite.ssrLoadModule('/src/lib/game/simulator.ts');
	const start = performance.now();
	const config = {
		seed: Number(process.argv[2] ?? 42),
		mode: 'ranked',
		startLevel: 1,
		dasTicks: 8,
		arrTicks: 1
	};
	const marathon = generateReplay(config, {
		lookahead: Number(process.argv[3] ?? 8),
		progress: (s) =>
			console.log(
				JSON.stringify({
					pieces: s.piecesLocked,
					lines: s.lines,
					level: s.level,
					elapsedMs: Math.round(performance.now() - start)
				})
			)
	});
	if (marathon.state.status !== 'won' || marathon.state.lines < 1500)
		throw new Error('Generator did not complete marathon');
	const timeout = stretchReplay(config, marathon.events, marathon.state.tick);
	if (timeout.state.status !== 'timeout')
		throw new Error('Stretched replay did not reach active-time limit');
	const adversarial = { ...timeout, events: padReplay(timeout.events, timeout.state.tick, 50000) };
	const directory = 'tests/fixtures/replays';
	await mkdir(directory, { recursive: true });
	const manifest = {
		version: 1,
		rulesVersion: marathon.state.rulesVersion,
		generator: { seed: config.seed, lookahead: Number(process.argv[3] ?? 8) },
		fixtures: []
	};
	for (const [name, fixture] of Object.entries({ marathon, timeout, adversarial })) {
		const bytes = encodeReplay(fixture.events, fixture.state.tick);
		const decoded = decodeReplay(bytes);
		const verified = simulateReplay(config, decoded.events, decoded.durationTicks);
		if (JSON.stringify(verified) !== JSON.stringify(fixture.state))
			throw new Error(`${name}: reference state mismatch`);
		const file = `${name}.tr`;
		await writeFile(`${directory}/${file}`, bytes);
		manifest.fixtures.push({
			name,
			file,
			config,
			bytes: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			events: fixture.events.length,
			expected: {
				status: verified.status,
				score: verified.score,
				lines: verified.lines,
				level: verified.level,
				durationTicks: verified.tick,
				piecesLocked: verified.piecesLocked,
				timeBonus: verified.timeBonus
			},
			stateSha256: createHash('sha256').update(JSON.stringify(verified)).digest('hex')
		});
	}
	await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, '\t') + '\n');
	console.log(
		JSON.stringify({ fixtures: manifest.fixtures, elapsedMs: performance.now() - start }, null, 2)
	);
} finally {
	await vite.close();
}
