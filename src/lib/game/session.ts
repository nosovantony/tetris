import { MAX_ACTIONS_PER_TICK, TICKS_PER_SECOND } from './constants';
import { createGame, stepGame } from './engine';
import { MAX_REPLAY_EVENTS } from './simulator';
import type { Action, GameConfig, GameState, ReplayEvent } from './types';
import { parseCheckpoint } from './checkpoint';
import { parseTicket, type RunTicket } from '../shared/runs';

export type SessionPhase = 'ready' | 'running' | 'paused' | 'countdown' | 'finished';
const RELEASES: Action[] = ['left-up', 'right-up', 'soft-drop-up'];
const TICK_MS = 1000 / TICKS_PER_SECOND;

// Browser-independent fixed-step runner. Wall time is supplied by requestAnimationFrame.
export class GameSession {
	game: GameState;
	phase: SessionPhase = 'ready';
	countdown = 0;
	events: ReplayEvent[] = [];
	replayAvailable = true;
	ticket: RunTicket | null = null;
	private pending: Action[] = [];
	private lastFrame: number | null = null;
	private accumulator = 0;
	private resumeAt = 0;

	constructor(config: GameConfig) {
		this.game = createGame(config);
	}

	start(config: GameConfig, ticket?: RunTicket): void {
		if (config.mode === 'ranked' && ticket) parseTicket(ticket);
		this.game = createGame(config);
		this.ticket = ticket ?? null;
		this.phase = 'running';
		this.events = [];
		this.replayAvailable = true;
		this.pending = [];
		this.lastFrame = null;
		this.accumulator = 0;
		this.countdown = 0;
	}

	restore(value: unknown, now = Date.now()): void {
		const saved = parseCheckpoint(value, now);
		this.game = saved.game;
		this.events = saved.events;
		this.replayAvailable = saved.replayAvailable;
		this.ticket = saved.ticket ?? null;
		this.phase = this.game.status === 'playing' ? 'paused' : 'finished';
		this.pending = [...RELEASES];
		this.lastFrame = null;
		this.accumulator = 0;
		this.countdown = 0;
	}

	enqueue(action: Action): void {
		if (this.phase !== 'running') return;
		if (this.pending.length >= MAX_ACTIONS_PER_TICK) {
			this.pause();
			return;
		}
		this.pending.push(action);
	}

	pause(): void {
		if (this.phase !== 'running' && this.phase !== 'countdown') return;
		this.phase = 'paused';
		// Releases become part of replay on the FIRST resumed active tick.
		this.pending = [...RELEASES];
		this.lastFrame = null;
		this.accumulator = 0;
		this.countdown = 0;
	}

	resume(now: number): void {
		if (this.phase !== 'paused' || !Number.isFinite(now)) return;
		this.phase = 'countdown';
		this.resumeAt = now + 3000;
		this.countdown = 3;
	}

	frame(now: number): void {
		if (!Number.isFinite(now)) return;
		if (this.phase === 'countdown') {
			this.countdown = Math.max(0, Math.ceil((this.resumeAt - now) / 1000));
			if (now >= this.resumeAt) {
				this.phase = 'running';
				this.lastFrame = now;
			}
			return;
		}
		if (this.phase !== 'running') return;
		if (this.lastFrame === null) {
			this.lastFrame = now;
			return;
		}
		const elapsed = now - this.lastFrame;
		this.lastFrame = now;
		// Never fast-forward through a frozen/background tab or a suspended device.
		if (elapsed > 250 || elapsed < 0) {
			this.pause();
			return;
		}
		this.accumulator += elapsed;
		while (this.accumulator + 1e-7 >= TICK_MS && this.phase === 'running') {
			const actions = this.pending;
			this.pending = [];
			if (this.replayAvailable) {
				if (this.events.length + actions.length > MAX_REPLAY_EVENTS) {
					// Local games keep working even if future ranked replay limits are exceeded.
					this.replayAvailable = false;
					this.events = [];
				} else for (const action of actions) this.events.push({ tick: this.game.tick, action });
			}
			stepGame(this.game, actions);
			this.accumulator = Math.max(0, this.accumulator - TICK_MS);
			if (this.game.status !== 'playing') this.phase = 'finished';
		}
	}
}
