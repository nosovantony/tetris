import { DurableObject } from 'cloudflare:workers';
import type { DuelRoomDO } from './duel-room-do';

interface MatchmakerEnv {
	DUEL_ROOM: DurableObjectNamespace<DuelRoomDO>;
}

export class MatchmakerDO extends DurableObject {
	private queue: string[] = [];

	constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const env = this.env as unknown as MatchmakerEnv;

		// Clean up queue and find first waiting room
		while (this.queue.length > 0) {
			const candidate = this.queue[0];
			try {
				const res = await env.DUEL_ROOM.getByName(candidate).fetch('https://internal/status');
				if (res.ok) {
					const data = (await res.json()) as { playersCount: number; status: string };
					if (data.playersCount === 1 && data.status === 'waiting') {
						this.queue.shift();
						return Response.json({ roomId: candidate });
					}
				}
			} catch {
				// Room unreachable or destroyed
			}
			this.queue.shift();
		}

		// Create a new quick-play room and put in queue
		const roomId = 'quick-' + crypto.randomUUID().slice(0, 8);
		this.queue.push(roomId);
		return Response.json({ roomId });
	}
}
