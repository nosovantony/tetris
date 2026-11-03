<script lang="ts">
	import { cells, ghostPiece } from '../game/board';
	import type { GameState } from '../game/types';
	import { COLORS } from './colors';
	let { game, concealed = false }: { game: GameState; concealed?: boolean } = $props();
	const id = $props.id();
	let stack = $derived(
		game.board.flatMap((row, y) =>
			row.flatMap((type, x) => (type && y >= 2 ? [{ type, x, y: y - 2 }] : []))
		)
	);
	let active = $derived(game.active ? cells(game.active) : []);
	let ghost = $derived(game.active ? cells(ghostPiece(game.board, game.active)) : []);
</script>

<svg
	viewBox="0 0 100 200"
	role="img"
	aria-label={concealed ? 'Поле скрыто на паузе' : 'Игровое поле, 10 колонок и 20 строк'}
	data-testid="board"
>
	<defs>
		<pattern id={`${id}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
			<path d="M10 0H0v10" fill="none" stroke="#2a3749" stroke-width=".25" />
		</pattern>
		<clipPath id={`${id}-clip`}><rect width="100" height="200" /></clipPath>
	</defs>
	<rect width="100" height="200" fill="#111b29" />
	<rect width="100" height="200" fill={`url(#${id}-grid)`} />
	{#if !concealed}
		<g clip-path={`url(#${id}-clip)`}>
			{#each stack as cell}
				<rect
					data-testid="locked-cell"
					x={cell.x * 10 + 0.5}
					y={cell.y * 10 + 0.5}
					width="9"
					height="9"
					rx=".8"
					fill={COLORS[cell.type]}
				/>
			{/each}
			{#each ghost as [x, y]}
				<rect
					data-testid="ghost-cell"
					x={x * 10 + 0.8}
					y={y * 10 + 0.8}
					width="8.4"
					height="8.4"
					rx=".7"
					fill="none"
					stroke="#b6c8dd"
					stroke-width=".5"
					opacity=".4"
				/>
			{/each}
			{#each active as [x, y]}
				<rect
					data-testid="active-cell"
					x={x * 10 + 0.5}
					y={y * 10 + 0.5}
					width="9"
					height="9"
					rx=".8"
					fill={COLORS[game.active!.type]}
				/>
			{/each}
		</g>
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 5px;
	}
</style>
