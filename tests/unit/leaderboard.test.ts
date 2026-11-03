import { describe, expect, it } from 'vitest';
import { parseVerifiedResult } from '../../src/lib/shared/leaderboard';

const now = 1793625000000;
const valid = {
	runId: 'run-1',
	guestId: 'guest-1',
	rulesVersion: 'marathon-150-v1',
	playerName: '  Игрок  ',
	score: 500,
	lines: 4,
	level: 1,
	durationTicks: 1000,
	isClear: false,
	expiresAt: now + 3600000
};

describe('trusted result boundary', () => {
	it('normalizes player names without relying on HTML', () => {
		expect(parseVerifiedResult(valid, now).playerName).toBe('Игрок');
		expect(parseVerifiedResult({ ...valid, playerName: '<script>' }, now).playerName).toBe(
			'<script>'
		);
	});
	it.each([
		{ score: -1 },
		{ score: 0.1 },
		{ score: Number.MAX_SAFE_INTEGER + 1 },
		{ lines: 1504 },
		{ level: 0 },
		{ level: 151 },
		{ durationTicks: 648001 },
		{ expiresAt: now },
		{ expiresAt: now + 8 * 86400000 },
		{ isClear: true },
		{ playerName: '' },
		{ playerName: 'x'.repeat(21) },
		{ playerName: 'a\u202eb' },
		{ runId: '../test' },
		{ guestId: null }
	])('rejects invalid fields: %j', (change) => {
		expect(() => parseVerifiedResult({ ...valid, ...change }, now)).toThrow();
	});
	it('accepts a completed marathon and simultaneous multi-line finish', () => {
		expect(
			parseVerifiedResult({ ...valid, lines: 1502, level: 150, isClear: true }, now).isClear
		).toBe(true);
	});
});
