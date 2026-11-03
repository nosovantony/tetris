<script lang="ts">
	import { shape } from '../game/constants';
	import type { PieceType } from '../game/types';
	import { COLORS } from './colors';
	import { i18n } from '../i18n/index.svelte';
	let { type, muted = false }: { type: PieceType | null; muted?: boolean } = $props();
</script>

<svg
	viewBox="0 0 60 34"
	role="img"
	aria-label={type
		? i18n.current === 'ru'
			? `Фигура ${type}`
			: `Piece ${type}`
		: i18n.current === 'ru'
			? 'Пусто'
			: 'Empty'}
	class:muted
>
	{#if type}
		{#each shape(type, 0) as [x, y]}
			<rect
				x={x * 11 + (type === 'I' || type === 'O' ? 8 : 13)}
				y={y * 11 + 6}
				width="10"
				height="10"
				rx="1.2"
				fill={COLORS[type]}
			/>
		{/each}
	{:else}
		<path d="M23 17h14" stroke="currentColor" opacity=".4" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		max-width: 86px;
		height: auto;
	}
	.muted {
		opacity: 0.35;
	}
</style>
