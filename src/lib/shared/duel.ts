import type { Cell } from '../game/types';

export type PlayerId = 'p1' | 'p2';

export interface DuelPlayerInfo {
	id: PlayerId;
	name: string;
	wins: number;
	connected: boolean;
	ready: boolean;
}

export type DuelRoomStatus = 'waiting' | 'countdown' | 'playing' | 'round_end' | 'match_end';

export type DuelClientMessage =
	| { type: 'join'; name: string }
	| { type: 'board'; board: Cell[][]; score: number; lines: number }
	| { type: 'attack'; lines: number }
	| { type: 'top_out' }
	| { type: 'rematch' };

export type DuelServerMessage =
	| { type: 'welcome'; playerId: PlayerId; roomId: string; targetWins?: number }
	| {
			type: 'room_state';
			status: DuelRoomStatus;
			players: DuelPlayerInfo[];
			round: number;
			wins: Record<PlayerId, number>;
			targetWins: number;
	  }
	| { type: 'start_countdown'; countdown: number; round: number; seed: number }
	| { type: 'round_start'; round: number; seed: number }
	| { type: 'opponent_board'; board: Cell[][]; score: number; lines: number }
	| { type: 'garbage'; lines: number; holeColumn: number }
	| {
			type: 'round_end';
			winnerId: PlayerId;
			wins: Record<PlayerId, number>;
			matchWinnerId?: PlayerId;
	  }
	| { type: 'player_left'; playerId: PlayerId }
	| { type: 'error'; message: string };
