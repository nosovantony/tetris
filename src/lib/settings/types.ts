import type { Control } from '../input/controls';

export interface ControlBindings {
	left: string[];
	right: string[];
	'soft-drop': string[];
	'hard-drop': string[];
	'rotate-cw': string[];
	'rotate-ccw': string[];
	hold: string[];
}

export type Handedness = 'right' | 'left';

export interface TouchSettings {
	layout: Handedness;
	deadzone: number;
	haptics: boolean;
}

export interface AudioSettings {
	masterVolume: number;
	sfxVolume: number;
	bgmVolume: number;
	sfxMuted: boolean;
	bgmMuted: boolean;
}

export interface GameSettings {
	dasTicks: number;
	arrTicks: number;
}

export interface UserSettings {
	version: number;
	controls: ControlBindings;
	touch: TouchSettings;
	audio: AudioSettings;
	game: GameSettings;
}

export const CONTROL_LABELS: Record<Control, { name: string; description: string }> = {
	left: { name: 'Сдвиг влево', description: 'Перемещение фигуры влево' },
	right: { name: 'Сдвиг вправо', description: 'Перемещение фигуры вправо' },
	'soft-drop': { name: 'Мягкое падение', description: 'Ускорить спуск фигуры' },
	'hard-drop': { name: 'Сбросить фигуру', description: 'Мгновенно бросить фигуру вниз' },
	'rotate-cw': { name: 'Поворот по часовой', description: 'Повернуть фигуру на 90° вправо' },
	'rotate-ccw': { name: 'Поворот против часовой', description: 'Повернуть фигуру на 90° влево' },
	hold: { name: 'Удержание (Hold)', description: 'Отложить фигуру про запас' }
};

export const DEFAULT_BINDINGS: Readonly<ControlBindings> = {
	left: ['ArrowLeft'],
	right: ['ArrowRight'],
	'soft-drop': ['ArrowDown'],
	'hard-drop': ['Space'],
	'rotate-cw': ['ArrowUp', 'KeyX'],
	'rotate-ccw': ['KeyZ'],
	hold: ['KeyC', 'ShiftLeft']
};

export const DEFAULT_SETTINGS: Readonly<UserSettings> = {
	version: 1,
	controls: DEFAULT_BINDINGS,
	touch: {
		layout: 'right',
		deadzone: 0.25,
		haptics: true
	},
	audio: {
		masterVolume: 0.7,
		sfxVolume: 0.8,
		bgmVolume: 0.45,
		sfxMuted: false,
		bgmMuted: false
	},
	game: {
		dasTicks: 8,
		arrTicks: 1
	}
};
