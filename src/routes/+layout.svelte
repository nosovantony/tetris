<script lang="ts">
	import '../app.css';
	import icon from '../../assets/icon.svg';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	let { children }: LayoutProps = $props();
	let staging = $state(false);
	onMount(() => {
		staging = location.hostname === 'tetris-web-staging.nosov-antony.workers.dev';
	});
</script>

<svelte:head>
	<link rel="icon" href={icon} type="image/svg+xml" />
	<meta
		name="description"
		content="Векторный тетрис Marathon 150. Клавиатура, мобильное управление и общий рейтинг."
	/>
</svelte:head>

<a class="skip-link" href="#main">К содержимому</a>
{#if staging}<aside class="staging-notice" role="note">
		STAGING — тестовая версия. Рекорды и сохранения отделены от основной игры.
	</aside>{/if}
<header class="site-header">
	<a class="brand" href="/" aria-label="Marathon 150 — главная">
		<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">
			<path d="M1 1h8v8H1zm10 0h8v8h-8zm10 0h8v8h-8zM11 11h8v8h-8z" fill="currentColor" />
		</svg>
		<span>MARATHON <strong>150</strong></span>
	</a>
	<nav aria-label="Основная навигация">
		<a href="/">Играть</a><a href="/leaderboard">Рекорды</a>
	</nav>
</header>
{@render children()}
<footer>
	SVG · Svelte · Cloudflare Workers <span>Тренировка / Рейтинг с проверкой replay</span>
</footer>

<style>
	.staging-notice {
		padding: 0.75rem 1rem;
		text-align: center;
		background: #553b12;
		color: #fff1c2;
	}
</style>
