import type { Control } from '../input/controls';
import {
	DEFAULT_BINDINGS,
	DEFAULT_SETTINGS,
	type ControlBindings,
	type UserSettings
} from './types';

export const SETTINGS_STORAGE_KEY = 'tetris:settings:v1';

export function bindingsToKeyMap(bindings: ControlBindings): Record<string, Control> {
	const map: Record<string, Control> = {};
	for (const [ctrl, keys] of Object.entries(bindings) as [Control, string[]][]) {
		for (const key of keys) {
			if (key) map[key] = ctrl;
		}
	}
	return map;
}

export function humanKeyName(code: string): string {
	if (!code) return '—';
	if (code.startsWith('Key')) return code.slice(3).toUpperCase();
	if (code.startsWith('Digit')) return code.slice(5);
	if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
	switch (code) {
		case 'ArrowLeft':
			return '←';
		case 'ArrowRight':
			return '→';
		case 'ArrowUp':
			return '↑';
		case 'ArrowDown':
			return '↓';
		case 'Space':
			return 'Пробел';
		case 'ShiftLeft':
			return 'Left Shift';
		case 'ShiftRight':
			return 'Right Shift';
		case 'ControlLeft':
			return 'Left Ctrl';
		case 'ControlRight':
			return 'Right Ctrl';
		case 'AltLeft':
			return 'Left Alt';
		case 'AltRight':
			return 'Right Alt';
		case 'Enter':
			return 'Enter';
		case 'Backspace':
			return 'Backspace';
		case 'Tab':
			return 'Tab';
		case 'Escape':
			return 'Esc';
		default:
			return code;
	}
}

/** Assigns a key code to a control, removing conflicts from other controls. */
export function assignKey(
	bindings: ControlBindings,
	targetControl: Control,
	code: string,
	slot = 0
): ControlBindings {
	const updated: ControlBindings = {
		left: [...bindings.left],
		right: [...bindings.right],
		'soft-drop': [...bindings['soft-drop']],
		'hard-drop': [...bindings['hard-drop']],
		'rotate-cw': [...bindings['rotate-cw']],
		'rotate-ccw': [...bindings['rotate-ccw']],
		hold: [...bindings.hold]
	};

	// Remove this code from any other controls or slots
	for (const [ctrl, keys] of Object.entries(updated) as [Control, string[]][]) {
		updated[ctrl] = keys.filter((k) => k !== code);
	}

	const list = updated[targetControl];
	if (slot < list.length) {
		list[slot] = code;
	} else {
		list.push(code);
	}

	return updated;
}

function clamp(val: unknown, min: number, max: number, fallback: number): number {
	if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
	return Math.max(min, Math.min(max, val));
}

export function validateSettings(raw: unknown): UserSettings {
	if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
	const candidate = raw as Partial<UserSettings>;

	const bindings: ControlBindings = {
		left: Array.isArray(candidate.controls?.left)
			? candidate.controls.left.filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS.left],
		right: Array.isArray(candidate.controls?.right)
			? candidate.controls.right.filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS.right],
		'soft-drop': Array.isArray(candidate.controls?.['soft-drop'])
			? candidate.controls['soft-drop'].filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS['soft-drop']],
		'hard-drop': Array.isArray(candidate.controls?.['hard-drop'])
			? candidate.controls['hard-drop'].filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS['hard-drop']],
		'rotate-cw': Array.isArray(candidate.controls?.['rotate-cw'])
			? candidate.controls['rotate-cw'].filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS['rotate-cw']],
		'rotate-ccw': Array.isArray(candidate.controls?.['rotate-ccw'])
			? candidate.controls['rotate-ccw'].filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS['rotate-ccw']],
		hold: Array.isArray(candidate.controls?.hold)
			? candidate.controls.hold.filter((k): k is string => typeof k === 'string')
			: [...DEFAULT_BINDINGS.hold]
	};

	const layout = candidate.touch?.layout === 'left' ? 'left' : 'right';
	const deadzone = clamp(candidate.touch?.deadzone, 0.1, 0.5, DEFAULT_SETTINGS.touch.deadzone);
	const haptics = candidate.touch?.haptics !== false;

	const masterVolume = clamp(
		candidate.audio?.masterVolume,
		0,
		1,
		DEFAULT_SETTINGS.audio.masterVolume
	);
	const sfxVolume = clamp(candidate.audio?.sfxVolume, 0, 1, DEFAULT_SETTINGS.audio.sfxVolume);
	const bgmVolume = clamp(candidate.audio?.bgmVolume, 0, 1, DEFAULT_SETTINGS.audio.bgmVolume);
	const sfxMuted = Boolean(candidate.audio?.sfxMuted);
	const bgmMuted = Boolean(candidate.audio?.bgmMuted);

	const dasTicks = Math.round(
		clamp(candidate.game?.dasTicks, 1, 20, DEFAULT_SETTINGS.game.dasTicks)
	);
	const arrTicks = Math.round(
		clamp(candidate.game?.arrTicks, 0, 6, DEFAULT_SETTINGS.game.arrTicks)
	);

	return {
		version: 1,
		controls: bindings,
		touch: { layout, deadzone, haptics },
		audio: { masterVolume, sfxVolume, bgmVolume, sfxMuted, bgmMuted },
		game: { dasTicks, arrTicks }
	};
}

export function loadSettings(): UserSettings {
	if (typeof window === 'undefined' || !window.localStorage) {
		return DEFAULT_SETTINGS;
	}
	try {
		const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (!raw) return DEFAULT_SETTINGS;
		return validateSettings(JSON.parse(raw));
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export function saveSettings(settings: UserSettings): void {
	if (typeof window === 'undefined' || !window.localStorage) return;
	try {
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// quota exceeded or disabled storage
	}
}
