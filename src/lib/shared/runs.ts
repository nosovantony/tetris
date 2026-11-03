import { RULES_VERSION } from './leaderboard';
import type { GameConfig } from '../game/types';

export const RUN_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const MAX_FINISH_BYTES = 180 * 1024;
export const MAX_TOKEN_LENGTH = 2048;
export const GUEST_COOKIE = 'marathon_guest';
export interface RunClaims {
	v: 1;
	runId: string;
	guestId: string;
	rulesVersion: string;
	issuedAt: number;
	expiresAt: number;
	config: Required<GameConfig>;
}
export interface RunTicket {
	token: string;
	claims: RunClaims;
}

export function parseRunClaims(value: unknown): RunClaims {
	if (!value || typeof value !== 'object') throw new Error('Invalid run');
	const v = value as RunClaims;
	if (
		v.v !== 1 ||
		typeof v.runId !== 'string' ||
		typeof v.guestId !== 'string' ||
		!/^[a-f0-9-]{36}$/.test(v.runId) ||
		!/^[a-f0-9-]{36}$/.test(v.guestId) ||
		v.rulesVersion !== RULES_VERSION ||
		!Number.isSafeInteger(v.issuedAt) ||
		v.issuedAt < 0 ||
		v.expiresAt !== v.issuedAt + RUN_LIFETIME_MS ||
		!v.config ||
		v.config.mode !== 'ranked' ||
		v.config.startLevel !== 1 ||
		v.config.dasTicks !== 8 ||
		v.config.arrTicks !== 1 ||
		!Number.isInteger(v.config.seed) ||
		v.config.seed < 0 ||
		v.config.seed > 0xffffffff
	)
		throw new Error('Invalid run');
	return v;
}

export function parseTicket(value: unknown): RunTicket {
	if (!value || typeof value !== 'object') throw new Error('Invalid ticket');
	const v = value as RunTicket;
	if (
		typeof v.token !== 'string' ||
		v.token.length > MAX_TOKEN_LENGTH ||
		!/^[\w-]+\.[\w-]+$/.test(v.token)
	)
		throw new Error('Invalid ticket');
	parseRunClaims(v.claims);
	return v;
}

export function toBase64(bytes: Uint8Array): string {
	let text = '';
	for (let i = 0; i < bytes.length; i += 8192)
		text += String.fromCharCode(...bytes.subarray(i, i + 8192));
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64(text: string, maxBytes: number): Uint8Array {
	if (!text || text.length > Math.ceil((maxBytes * 4) / 3) || !/^[\w-]+$/.test(text))
		throw new Error('Invalid base64url');
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	if (bytes.length > maxBytes || toBase64(bytes) !== text) throw new Error('Invalid base64url');
	return bytes;
}
