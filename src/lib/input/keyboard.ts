import type { Control } from './controls';

const KEYS: Readonly<Record<string, Control>> = {
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowDown: 'soft-drop',
	ArrowUp: 'rotate-cw',
	KeyX: 'rotate-cw',
	KeyZ: 'rotate-ccw',
	Space: 'hard-drop',
	KeyC: 'hold',
	ShiftLeft: 'hold'
};

interface KeyboardInput {
	code: string;
	repeat: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	preventDefault(): void;
}

export function isEditable(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		!!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
	);
}

export function createKeyboard(options: {
	enabled: () => boolean;
	press: (source: string, control: Control) => void;
	release: (source: string) => void;
	pause: () => void;
	getKey?: (code: string) => Control | undefined;
}) {
	const pressed = new Set<string>();
	return {
		keydown(event: KeyboardInput): void {
			if (!options.enabled() || event.ctrlKey || event.metaKey || event.altKey) return;
			const control = options.getKey ? options.getKey(event.code) : KEYS[event.code];
			if (!control && event.code !== 'Escape') return;
			event.preventDefault();
			if (event.repeat || pressed.has(event.code)) return;
			pressed.add(event.code);
			if (event.code === 'Escape') options.pause();
			else if (control) options.press(`key:${event.code}`, control);
		},
		keyup(event: KeyboardInput): void {
			// Release even if modifiers/focus changed after keydown.
			if (!pressed.delete(event.code)) return;
			event.preventDefault();
			options.release(`key:${event.code}`);
		},
		reset(): void {
			for (const code of pressed) options.release(`key:${code}`);
			pressed.clear();
		}
	};
}
