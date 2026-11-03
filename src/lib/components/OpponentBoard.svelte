<script lang="ts">
	import type { Cell } from '../game/types';
	import { COLORS } from './colors';
	import { i18n } from '../i18n/index.svelte';

	let {
		board = [],
		name = 'Opponent',
		score = 0,
		lines = 0,
		wins = 0,
		targetWins = 2
	}: {
		board: Cell[][];
		name: string;
		score: number;
		lines: number;
		wins: number;
		targetWins?: number;
	} = $props();

	const id = $props.id();

	// Flatten rows from row 2 downwards (hidden rows are 0 and 1)
	let stack = $derived(
		board.flatMap((row, y) =>
			row.flatMap((type, x) => (type && y >= 2 ? [{ type, x, y: y - 2 }] : []))
		)
	);
</script>

<div class="opponent-panel">
	<div class="opponent-header">
		<div class="opponent-info">
			<span class="opponent-label">{i18n.t.duel.opponent}</span>
			<span class="opponent-name" title={name}>{name}</span>
		</div>
		<div class="opponent-stars" aria-label={`Wins: ${wins} of ${targetWins}`}>
			{#each Array.from({ length: targetWins }) as _, idx}
				<span class="star" class:filled={idx < wins}>★</span>
			{/each}
		</div>
	</div>

	<div class="opponent-board-wrapper">
		<svg
			viewBox="0 0 100 200"
			role="img"
			aria-label={i18n.t.duel.opponentBoardAria}
			class="opponent-svg"
		>
			<defs>
				<pattern id={`${id}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
					<path d="M10 0H0v10" fill="none" stroke="#1e293b" stroke-width=".3" />
				</pattern>
				<clipPath id={`${id}-clip`}><rect width="100" height="200" /></clipPath>
			</defs>
			<rect width="100" height="200" fill="#0b1120" />
			<rect width="100" height="200" fill={`url(#${id}-grid)`} />
			<g clip-path={`url(#${id}-clip)`}>
				{#each stack as cell}
					<rect
						x={cell.x * 10 + 0.5}
						y={cell.y * 10 + 0.5}
						width="9"
						height="9"
						rx=".8"
						fill={COLORS[cell.type] || '#64748b'}
					/>
				{/each}
			</g>
		</svg>
	</div>

	<div class="opponent-stats">
		<div class="stat-col">
			<span class="stat-label">{i18n.t.game.score}</span>
			<span class="stat-val">{score.toLocaleString(i18n.current === 'ru' ? 'ru-RU' : 'en-US')}</span
			>
		</div>
		<div class="stat-col">
			<span class="stat-label">{i18n.t.game.lines}</span>
			<span class="stat-val">{lines}</span>
		</div>
	</div>
</div>

<style>
	.opponent-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		background: rgba(15, 23, 42, 0.7);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 12px;
		gap: 10px;
		width: 140px;
	}
	.opponent-header {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.opponent-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}
	.opponent-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.opponent-name {
		font-size: 13px;
		font-weight: 700;
		color: #f87171;
		max-width: 120px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.opponent-stars {
		display: flex;
		gap: 4px;
		font-size: 14px;
	}
	.star {
		color: #334155;
	}
	.star.filled {
		color: #fbbf24;
		text-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
	}
	.opponent-board-wrapper {
		width: 100px;
		height: 200px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
		background: #0b1120;
	}
	.opponent-svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.opponent-stats {
		width: 100%;
		display: flex;
		justify-content: space-between;
		font-size: 11px;
	}
	.stat-col {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.stat-label {
		font-size: 9px;
		color: var(--muted);
		text-transform: uppercase;
	}
	.stat-val {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
