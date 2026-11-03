<script lang="ts">
	import '../app.css';
	import icon from '../../assets/icon.svg';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { i18n } from '#lib/i18n/index.js';

	let { children }: LayoutProps = $props();
	let staging = $state(false);
	onMount(() => {
		staging = location.hostname === 'tetris-web-staging.nosov-antony.workers.dev';
	});

	function toggleLang() {
		i18n.setLanguage(i18n.current === 'ru' ? 'en' : 'ru');
	}
</script>

<svelte:head>
	<link rel="icon" href={icon} type="image/svg+xml" />
	<meta
		name="description"
		content={i18n.current === 'ru'
			? 'Векторный тетрис Marathon 150. Клавиатура, мобильное управление и общий рейтинг.'
			: 'Vector Tetris Marathon 150. Keyboard, touch controls and global leaderboard.'}
	/>
</svelte:head>

<a class="skip-link" href="#main">{i18n.t.nav.skipToContent}</a>
{#if staging}<aside class="staging-notice" role="note">
		{i18n.t.nav.stagingNotice}
	</aside>{/if}
<header class="site-header">
	<a
		class="brand"
		href="/"
		aria-label={i18n.current === 'ru' ? 'Marathon 150 — главная' : 'Marathon 150 — home'}
	>
		<svg viewBox="0 0 30 30" width="30" height="30" aria-hidden="true">
			<path d="M1 1h8v8H1zm10 0h8v8h-8zm10 0h8v8h-8zM11 11h8v8h-8z" fill="currentColor" />
		</svg>
		<span>MARATHON <strong>150</strong></span>
	</a>
	<div class="header-right">
		<nav aria-label="Основная навигация">
			<a href="/">{i18n.t.nav.play}</a><a href="/leaderboard">{i18n.t.nav.leaderboard}</a>
		</nav>
		<button
			type="button"
			class="lang-switch-btn"
			onclick={toggleLang}
			aria-label={i18n.current === 'ru' ? 'Switch to English' : 'Переключить на русский'}
			title={i18n.current === 'ru' ? 'Switch to English' : 'Переключить на русский'}
		>
			<span class="lang-tag" class:active={i18n.current === 'ru'}>RU</span>
			<span class="lang-divider">/</span>
			<span class="lang-tag" class:active={i18n.current === 'en'}>EN</span>
		</button>
	</div>
</header>
{@render children()}
<footer>
	{i18n.t.nav.footerTech} <span>{i18n.t.nav.footerDesc}</span>
</footer>

<style>
	.staging-notice {
		padding: 0.75rem 1rem;
		text-align: center;
		background: #553b12;
		color: #fff1c2;
	}
	.header-right {
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.lang-switch-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--muted);
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		letter-spacing: 0.05em;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.lang-switch-btn:hover {
		border-color: var(--accent);
		color: var(--fg);
	}
	.lang-tag {
		opacity: 0.55;
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
	}
	.lang-tag.active {
		opacity: 1;
		color: var(--accent);
	}
	.lang-divider {
		opacity: 0.35;
		font-size: 11px;
	}
	@media (max-width: 600px) {
		.header-right {
			gap: 12px;
		}
		.lang-switch-btn {
			padding: 3px 8px;
			font-size: 11px;
		}
	}
</style>
