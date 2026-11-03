export const TOTAL_LEVELS = 150;
export const LINES_PER_LEVEL = 10;
export const MARATHON_LINES = TOTAL_LEVELS * LINES_PER_LEVEL;

export function assertLevel(level: number): void {
	if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) {
		throw new RangeError('Level must be an integer from 1 to 150');
	}
}

// 0 means explicit 20G, never an interval used in division or modulo.
export function getGravityTicks(level: number): number {
	assertLevel(level);
	if (level <= 30) return Math.max(6, Math.round(60 - ((level - 1) * 54) / 29));
	if (level <= 80) return Math.max(1, Math.round(5 - ((level - 31) * 4) / 49));
	return 0;
}

export function getLockDelayTicks(level: number): number {
	assertLevel(level);
	return level <= 120 ? 30 : Math.max(15, Math.round(30 - (level - 120) / 2));
}

export function levelForLines(startLevel: number, lines: number): number {
	return Math.min(TOTAL_LEVELS, startLevel + Math.floor(lines / LINES_PER_LEVEL));
}
