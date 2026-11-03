import { describe, expect, it } from 'vitest';
import { InputMux } from '../../src/lib/input/controls';
import { createKeyboard } from '../../src/lib/input/keyboard';
import { stickDirection } from '../../src/lib/input/touch';
import type { Action } from '../../src/lib/game/types';

describe('input sources', () => {
	it('merges keyboard and touch holds without premature release', () => {
		const actions: Action[] = [];
		const input = new InputMux((a) => actions.push(a));
		input.press('key', 'left');
		input.press('key', 'left');
		input.press('touch', 'left');
		input.release('key');
		expect(actions).toEqual(['left-down']);
		input.press('touch', 'right');
		input.clear();
		expect(actions).toEqual(['left-down', 'left-up', 'right-down', 'right-up']);
		input.press('button', 'hold');
		input.clear();
		expect(actions.at(-1)).toBe('hold');
	});
	it('uses physical codes, ignores OS repeats and shortcuts, releases after focus/modifier change', () => {
		const actions: string[] = [];
		let prevented = 0,
			enabled = true;
		const keyboard = createKeyboard({
			enabled: () => enabled,
			press: (source, control) => actions.push(`${source}:${control}`),
			release: (source) => actions.push(`release:${source}`),
			pause: () => actions.push('pause')
		});
		const key = (code: string, change = {}) => ({
			code,
			repeat: false,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			preventDefault: () => {
				prevented++;
			},
			...change
		});
		keyboard.keydown(key('ArrowLeft'));
		keyboard.keydown(key('ArrowLeft', { repeat: true }));
		keyboard.keydown(key('KeyR', { ctrlKey: true }));
		keyboard.keydown(key('F11'));
		keyboard.keydown(key('Space', { metaKey: true }));
		expect(actions).toEqual(['key:ArrowLeft:left']);
		expect(prevented).toBe(2);
		enabled = false;
		keyboard.keyup(key('ArrowLeft', { ctrlKey: true }));
		keyboard.keydown(key('KeyX'));
		expect(actions.at(-1)).toBe('release:key:ArrowLeft');
		enabled = true;
		keyboard.keydown(key('KeyX'));
		keyboard.keydown(key('Escape'));
		keyboard.reset();
		expect(actions).toContain('key:KeyX:rotate-cw');
		expect(actions).toContain('pause');
	});
});

describe('cardinal joystick', () => {
	it('has deadzone, smaller release radius and no upward action', () => {
		expect(stickDirection(0.24, 0, null)).toBeNull();
		expect(stickDirection(0.24, 0, 'right')).toBe('right');
		expect(stickDirection(0.17, 0, 'right')).toBeNull();
		expect(stickDirection(0, -1, null)).toBeNull();
		expect(stickDirection(-1, 0, null)).toBe('left');
		expect(stickDirection(0, 1, null)).toBe('soft-drop');
		expect(stickDirection(NaN, 1, null)).toBeNull();
	});
	it('retains sector around diagonal until hysteresis threshold is crossed', () => {
		expect(stickDirection(1, 1.1, 'right')).toBe('right');
		expect(stickDirection(1, 1.3, 'right')).toBe('soft-drop');
		expect(stickDirection(1.1, 1, 'soft-drop')).toBe('soft-drop');
		expect(stickDirection(1.3, 1, 'soft-drop')).toBe('right');
	});
});
