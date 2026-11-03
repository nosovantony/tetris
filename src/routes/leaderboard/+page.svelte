<script lang="ts">
	import { onMount } from 'svelte';
	import type { PublicResult } from '#lib/shared/leaderboard.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	let personal = $state<PublicResult | null>(null);
	let personalMessage = $state('');
	onMount(() => {
		void fetch('/api/leaderboard/me')
			.then(async (response) => {
				if (!response.ok) {
					personalMessage = 'Личный рекорд недоступен. Попробуйте позже.';
					return;
				}
				const body = (await response.json()) as { result: PublicResult | null };
				personal = body.result;
				if (!personal) personalMessage = 'В этом браузере ещё нет подтверждённого рекорда.';
			})
			.catch(() => {
				personalMessage = 'Личный рекорд недоступен.';
			});
	});
</script>

<svelte:head><title>Рекорды — Marathon 150</title></svelte:head>

<main id="main">
	<span class="eyebrow">Marathon 150 / общий рейтинг</span>
	<h1>Таблица рекордов</h1>
	<p>
		Место в топе определяет счёт. При равенстве выше результат, достигнутый раньше. Результаты
		рейтинговых партий пересчитываются по replay на сервере. Топ обновляется с задержкой до 30
		секунд.
	</p>
	{#if personal}<p role="status">
			Ваш рекорд: <strong>{personal.score.toLocaleString('ru-RU')}</strong> · {personal.lines} линий ·
			уровень {personal.level}
		</p>
	{:else if personalMessage}<p role="status">{personalMessage}</p>{/if}
	{#if data.unavailable}
		<div class="notice" role="status">
			<strong>Хранилище пока недоступно</strong>
			<p>
				Попробуйте обновить страницу позже. При локальном запуске используйте <code
					>npm run dev</code
				> — он запускает оба Worker.
			</p>
		</div>
	{:else if data.entries.length === 0}
		<div class="notice">
			<strong>Первый рекорд ещё впереди</strong>
			<p>Таблица подключена к SQLite и пока пуста. Тестовые очки сюда не добавляются.</p>
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<caption>100 лучших результатов Marathon 150</caption>
				<thead
					><tr
						><th scope="col">Место</th><th scope="col">Игрок</th><th scope="col">Очки</th><th
							scope="col">Линии</th
						><th scope="col">Уровень</th></tr
					></thead
				>
				<tbody
					>{#each data.entries as entry, index}<tr
							><td>{index + 1}</td><td>{entry.playerName}{entry.isClear ? ' · Clear' : ''}</td><td
								>{entry.score.toLocaleString('ru-RU')}</td
							><td>{entry.lines}</td><td>{entry.level}</td></tr
						>{/each}</tbody
				>
			</table>
		</div>
	{/if}
	<a href="/">← Играть</a>
</main>

<style>
	h1 {
		font-size: clamp(36px, 6vw, 60px);
	}
	.table-wrap {
		overflow-x: auto;
		margin-block: 32px;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		text-align: left;
		white-space: nowrap;
	}
	caption {
		text-align: left;
		color: var(--muted);
		margin-bottom: 16px;
	}
	th,
	td {
		padding: 16px;
		border-bottom: 1px solid var(--border);
	}
	th {
		font-size: 13px;
		color: var(--muted);
	}
</style>
