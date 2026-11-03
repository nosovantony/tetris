export const RULES_VERSION = 'marathon-150-v1';

// Only trusted backend callers may submit this. It is NOT a public API payload.
export interface VerifiedResult {
	runId: string;
	guestId: string;
	rulesVersion: string;
	playerName: string;
	score: number;
	lines: number;
	level: number;
	durationTicks: number;
	isClear: boolean;
	expiresAt: number; // Unix milliseconds; submission deadline, not elapsed play time.
}

export interface PublicResult {
	playerName: string;
	score: number;
	lines: number;
	level: number;
	durationTicks: number;
	isClear: boolean;
	achievedAt: number;
}

export function parseVerifiedResult(value: unknown, now: number): VerifiedResult {
	if (!value || typeof value !== 'object') throw new Error('Expected a result object');
	const v = value as Record<string, unknown>;
	for (const key of ['runId', 'guestId', 'rulesVersion'] as const) {
		if (typeof v[key] !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v[key])) {
			throw new Error(`Invalid ${key}`);
		}
	}
	if (typeof v.playerName !== 'string') throw new Error('Invalid player name');
	const playerName = v.playerName.trim().normalize('NFC');
	if (!playerName || [...playerName].length > 20 || /[\p{Cc}\p{Cf}]/u.test(playerName)) {
		throw new Error('Invalid player name');
	}
	for (const [key, minimum, maximum] of [
		['score', 0, Number.MAX_SAFE_INTEGER],
		['lines', 0, 1503],
		['level', 1, 150],
		['durationTicks', 0, 648000],
		['expiresAt', now + 1, now + 7 * 86400000]
	] as const) {
		if (
			typeof v[key] !== 'number' ||
			!Number.isSafeInteger(v[key]) ||
			v[key] < minimum ||
			v[key] > maximum
		) {
			throw new Error(`Invalid ${key}`);
		}
	}
	if (typeof v.isClear !== 'boolean' || v.isClear !== (v.lines as number) >= 1500) {
		throw new Error('Invalid completion flag');
	}
	return { ...v, playerName } as unknown as VerifiedResult;
}
