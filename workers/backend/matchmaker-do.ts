import { DurableObject } from 'cloudflare:workers';
import type { DuelRoomDO } from './duel-room-do';

interface MatchmakerEnv {
	DUEL_ROOM: DurableObjectNamespace<DuelRoomDO>;
}

export class MatchmakerDO extends DurableObject {
	private queues: Record<number, string[]> = { 1: [], 2: [], 3: [] };

	constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const env = this.env as unknown as MatchmakerEnv;
		const url = new URL(request.url);
		const rawWins = parseInt(
			url.searchParams.get('targetWins') || url.searchParams.get('wins') || '2',
			10
		);
		const targetWins = rawWins === 1 ? 1 : rawWins === 3 ? 3 : 2;

		if (!this.queues[targetWins]) {
			this.queues[targetWins] = [];
		}
		const queue = this.queues[targetWins];

		// Clean up queue and find first waiting room
		while (queue.length > 0) {
			const candidate = queue[0];
			try {
				const res = await env.DUEL_ROOM.getByName(candidate).fetch('https://internal/status');
				if (res.ok) {
					const data = (await res.json()) as {
						playersCount: number;
						status: string;
						targetWins?: number;
					};
					if (data.playersCount === 1 && data.status === 'waiting') {
						queue.shift();
						return Response.json({ roomId: candidate, targetWins });
					}
				}
			} catch {
				// Room unreachable or destroyed
			}
			queue.shift();
		}

		// Create a new quick-play room and put in queue
		const roomId = `quick-${targetWins}w-` + crypto.randomUUID().slice(0, 8);
		queue.push(roomId);
		return Response.json({ roomId, targetWins });
	}
}
