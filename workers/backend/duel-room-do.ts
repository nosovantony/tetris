import { DurableObject } from 'cloudflare:workers';
import type {
	DuelClientMessage,
	DuelPlayerInfo,
	DuelRoomStatus,
	DuelServerMessage,
	PlayerId
} from '../../src/lib/shared/duel';

const INITIAL_ACTIVITY_TIMEOUT_MS = 10_000;
type DuelSocket = { id: PlayerId; name: string; ready: boolean; actedThisRound: boolean };

export class DuelRoomDO extends DurableObject {
	private sockets = new Map<WebSocket, DuelSocket>();
	private wins: Record<PlayerId, number> = { p1: 0, p2: 0 };
	private round = 1;
	private status: DuelRoomStatus = 'waiting';
	private countdownTimer: ReturnType<typeof setTimeout> | null = null;
	private inactivityTimer: ReturnType<typeof setInterval> | null = null;
	private roundStartedAt = 0;
	private currentSeed = 0;
	private roomId = '';
	private targetWins = 2;

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
					wins: this.wins,
					targetWins: this.targetWins
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

		// Set targetWins when room is initially created by first player
		if (this.sockets.size === 0) {
			const parsedWins = parseInt(
				url.searchParams.get('targetWins') || url.searchParams.get('wins') || '',
				10
			);
			if (parsedWins === 1 || parsedWins === 2 || parsedWins === 3) {
				this.targetWins = parsedWins;
			}
		}

		// Determine player slot
		const takenIds = new Set(Array.from(this.sockets.values()).map((p) => p.id));
		const playerId: PlayerId = takenIds.has('p1') ? 'p2' : 'p1';

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		server.accept();

		this.sockets.set(server, {
			id: playerId,
			name: playerName,
			ready: false,
			actedThisRound: false
		});

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
			roomId: this.roomId,
			targetWins: this.targetWins
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
				this.roundStartedAt = Date.now();
				for (const player of this.sockets.values()) player.actedThisRound = false;
				this.broadcast({
					type: 'round_start',
					round: this.round,
					seed: this.currentSeed
				});
				this.broadcastState();
				this.startInactivityWatch();
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
			case 'activity': {
				if (this.status === 'playing') senderPlayer.actedThisRound = true;
				break;
			}
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
					this.finishRound(senderPlayer.id === 'p1' ? 'p2' : 'p1');
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
		this.stopInactivityWatch();

		this.broadcast({
			type: 'player_left',
			playerId: player.id
		});

		this.status = 'waiting';
		this.broadcastState();
	}

	private startInactivityWatch(): void {
		this.stopInactivityWatch();
		this.inactivityTimer = setInterval(() => {
			if (this.status !== 'playing') {
				this.stopInactivityWatch();
				return;
			}
			if (Date.now() - this.roundStartedAt < INITIAL_ACTIVITY_TIMEOUT_MS) return;

			const players = Array.from(this.sockets.values());
			const activePlayers = players.filter((player) => player.actedThisRound);
			// If both players are idle, do not award a random win. As soon as
			// one player makes a move, the untouched player forfeits.
			if (activePlayers.length !== 1) return;
			const inactive = players.find((player) => !player.actedThisRound);
			if (inactive) this.finishRound(inactive.id === 'p1' ? 'p2' : 'p1');
		}, 1000);
	}

	private stopInactivityWatch(): void {
		if (this.inactivityTimer) {
			clearInterval(this.inactivityTimer);
			this.inactivityTimer = null;
		}
	}

	private finishRound(winnerId: PlayerId): void {
		if (this.status !== 'playing') return;
		this.stopInactivityWatch();
		this.wins[winnerId]++;

		if (this.wins[winnerId] >= this.targetWins) {
			this.status = 'match_end';
			this.broadcast({ type: 'round_end', winnerId, wins: this.wins, matchWinnerId: winnerId });
		} else {
			this.status = 'round_end';
			this.broadcast({ type: 'round_end', winnerId, wins: this.wins });
			this.round++;
			this.countdownTimer = setTimeout(() => {
				if (this.sockets.size === 2) this.startCountdown();
			}, 3000);
		}
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
			wins: this.wins,
			targetWins: this.targetWins
		});
	}
}
