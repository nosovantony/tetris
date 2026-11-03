import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const vite = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	appType: 'custom'
});
try {
	const { generateReplay } = await vite.ssrLoadModule('/scripts/replay/generator.ts');
	const { stretchReplay } = await vite.ssrLoadModule('/scripts/replay/stretch.ts');
	const { rotateHeavy } = await vite.ssrLoadModule('/scripts/replay/heavy.ts');
	const { encodeReplay, decodeReplay } = await vite.ssrLoadModule('/src/lib/game/codec.ts');
	const { simulateReplay } = await vite.ssrLoadModule('/src/lib/game/simulator.ts');
	const original = JSON.parse(await readFile('tests/fixtures/replays/manifest.json', 'utf8'));
	const win = original.fixtures.find((f) => f.name === 'marathon');
	const replay = decodeReplay(await readFile(`tests/fixtures/replays/${win.file}`));
	const late = stretchReplay(win.config, replay.events, replay.durationTicks, 81);
	const heavy = rotateHeavy(win.config, late.events, late.state.tick);
	const config = { ...win.config, seed: 7 };
	const held = generateReplay(config, {
		lookahead: 4,
		holdEvery: 2,
		progress: (s) => console.log(`hold-seed7: ${s.lines} lines`)
	});
	// Even a loss is a valid terminal adversarial fixture; don't label it a win.
	if (held.state.status === 'playing') throw new Error('Hold route did not terminate');
	const heldHeavy = rotateHeavy(config, held.events, held.state.tick, 1);
	const directory = 'tests/fixtures/replays-heavy';
	await mkdir(directory, { recursive: true });
	const manifest = { version: 1, rulesVersion: original.rulesVersion, fixtures: [] };
	for (const [name, fixture] of Object.entries({
		'late-20g': late,
		'rotate-20g': heavy,
		'hold-seed7': heldHeavy
	})) {
		const bytes = encodeReplay(fixture.events, fixture.state.tick);
		const decoded = decodeReplay(bytes);
		const state = simulateReplay(fixture.state.config, decoded.events, decoded.durationTicks);
		if (JSON.stringify(state) !== JSON.stringify(fixture.state))
			throw new Error('Reference mismatch');
		await writeFile(`${directory}/${name}.tr`, bytes);
		manifest.fixtures.push({
			name,
			file: `${name}.tr`,
			config: state.config,
			bytes: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			events: fixture.events.length,
			metrics: {
				...fixture.metrics,
				holds: fixture.events.filter((e) => e.action === 'hold').length
			},
			expected: {
				status: state.status,
				score: state.score,
				lines: state.lines,
				level: state.level,
				durationTicks: state.tick,
				piecesLocked: state.piecesLocked,
				timeBonus: state.timeBonus
			},
			stateSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex')
		});
	}
	await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, '\t') + '\n');
	console.log(JSON.stringify(manifest, null, 2));
} finally {
	await vite.close();
}
