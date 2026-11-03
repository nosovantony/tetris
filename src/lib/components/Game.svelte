<script lang="ts">
	import { onMount } from 'svelte';
	import Board from './Board.svelte';
	import PiecePreview from './PiecePreview.svelte';
	import Joystick from './Joystick.svelte';
	import ControlButton from './ControlButton.svelte';
	import { GameSession, type SessionPhase } from '../game/session';
	import type { GameState } from '../game/types';
	import { InputMux, type Control } from '../input/controls';
	import { createKeyboard, isEditable } from '../input/keyboard';
	import type { StickDirection } from '../input/touch';
	import { makeCheckpoint } from '../game/checkpoint';
	import { openGameStore, type GameStore } from '../storage/game-store';
	import { encodeReplay } from '../game/codec';
	import { parseTicket, toBase64 } from '../shared/runs';
	import SettingsModal from './SettingsModal.svelte';
	import { soundManager } from '../audio/sound';
	import { bindingsToKeyMap, humanKeyName, loadSettings } from '../settings/store';
	import { DEFAULT_SETTINGS, type UserSettings } from '../settings/types';

	// User customizable controls & sound settings
	let userSettings = $state<UserSettings>({ ...DEFAULT_SETTINGS });
	let settingsOpen = $state(false);
	let keyMap = $derived(bindingsToKeyMap(userSettings.controls));

	// Deterministic SSR preview; actual seeds are generated only on Start in the browser.
	const session = new GameSession({ seed: 0, mode: 'training' });
	let game = $state.raw<GameState>({ ...session.game });
	let phase = $state<SessionPhase>('ready');
	let countdown = $state(0);
	let startLevel = $state(1);
	let arena: HTMLDivElement;
	let mounted = $state(false);
	let replayAvailable = $state(true);
	let storageMessage = $state('Проверяем сохранение…');
	let restored = $state(false);
	let store: GameStore | null = null;
	let lastSavedTick = -1;
	let lastAttemptTick = -1;
	let saving = false;
	let selectedMode = $state<'training' | 'ranked'>('training');
	let starting = $state(false);
	let playerName = $state('Игрок');
	let submission = $state<'idle' | 'sending' | 'sent'>('idle');
	let apiMessage = $state('');
	let alive = false;
	function persist(force = false) {
		if (!store || session.phase === 'ready') return;
		if (!force && (saving || session.game.tick - Math.max(lastSavedTick, lastAttemptTick) < 60))
			return;
		const tick = session.game.tick;
		lastAttemptTick = tick;
		const storage = store;
		saving = true;
		const task =
			session.phase === 'finished' && (!session.ticket || submission === 'sent')
				? storage.clear()
				: storage.save(
						makeCheckpoint(
							session.game,
							session.events,
							session.replayAvailable,
							Date.now(),
							session.ticket ?? undefined
						)
					);
		void task
			.then(() => {
				lastSavedTick = tick;
				storageMessage =
					session.phase === 'finished' && (!session.ticket || submission === 'sent')
						? 'Завершённая партия удалена из автосохранения.'
						: 'Партия сохранена в этом браузере.';
			})
			.catch(() => {
				storageMessage =
					'Не удалось сохранить партию. Не закрывайте страницу, если хотите продолжить.';
			})
			.finally(() => {
				saving = false;
			});
	}
	const input = new InputMux((action) => session.enqueue(action));
	const keyboard = createKeyboard({
		enabled: () =>
			!settingsOpen &&
			(session.phase === 'running' || session.phase === 'paused' || session.phase === 'countdown'),
		getKey: (code) => keyMap[code],
		press: (source, control) => {
			if (session.phase === 'running') {
				input.press(source, control);
				void soundManager.resume();
				if (control === 'left' || control === 'right') soundManager.playMove();
				else if (control === 'rotate-cw' || control === 'rotate-ccw') soundManager.playRotate();
				else if (control === 'soft-drop') soundManager.playSoftDrop();
				else if (control === 'hard-drop') soundManager.playHardDrop();
				else if (control === 'hold') soundManager.playHold();
			}
		},
		release: (source) => input.release(source),
		pause: () => {
			if (session.phase === 'paused') resume();
			else pause();
		}
	});

	function sync() {
		game = { ...session.game };
		phase = session.phase;
		countdown = session.countdown;
		replayAvailable = session.replayAvailable;
	}
	async function submit() {
		if (
			!session.ticket ||
			session.phase !== 'finished' ||
			!session.replayAvailable ||
			submission !== 'idle'
		)
			return;
		submission = 'sending';
		apiMessage = 'Сервер проверяет replay…';
		try {
			const response = await fetch('/api/runs/finish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token: session.ticket.token,
					playerName,
					replay: toBase64(encodeReplay(session.events, session.game.tick))
				})
			});
			const result = (await response.json()) as {
				error?: string;
				accepted?: boolean;
				duplicate?: boolean;
				improved?: boolean;
			};
			if (!response.ok) throw new Error(result.error ?? 'Не удалось отправить результат');
			if (!result.accepted) throw new Error('Сервер не подтвердил результат');
			submission = 'sent';
			apiMessage = result.duplicate
				? 'Результат уже принят.'
				: result.improved
					? 'Рекорд подтверждён сервером!'
					: 'Результат принят. Личный рекорд остался прежним.';
			persist(true);
		} catch (error) {
			submission = 'idle';
			apiMessage =
				error instanceof Error ? error.message : 'Ошибка сети; можно повторить отправку.';
		}
	}
	function clearInputs() {
		keyboard.reset();
		input.clear();
	}
	function pause() {
		const active = session.phase === 'running' || session.phase === 'countdown';
		session.pause();
		soundManager.pauseBgm();
		clearInputs();
		sync();
		if (active) persist(true);
	}
	function resume() {
		void soundManager.resume();
		clearInputs();
		session.resume(performance.now());
		sync();
		arena?.focus({ preventScroll: true });
	}
	function openSettings() {
		if (session.phase === 'running') pause();
		settingsOpen = true;
	}
	async function start() {
		if (starting || submission === 'sending') return;
		starting = true;
		apiMessage = '';
		clearInputs();
		try {
			void soundManager.resume();
			if (selectedMode === 'ranked') {
				const response = await fetch('/api/runs', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}'
				});
				const result = (await response.json()) as { error?: string };
				if (!response.ok) throw new Error(result.error ?? 'Не удалось начать рейтинговую партию');
				const ticket = parseTicket(result);
				if (!alive) return;
				session.start(ticket.claims.config, ticket);
			} else {
				const seed = crypto.getRandomValues(new Uint32Array(1))[0];
				session.start({
					seed,
					mode: 'training',
					startLevel: Number(startLevel),
					dasTicks: userSettings.game.dasTicks,
					arrTicks: userSettings.game.arrTicks
				});
			}
			submission = 'idle';
			restored = false;
			lastSavedTick = -1;
			lastAttemptTick = -1;
			sync();
			persist(true);
			arena?.focus({ preventScroll: true });
			if (document.hidden || !document.hasFocus()) pause();
		} catch (error) {
			apiMessage = error instanceof Error ? error.message : 'Не удалось начать игру';
		} finally {
			starting = false;
		}
	}
	function stick(direction: StickDirection) {
		if (direction && session.phase === 'running') {
			input.press('stick', direction);
			void soundManager.resume();
			if (
				userSettings.touch.haptics &&
				typeof navigator !== 'undefined' &&
				'vibrate' in navigator
			) {
				try {
					navigator.vibrate(10);
				} catch {
					// vibration unavailable
				}
			}
			if (direction === 'left' || direction === 'right') soundManager.playMove();
			else if (direction === 'soft-drop') soundManager.playSoftDrop();
		} else {
			input.release('stick');
		}
	}
	function action(control: Control) {
		if (session.phase === 'running') {
			input.press('pad', control);
			void soundManager.resume();
			if (
				userSettings.touch.haptics &&
				typeof navigator !== 'undefined' &&
				'vibrate' in navigator
			) {
				try {
					navigator.vibrate(12);
				} catch {
					// vibration unavailable
				}
			}
			if (control === 'rotate-cw' || control === 'rotate-ccw') soundManager.playRotate();
			else if (control === 'hard-drop') soundManager.playHardDrop();
			else if (control === 'hold') soundManager.playHold();
		}
	}
	let time = $derived(
		`${Math.floor(game.tick / 3600)
			.toString()
			.padStart(2, '0')}:${Math.floor((game.tick / 60) % 60)
			.toString()
			.padStart(2, '0')}`
	);
	let target = $derived((151 - game.config.startLevel) * 10);
	let concealed = $derived(phase === 'paused' || phase === 'countdown' || phase === 'ready');
	let outcome = $derived(
		game.status === 'won'
			? 'Марафон пройден!'
			: game.status === 'timeout'
				? 'Время вышло'
				: 'Партия окончена'
	);

	$effect(() => {
		soundManager.updateSettings(userSettings.audio);
	});

	onMount(() => {
		alive = true;
		let disposed = false;
		userSettings = loadSettings();
		soundManager.updateSettings(userSettings.audio);
		let prevLocked = session.game.piecesLocked;
		let prevLevel = session.game.level;
		let prevStatus = session.game.status;
		let prevCountdown = session.countdown;
		let prevPhase = session.phase;

		void (async () => {
			try {
				const opened = await openGameStore();
				if (disposed) {
					await opened.close();
					return;
				}
				store = opened;
				const checkpoint = await opened.load();
				if (disposed) return;
				if (checkpoint !== undefined) {
					try {
						session.restore(checkpoint);
						selectedMode = session.game.config.mode;
						if (session.ticket && Date.now() >= session.ticket.claims.expiresAt)
							apiMessage =
								'Срок рейтинговой сессии истёк. Можно доиграть локально, но отправка уже недоступна.';
						startLevel = session.game.config.startLevel;
						restored = true;
						lastSavedTick = session.game.tick;
						prevLocked = session.game.piecesLocked;
						prevLevel = session.game.level;
						prevStatus = session.game.status;
						prevCountdown = session.countdown;
						prevPhase = session.phase;
						storageMessage =
							session.phase === 'finished'
								? 'Завершённая рейтинговая партия восстановлена. Можно отправить результат.'
								: 'Незавершённая партия восстановлена. Нажмите «Продолжить».';
						sync();
					} catch {
						await opened.clear();
						storageMessage = 'Сохранение устарело или повреждено. Можно начать новую партию.';
					}
				} else storageMessage = 'Автосохранение включено для этого браузера.';
			} catch (error) {
				storageMessage =
					error instanceof Error
						? error.message
						: 'Автосохранение недоступно. Можно играть без сохранения.';
			} finally {
				if (!disposed) mounted = true;
			}
		})();
		let raf = 0;
		function frame(now: number) {
			const before = `${session.game.tick}:${session.phase}:${session.countdown}`;
			session.frame(now);

			if (session.game.piecesLocked > prevLocked) {
				const clear = session.game.lastClear;
				if (clear && clear.lines > 0) {
					if (clear.lines === 4) soundManager.playTetris();
					else soundManager.playClear(clear.lines);
				} else {
					soundManager.playLock();
				}
				prevLocked = session.game.piecesLocked;
			}
			if (session.game.level > prevLevel) {
				soundManager.playLevelUp();
				prevLevel = session.game.level;
			}
			if (session.countdown !== prevCountdown && session.phase === 'countdown') {
				soundManager.playCountdown(session.countdown);
				prevCountdown = session.countdown;
			}
			if (session.game.status !== prevStatus) {
				if (session.game.status === 'won') {
					soundManager.playVictory();
					soundManager.stopBgm();
				} else if (session.game.status === 'lost' || session.game.status === 'timeout') {
					soundManager.playGameOver();
					soundManager.stopBgm();
				}
				prevStatus = session.game.status;
			}
			if (session.phase !== prevPhase) {
				if (session.phase === 'running') {
					soundManager.startBgm();
				} else if (session.phase === 'paused') {
					soundManager.pauseBgm();
				} else if (session.phase === 'finished' || session.phase === 'ready') {
					soundManager.stopBgm();
				}
				prevPhase = session.phase;
			}

			if (
				phase !== session.phase ||
				before !== `${session.game.tick}:${session.phase}:${session.countdown}`
			) {
				if (session.phase !== 'running') clearInputs();
				sync();
				persist(session.phase === 'finished' || session.phase === 'paused');
			}
			raf = requestAnimationFrame(frame);
		}
		function keydown(event: KeyboardEvent) {
			if (settingsOpen) return;
			if (isEditable(event.target)) {
				if (session.phase === 'running') pause();
				return;
			}
			// Let native buttons/links keep their Space/Enter semantics.
			if (
				event.code !== 'Escape' &&
				event.target instanceof Element &&
				event.target.closest('button, a')
			)
				return;
			keyboard.keydown(event);
		}
		function keyup(event: KeyboardEvent) {
			if (settingsOpen) return;
			keyboard.keyup(event);
		}
		function visibility() {
			if (document.hidden) pause();
		}
		function focusin(event: FocusEvent) {
			if (isEditable(event.target)) pause();
		}
		window.addEventListener('keydown', keydown);
		window.addEventListener('keyup', keyup);
		window.addEventListener('blur', pause);
		window.addEventListener('pagehide', pause);
		document.addEventListener('visibilitychange', visibility);
		document.addEventListener('focusin', focusin);
		raf = requestAnimationFrame(frame);
		return () => {
			alive = false;
			disposed = true;
			pause();
			soundManager.stopBgm();
			cancelAnimationFrame(raf);
			window.removeEventListener('keydown', keydown);
			window.removeEventListener('keyup', keyup);
			window.removeEventListener('blur', pause);
			window.removeEventListener('pagehide', pause);
			document.removeEventListener('visibilitychange', visibility);
			document.removeEventListener('focusin', focusin);
			clearInputs();
			if (store) {
				void store.close();
				store = null;
			}
		};
	});
</script>

<div class="game-topbar">
	<div>
		<span class="eyebrow">Тренировка / Рейтинг</span>
		<h1>Marathon <span>150</span></h1>
	</div>
	<div class="topbar-actions">
		<button
			type="button"
			class="settings-topbar-btn"
			onclick={openSettings}
			title="Настройки звука и управления"
			aria-label="Настройки"
		>
			<svg
				viewBox="0 0 24 24"
				width="16"
				height="16"
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
			<span>Настройки</span>
		</button>
		<div class="mode-badge">
			<i></i>
			{game.config.mode === 'ranked' ? 'Рейтинг · серверная проверка' : 'Тренировка · без рейтинга'}
		</div>
	</div>
</div>

<div class="game-layout">
	<aside class="brief">
		<div class="chapter">01 — 150 / УРОВНИ</div>
		<h2>Линия за линией.</h2>
		<p>Найди ритм. Сохрани место для следующей фигуры. Дойди до 1 500 линий.</p>
		<dl class="instructions">
			<div>
				<dt>
					{(userSettings.controls.left[0] && humanKeyName(userSettings.controls.left[0])) || '←'}
					{(userSettings.controls.right[0] && humanKeyName(userSettings.controls.right[0])) || '→'}
				</dt>
				<dd>Сдвиг</dd>
			</div>
			<div>
				<dt>
					{(userSettings.controls['rotate-cw'][0] &&
						humanKeyName(userSettings.controls['rotate-cw'][0])) ||
						'↑'} · {(userSettings.controls['rotate-ccw'][0] &&
						humanKeyName(userSettings.controls['rotate-ccw'][0])) ||
						'Z'}
				</dt>
				<dd>Поворот ↻ / ↺</dd>
			</div>
			<div>
				<dt>
					{(userSettings.controls['soft-drop'][0] &&
						humanKeyName(userSettings.controls['soft-drop'][0])) ||
						'↓'}
				</dt>
				<dd>Мягкое падение</dd>
			</div>
			<div>
				<dt>
					{(userSettings.controls['hard-drop'][0] &&
						humanKeyName(userSettings.controls['hard-drop'][0])) ||
						'Space'}
				</dt>
				<dd>Сбросить фигуру</dd>
			</div>
			<div>
				<dt>
					{(userSettings.controls.hold[0] && humanKeyName(userSettings.controls.hold[0])) || 'C'}
				</dt>
				<dd>Hold</dd>
			</div>
			<div>
				<dt>Esc</dt>
				<dd>Пауза / продолжить</dd>
			</div>
		</dl>
		<p class="local-note">
			Тренировка — с любого уровня. Рейтинг — с уровня 1 и проверкой replay на сервере. Рейтинговую
			партию нужно завершить и отправить в течение 24 часов, активное время — до 3 часов. Паузы
			разрешены. Автосохранение остаётся в этом браузере до 7 дней; при аварийном закрытии возможна
			потеря последних действий.
		</p>
	</aside>

	<section class="play-area" aria-label="Marathon 150">
		<div class="hud" aria-label="Показатели партии">
			<div>
				<span>Очки</span><strong data-testid="score">{game.score.toLocaleString('ru-RU')}</strong>
			</div>
			<div>
				<span>Уровень</span><strong data-testid="level"
					>{game.level.toString().padStart(2, '0')}</strong
				>
			</div>
			<div>
				<span>Линии</span><strong data-testid="lines">{game.lines}<small> / {target}</small></strong
				>
			</div>
			<div><span>Время</span><strong data-testid="time">{time}</strong></div>
		</div>
		<div class="field-layout">
			<div class="piece-rail hold">
				<span class="rail-title"
					>HOLD <kbd
						>{(userSettings.controls.hold[0] && humanKeyName(userSettings.controls.hold[0])) ||
							'C'}</kbd
					></span
				>
				<PiecePreview type={concealed ? null : game.hold} muted={game.holdUsed} />
				<span class="rail-note">{game.holdUsed ? 'После фиксации' : 'Про запас'}</span>
			</div>
			<div
				class="arena"
				bind:this={arena}
				tabindex="-1"
				role="region"
				aria-label="Управление игрой с клавиатуры"
				aria-describedby="game-status"
				data-phase={phase}
			>
				<Board {game} {concealed} />
				{#key game.piecesLocked}
					{#if game.piecesLocked > 0 && !concealed}
						<div
							class="lock-flash"
							class:cleared={(game.lastClear?.lines ?? 0) > 0}
							aria-hidden="true"
						></div>
					{/if}
				{/key}
				{#if phase !== 'running'}
					<div class="overlay">
						{#if phase === 'ready'}
							<span class="overlay-icon" aria-hidden="true">✦</span>
							<h2>Твой марафон</h2>
							<p>150 уровней.<br />Одна длинная партия.</p>
							<label for="game-mode">Режим</label>
							<select
								id="game-mode"
								bind:value={selectedMode}
								onchange={() => {
									if (selectedMode === 'ranked') startLevel = 1;
								}}
								disabled={!mounted || starting}
							>
								<option value="training">Тренировка</option><option value="ranked">Рейтинг</option>
							</select>
							<label for="start-level">Стартовый уровень</label>
							<select
								id="start-level"
								bind:value={startLevel}
								disabled={!mounted || starting || selectedMode === 'ranked'}
							>
								{#each Array.from({ length: 150 }, (_, i) => i + 1) as level}<option value={level}
										>{level}</option
									>{/each}
							</select>
							<button class="button start" onclick={start} disabled={!mounted || starting}
								>Начать игру <span aria-hidden="true">→</span></button
							>
						{:else if phase === 'paused'}
							<span class="overlay-icon" aria-hidden="true">Ⅱ</span>
							<h2>{restored ? 'Партия восстановлена' : 'Пауза'}</h2>
							<p>Поле скрыто.<br />Время остановлено.</p>
							<button class="button" onclick={resume}>Продолжить</button>
							<button class="button quiet pause-settings-btn" onclick={openSettings}
								>⚙ Настройки</button
							>
							{#if restored}<button
									class="quiet new-game"
									onclick={() => {
										if (confirm('Удалить сохранённую партию и начать заново?')) start();
									}}>Новая партия</button
								>{/if}
						{:else if phase === 'countdown'}
							<span class="countdown">{countdown}</span>
							<p>Приготовься</p>
						{:else}
							<span class="overlay-icon" aria-hidden="true"
								>{game.status === 'won' ? '✦' : '◇'}</span
							>
							<h2>{outcome}</h2>
							<p>
								{game.score.toLocaleString('ru-RU')} очков<br />{game.lines} линий · уровень {game.level}
							</p>
							{#if game.timeBonus > 0}<p>
									Бонус времени: +{game.timeBonus.toLocaleString('ru-RU')}
								</p>{/if}
							{#if game.config.mode === 'ranked' && session.ticket}
								<label for="player-name">Имя в рейтинге</label>
								<input
									id="player-name"
									bind:value={playerName}
									maxlength="40"
									disabled={submission !== 'idle'}
								/>
								<button
									class="button"
									onclick={submit}
									disabled={submission !== 'idle' || !replayAvailable}
								>
									{submission === 'sending'
										? 'Проверка…'
										: submission === 'sent'
											? 'Принято'
											: 'Отправить результат'}
								</button>
							{/if}
							<label for="restart-mode">Режим новой партии</label>
							<select
								id="restart-mode"
								bind:value={selectedMode}
								onchange={() => {
									if (selectedMode === 'ranked') startLevel = 1;
								}}
								disabled={starting || submission === 'sending'}
							>
								<option value="training">Тренировка</option><option value="ranked">Рейтинг</option>
							</select>
							<label for="restart-level">Стартовый уровень</label>
							<select
								id="restart-level"
								bind:value={startLevel}
								disabled={selectedMode === 'ranked' || starting || submission === 'sending'}
								>{#each Array.from({ length: 150 }, (_, i) => i + 1) as level}<option value={level}
										>{level}</option
									>{/each}</select
							>
							<button class="button" onclick={start} disabled={starting || submission === 'sending'}
								>Играть снова</button
							>
						{/if}
					</div>
				{/if}
			</div>
			<div class="piece-rail next">
				<span class="rail-title">ДАЛЬШЕ</span>
				{#each game.next as type, index}<div class:next-first={index === 0}>
						<PiecePreview type={concealed ? null : type} />
					</div>{/each}
			</div>
		</div>
		<div class="below-field">
			<span id="game-status" role="status" aria-live="polite"
				>{phase === 'ready'
					? 'Готов к старту'
					: phase === 'paused'
						? 'Игра на паузе'
						: phase === 'countdown'
							? `Старт через ${countdown}`
							: phase === 'finished'
								? outcome
								: 'Партия идёт'}</span
			>
			<div class="below-actions">
				<button class="quiet" onclick={openSettings} aria-label="Настройки звука и управления"
					>⚙ Настройки</button
				>
				{#if phase === 'running' || phase === 'countdown'}<button
						class="quiet"
						onclick={pause}
						aria-label="Пауза">Ⅱ Пауза</button
					>{/if}
			</div>
		</div>
		<div
			class="touch-controls"
			class:flipped={userSettings.touch.layout === 'left'}
			aria-label="Сенсорное управление"
		>
			<Joystick
				disabled={phase !== 'running'}
				deadzone={userSettings.touch.deadzone}
				onchange={stick}
			/>
			<div class="action-pad">
				<ControlButton
					action="hold"
					label="Hold"
					symbol="⇄"
					disabled={phase !== 'running'}
					onpress={action}
				/>
				<ControlButton
					action="hard-drop"
					label="Сбросить"
					symbol="⇓"
					disabled={phase !== 'running'}
					onpress={action}
				/>
				<ControlButton
					action="rotate-ccw"
					label="Поворот ↺"
					symbol="↺"
					disabled={phase !== 'running'}
					onpress={action}
				/>
				<ControlButton
					action="rotate-cw"
					label="Поворот ↻"
					symbol="↻"
					primary
					disabled={phase !== 'running'}
					onpress={action}
				/>
			</div>
		</div>
		{#if !replayAvailable}<p class="replay-note">
				Локальная игра продолжается, но лимит записи replay превышен.
			</p>{/if}
		<p class="storage-note" role="status" data-testid="storage-status">{storageMessage}</p>
		{#if apiMessage}<p class="storage-note" role="status" data-testid="api-status">
				{apiMessage}
			</p>{/if}
	</section>
</div>

<SettingsModal
	open={settingsOpen}
	bind:settings={userSettings}
	onclose={() => {
		settingsOpen = false;
	}}
/>

<style>
	.overlay {
		overflow-y: auto;
		justify-content: safe center;
	}
	.overlay input {
		width: 100%;
		min-width: 0;
		margin-bottom: 10px;
		padding: 4px;
	}
	.storage-note {
		font-size: 11px;
		margin: 6px 0;
	}
	.new-game {
		margin-top: 12px;
	}
	.game-topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin-bottom: 28px;
	}
	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.settings-topbar-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: #ccd9e9;
		background: #182333;
		border: 1px solid #36455c;
		border-radius: 20px;
		padding: 6px 12px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			color 0.15s;
	}
	.settings-topbar-btn:hover {
		background: #23344b;
		border-color: var(--accent);
		color: #fff;
	}
	.settings-topbar-btn svg {
		color: var(--accent);
	}
	.pause-settings-btn {
		margin-top: 8px;
	}
	.below-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.touch-controls.flipped {
		flex-direction: row-reverse;
	}
	h1 {
		font-size: clamp(30px, 4vw, 46px);
		margin: 6px 0 0;
	}
	h1 span {
		color: var(--accent);
		font-weight: 400;
	}
	.mode-badge {
		font-size: 11px;
		color: #b3c0d2;
		border: 1px solid var(--border);
		border-radius: 30px;
		padding: 7px 13px;
	}
	i {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		margin-right: 5px;
	}
	.game-layout {
		display: grid;
		grid-template-columns: minmax(210px, 1fr) minmax(340px, 540px);
		gap: 80px;
		align-items: start;
	}
	.brief {
		padding-top: 55px;
	}
	.chapter {
		color: var(--accent);
		font-size: 11px;
		letter-spacing: 0.15em;
	}
	.brief h2 {
		font-size: 28px;
		margin-bottom: 12px;
	}
	.brief p {
		font-size: 15px;
	}
	.instructions {
		margin: 35px 0;
	}
	.instructions div {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid #263141;
		padding: 10px 0;
		gap: 12px;
	}
	dt {
		font-size: 13px;
		color: #dce8f7;
	}
	dd {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.brief .local-note {
		font-size: 12px;
		line-height: 1.8;
		color: #90a0b6;
	}
	.play-area {
		min-width: 0;
	}
	.hud {
		display: grid;
		grid-template-columns: 1.2fr 0.8fr 1fr 0.8fr;
		padding: 14px 0 18px;
		gap: 12px;
	}
	.hud div {
		display: flex;
		flex-direction: column;
	}
	.hud span {
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 9px;
	}
	.hud strong {
		font-weight: 500;
		font-size: 20px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.hud small {
		font-size: 10px;
		color: #7e8fa6;
	}
	.field-layout {
		display: grid;
		grid-template-columns: minmax(52px, 1fr) minmax(0, 280px) minmax(52px, 1fr);
		gap: 16px;
	}
	.arena {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 2;
		border: 1px solid #45516a;
		border-radius: 6px;
		box-shadow: 0 16px 60px #0003;
		outline: none;
	}
	.arena:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
	.piece-rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding-top: 4px;
	}
	.rail-title {
		font-size: 9px;
		letter-spacing: 0.1em;
		color: #9badc5;
		white-space: nowrap;
	}
	kbd {
		margin-left: 3px;
		border: 1px solid #3d4d62;
		border-radius: 3px;
		padding: 0 3px;
		font: 8px inherit;
	}
	.rail-note {
		font-size: 9px;
		text-align: center;
		color: #7588a2;
	}
	.next > div {
		width: 100%;
		max-width: 78px;
	}
	.next-first {
		background: #1b293b;
		border: 1px solid #354257;
		border-radius: 6px;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: safe center;
		padding: 16px;
		text-align: center;
		background: #101926ed;
		border-radius: 5px;
	}
	.lock-flash {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border: 2px solid #91a9c2;
		border-radius: 5px;
		opacity: 0;
		animation: lock-flash 180ms ease-out;
	}
	.lock-flash.cleared {
		border-color: var(--accent);
		background: #73ebc10a;
	}
	@keyframes lock-flash {
		from {
			opacity: 0.65;
		}
		to {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.lock-flash {
			animation: none;
		}
	}
	.overlay h2 {
		font-size: clamp(18px, 2.3vw, 25px);
		margin: 10px 0 0;
	}
	.overlay p {
		font-size: 13px;
		margin: 10px 0 20px;
	}
	.overlay-icon {
		color: var(--accent);
		font-size: 36px;
		line-height: 1;
	}
	.overlay label {
		color: var(--muted);
		font-size: 11px;
		margin-bottom: 5px;
	}
	select {
		font: inherit;
		padding: 5px 14px;
		border: 1px solid #465970;
		border-radius: 5px;
		background: #1a293b;
		color: #e8edf4;
		margin-bottom: 18px;
		max-width: 100%;
	}
	select:focus-visible {
		outline: 2px solid var(--accent);
	}
	.button {
		border: 0;
		cursor: pointer;
		font-size: 13px;
		padding: 11px 16px;
		justify-content: center;
	}
	.countdown {
		font-size: 80px;
		line-height: 1;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}
	.below-field {
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 42px;
		font-size: 10px;
		color: #91a5bf;
	}
	.quiet {
		color: #ccd9e9;
		border: 1px solid #36455c;
		background: #182333;
		border-radius: 5px;
		padding: 5px 10px;
		cursor: pointer;
		font-size: 11px;
	}
	.touch-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 8px 0 max(8px, env(safe-area-inset-bottom));
		touch-action: none;
	}
	.action-pad {
		display: grid;
		grid-template-columns: repeat(2, minmax(58px, 72px));
		gap: 10px;
	}
	.replay-note {
		font-size: 11px;
	}
	@media (hover: hover) and (pointer: fine) {
		.touch-controls {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.game-layout {
			gap: 30px;
			grid-template-columns: minmax(180px, 1fr) minmax(340px, 470px);
		}
	}
	@media (max-width: 680px) {
		.game-topbar {
			margin-bottom: 6px;
		}
		.eyebrow {
			font-size: 9px;
		}
		h1 {
			font-size: 28px;
		}
		.mode-badge {
			font-size: 9px;
			padding: 5px 8px;
			max-width: 128px;
		}
		.game-layout {
			display: flex;
			flex-direction: column-reverse;
			gap: 20px;
		}
		.play-area {
			width: 100%;
			max-width: 470px;
			margin-inline: auto;
		}
		.brief {
			padding-top: 0;
			border-top: 1px solid var(--border);
			width: 100%;
		}
		.chapter {
			margin-top: 22px;
		}
		.brief h2 {
			font-size: 23px;
		}
		.instructions {
			margin: 15px 0;
		}
		.field-layout {
			grid-template-columns:
				minmax(44px, 1fr) max(130px, min(53vw, calc((100dvh - 320px) / 2)))
				minmax(44px, 1fr);
			gap: 10px;
		}
		.hud {
			padding: 8px 0 12px;
		}
		.hud strong {
			font-size: 18px;
		}
		.overlay {
			padding: 10px;
		}
		.overlay h2 {
			font-size: 18px;
		}
		.overlay p {
			font-size: 11px;
			margin: 8px 0 12px;
		}
		.overlay-icon {
			font-size: 24px;
		}
		.overlay select {
			padding: 2px 8px;
			margin-bottom: 10px;
		}
		.button {
			padding: 9px 12px;
			font-size: 12px;
		}
		.touch-controls {
			display: flex;
		}
	}
</style>
