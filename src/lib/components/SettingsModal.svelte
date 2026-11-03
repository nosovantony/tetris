<script lang="ts">
	import type { Control } from '../input/controls';
	import { DEFAULT_BINDINGS, DEFAULT_SETTINGS, type UserSettings } from '../settings/types';
	import { assignKey, humanKeyName, saveSettings } from '../settings/store';
	import { soundManager } from '../audio/sound';
	import {
		loadCustomAudioTrack,
		saveCustomAudioTrack,
		deleteCustomAudioTrack,
		type CustomTrackMetadata
	} from '../audio/custom-audio';
	import { i18n, type Language } from '../i18n/index.svelte';
	import { onMount } from 'svelte';

	let {
		open = false,
		settings = $bindable<UserSettings>({ ...DEFAULT_SETTINGS }),
		onclose
	}: {
		open: boolean;
		settings: UserSettings;
		onclose: () => void;
	} = $props();

	type Tab = 'controls' | 'audio' | 'language';
	let activeTab = $state<Tab>('controls');
	let listeningControl = $state<Control | null>(null);
	let previewingBgm = $state(false);
	let customTrack = $state<CustomTrackMetadata | null>(null);
	let uploadError = $state<string | null>(null);
	let fileInputRef = $state<HTMLInputElement | null>(null);

	const CONTROLS_LIST: { id: Control }[] = [
		{ id: 'left' },
		{ id: 'right' },
		{ id: 'soft-drop' },
		{ id: 'hard-drop' },
		{ id: 'rotate-cw' },
		{ id: 'rotate-ccw' },
		{ id: 'hold' }
	];

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (listeningControl) {
			event.preventDefault();
			event.stopPropagation();
			if (event.code === 'Escape') {
				listeningControl = null;
				return;
			}
			settings.controls = assignKey(settings.controls, listeningControl, event.code);
			listeningControl = null;
			persist();
			soundManager.playUiClick();
			return;
		}

		if (event.code === 'Escape') {
			close();
		}
	}

	function persist() {
		saveSettings(settings);
		soundManager.updateSettings(settings.audio);
	}

	function close() {
		listeningControl = null;
		if (previewingBgm) {
			soundManager.stopBgm();
			previewingBgm = false;
		}
		persist();
		onclose();
	}

	function selectLanguage(lang: Language) {
		settings.language = lang;
		i18n.setLanguage(lang);
		persist();
		soundManager.playUiClick();
	}

	function resetControls() {
		settings.controls = {
			left: [...DEFAULT_BINDINGS.left],
			right: [...DEFAULT_BINDINGS.right],
			'soft-drop': [...DEFAULT_BINDINGS['soft-drop']],
			'hard-drop': [...DEFAULT_BINDINGS['hard-drop']],
			'rotate-cw': [...DEFAULT_BINDINGS['rotate-cw']],
			'rotate-ccw': [...DEFAULT_BINDINGS['rotate-ccw']],
			hold: [...DEFAULT_BINDINGS.hold]
		};
		settings.game.dasTicks = DEFAULT_SETTINGS.game.dasTicks;
		settings.game.arrTicks = DEFAULT_SETTINGS.game.arrTicks;
		settings.touch.deadzone = DEFAULT_SETTINGS.touch.deadzone;
		settings.touch.layout = DEFAULT_SETTINGS.touch.layout;
		settings.touch.haptics = DEFAULT_SETTINGS.touch.haptics;
		persist();
		soundManager.playUiClick();
	}

	function resetAll() {
		settings = {
			version: 1,
			language: i18n.current,
			controls: {
				left: [...DEFAULT_BINDINGS.left],
				right: [...DEFAULT_BINDINGS.right],
				'soft-drop': [...DEFAULT_BINDINGS['soft-drop']],
				'hard-drop': [...DEFAULT_BINDINGS['hard-drop']],
				'rotate-cw': [...DEFAULT_BINDINGS['rotate-cw']],
				'rotate-ccw': [...DEFAULT_BINDINGS['rotate-ccw']],
				hold: [...DEFAULT_BINDINGS.hold]
			},
			touch: { ...DEFAULT_SETTINGS.touch },
			audio: { ...DEFAULT_SETTINGS.audio },
			game: { ...DEFAULT_SETTINGS.game }
		};
		persist();
		soundManager.playUiClick();
	}

	onMount(() => {
		void (async () => {
			const stored = await loadCustomAudioTrack();
			if (stored) {
				customTrack = stored.meta;
				soundManager.setCustomAudio(stored.buffer, stored.meta.type);
			}
		})();
	});

	async function handleFileUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		uploadError = null;
		try {
			const meta = await saveCustomAudioTrack(file);
			customTrack = meta;
			const buffer = await file.arrayBuffer();
			soundManager.setCustomAudio(buffer, file.type || 'audio/mpeg');
			settings.audio.bgmSource = 'custom';
			persist();
			soundManager.playUiClick();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : i18n.t.settings.customTrackError;
		} finally {
			target.value = '';
		}
	}

	async function removeCustomAudio() {
		try {
			await deleteCustomAudioTrack();
			customTrack = null;
			soundManager.clearCustomAudio();
			settings.audio.bgmSource = 'classic';
			persist();
			soundManager.playUiClick();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Error removing audio';
		}
	}

	function testSfx() {
		void soundManager.resume();
		soundManager.playTetris();
	}

	function toggleBgmTest() {
		void soundManager.resume();
		if (previewingBgm) {
			soundManager.stopBgm();
			previewingBgm = false;
		} else {
			soundManager.startBgm();
			previewingBgm = true;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			class="modal-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="settings-modal-title"
		>
			<header class="modal-header">
				<div class="modal-title-group">
					<svg
						class="gear-icon"
						viewBox="0 0 24 24"
						width="20"
						height="20"
						stroke="currentColor"
						stroke-width="2"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="3" />
						<path
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
						/>
					</svg>
					<h2 id="settings-modal-title">{i18n.t.settings.title}</h2>
				</div>
				<button class="close-btn" onclick={close} aria-label={i18n.t.settings.closeAria}>✕</button>
			</header>

			<nav class="tabs-nav" aria-label="Разделы настроек">
				<button
					class="tab-btn"
					class:active={activeTab === 'controls'}
					onclick={() => (activeTab = 'controls')}
				>
					{i18n.t.settings.tabControls}
				</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'audio'}
					onclick={() => (activeTab = 'audio')}
				>
					{i18n.t.settings.tabAudio}
				</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'language'}
					onclick={() => (activeTab = 'language')}
				>
					{i18n.t.settings.tabLanguage}
				</button>
			</nav>

			<div class="modal-body">
				{#if activeTab === 'controls'}
					<section class="section" aria-labelledby="heading-keyboard">
						<div class="section-header">
							<h3 id="heading-keyboard">{i18n.t.settings.headingKeyboard}</h3>
							<button class="action-link" onclick={resetControls}
								>{i18n.t.settings.defaultsBtn}</button
							>
						</div>
						<p class="section-desc">{i18n.t.settings.keyboardDesc}</p>

						<div class="bindings-grid">
							{#each CONTROLS_LIST as item}
								<div class="binding-row">
									<div class="binding-info">
										<span class="binding-label">{i18n.t.settings.controls[item.id].name}</span>
										<span class="binding-desc">{i18n.t.settings.controls[item.id].desc}</span>
									</div>
									<div class="binding-keys">
										{#if listeningControl === item.id}
											<span class="press-prompt">{i18n.t.settings.pressPrompt}</span>
										{:else}
											<div class="key-badges">
												{#if (settings.controls[item.id] || []).length > 0}
													{#each settings.controls[item.id] as code}
														<button
															type="button"
															class="key-btn"
															title={i18n.t.settings.clickToRemap}
															onclick={() => (listeningControl = item.id)}
														>
															{humanKeyName(code, i18n.current)}
														</button>
													{/each}
												{:else}
													<button
														type="button"
														class="key-btn empty"
														onclick={() => (listeningControl = item.id)}
													>
														{i18n.t.settings.assignBtn}
													</button>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</section>

					<section class="section" aria-labelledby="heading-touch">
						<h3 id="heading-touch">{i18n.t.settings.headingTouch}</h3>
						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.touchLayoutTitle}</span>
								<span class="setting-sub">{i18n.t.settings.touchLayoutDesc}</span>
							</div>
							<div class="segmented-control">
								<button
									type="button"
									class:selected={settings.touch.layout === 'right'}
									onclick={() => {
										settings.touch.layout = 'right';
										persist();
									}}
								>
									{i18n.t.settings.touchLayoutRight}
								</button>
								<button
									type="button"
									class:selected={settings.touch.layout === 'left'}
									onclick={() => {
										settings.touch.layout = 'left';
										persist();
									}}
								>
									{i18n.t.settings.touchLayoutLeft}
								</button>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.touchDeadzoneTitle}</span>
								<span class="setting-sub">{i18n.t.settings.touchDeadzoneDesc}</span>
							</div>
							<div class="slider-group">
								<input
									type="range"
									min="0.15"
									max="0.40"
									step="0.01"
									bind:value={settings.touch.deadzone}
									oninput={persist}
								/>
								<span class="slider-value">{(settings.touch.deadzone * 100).toFixed(0)}%</span>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.touchHapticsTitle}</span>
								<span class="setting-sub">{i18n.t.settings.touchHapticsDesc}</span>
							</div>
							<label class="toggle-switch">
								<input type="checkbox" bind:checked={settings.touch.haptics} onchange={persist} />
								<span class="slider"></span>
							</label>
						</div>
					</section>

					<section class="section" aria-labelledby="heading-das">
						<h3 id="heading-das">{i18n.t.settings.headingTraining}</h3>
						<p class="section-desc">
							{i18n.t.settings.trainingNote}
						</p>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.dasTitle}</span>
								<span class="setting-sub">{i18n.t.settings.dasDesc}</span>
							</div>
							<div class="slider-group">
								<input
									type="range"
									min="4"
									max="16"
									step="1"
									bind:value={settings.game.dasTicks}
									oninput={persist}
								/>
								<span class="slider-value"
									>{settings.game.dasTicks}
									{i18n.current === 'ru' ? 'кадров' : 'frames'} ({Math.round(
										settings.game.dasTicks * 16.6
									)}
									{i18n.current === 'ru' ? 'мс' : 'ms'})</span
								>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.arrTitle}</span>
								<span class="setting-sub">{i18n.t.settings.arrDesc}</span>
							</div>
							<div class="slider-group">
								<input
									type="range"
									min="0"
									max="6"
									step="1"
									bind:value={settings.game.arrTicks}
									oninput={persist}
								/>
								<span class="slider-value"
									>{settings.game.arrTicks === 0
										? i18n.current === 'ru'
											? '0 (мгновенно)'
											: '0 (instant)'
										: `${settings.game.arrTicks} ${i18n.current === 'ru' ? 'кадр.' : 'frames'}`}</span
								>
							</div>
						</div>
					</section>
				{:else if activeTab === 'audio'}
					<section class="section" aria-labelledby="heading-audio">
						<h3 id="heading-audio">{i18n.t.settings.headingAudio}</h3>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.masterTitle}</span>
							</div>
							<div class="slider-group">
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									bind:value={settings.audio.masterVolume}
									oninput={persist}
								/>
								<span class="slider-value">{Math.round(settings.audio.masterVolume * 100)}%</span>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.sfxTitle}</span>
								<span class="setting-sub">{i18n.t.settings.sfxDesc}</span>
							</div>
							<div class="audio-control-row">
								<label class="toggle-switch" title={i18n.t.settings.sfxToggleTitle}>
									<input
										type="checkbox"
										checked={!settings.audio.sfxMuted}
										onchange={(e) => {
											settings.audio.sfxMuted = !e.currentTarget.checked;
											persist();
										}}
									/>
									<span class="slider"></span>
								</label>
								<div class="slider-group">
									<input
										type="range"
										min="0"
										max="1"
										step="0.05"
										bind:value={settings.audio.sfxVolume}
										disabled={settings.audio.sfxMuted}
										oninput={persist}
									/>
									<span class="slider-value"
										>{settings.audio.sfxMuted
											? i18n.t.settings.muteLabel
											: `${Math.round(settings.audio.sfxVolume * 100)}%`}</span
									>
								</div>
								<button
									type="button"
									class="test-btn"
									onclick={testSfx}
									title={i18n.t.settings.sfxTestTitle}
								>
									{i18n.t.settings.sfxTestBtn}
								</button>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.bgmTitle}</span>
								<span class="setting-sub">{i18n.t.settings.bgmDesc}</span>
							</div>
							<div class="audio-control-row">
								<label class="toggle-switch" title={i18n.t.settings.bgmToggleTitle}>
									<input
										type="checkbox"
										checked={!settings.audio.bgmMuted}
										onchange={(e) => {
											settings.audio.bgmMuted = !e.currentTarget.checked;
											persist();
										}}
									/>
									<span class="slider"></span>
								</label>
								<div class="slider-group">
									<input
										type="range"
										min="0"
										max="1"
										step="0.05"
										bind:value={settings.audio.bgmVolume}
										disabled={settings.audio.bgmMuted}
										oninput={persist}
									/>
									<span class="slider-value"
										>{settings.audio.bgmMuted
											? i18n.t.settings.muteLabel
											: `${Math.round(settings.audio.bgmVolume * 100)}%`}</span
									>
								</div>
								<button
									type="button"
									class="test-btn"
									class:active={previewingBgm}
									onclick={toggleBgmTest}
									title={i18n.t.settings.bgmListenTitle}
								>
									{previewingBgm ? i18n.t.settings.bgmStopBtn : i18n.t.settings.bgmListenBtn}
								</button>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">{i18n.t.settings.bgmSourceTitle}</span>
								<span class="setting-sub">{i18n.t.settings.bgmSourceDesc}</span>
							</div>
							<div class="segmented-control">
								<button
									type="button"
									class:selected={settings.audio.bgmSource === 'classic'}
									onclick={() => {
										settings.audio.bgmSource = 'classic';
										persist();
									}}
								>
									{i18n.t.settings.bgmSourceClassic}
								</button>
								<button
									type="button"
									class:selected={settings.audio.bgmSource === 'custom'}
									onclick={() => {
										settings.audio.bgmSource = 'custom';
										persist();
									}}
								>
									{i18n.t.settings.bgmSourceCustom}
								</button>
							</div>
						</div>

						{#if settings.audio.bgmSource === 'custom'}
							<div class="custom-track-card">
								<input
									type="file"
									accept="audio/*,.mp3,.wav,.ogg,.m4a"
									class="sr-only"
									bind:this={fileInputRef}
									onchange={handleFileUpload}
								/>
								{#if customTrack}
									<div class="custom-track-header">
										<span class="track-icon" aria-hidden="true">🎵</span>
										<div class="track-details">
											<span class="track-name">{customTrack.name}</span>
											<span class="track-size"
												>{(customTrack.size / (1024 * 1024)).toFixed(2)} MB • {i18n.t.settings
													.customTrackUploaded}</span
											>
										</div>
									</div>
									<div class="track-actions">
										<button
											type="button"
											class="track-action-btn"
											onclick={() => fileInputRef?.click()}
										>
											{i18n.t.settings.customTrackUploadBtn}
										</button>
										<button
											type="button"
											class="track-action-btn danger"
											onclick={removeCustomAudio}
										>
											{i18n.t.settings.customTrackRemoveBtn}
										</button>
									</div>
								{:else}
									<p class="custom-track-empty">{i18n.t.settings.customTrackNone}</p>
									<button
										type="button"
										class="track-upload-primary-btn"
										onclick={() => fileInputRef?.click()}
									>
										📁 {i18n.t.settings.customTrackUploadBtn}
									</button>
								{/if}
								{#if uploadError}
									<p class="upload-error-text" role="alert">{uploadError}</p>
								{/if}
							</div>
						{/if}
					</section>
				{:else if activeTab === 'language'}
					<section class="section" aria-labelledby="heading-language">
						<h3 id="heading-language">{i18n.t.settings.headingLanguage}</h3>
						<p class="section-desc">{i18n.t.settings.languageDesc}</p>

						<div class="lang-selector-group">
							<button
								type="button"
								class="lang-option-card"
								class:selected={settings.language === 'ru'}
								onclick={() => selectLanguage('ru')}
							>
								<span class="lang-flag" aria-hidden="true">🇷🇺</span>
								<div class="lang-card-text">
									<strong>Русский</strong>
									<span>Russian</span>
								</div>
								{#if settings.language === 'ru'}
									<span class="check-mark" aria-hidden="true">✓</span>
								{/if}
							</button>

							<button
								type="button"
								class="lang-option-card"
								class:selected={settings.language === 'en'}
								onclick={() => selectLanguage('en')}
							>
								<span class="lang-flag" aria-hidden="true">🇬🇧</span>
								<div class="lang-card-text">
									<strong>English</strong>
									<span>Английский</span>
								</div>
								{#if settings.language === 'en'}
									<span class="check-mark" aria-hidden="true">✓</span>
								{/if}
							</button>
						</div>
					</section>
				{/if}
			</div>

			<footer class="modal-footer">
				<button type="button" class="btn-quiet" onclick={resetAll}>
					{i18n.t.settings.resetAllBtn}
				</button>
				<button type="button" class="btn-primary" onclick={close}>
					{i18n.t.settings.doneBtn}
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(8, 14, 23, 0.78);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
	}
	.modal-dialog {
		background: #0f172a;
		border: 1px solid var(--border);
		border-radius: 12px;
		width: min(640px, 100%);
		max-height: min(85dvh, 760px);
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55);
		color: var(--fg);
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 24px;
		border-bottom: 1px solid var(--border);
	}
	.modal-title-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.gear-icon {
		color: var(--accent);
	}
	.modal-header h2 {
		font-size: 18px;
		font-weight: 700;
		margin: 0;
		letter-spacing: 0.04em;
	}
	.close-btn {
		background: transparent;
		border: none;
		color: var(--muted);
		font-size: 18px;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		line-height: 1;
	}
	.close-btn:hover {
		color: var(--fg);
		background: rgba(255, 255, 255, 0.08);
	}
	.tabs-nav {
		display: flex;
		border-bottom: 1px solid var(--border);
		background: rgba(15, 23, 42, 0.6);
		padding: 0 16px;
		gap: 4px;
	}
	.tab-btn {
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--muted);
		padding: 12px 16px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition: all 0.15s ease;
	}
	.tab-btn:hover {
		color: var(--fg);
	}
	.tab-btn.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
	.modal-body {
		padding: 20px 24px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section h3 {
		font-size: 15px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
		margin: 0;
	}
	.section-desc {
		font-size: 13px;
		color: var(--muted);
		margin: 0;
		line-height: 1.4;
	}
	.action-link {
		background: transparent;
		border: none;
		color: var(--accent);
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
	}
	.action-link:hover {
		opacity: 0.8;
	}
	.bindings-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.binding-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 8px 12px;
		background: rgba(30, 41, 59, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 6px;
	}
	.binding-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.binding-label {
		font-size: 13px;
		font-weight: 600;
	}
	.binding-desc {
		font-size: 11px;
		color: var(--muted);
	}
	.binding-keys {
		display: flex;
		align-items: center;
	}
	.key-badges {
		display: flex;
		gap: 6px;
	}
	.key-btn {
		background: #1e293b;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		padding: 4px 10px;
		font-size: 12px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		min-width: 36px;
		text-align: center;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.3);
		transition: all 0.15s ease;
	}
	.key-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.key-btn.empty {
		border-style: dashed;
		color: var(--muted);
	}
	.press-prompt {
		font-size: 12px;
		color: var(--accent);
		font-weight: 600;
		animation: pulse 1s infinite alternate;
	}
	@keyframes pulse {
		from {
			opacity: 0.6;
		}
		to {
			opacity: 1;
		}
	}
	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 12px;
		background: rgba(30, 41, 59, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 6px;
	}
	.setting-label-col {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.setting-title {
		font-size: 13px;
		font-weight: 600;
	}
	.setting-sub {
		font-size: 11px;
		color: var(--muted);
	}
	.slider-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.slider-group input[type='range'] {
		accent-color: var(--accent);
		width: 120px;
		cursor: pointer;
	}
	.slider-value {
		font-size: 12px;
		color: var(--muted);
		min-width: 48px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.segmented-control {
		display: inline-flex;
		background: #0b1120;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 2px;
		gap: 2px;
	}
	.segmented-control button {
		background: transparent;
		border: none;
		color: var(--muted);
		padding: 6px 12px;
		font-size: 12px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.segmented-control button.selected {
		background: #1e293b;
		color: var(--accent);
		font-weight: 600;
	}
	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 40px;
		height: 22px;
		flex-shrink: 0;
	}
	.toggle-switch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		z-index: 2;
		margin: 0;
	}
	.toggle-switch .slider {
		position: absolute;
		inset: 0;
		background-color: #334155;
		border-radius: 22px;
		transition: 0.2s ease;
		pointer-events: none;
	}
	.toggle-switch .slider:before {
		position: absolute;
		content: '';
		height: 16px;
		width: 16px;
		left: 3px;
		bottom: 3px;
		background-color: white;
		border-radius: 50%;
		transition: 0.2s ease;
	}
	.toggle-switch input:checked + .slider {
		background-color: var(--accent);
	}
	.toggle-switch input:checked + .slider:before {
		transform: translateX(18px);
	}
	.audio-control-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.test-btn {
		background: #1e293b;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.test-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.test-btn.active {
		background: var(--accent);
		color: #0b1120;
		border-color: var(--accent);
	}
	.lang-selector-group {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
		margin-top: 6px;
	}
	.lang-option-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		background: rgba(30, 41, 59, 0.45);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}
	.lang-option-card:hover {
		border-color: var(--accent);
		background: rgba(30, 41, 59, 0.7);
	}
	.lang-option-card.selected {
		border-color: var(--accent);
		background: rgba(14, 165, 233, 0.12);
		box-shadow: 0 0 0 1px var(--accent);
	}
	.lang-flag {
		font-size: 26px;
		line-height: 1;
	}
	.lang-card-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
	}
	.lang-card-text strong {
		font-size: 14px;
		font-weight: 600;
	}
	.lang-card-text span {
		font-size: 12px;
		color: var(--muted);
	}
	.check-mark {
		color: var(--accent);
		font-weight: 800;
		font-size: 18px;
	}
	.custom-track-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		background: rgba(30, 41, 59, 0.45);
		border: 1px solid var(--border);
		border-radius: 8px;
		margin-top: 4px;
	}
	.custom-track-header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.track-icon {
		font-size: 24px;
		line-height: 1;
	}
	.track-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.track-name {
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.track-size {
		font-size: 11px;
		color: var(--muted);
	}
	.track-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
	.track-action-btn {
		background: #1e293b;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.track-action-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.track-action-btn.danger {
		color: #f87171;
		border-color: rgba(239, 68, 68, 0.3);
	}
	.track-action-btn.danger:hover {
		background: rgba(239, 68, 68, 0.15);
		border-color: #ef4444;
	}
	.custom-track-empty {
		font-size: 13px;
		color: var(--muted);
		margin: 0;
		line-height: 1.4;
	}
	.track-upload-primary-btn {
		background: #1e293b;
		border: 1px dashed var(--accent);
		border-radius: 6px;
		color: var(--accent);
		padding: 10px 16px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.track-upload-primary-btn:hover {
		background: rgba(14, 165, 233, 0.12);
		border-style: solid;
	}
	.upload-error-text {
		font-size: 12px;
		color: #f87171;
		margin: 0;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid var(--border);
	}
	.btn-quiet {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--muted);
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.btn-quiet:hover {
		color: var(--fg);
		border-color: var(--fg);
	}
	.btn-primary {
		background: var(--accent);
		border: none;
		color: #0b1120;
		padding: 8px 20px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.btn-primary:hover {
		opacity: 0.9;
	}
	@media (max-width: 600px) {
		.modal-dialog {
			max-height: 92dvh;
		}
		.modal-body {
			padding: 16px;
			gap: 20px;
		}
		.binding-row,
		.setting-item {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}
		.audio-control-row {
			width: 100%;
			justify-content: space-between;
		}
	}
</style>
