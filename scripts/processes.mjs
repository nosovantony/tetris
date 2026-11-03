import { spawn } from 'node:child_process';

export function launch(command, args, options = {}) {
	return spawn(command, args, {
		stdio: 'inherit',
		detached: process.platform !== 'win32',
		...options
	});
}

export function stop(child) {
	if (!child?.pid || child.exitCode !== null) return;
	try {
		if (process.platform === 'win32') child.kill('SIGTERM');
		else process.kill(-child.pid, 'SIGTERM');
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
}

export async function waitForHttp(url, children, timeout = 60000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (children.some((child) => child.exitCode !== null)) throw new Error('A dev process exited');
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
			await response.body?.cancel();
			if (response.ok) return;
		} catch {
			/* process is still starting */
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`Timed out waiting for ${url}`);
}
