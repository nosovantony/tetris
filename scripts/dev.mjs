import { fileURLToPath } from 'node:url';
import { launch, stop, waitForHttp } from './processes.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const npm = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const built = process.argv.includes('--built');
const children = [];
let stopping = false;
function shutdown(code = 0) {
	if (stopping) return;
	stopping = true;
	for (const child of children) stop(child);
	process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown());
process.on('exit', () => children.forEach(stop));

const backend = launch(npm, [
	'--no-install',
	'wrangler',
	'dev',
	'--config',
	'workers/backend/wrangler.jsonc',
	'--local',
	'--ip',
	'127.0.0.1',
	'--port',
	process.env.BACKEND_PORT || '8788',
	'--inspector-port',
	'0',
	...(process.env.TETRIS_TEST_SIGNING_KEY
		? ['--var', `RUN_SIGNING_KEY:${process.env.TETRIS_TEST_SIGNING_KEY}`]
		: []),
	...(process.env.TETRIS_STATE_DIR ? ['--persist-to', process.env.TETRIS_STATE_DIR] : [])
]);
children.push(backend);
backend.on('exit', (code) => shutdown(code || 1));
try {
	await waitForHttp(`http://127.0.0.1:${process.env.BACKEND_PORT || 8788}/health`, children);
	if (!stopping) {
		const args = built
			? [
					'--no-install',
					'wrangler',
					'dev',
					'--local',
					'--ip',
					'127.0.0.1',
					'--port',
					process.env.DEV_PORT || '5173',
					'--inspector-port',
					'0',
					...(process.env.TETRIS_STATE_DIR ? ['--persist-to', process.env.TETRIS_STATE_DIR] : [])
				]
			: ['--no-install', 'vite', 'dev'];
		const frontend = launch(npm, args);
		children.push(frontend);
		frontend.on('exit', (code) => shutdown(code || 1));
	}
} catch (error) {
	console.error(error.message);
	shutdown(1);
}
