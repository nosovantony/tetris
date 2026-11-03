import { DurableObject } from 'cloudflare:workers';
import type {
	DuelClientMessage,
	DuelPlayerInfo,
	DuelRoomStatus,
	DuelServerMessage,
	PlayerId
} from '../../src/lib/shared/duel';

export class DuelRoomDO extends DurableObject {
	private sockets = new Map<WebSocket, { id: PlayerId; name: string; ready: boolean }>();
	private wins: Record<PlayerId, number> = { p1: 0, p2: 0 };
	private round = 1;
	private status: DuelRoomStatus = 'waiting';
	private countdownTimer: ReturnType<typeof setTimeout> | null = null;
	private currentSeed = 0;
	private roomId = '';

	constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.headers.get('Upgrade') !== 'websocket') {
			if (url.pathname === '/status') {
				return Response.json({
					roomId: this.roomId,
					playersCount: this.sockets.size,
					status: this.status,
					wins: this.wins
				});
			}
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		if (this.sockets.size >= 2) {
			return new Response(JSON.stringify({ error: 'Room is full' }), {
				status: 409,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		this.roomId = url.searchParams.get('room') || 'default';
		const rawName = url.searchParams.get('name') || 'Игрок';
		const playerName = rawName.trim().slice(0, 30) || 'Игрок';

		// Determine player slot
		const takenIds = new Set(Array.from(this.sockets.values()).map((p) => p.id));
		const playerId: PlayerId = takenIds.has('p1') ? 'p2' : 'p1';

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		server.accept();

		this.sockets.set(server, { id: playerId, name: playerName, ready: false });

		server.addEventListener('message', (event) => {
			this.handleMessage(server, event.data);
		});

		const onClose = () => this.handleClose(server);
		server.addEventListener('close', onClose);
		server.addEventListener('error', onClose);

		// Send initial welcome message
		this.send(server, {
			type: 'welcome',
			playerId,
			roomId: this.roomId
		});

		// Broadcast updated room state
		this.broadcastState();

		// If 2 players are now in the room and waiting, start the countdown
		if (this.sockets.size === 2 && this.status === 'waiting') {
			this.startCountdown();
		}

		return new Response(null, { status: 101, webSocket: client });
	}

	private startCountdown(): void {
		if (this.countdownTimer) {
			clearTimeout(this.countdownTimer);
			this.countdownTimer = null;
		}

		this.status = 'countdown';
		this.currentSeed = Math.floor(Math.random() * 2147483647);

		let count = 3;
		this.broadcast({
			type: 'start_countdown',
			countdown: count,
			round: this.round,
			seed: this.currentSeed
		});
		this.broadcastState();

		const tick = () => {
			count--;
			if (count > 0) {
				this.broadcast({
					type: 'start_countdown',
					countdown: count,
					round: this.round,
					seed: this.currentSeed
				});
				this.countdownTimer = setTimeout(tick, 1000);
			} else {
				this.status = 'playing';
				this.broadcast({
					type: 'round_start',
					round: this.round,
					seed: this.currentSeed
				});
				this.broadcastState();
			}
		};

		this.countdownTimer = setTimeout(tick, 1000);
	}

	private handleMessage(sender: WebSocket, rawData: unknown): void {
		let msg: DuelClientMessage;
		try {
			msg = typeof rawData === 'string' ? JSON.parse(rawData) : null;
			if (!msg || typeof msg !== 'object' || !msg.type) return;
		} catch {
			return;
		}

		const senderPlayer = this.sockets.get(sender);
		if (!senderPlayer) return;

		switch (msg.type) {
			case 'board': {
				this.sendToOpponent(sender, {
					type: 'opponent_board',
					board: msg.board,
					score: msg.score,
					lines: msg.lines
				});
				break;
			}
			case 'attack': {
				if (this.status === 'playing' && typeof msg.lines === 'number' && msg.lines > 0) {
					const holeColumn = Math.floor(Math.random() * 10);
					this.sendToOpponent(sender, {
						type: 'garbage',
						lines: msg.lines,
						holeColumn
					});
				}
				break;
			}
			case 'top_out': {
				if (this.status === 'playing') {
					// The other player won this round!
					const winnerId: PlayerId = senderPlayer.id === 'p1' ? 'p2' : 'p1';
					this.wins[winnerId]++;

					if (this.wins[winnerId] >= 2) {
						// First to 2 wins -> Match victory
						this.status = 'match_end';
						this.broadcast({
							type: 'round_end',
							winnerId,
							wins: this.wins,
							matchWinnerId: winnerId
						});
					} else {
						// Next round
						this.status = 'round_end';
						this.broadcast({
							type: 'round_end',
							winnerId,
							wins: this.wins
						});
						this.round++;
						this.countdownTimer = setTimeout(() => {
							if (this.sockets.size === 2) {
								this.startCountdown();
							}
						}, 3000);
					}
					this.broadcastState();
				}
				break;
			}
			case 'rematch': {
				if (this.status === 'match_end') {
					senderPlayer.ready = true;
					const allReady =
						this.sockets.size === 2 && Array.from(this.sockets.values()).every((p) => p.ready);

					if (allReady) {
						this.wins = { p1: 0, p2: 0 };
						this.round = 1;
						for (const p of this.sockets.values()) {
							p.ready = false;
						}
						this.startCountdown();
					} else {
						this.broadcastState();
					}
				}
				break;
			}
		}
	}

	private handleClose(ws: WebSocket): void {
		const player = this.sockets.get(ws);
		if (!player) return;

		this.sockets.delete(ws);
		try {
			ws.close();
		} catch {
			// already closed
		}

		if (this.countdownTimer) {
			clearTimeout(this.countdownTimer);
			this.countdownTimer = null;
		}

		this.broadcast({
			type: 'player_left',
			playerId: player.id
		});

		this.status = 'waiting';
		this.broadcastState();
	}

	private broadcast(msg: DuelServerMessage): void {
		const text = JSON.stringify(msg);
		for (const ws of this.sockets.keys()) {
			try {
				ws.send(text);
			} catch {
				// handled by onclose
			}
		}
	}

	private send(ws: WebSocket, msg: DuelServerMessage): void {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// handled by onclose
		}
	}

	private sendToOpponent(sender: WebSocket, msg: DuelServerMessage): void {
		const text = JSON.stringify(msg);
		for (const [ws] of this.sockets) {
			if (ws !== sender) {
				try {
					ws.send(text);
				} catch {
					// handled by onclose
				}
			}
		}
	}

	private broadcastState(): void {
		const players: DuelPlayerInfo[] = Array.from(this.sockets.values()).map((p) => ({
			id: p.id,
			name: p.name,
			wins: this.wins[p.id] || 0,
			connected: true,
			ready: p.ready
		}));

		this.broadcast({
			type: 'room_state',
			status: this.status,
			players,
			round: this.round,
			wins: this.wins
		});
	}
}
