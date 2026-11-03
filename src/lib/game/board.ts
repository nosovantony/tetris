import { BOARD_HEIGHT, BOARD_WIDTH, HIDDEN_ROWS, VISIBLE_HEIGHT, shape } from './constants';
import type { ActivePiece, Board, Point } from './types';

export function createBoard(): Board {
	return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
}

export function cells(piece: ActivePiece): Point[] {
	return shape(piece.type, piece.rotation).map(([x, y]): Point => [x + piece.x, y + piece.y]);
}

export function occupied(board: Board, x: number, y: number): boolean {
	return (
		x < 0 ||
		x >= BOARD_WIDTH ||
		y < -HIDDEN_ROWS ||
		y >= VISIBLE_HEIGHT ||
		board[y + HIDDEN_ROWS][x] !== null
	);
}

export function collides(board: Board, piece: ActivePiece): boolean {
	return cells(piece).some(([x, y]) => occupied(board, x, y));
}

export function grounded(board: Board, piece: ActivePiece): boolean {
	return collides(board, { ...piece, y: piece.y + 1 });
}

export function ghostPiece(board: Board, piece: ActivePiece): ActivePiece {
	const ghost = { ...piece };
	while (!collides(board, { ...ghost, y: ghost.y + 1 })) ghost.y++;
	return ghost;
}

export function clearLines(board: Board): number {
	const remaining = board.filter((row) => row.some((cell) => cell === null));
	const count = BOARD_HEIGHT - remaining.length;
	if (count > 0) {
		board.splice(
			0,
			board.length,
			...Array.from({ length: count }, () => Array(BOARD_WIDTH).fill(null)),
			...remaining
		);
	}
	return count;
}
