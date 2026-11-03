<script lang="ts">
	import { onMount } from 'svelte';
	import type { PublicResult } from '#lib/shared/leaderboard.js';
	import type { PageProps } from './$types';
	import { i18n } from '#lib/i18n/index.js';

	let { data }: PageProps = $props();
	let personal = $state<PublicResult | null>(null);
	let personalMessage = $state('');
	onMount(() => {
		void fetch('/api/leaderboard/me')
			.then(async (response) => {
				if (!response.ok) {
					personalMessage = i18n.t.leaderboard.recordUnavailable;
					return;
				}
				const body = (await response.json()) as { result: PublicResult | null };
				personal = body.result;
				if (!personal) personalMessage = i18n.t.leaderboard.noRecord;
			})
			.catch(() => {
				personalMessage = i18n.t.leaderboard.recordUnavailable;
			});
	});
</script>

<svelte:head
	><title>{i18n.current === 'ru' ? 'Рекорды — Marathon 150' : 'Leaderboard — Marathon 150'}</title
	></svelte:head
>

<main id="main">
	<span class="eyebrow">{i18n.t.leaderboard.eyebrow}</span>
	<h1>{i18n.t.leaderboard.title}</h1>
	<p>{i18n.t.leaderboard.desc}</p>
	{#if personal}<p role="status">
			{i18n.t.leaderboard.yourRecord}
			<strong>{personal.score.toLocaleString(i18n.current === 'ru' ? 'ru-RU' : 'en-US')}</strong>
			· {personal.lines}
			{i18n.t.leaderboard.linesSuffix} ·
			{i18n.t.leaderboard.levelPrefix}
			{personal.level}
		</p>
	{:else if personalMessage}<p role="status">{personalMessage}</p>{/if}
	{#if data.unavailable}
		<div class="notice" role="status">
			<strong>{i18n.t.leaderboard.storageUnavailableTitle}</strong>
			<p>{i18n.t.leaderboard.storageUnavailableDesc}</p>
		</div>
	{:else if data.entries.length === 0}
		<div class="notice">
			<strong>{i18n.t.leaderboard.emptyTitle}</strong>
			<p>{i18n.t.leaderboard.emptyDesc}</p>
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<caption>{i18n.t.leaderboard.tableCaption}</caption>
				<thead>
					<tr>
						<th scope="col">{i18n.t.leaderboard.colRank}</th>
						<th scope="col">{i18n.t.leaderboard.colPlayer}</th>
						<th scope="col">{i18n.t.leaderboard.colScore}</th>
						<th scope="col">{i18n.t.leaderboard.colLines}</th>
						<th scope="col">{i18n.t.leaderboard.colLevel}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.entries as entry, index}
						<tr>
							<td>{index + 1}</td>
							<td>{entry.playerName}{entry.isClear ? ' · Clear' : ''}</td>
							<td>{entry.score.toLocaleString(i18n.current === 'ru' ? 'ru-RU' : 'en-US')}</td>
							<td>{entry.lines}</td>
							<td>{entry.level}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	<a href="/">{i18n.t.leaderboard.backLink}</a>
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
