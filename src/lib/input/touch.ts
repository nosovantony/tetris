import type { HeldControl } from './controls';

export type StickDirection = HeldControl | null;

/** Normalized stick coordinates, +y down. No upward action or diagonal inputs. */
export function stickDirection(x: number, y: number, previous: StickDirection): StickDirection {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	if (Math.hypot(x, y) < (previous ? 0.18 : 0.25)) return null;
	const ax = Math.abs(x),
		ay = Math.abs(y);
	// Retain the old sector until the other axis exceeds it by 25%.
	if (previous === 'left' && x < 0 && ax * 1.25 >= ay) return previous;
	if (previous === 'right' && x > 0 && ax * 1.25 >= ay) return previous;
	if (previous === 'soft-drop' && y > 0 && ay * 1.25 >= ax) return previous;
	if (ay > ax) return y > 0 ? 'soft-drop' : null;
	return x < 0 ? 'left' : 'right';
}
