export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type Rotation = 0 | 1 | 2 | 3;
export type Cell = PieceType | 'G' | null;
export type Point = readonly [x: number, y: number];
export type Board = Cell[][];
export interface ActivePiece {
	type: PieceType;
	rotation: Rotation;
	x: number;
	y: number;
}

// Press/release events, NOT OS key repeats. One-shot actions are already debounced by adapters.
export const ACTIONS = [
	'left-down',
	'left-up',
	'right-down',
	'right-up',
	'soft-drop-down',
	'soft-drop-up',
	'rotate-cw',
	'rotate-ccw',
	'hard-drop',
	'hold'
] as const;
export type Action = (typeof ACTIONS)[number];
export interface ReplayEvent {
	tick: number;
	action: Action;
}
export interface GameConfig {
	seed: number;
	mode?: 'ranked' | 'training';
	startLevel?: number;
	dasTicks?: number;
	arrTicks?: number;
}
export interface BagState {
	randomState: number;
	remaining: PieceType[];
}
export interface InputState {
	left: boolean;
	right: boolean;
	softDrop: boolean;
	direction: -1 | 0 | 1;
	horizontalAge: number;
}
export type Spin = 'none' | 'mini' | 'full';
export interface ClearEvent {
	lines: number;
	spin: Spin;
	basePoints: number;
	comboPoints: number;
	backToBackBonus: boolean;
}
export interface GameState {
	rulesVersion: string;
	config: Required<GameConfig>;
	board: Board;
	bag: BagState;
	next: PieceType[];
	active: ActivePiece | null;
	hold: PieceType | null;
	holdUsed: boolean;
	input: InputState;
	status: 'playing' | 'won' | 'lost' | 'timeout';
	topOut: 'block-out' | 'lock-out' | null;
	tick: number;
	score: number;
	lines: number;
	level: number;
	piecesLocked: number;
	combo: number;
	backToBack: boolean;
	gravityTicks: number;
	lockTicks: number;
	lockResets: number;
	hasTouchedGround: boolean;
	lastRotation: { kickIndex: number } | null;
	lastClear: ClearEvent | null;
	timeBonus: number;
}
