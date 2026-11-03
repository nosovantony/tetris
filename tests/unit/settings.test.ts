import { describe, expect, it } from 'vitest';
import {
	assignKey,
	bindingsToKeyMap,
	humanKeyName,
	validateSettings
} from '../../src/lib/settings/store';
import {
	DEFAULT_BINDINGS,
	DEFAULT_SETTINGS,
	type ControlBindings
} from '../../src/lib/settings/types';
import { SoundManager } from '../../src/lib/audio/sound';
import { createKeyboard } from '../../src/lib/input/keyboard';

describe('settings store and bindings', () => {
	it('validates and falls back to default settings gracefully', () => {
		expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings({})).toEqual(DEFAULT_SETTINGS);
		expect(validateSettings({ version: 'invalid' })).toEqual(DEFAULT_SETTINGS);

		// Clamping out-of-range values
		const clamped = validateSettings({
			audio: { masterVolume: 2.5, sfxVolume: -0.5, bgmVolume: 10, sfxMuted: true, bgmMuted: false },
			game: { dasTicks: 99, arrTicks: -5 },
			touch: { layout: 'left', deadzone: 0.9, haptics: false }
		});

		expect(clamped.audio.masterVolume).toBe(1);
		expect(clamped.audio.sfxVolume).toBe(0);
		expect(clamped.audio.bgmVolume).toBe(1);
		expect(clamped.audio.sfxMuted).toBe(true);
		expect(clamped.game.dasTicks).toBe(20);
		expect(clamped.game.arrTicks).toBe(0);
		expect(clamped.touch.layout).toBe('left');
		expect(clamped.touch.deadzone).toBe(0.5);
		expect(clamped.touch.haptics).toBe(false);
	});

	it('maps control bindings to key lookup map', () => {
		const bindings: ControlBindings = {
			left: ['KeyA', 'ArrowLeft'],
			right: ['KeyD'],
			'soft-drop': ['KeyS'],
			'hard-drop': ['Space'],
			'rotate-cw': ['KeyW'],
			'rotate-ccw': ['KeyQ'],
			hold: ['KeyE']
		};

		const map = bindingsToKeyMap(bindings);
		expect(map['KeyA']).toBe('left');
		expect(map['ArrowLeft']).toBe('left');
		expect(map['KeyD']).toBe('right');
		expect(map['KeyS']).toBe('soft-drop');
		expect(map['Space']).toBe('hard-drop');
		expect(map['KeyW']).toBe('rotate-cw');
		expect(map['KeyQ']).toBe('rotate-ccw');
		expect(map['KeyE']).toBe('hold');
		expect(map['KeyZ']).toBeUndefined();
	});

	it('formats human readable key names', () => {
		expect(humanKeyName('ArrowLeft')).toBe('←');
		expect(humanKeyName('ArrowRight')).toBe('→');
		expect(humanKeyName('ArrowUp')).toBe('↑');
		expect(humanKeyName('ArrowDown')).toBe('↓');
		expect(humanKeyName('Space')).toBe('Пробел');
		expect(humanKeyName('KeyZ')).toBe('Z');
		expect(humanKeyName('KeyC')).toBe('C');
		expect(humanKeyName('Digit1')).toBe('1');
		expect(humanKeyName('Numpad4')).toBe('Num 4');
		expect(humanKeyName('ShiftLeft')).toBe('Left Shift');
		expect(humanKeyName('Escape')).toBe('Esc');
		expect(humanKeyName('')).toBe('—');
	});

	it('resolves key conflicts when assigning keys', () => {
		const initial: ControlBindings = {
			...DEFAULT_BINDINGS,
			left: ['ArrowLeft'],
			right: ['ArrowRight']
		};

		// Assign ArrowLeft to 'right': it must be removed from 'left'
		const updated = assignKey(initial, 'right', 'ArrowLeft', 0);
		expect(updated.right).toContain('ArrowLeft');
		expect(updated.left).not.toContain('ArrowLeft');
	});

	it('supports custom getKey lookup in keyboard controller', () => {
		const actions: string[] = [];
		const customMap: Record<string, 'left' | 'right' | 'hard-drop'> = {
			KeyA: 'left',
			KeyD: 'right',
			Enter: 'hard-drop'
		};

		const keyboard = createKeyboard({
			enabled: () => true,
			getKey: (code) => customMap[code],
			press: (source, control) => actions.push(`${source}:${control}`),
			release: (source) => actions.push(`release:${source}`),
			pause: () => actions.push('pause')
		});

		const key = (code: string) => ({
			code,
			repeat: false,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			preventDefault: () => {}
		});

		keyboard.keydown(key('KeyA'));
		keyboard.keydown(key('KeyD'));
		keyboard.keydown(key('Enter'));
		// ArrowLeft is NOT in customMap, so it should be ignored
		keyboard.keydown(key('ArrowLeft'));

		expect(actions).toEqual(['key:KeyA:left', 'key:KeyD:right', 'key:Enter:hard-drop']);
	});
});

describe('audio sound synthesizer', () => {
	it('handles all sound effects safely in headless environments without errors', () => {
		const manager = new SoundManager();

		expect(() => {
			manager.playMove();
			manager.playRotate();
			manager.playSoftDrop();
			manager.playHardDrop();
			manager.playLock();
			manager.playHold();
			manager.playClear(1);
			manager.playClear(2);
			manager.playClear(3);
			manager.playTetris();
			manager.playLevelUp();
			manager.playGameOver();
			manager.playVictory();
			manager.playCountdown(3);
			manager.playCountdown(0);
			manager.playUiClick();
		}).not.toThrow();
	});

	it('manages BGM playback and settings updates without errors', () => {
		const manager = new SoundManager();

		expect(() => {
			manager.startBgm();
			manager.pauseBgm();
			manager.resumeBgm();
			manager.stopBgm();
			manager.updateSettings({
				masterVolume: 0.5,
				sfxVolume: 0.6,
				bgmVolume: 0.4,
				sfxMuted: false,
				bgmMuted: true
			});
		}).not.toThrow();
	});
});
