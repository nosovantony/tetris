import {
	fromBase64,
	toBase64,
	MAX_TOKEN_LENGTH,
	parseRunClaims,
	RUN_LIFETIME_MS,
	type RunTicket
} from '../shared/runs';
import { RULES_VERSION } from '../shared/leaderboard';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
export class TokenError extends Error {}
export class SigningUnavailable extends Error {}
let cached: { secret: string; key: Promise<CryptoKey> } | undefined;
function key(secret: string): Promise<CryptoKey> {
	if (secret.length < 32) throw new SigningUnavailable('Signing key is not configured');
	if (cached?.secret !== secret)
		cached = {
			secret,
			key: crypto.subtle.importKey(
				'raw',
				encoder.encode(secret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign', 'verify']
			)
		};
	return cached.key;
}

export async function signToken(
	secret: string,
	purpose: 'guest' | 'run',
	payload: unknown
): Promise<string> {
	const body = toBase64(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign(
		'HMAC',
		await key(secret),
		encoder.encode(`${purpose}.${body}`)
	);
	return `${body}.${toBase64(new Uint8Array(signature))}`;
}

export async function verifyToken(
	secret: string,
	purpose: 'guest' | 'run',
	token: string
): Promise<unknown> {
	const signingKey = await key(secret);
	try {
		if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) throw new TokenError();
		const parts = token.split('.');
		if (parts.length !== 2) throw new TokenError();
		const signature = fromBase64(parts[1], 32);
		if (
			signature.length !== 32 ||
			!(await crypto.subtle.verify(
				'HMAC',
				signingKey,
				new Uint8Array(signature),
				encoder.encode(`${purpose}.${parts[0]}`)
			))
		)
			throw new TokenError();
		return JSON.parse(decoder.decode(fromBase64(parts[0], 1400)));
	} catch {
		throw new TokenError('Invalid token');
	}
}

export async function guestIdentity(secret: string, token: string, now: number): Promise<string> {
	const value = (await verifyToken(secret, 'guest', token)) as {
		v: number;
		guestId: string;
		expiresAt: number;
	};
	if (
		!value ||
		value.v !== 1 ||
		typeof value.guestId !== 'string' ||
		!/^[a-f0-9-]{36}$/.test(value.guestId) ||
		!Number.isSafeInteger(value.expiresAt) ||
		value.expiresAt <= now
	)
		throw new TokenError('Invalid guest');
	return value.guestId;
}

export async function issueRun(
	secret: string,
	guestToken: string,
	now: number
): Promise<RunTicket & { guestToken: string }> {
	let guestId: string;
	try {
		guestId = await guestIdentity(secret, guestToken, now);
	} catch (error) {
		if (!(error instanceof TokenError)) throw error;
		guestId = crypto.randomUUID();
	}
	const claims = {
		v: 1 as const,
		runId: crypto.randomUUID(),
		guestId,
		rulesVersion: RULES_VERSION,
		issuedAt: now,
		expiresAt: now + RUN_LIFETIME_MS,
		config: {
			seed: crypto.getRandomValues(new Uint32Array(1))[0],
			mode: 'ranked' as const,
			startLevel: 1,
			dasTicks: 8,
			arrTicks: 1
		}
	};
	return {
		claims,
		token: await signToken(secret, 'run', claims),
		guestToken: await signToken(secret, 'guest', { v: 1, guestId, expiresAt: now + 365 * 86400000 })
	};
}

export async function verifyRun(secret: string, token: string, guestToken: string, now: number) {
	let claims;
	try {
		claims = parseRunClaims(await verifyToken(secret, 'run', token));
	} catch (error) {
		if (error instanceof SigningUnavailable) throw error;
		throw new TokenError('Invalid run');
	}
	if (
		claims.issuedAt > now + 1000 ||
		claims.expiresAt <= now ||
		claims.guestId !== (await guestIdentity(secret, guestToken, now))
	)
		throw new TokenError('Expired or foreign run');
	return claims;
}
