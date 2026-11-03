import type { Action } from '../game/types';

export type HeldControl = 'left' | 'right' | 'soft-drop';
export type Control = HeldControl | 'rotate-cw' | 'rotate-ccw' | 'hard-drop' | 'hold';

export function isHeld(control: Control): control is HeldControl {
	return control === 'left' || control === 'right' || control === 'soft-drop';
}

// A physical key and a pointer can hold the same control independently.
// Releasing one source must not release the other.
export class InputMux {
	private held = new Map<string, HeldControl>();
	constructor(private emit: (action: Action) => void) {}

	press(source: string, control: Control): void {
		if (!isHeld(control)) {
			this.emit(control);
			return;
		}
		if (this.held.get(source) === control) return;
		this.release(source);
		const alreadyHeld = [...this.held.values()].includes(control);
		this.held.set(source, control);
		if (!alreadyHeld) this.emit(`${control}-down`);
	}

	release(source: string): void {
		const control = this.held.get(source);
		if (!control) return;
		this.held.delete(source);
		if (![...this.held.values()].includes(control)) this.emit(`${control}-up`);
	}

	clear(): void {
		for (const source of [...this.held.keys()]) this.release(source);
	}
}
