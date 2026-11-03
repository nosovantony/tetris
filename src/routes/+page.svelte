<script lang="ts">
	import Game from '#lib/components/Game.svelte';
	import { i18n } from '#lib/i18n/index.js';
</script>

<svelte:head
	><title
		>{i18n.current === 'ru'
			? 'Marathon 150 — играть в тетрис'
			: 'Marathon 150 — play Tetris'}</title
	></svelte:head
>

<main id="main"><Game /></main>

<style>
	main {
		padding-block: 28px 48px;
	}
	@media (max-width: 680px) {
		main {
			padding-block: 16px 24px;
		}
	}
</style>
