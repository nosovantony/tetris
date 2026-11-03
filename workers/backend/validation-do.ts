import { DurableObject } from 'cloudflare:workers';
import { validateSubmission, type ValidationInput } from './validation';
import { failure, HttpFailure, readLimited } from '../../src/lib/server/http';
import { MAX_FINISH_BYTES } from '../../src/lib/shared/runs';
import type { LeaderboardDO } from './leaderboard-do';

interface Env {
	LEADERBOARD: DurableObjectNamespace<LeaderboardDO>;
}

export class ValidationDO extends DurableObject<Env> {
	private busy = false;
	private retryAfter = 0;
	async fetch(request: Request): Promise<Response> {
		// One in-flight validation per run, including concurrent duplicate requests.
		if (this.busy)
			return failure(new HttpFailure(429, 'Партия уже проверяется; повторите запрос позже'));
		if (Date.now() < this.retryAfter)
			return failure(new HttpFailure(429, 'Повторите проверку через несколько секунд'));
		this.busy = true;
		try {
			const input: ValidationInput = JSON.parse(
				await readLimited(request, MAX_FINISH_BYTES + 4096)
			);
			const leaderboard = this.env.LEADERBOARD.getByName('global-v1');
			// A committed receipt survives isolate eviction. Retries avoid re-simulation.
			const receipt = await leaderboard.fetch(
				`https://internal/receipt?runId=${input.claims.runId}&guestId=${input.claims.guestId}`
			);
			if (receipt.status === 200) return receipt;
			if (receipt.status !== 404) throw new Error('Receipt lookup failed');
			const result = await validateSubmission(input);
			return await leaderboard.fetch('https://internal/results', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(result)
			});
		} catch (error) {
			this.retryAfter = Date.now() + 2000;
			return failure(error);
		} finally {
			this.busy = false;
		}
	}
}
