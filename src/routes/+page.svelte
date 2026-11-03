<script lang="ts">
	import Game from '#lib/components/Game.svelte';
</script>

<svelte:head><title>Marathon 150 — играть в тетрис</title></svelte:head>

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
