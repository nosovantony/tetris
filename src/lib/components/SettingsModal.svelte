<script lang="ts">
	import type { Control } from '../input/controls';
	import {
		DEFAULT_BINDINGS,
		DEFAULT_SETTINGS,
		type ControlBindings,
		type UserSettings
	} from '../settings/types';
	import { assignKey, humanKeyName, saveSettings } from '../settings/store';
	import { soundManager } from '../audio/sound';

	let {
		open = false,
		settings = $bindable<UserSettings>({ ...DEFAULT_SETTINGS }),
		onclose
	}: {
		open: boolean;
		settings: UserSettings;
		onclose: () => void;
	} = $props();

	type Tab = 'controls' | 'audio';
	let activeTab = $state<Tab>('controls');
	let listeningControl = $state<Control | null>(null);
	let previewingBgm = $state(false);

	const CONTROLS_LIST: { id: Control; label: string; desc: string }[] = [
		{ id: 'left', label: 'Сдвиг влево', desc: 'Перемещение фигуры влево' },
		{ id: 'right', label: 'Сдвиг вправо', desc: 'Перемещение фигуры вправо' },
		{ id: 'soft-drop', label: 'Мягкое падение', desc: 'Ускорить спуск фигуры вниз' },
		{ id: 'hard-drop', label: 'Сброс (Hard Drop)', desc: 'Мгновенно уронить и зафиксировать' },
		{ id: 'rotate-cw', label: 'Поворот по часовой', desc: 'Вращение на 90° вправо' },
		{ id: 'rotate-ccw', label: 'Поворот против часовой', desc: 'Вращение на 90° влево' },
		{ id: 'hold', label: 'Удержание (Hold)', desc: 'Отложить фигуру про запас' }
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
					<h2 id="settings-modal-title">Настройки</h2>
				</div>
				<button class="close-btn" onclick={close} aria-label="Закрыть настройки">✕</button>
			</header>

			<nav class="tabs-nav" aria-label="Разделы настроек">
				<button
					class="tab-btn"
					class:active={activeTab === 'controls'}
					onclick={() => (activeTab = 'controls')}
				>
					🎮 Управление
				</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'audio'}
					onclick={() => (activeTab = 'audio')}
				>
					🔊 Звук
				</button>
			</nav>

			<div class="modal-body">
				{#if activeTab === 'controls'}
					<section class="section" aria-labelledby="heading-keyboard">
						<div class="section-header">
							<h3 id="heading-keyboard">Клавиатура</h3>
							<button class="action-link" onclick={resetControls}>По умолчанию</button>
						</div>
						<p class="section-desc">Нажмите на клавишу, чтобы назначить новое действие.</p>

						<div class="bindings-grid">
							{#each CONTROLS_LIST as item}
								<div class="binding-row">
									<div class="binding-info">
										<span class="binding-label">{item.label}</span>
										<span class="binding-desc">{item.desc}</span>
									</div>
									<div class="binding-keys">
										{#if listeningControl === item.id}
											<span class="press-prompt">Нажмите клавишу…</span>
										{:else}
											<div class="key-badges">
												{#if (settings.controls[item.id] || []).length > 0}
													{#each settings.controls[item.id] as code, slotIdx}
														<button
															type="button"
															class="key-btn"
															title="Нажмите для переназначения"
															onclick={() => (listeningControl = item.id)}
														>
															{humanKeyName(code)}
														</button>
													{/each}
												{:else}
													<button
														type="button"
														class="key-btn empty"
														onclick={() => (listeningControl = item.id)}
													>
														+ Назначить
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
						<h3 id="heading-touch">Сенсорное управление</h3>
						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">Раскладка джойстика</span>
								<span class="setting-sub">Положение стика и кнопок действий</span>
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
									Для правшей (стик слева)
								</button>
								<button
									type="button"
									class:selected={settings.touch.layout === 'left'}
									onclick={() => {
										settings.touch.layout = 'left';
										persist();
									}}
								>
									Для левшей (стик справа)
								</button>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">Мёртвая зона стика</span>
								<span class="setting-sub">Чувствительность отклонения джойстика</span>
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
								<span class="setting-title">Тактильный отклик (вибрация)</span>
								<span class="setting-sub"
									>Легкая вибрация при касаниях на мобильных устройствах</span
								>
							</div>
							<label class="toggle-switch">
								<input type="checkbox" bind:checked={settings.touch.haptics} onchange={persist} />
								<span class="slider"></span>
							</label>
						</div>
					</section>

					<section class="section" aria-labelledby="heading-das">
						<h3 id="heading-das">Тайминги повтора (Тренировка)</h3>
						<p class="section-desc">
							В рейтинговом режиме всегда действуют турнирные правила (DAS: 8, ARR: 1).
						</p>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">DAS (Задержка автоповтора)</span>
								<span class="setting-sub">Число кадров до начала повтора сдвига</span>
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
									>{settings.game.dasTicks} кадров ({Math.round(settings.game.dasTicks * 16.6)} мс)</span
								>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">ARR (Период повтора сдвига)</span>
								<span class="setting-sub">0 — мгновенный сдвиг к стенке</span>
							</div>
							<div class="slider-group">
								<input
									type="range"
									min="0"
									max="5"
									step="1"
									bind:value={settings.game.arrTicks}
									oninput={persist}
								/>
								<span class="slider-value"
									>{settings.game.arrTicks === 0
										? '0 (мгновенно)'
										: `${settings.game.arrTicks} кадров`}</span
								>
							</div>
						</div>
					</section>
				{:else if activeTab === 'audio'}
					<section class="section" aria-labelledby="heading-audio">
						<h3 id="heading-audio">Звуковая система</h3>
						<p class="section-desc">
							Процедурный 8-битный синтезатор Web Audio API (без внешних файлов).
						</p>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">Общая громкость</span>
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
								<span class="setting-title">Звуковые эффекты (SFX)</span>
								<span class="setting-sub">Сдвиги, фиксация фигур, очистка линий, победа</span>
							</div>
							<div class="control-row">
								<label class="toggle-switch" title="Включить / отключить эффекты">
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
										disabled={settings.audio.sfxMuted}
										bind:value={settings.audio.sfxVolume}
										oninput={persist}
									/>
									<span class="slider-value"
										>{settings.audio.sfxMuted
											? 'Выкл'
											: `${Math.round(settings.audio.sfxVolume * 100)}%`}</span
									>
								</div>
								<button type="button" class="test-btn" onclick={testSfx} title="Проверить звук">
									Тест
								</button>
							</div>
						</div>

						<div class="setting-item">
							<div class="setting-label-col">
								<span class="setting-title">Музыка (BGM — Коробейники)</span>
								<span class="setting-sub">Классическая chiptune мелодия Тетриса во время игры</span>
							</div>
							<div class="control-row">
								<label class="toggle-switch" title="Включить / отключить музыку">
									<input
										type="checkbox"
										checked={!settings.audio.bgmMuted}
										onchange={(e) => {
											settings.audio.bgmMuted = !e.currentTarget.checked;
											if (settings.audio.bgmMuted && previewingBgm) {
												soundManager.stopBgm();
												previewingBgm = false;
											}
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
										disabled={settings.audio.bgmMuted}
										bind:value={settings.audio.bgmVolume}
										oninput={persist}
									/>
									<span class="slider-value"
										>{settings.audio.bgmMuted
											? 'Выкл'
											: `${Math.round(settings.audio.bgmVolume * 100)}%`}</span
									>
								</div>
								<button
									type="button"
									class="test-btn"
									class:active={previewingBgm}
									onclick={toggleBgmTest}
									title="Послушать музыку"
								>
									{previewingBgm ? 'Стоп' : 'Слушать'}
								</button>
							</div>
						</div>
					</section>
				{/if}
			</div>

			<footer class="modal-footer">
				<button type="button" class="btn-quiet" onclick={resetAll}> Сбросить всё </button>
				<button type="button" class="btn-primary" onclick={close}> Готово </button>
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
		background: #152233;
		border: 1px solid #32445b;
		border-radius: 12px;
		width: 100%;
		max-width: 580px;
		max-height: min(88vh, 720px);
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
		color: #e2ebf5;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 18px 24px 14px;
		border-bottom: 1px solid #253549;
	}

	.modal-title-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.gear-icon {
		color: var(--accent, #73ebc1);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #f1f6fc;
	}

	.close-btn {
		background: none;
		border: none;
		color: #8c9fb6;
		font-size: 18px;
		cursor: pointer;
		padding: 6px 10px;
		border-radius: 6px;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.close-btn:hover {
		background: #203144;
		color: #fff;
	}

	.tabs-nav {
		display: flex;
		border-bottom: 1px solid #253549;
		background: #111c2a;
		padding: 0 16px;
	}

	.tab-btn {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: #8c9fb6;
		font-size: 13px;
		font-weight: 500;
		padding: 12px 18px;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.tab-btn:hover {
		color: #d8e5f4;
	}

	.tab-btn.active {
		color: var(--accent, #73ebc1);
		border-bottom-color: var(--accent, #73ebc1);
	}

	.modal-body {
		padding: 20px 24px;
		overflow-y: auto;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.section h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: #9cb2cb;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.action-link {
		background: none;
		border: none;
		color: var(--accent, #73ebc1);
		font-size: 12px;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		opacity: 0.85;
	}
	.action-link:hover {
		opacity: 1;
	}

	.section-desc {
		margin: 0;
		font-size: 12px;
		color: #8397af;
		line-height: 1.4;
	}

	.bindings-grid {
		display: flex;
		flex-direction: column;
		background: #0f1925;
		border: 1px solid #233448;
		border-radius: 8px;
		overflow: hidden;
	}

	.binding-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px;
		border-bottom: 1px solid #1c2b3d;
		gap: 12px;
	}
	.binding-row:last-child {
		border-bottom: none;
	}

	.binding-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.binding-label {
		font-size: 13px;
		font-weight: 500;
		color: #e6eef8;
	}

	.binding-desc {
		font-size: 11px;
		color: #798ea7;
	}

	.binding-keys {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.key-badges {
		display: flex;
		gap: 6px;
	}

	.key-btn {
		font-family: inherit;
		font-size: 12px;
		font-weight: 500;
		background: #1c2c3e;
		border: 1px solid #3c4f67;
		color: #a4fcde;
		border-radius: 5px;
		padding: 4px 10px;
		min-width: 36px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.1s;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.key-btn:hover {
		background: #25394f;
		border-color: var(--accent, #73ebc1);
	}
	.key-btn:active {
		transform: scale(0.96);
	}

	.key-btn.empty {
		color: #7d93ae;
		border-style: dashed;
	}

	.press-prompt {
		font-size: 12px;
		color: #f7ca54;
		animation: pulse-prompt 1s infinite alternate ease-in-out;
		padding: 4px 8px;
		background: #392f15;
		border: 1px solid #735d25;
		border-radius: 4px;
	}

	@keyframes pulse-prompt {
		from {
			opacity: 0.7;
		}
		to {
			opacity: 1;
		}
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		background: #0f1925;
		border: 1px solid #233448;
		border-radius: 8px;
		padding: 12px 14px;
		gap: 10px;
	}

	@media (min-width: 480px) {
		.setting-item {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}
	}

	.setting-label-col {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.setting-title {
		font-size: 13px;
		font-weight: 500;
		color: #e6eef8;
	}

	.setting-sub {
		font-size: 11px;
		color: #798ea7;
	}

	.segmented-control {
		display: flex;
		background: #182637;
		border: 1px solid #2d3f54;
		border-radius: 6px;
		padding: 3px;
		gap: 4px;
	}

	.segmented-control button {
		background: none;
		border: none;
		color: #8fa4bd;
		font-size: 11px;
		padding: 6px 10px;
		border-radius: 4px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
		white-space: nowrap;
	}

	.segmented-control button.selected {
		background: #2b3e55;
		color: #fff;
		font-weight: 500;
	}

	.slider-group {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.slider-group input[type='range'] {
		accent-color: var(--accent, #73ebc1);
		cursor: pointer;
		width: 120px;
	}

	.slider-value {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: #b5c7dc;
		min-width: 48px;
		text-align: right;
	}

	.control-row {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}

	.test-btn {
		font-family: inherit;
		font-size: 11px;
		background: #1c2b3d;
		border: 1px solid #374b63;
		color: #c9dbed;
		padding: 5px 11px;
		border-radius: 5px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.test-btn:hover {
		background: #273b53;
		border-color: #557193;
	}
	.test-btn.active {
		background: #254b43;
		border-color: var(--accent, #73ebc1);
		color: #a4fcde;
	}

	/* Toggle switch */
	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 42px;
		height: 22px;
		flex-shrink: 0;
	}
	.toggle-switch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		margin: 0;
		cursor: pointer;
		z-index: 2;
	}
	.toggle-switch .slider {
		position: absolute;
		cursor: pointer;
		inset: 0;
		background-color: #2b394b;
		transition: 0.2s;
		border-radius: 22px;
	}
	.toggle-switch .slider:before {
		position: absolute;
		content: '';
		height: 16px;
		width: 16px;
		left: 3px;
		bottom: 3px;
		background-color: #fff;
		transition: 0.2s;
		border-radius: 50%;
	}
	.toggle-switch input:checked + .slider {
		background-color: var(--accent, #73ebc1);
	}
	.toggle-switch input:checked + .slider:before {
		transform: translateX(20px);
		background-color: #0b1520;
	}

	.modal-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 24px 18px;
		border-top: 1px solid #253549;
		background: #111c2a;
		border-radius: 0 0 12px 12px;
	}

	.btn-quiet {
		background: none;
		border: 1px solid #34475d;
		color: #9cb1cb;
		font-size: 12px;
		padding: 8px 14px;
		border-radius: 6px;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.btn-quiet:hover {
		background: #1c2b3d;
		color: #e5effc;
	}

	.btn-primary {
		background: var(--accent, #73ebc1);
		color: #0b1520;
		font-size: 13px;
		font-weight: 600;
		border: none;
		padding: 8px 22px;
		border-radius: 6px;
		cursor: pointer;
		transition:
			filter 0.15s,
			transform 0.1s;
	}
	.btn-primary:hover {
		filter: brightness(1.08);
	}
	.btn-primary:active {
		transform: scale(0.97);
	}
</style>
