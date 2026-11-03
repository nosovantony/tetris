import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, stop } from './processes.mjs';

const state = await mkdtemp(join(tmpdir(), 'tetris-e2e-'));
const child = launch(process.execPath, ['scripts/dev.mjs', '--built'], {
	env: {
		...process.env,
		DEV_PORT: '18795',
		BACKEND_PORT: '18796',
		TETRIS_STATE_DIR: state,
		TETRIS_TEST_SIGNING_KEY: 'local-e2e-only-not-a-production-secret-2026'
	}
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(child));
try {
	process.exitCode = await new Promise((resolve) =>
		child.once('close', (code) => resolve(code || 0))
	);
} finally {
	await rm(state, { recursive: true, force: true });
}
