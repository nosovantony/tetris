<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Board from '../../lib/components/Board.svelte';
	import OpponentBoard from '../../lib/components/OpponentBoard.svelte';
	import PiecePreview from '../../lib/components/PiecePreview.svelte';
	import Joystick from '../../lib/components/Joystick.svelte';
	import ControlButton from '../../lib/components/ControlButton.svelte';
	import SettingsModal from '../../lib/components/SettingsModal.svelte';
	import { createGame, stepGame } from '../../lib/game/engine';
	import { collides } from '../../lib/game/board';
	import { calculateAttack, cancelGarbage, insertGarbageLines } from '../../lib/game/garbage';
	import { TICKS_PER_SECOND } from '../../lib/game/constants';
	import type { Action, Cell, GameState } from '../../lib/game/types';
	import type {
		DuelClientMessage,
		DuelPlayerInfo,
		DuelRoomStatus,
		DuelServerMessage,
		PlayerId
	} from '../../lib/shared/duel';
	import { InputMux, type Control } from '../../lib/input/controls';
	import { createKeyboard } from '../../lib/input/keyboard';
	import type { StickDirection } from '../../lib/input/touch';
	import { soundManager } from '../../lib/audio/sound';
	import { loadCustomAudioTrack } from '../../lib/audio/custom-audio';
	import { bindingsToKeyMap, loadSettings } from '../../lib/settings/store';
	import { DEFAULT_SETTINGS, type UserSettings } from '../../lib/settings/types';
	import { i18n } from '../../lib/i18n/index.svelte';

	// Settings & Audio
	let userSettings = $state<UserSettings>({ ...DEFAULT_SETTINGS });
	let settingsOpen = $state(false);
	let keyMap = $derived(bindingsToKeyMap(userSettings.controls));

	// State
	let pageState = $state<'lobby' | 'waiting' | 'in_game' | 'match_over'>('lobby');
	let roomId = $state('');
	let playerName = $state('Игрок');
	let inputRoomCode = $state('');
	let shareUrl = $state('');
	let copied = $state(false);
	let errorMessage = $state('');
	let isQuickJoining = $state(false);

	let ws: WebSocket | null = null;
	let myPlayerId = $state<PlayerId | null>(null);
	let opponent = $state<DuelPlayerInfo | null>(null);
	let currentRound = $state(1);
	let wins = $state<Record<PlayerId, number>>({ p1: 0, p2: 0 });
	let countdownNumber = $state(0);
	let roundResult = $state<'won' | 'lost' | null>(null);
	let matchResult = $state<'won' | 'lost' | null>(null);
	let rematchReady = $state(false);
	let opponentRematchReady = $state(false);

	// In-game playfield state
	let game = $state.raw<GameState>(createGame({ seed: 0, mode: 'training', startLevel: 1 }));
	let pendingGarbage = $state(0);
	let isPlaying = $state(false);

	// Opponent live board state
	let opponentBoard = $state<Cell[][]>([]);
	let opponentScore = $state(0);
	let opponentLines = $state(0);

	let arena: HTMLDivElement | undefined = $state();
	let lastFrameTime = 0;
	let accumulator = 0;
	let pendingActions: Action[] = [];
	let animFrameId: number | null = null;
	let lastBroadcastTick = -1;

	const TICK_MS = 1000 / TICKS_PER_SECOND;

	// Input handling
	const input = new InputMux((action: Action) => {
		if (isPlaying && game.status === 'playing') {
			pendingActions.push(action);
		}
	});

	const keyboard = createKeyboard({
		enabled: () => !settingsOpen && isPlaying && game.status === 'playing',
		getKey: (code: string) => keyMap[code],
		press: (source: string, control: Control) => {
			if (isPlaying && game.status === 'playing') {
				input.press(source, control);
				void soundManager.resume();
				if (control === 'left' || control === 'right') soundManager.playMove();
				else if (control === 'rotate-cw' || control === 'rotate-ccw') soundManager.playRotate();
				else if (control === 'soft-drop') soundManager.playSoftDrop();
				else if (control === 'hard-drop') soundManager.playHardDrop();
				else if (control === 'hold') soundManager.playHold();
			}
		},
		release: (source: string) => input.release(source),
		pause: () => {
			// No pausing during real-time online duel
		}
	});

	function handleStick(direction: StickDirection | null) {
		if (direction) {
			input.press('stick', direction);
			void soundManager.resume();
			if (
				userSettings.touch.haptics &&
				typeof navigator !== 'undefined' &&
				'vibrate' in navigator
			) {
				try {
					navigator.vibrate(8);
				} catch {}
			}
			if (direction === 'left' || direction === 'right') soundManager.playMove();
			else if (direction === 'soft-drop') soundManager.playSoftDrop();
		} else {
			input.release('stick');
		}
	}

	function handleAction(control: Control) {
		if (isPlaying && game.status === 'playing') {
			input.press('pad', control);
			void soundManager.resume();
			if (
				userSettings.touch.haptics &&
				typeof navigator !== 'undefined' &&
				'vibrate' in navigator
			) {
				try {
					navigator.vibrate(12);
				} catch {}
			}
			if (control === 'rotate-cw' || control === 'rotate-ccw') soundManager.playRotate();
			else if (control === 'hard-drop') soundManager.playHardDrop();
			else if (control === 'hold') soundManager.playHold();
		}
	}

	function sendWs(msg: DuelClientMessage) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}

	function connectToRoom(targetRoom: string) {
		disconnectWs();
		roomId = targetRoom;
		errorMessage = '';
		pageState = 'waiting';

		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.set('room', targetRoom);
			shareUrl = url.toString();
			window.history.replaceState({}, '', url.toString());

			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/api/duel/ws?room=${encodeURIComponent(targetRoom)}&name=${encodeURIComponent(playerName)}`;

			const socket = new WebSocket(wsUrl);
			ws = socket;

			socket.onmessage = (event) => {
				try {
					const msg: DuelServerMessage = JSON.parse(event.data);
					handleServerMessage(msg);
				} catch (err) {
					console.error('Failed to parse duel message:', err);
				}
			};

			socket.onerror = () => {
				errorMessage = i18n.t.duel.connectionError;
				pageState = 'lobby';
			};

			socket.onclose = () => {
				if (pageState !== 'lobby') {
					errorMessage = i18n.t.duel.connectionError;
					pageState = 'lobby';
				}
			};
		}
	}

	function handleServerMessage(msg: DuelServerMessage) {
		switch (msg.type) {
			case 'welcome': {
				myPlayerId = msg.playerId;
				roomId = msg.roomId;
				break;
			}
			case 'room_state': {
				wins = msg.wins;
				currentRound = msg.round;

				const me = msg.players.find((p: DuelPlayerInfo) => p.id === myPlayerId);
				const opp = msg.players.find((p: DuelPlayerInfo) => p.id !== myPlayerId);

				opponent = opp ?? null;
				if (opp) opponentRematchReady = opp.ready;
				if (me) rematchReady = me.ready;

				if (msg.players.length < 2 && pageState !== 'lobby') {
					pageState = 'waiting';
					isPlaying = false;
				}
				break;
			}
			case 'start_countdown': {
				pageState = 'in_game';
				countdownNumber = msg.countdown;
				currentRound = msg.round;
				roundResult = null;
				rematchReady = false;
				opponentRematchReady = false;

				// Prepare game state
				if (countdownNumber === 3) {
					game = createGame({ seed: msg.seed, mode: 'training', startLevel: 1 });
					pendingGarbage = 0;
					opponentBoard = [];
					opponentScore = 0;
					opponentLines = 0;
					isPlaying = false;
					soundManager.playRotate();
				}
				break;
			}
			case 'round_start': {
				countdownNumber = 0;
				isPlaying = true;
				game = createGame({ seed: msg.seed, mode: 'training', startLevel: 1 });
				pendingGarbage = 0;
				lastFrameTime = performance.now();
				accumulator = 0;
				pendingActions = [];
				soundManager.playTetris();
				void soundManager.startBgm();

				// Send initial board
				sendWs({ type: 'board', board: game.board, score: game.score, lines: game.lines });

				arena?.focus({ preventScroll: true });
				break;
			}
			case 'opponent_board': {
				opponentBoard = msg.board;
				opponentScore = msg.score;
				opponentLines = msg.lines;
				break;
			}
			case 'garbage': {
				pendingGarbage += msg.lines;
				soundManager.playLock();
				break;
			}
			case 'round_end': {
				isPlaying = false;
				soundManager.stopBgm();
				wins = msg.wins;

				const wonThisRound = msg.winnerId === myPlayerId;
				roundResult = wonThisRound ? 'won' : 'lost';

				if (msg.matchWinnerId) {
					pageState = 'match_over';
					matchResult = msg.matchWinnerId === myPlayerId ? 'won' : 'lost';
					if (matchResult === 'won') soundManager.playLevelUp();
					else soundManager.playGameOver();
				} else {
					if (wonThisRound) soundManager.playTetris();
					else soundManager.playGameOver();
				}
				break;
			}
			case 'player_left': {
				opponent = null;
				isPlaying = false;
				soundManager.stopBgm();
				if (pageState === 'in_game') {
					errorMessage = i18n.t.duel.opponentLeft;
					pageState = 'waiting';
				}
				break;
			}
			case 'error': {
				errorMessage = msg.message;
				break;
			}
		}
	}

	function disconnectWs() {
		if (ws) {
			ws.onclose = null;
			ws.onerror = null;
			ws.close();
			ws = null;
		}
		isPlaying = false;
		soundManager.stopBgm();
		if (animFrameId !== null) {
			cancelAnimationFrame(animFrameId);
			animFrameId = null;
		}
	}

	// Game step loop
	function frame(now: number) {
		if (isPlaying && game.status === 'playing') {
			const elapsed = now - lastFrameTime;
			lastFrameTime = now;

			if (elapsed > 0 && elapsed <= 250) {
				accumulator += elapsed;
				while (accumulator + 1e-7 >= TICK_MS && isPlaying && game.status === 'playing') {
					const actions = pendingActions;
					pendingActions = [];

					const prevPieces = game.piecesLocked;
					const prevLines = game.lines;

					stepGame(game, actions);
					accumulator = Math.max(0, accumulator - TICK_MS);

					// Check if a piece locked
					if (game.piecesLocked > prevPieces) {
						const linesCleared = game.lines - prevLines;
						if (linesCleared > 0) {
							// Attack opponent & cancel incoming garbage
							const attack = calculateAttack(linesCleared, game.backToBack, game.combo);
							const { remainingPending, outgoingAttack } = cancelGarbage(pendingGarbage, attack);
							pendingGarbage = remainingPending;

							if (outgoingAttack > 0) {
								sendWs({ type: 'attack', lines: outgoingAttack });
							}
							soundManager.playClear(linesCleared);
						} else {
							// No lines cleared: insert pending garbage
							if (pendingGarbage > 0) {
								const drop = Math.min(pendingGarbage, 8);
								insertGarbageLines(game.board, drop);
								pendingGarbage -= drop;

								// Check if active piece collides with new garbage
								if (game.active && collides(game.board, game.active)) {
									game.status = 'lost';
									game.topOut = 'lock-out';
									game.active = null;
								}
							}
							soundManager.playLock();
						}

						// Broadcast board
						sendWs({ type: 'board', board: game.board, score: game.score, lines: game.lines });
						lastBroadcastTick = game.tick;
					}

					// Periodic board broadcast every 30 ticks
					if (game.tick - lastBroadcastTick >= 30) {
						sendWs({ type: 'board', board: game.board, score: game.score, lines: game.lines });
						lastBroadcastTick = game.tick;
					}

					// Check top-out / lost
					if (game.status === 'lost') {
						isPlaying = false;
						sendWs({ type: 'top_out' });
						soundManager.playGameOver();
					}
				}
			} else {
				lastFrameTime = now;
			}
			game = { ...game };
		}
		animFrameId = requestAnimationFrame(frame);
	}

	async function startQuickPlay() {
		isQuickJoining = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/duel/quick', { method: 'POST' });
			if (!res.ok) throw new Error('Quick play failed');
			const data = (await res.json()) as { roomId: string };
			connectToRoom(data.roomId);
		} catch {
			errorMessage = i18n.t.duel.connectionError;
		} finally {
			isQuickJoining = false;
		}
	}

	function createPrivateRoom() {
		const code = 'room-' + Math.random().toString(36).substring(2, 8);
		connectToRoom(code);
	}

	function joinByCode() {
		const code = inputRoomCode.trim();
		if (code) {
			connectToRoom(code);
		}
	}

	function copyLink() {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(shareUrl).then(() => {
				copied = true;
				setTimeout(() => (copied = false), 2500);
			});
		}
	}

	function requestRematch() {
		rematchReady = true;
		sendWs({ type: 'rematch' });
	}

	function returnToLobby() {
		disconnectWs();
		pageState = 'lobby';
		errorMessage = '';
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.delete('room');
			window.history.replaceState({}, '', url.toString());
		}
	}

	$effect(() => {
		soundManager.updateSettings(userSettings.audio);
	});

	onMount(() => {
		userSettings = loadSettings();
		if (userSettings.language) i18n.setLanguage(userSettings.language);

		const savedName = localStorage.getItem('tetris_player_name');
		if (savedName) playerName = savedName;

		void (async () => {
			const custom = await loadCustomAudioTrack();
			if (custom) soundManager.setCustomAudio(custom.buffer, custom.meta.type);
		})();

		animFrameId = requestAnimationFrame(frame);

		// If ?room=... is present in URL, connect immediately!
		const urlParams = new URLSearchParams(window.location.search);
		const initialRoom = urlParams.get('room');
		if (initialRoom) {
			connectToRoom(initialRoom);
		}
	});

	onDestroy(() => {
		disconnectWs();
	});

	let myWins = $derived(myPlayerId ? wins[myPlayerId] : 0);
	let oppWins = $derived(myPlayerId ? wins[myPlayerId === 'p1' ? 'p2' : 'p1'] : 0);
	let oppName = $derived(opponent?.name || i18n.t.duel.opponent);
</script>

<svelte:window onkeydown={keyboard.keydown} onkeyup={keyboard.keyup} />

<div class="duel-page">
	{#if pageState === 'lobby'}
		<div class="lobby-card">
			<div class="lobby-header">
				<div class="eyebrow">{i18n.t.duel.subtitle}</div>
				<h1 class="lobby-title">{i18n.t.duel.title}</h1>
				<p class="lobby-desc">{i18n.t.duel.rulesDesc}</p>
			</div>

			{#if errorMessage}
				<div class="error-banner" role="alert">{errorMessage}</div>
			{/if}

			<div class="name-section">
				<label for="player-name-input" class="name-label">{i18n.t.duel.nameLabel}</label>
				<input
					id="player-name-input"
					type="text"
					class="name-input"
					bind:value={playerName}
					maxlength="30"
					placeholder="Игрок"
					onchange={() => localStorage.setItem('tetris_player_name', playerName)}
				/>
			</div>

			<div class="modes-grid">
				<div class="mode-card quick-card">
					<div class="mode-title">{i18n.t.duel.quickPlay}</div>
					<div class="mode-desc">{i18n.t.duel.quickPlayDesc}</div>
					<button class="btn-primary" disabled={isQuickJoining} onclick={startQuickPlay}>
						{isQuickJoining ? i18n.t.duel.connecting : i18n.t.duel.quickPlay}
					</button>
				</div>

				<div class="mode-card private-card">
					<div class="mode-title">{i18n.t.duel.createRoom}</div>
					<div class="mode-desc">{i18n.t.duel.createRoomDesc}</div>
					<button class="btn-secondary" onclick={createPrivateRoom}>
						{i18n.t.duel.createRoom}
					</button>
				</div>
			</div>

			<div class="join-box">
				<h2 class="join-heading">{i18n.t.duel.joinRoomHeading}</h2>
				<form
					class="join-form"
					onsubmit={(e) => {
						e.preventDefault();
						joinByCode();
					}}
				>
					<input
						type="text"
						class="join-input"
						placeholder={i18n.t.duel.roomCodePlaceholder}
						bind:value={inputRoomCode}
					/>
					<button type="submit" class="btn-join" disabled={!inputRoomCode.trim()}>
						{i18n.t.duel.joinBtn}
					</button>
				</form>
			</div>
		</div>
	{:else if pageState === 'waiting'}
		<div class="waiting-card">
			<div class="spinner"></div>
			<h2 class="waiting-title">{i18n.t.duel.waitingOpponent}</h2>
			<p class="waiting-room">
				<span class="room-label">Комната:</span>
				<span class="room-code">{roomId}</span>
			</p>
			<p class="waiting-sub">{i18n.t.duel.shareLinkText}</p>

			<div class="share-box">
				<input type="text" readonly class="share-input" value={shareUrl} />
				<button class="btn-copy" onclick={copyLink}>
					{copied ? i18n.t.duel.copied : i18n.t.duel.copyLinkBtn}
				</button>
			</div>

			<button class="btn-cancel" onclick={returnToLobby}>
				{i18n.t.duel.cancelWait}
			</button>
		</div>
	{:else}
		<!-- ARENA SCREEN (in_game & match_over) -->
		<div class="arena-container">
			<!-- TOP HUD -->
			<div class="duel-hud">
				<div class="hud-meta">
					<span class="round-badge">
						{i18n.t.duel.roundOf.replace('{round}', String(currentRound))}
					</span>
					<button
						class="settings-btn"
						aria-label={i18n.t.game.settingsAria}
						onclick={() => (settingsOpen = true)}
					>
						⚙️
					</button>
				</div>

				<div class="score-bar">
					<div class="player-hud you">
						<span class="hud-name">{playerName} ({i18n.t.duel.you})</span>
						<div class="stars">
							{#each Array.from({ length: 2 }) as _, i}
								<span class="star" class:filled={i < myWins}>★</span>
							{/each}
						</div>
					</div>

					<div class="vs-badge">VS</div>

					<div class="player-hud opp">
						<span class="hud-name">{oppName}</span>
						<div class="stars">
							{#each Array.from({ length: 2 }) as _, i}
								<span class="star" class:filled={i < oppWins}>★</span>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- MAIN DUAL BOARD ARENA -->
			<div class="duel-arena">
				<!-- PLAYER SIDE -->
				<div class="player-col">
					<div class="side-panel left-panel">
						<div class="panel-box hold-box">
							<span class="box-label">{i18n.t.game.hold}</span>
							<PiecePreview type={game.hold} />
						</div>
						<div class="stats-box">
							<div class="stat-item">
								<span class="stat-label">{i18n.t.game.score}</span>
								<span class="stat-val">{game.score}</span>
							</div>
							<div class="stat-item">
								<span class="stat-label">{i18n.t.game.lines}</span>
								<span class="stat-val">{game.lines}</span>
							</div>
						</div>
					</div>

					<div
						class="board-wrapper"
						tabindex="-1"
						role="region"
						aria-label="Игровое поле"
						bind:this={arena}
					>
						<Board {game} concealed={countdownNumber > 0} />

						<!-- GARBAGE METER -->
						{#if pendingGarbage > 0}
							<div class="garbage-indicator" title={i18n.t.duel.pendingGarbage}>
								<div
									class="garbage-fill"
									style={`height: ${Math.min(100, pendingGarbage * 5)}%`}
								></div>
								<span class="garbage-count">+{pendingGarbage}</span>
							</div>
						{/if}

						<!-- COUNTDOWN OVERLAY -->
						{#if countdownNumber > 0}
							<div class="overlay countdown-overlay">
								<span class="countdown-num">{countdownNumber}</span>
								<span class="countdown-sub">{i18n.t.duel.getReady}</span>
							</div>
						{/if}

						<!-- ROUND RESULT BANNER -->
						{#if roundResult && !matchResult}
							<div class="overlay round-overlay" class:won={roundResult === 'won'}>
								<span class="round-msg">
									{roundResult === 'won' ? i18n.t.duel.roundWon : i18n.t.duel.roundLost}
								</span>
							</div>
						{/if}
					</div>

					<div class="side-panel right-panel">
						<div class="panel-box next-box">
							<span class="box-label">{i18n.t.game.next}</span>
							<PiecePreview type={game.next[0] ?? null} />
						</div>
					</div>
				</div>

				<!-- OPPONENT SIDE -->
				<div class="opponent-col">
					<OpponentBoard
						board={opponentBoard}
						name={oppName}
						score={opponentScore}
						lines={opponentLines}
						wins={oppWins}
						targetWins={2}
					/>
				</div>
			</div>

			<!-- TOUCH CONTROLS (mobile) -->
			<div class="touch-wrapper">
				<div class="touch-controls" class:left-handed={userSettings.touch.layout === 'left'}>
					<div class="stick-zone">
						<Joystick
							disabled={!isPlaying}
							deadzone={userSettings.touch.deadzone}
							onchange={handleStick}
						/>
					</div>
					<div class="buttons-zone">
						<div class="btn-row">
							<ControlButton
								action="rotate-ccw"
								label={i18n.t.game.touchRotateCcw}
								symbol="↺"
								disabled={!isPlaying}
								onpress={handleAction}
							/>
							<ControlButton
								action="rotate-cw"
								label={i18n.t.game.touchRotateCw}
								symbol="↻"
								primary
								disabled={!isPlaying}
								onpress={handleAction}
							/>
						</div>
						<div class="btn-row">
							<ControlButton
								action="hold"
								label={i18n.t.game.touchHold}
								symbol="⇄"
								disabled={!isPlaying}
								onpress={handleAction}
							/>
							<ControlButton
								action="hard-drop"
								label={i18n.t.game.touchDrop}
								symbol="⇓"
								disabled={!isPlaying}
								onpress={handleAction}
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- MATCH OVER MODAL -->
			{#if pageState === 'match_over'}
				<div class="modal-backdrop">
					<div class="match-modal">
						<div class="modal-trophy">
							{matchResult === 'won' ? '🏆' : '💀'}
						</div>
						<h2 class="modal-title" class:victory={matchResult === 'won'}>
							{matchResult === 'won' ? i18n.t.duel.matchWon : i18n.t.duel.matchLost}
						</h2>
						<div class="final-score">
							<span class="score-num">{myWins}</span>
							<span class="score-sep">-</span>
							<span class="score-num">{oppWins}</span>
						</div>

						<div class="rematch-status">
							{#if rematchReady}
								<span class="ready-badge">{i18n.t.duel.rematchReady}</span>
							{/if}
							{#if opponentRematchReady}
								<span class="opp-ready-badge">{i18n.t.duel.opponentReady}</span>
							{/if}
						</div>

						<div class="modal-actions">
							<button class="btn-rematch" disabled={rematchReady} onclick={requestRematch}>
								{rematchReady ? '⏳ Ожидание...' : i18n.t.duel.rematchBtn}
							</button>
							<button class="btn-lobby" onclick={returnToLobby}>
								{i18n.t.duel.lobbyBtn}
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<SettingsModal
		open={settingsOpen}
		onclose={() => (settingsOpen = false)}
		bind:settings={userSettings}
	/>
</div>

<style>
	.duel-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: calc(100vh - 120px);
		padding: 1rem;
		box-sizing: border-box;
		color: #e2e8f0;
	}

	/* LOBBY */
	.lobby-card {
		max-width: 680px;
		width: 100%;
		background: #0f172a;
		border: 1px solid #1e293b;
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		box-sizing: border-box;
	}
	.lobby-header {
		text-align: center;
		margin-bottom: 2rem;
	}
	.eyebrow {
		font-size: 0.85rem;
		color: #38bdf8;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}
	.lobby-title {
		font-size: 2rem;
		font-weight: 800;
		margin: 0.25rem 0;
		background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.lobby-desc {
		font-size: 0.95rem;
		color: #94a3b8;
		line-height: 1.5;
		margin: 0.5rem auto 0;
	}
	.error-banner {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid #ef4444;
		color: #fca5a5;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		margin-bottom: 1.5rem;
		text-align: center;
	}
	.name-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.75rem;
	}
	.name-label {
		font-size: 0.85rem;
		color: #94a3b8;
		font-weight: 500;
	}
	.name-input {
		background: #1e293b;
		border: 1px solid #334155;
		color: #f8fafc;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		outline: none;
		transition: border-color 0.2s;
	}
	.name-input:focus {
		border-color: #38bdf8;
	}
	.modes-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 2rem;
	}
	@media (max-width: 600px) {
		.modes-grid {
			grid-template-columns: 1fr;
		}
	}
	.mode-card {
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 0.75rem;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.mode-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: #f1f5f9;
	}
	.mode-desc {
		font-size: 0.85rem;
		color: #94a3b8;
		line-height: 1.4;
		flex-grow: 1;
	}
	.btn-primary {
		background: #0284c7;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-primary:hover:not(:disabled) {
		background: #0369a1;
	}
	.btn-secondary {
		background: #475569;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-secondary:hover:not(:disabled) {
		background: #334155;
	}
	.join-box {
		background: #131d31;
		border: 1px solid #202e48;
		border-radius: 0.75rem;
		padding: 1.25rem;
	}
	.join-heading {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
		color: #cbd5e1;
	}
	.join-form {
		display: flex;
		gap: 0.75rem;
	}
	.join-input {
		flex: 1;
		background: #1e293b;
		border: 1px solid #334155;
		color: #fff;
		border-radius: 0.5rem;
		padding: 0.65rem 0.85rem;
		outline: none;
	}
	.btn-join {
		background: #2563eb;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.65rem 1.25rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-join:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* WAITING SCREEN */
	.waiting-card {
		max-width: 500px;
		width: 100%;
		background: #0f172a;
		border: 1px solid #1e293b;
		border-radius: 1rem;
		padding: 2.5rem 1.5rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid #1e293b;
		border-top-color: #38bdf8;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.waiting-title {
		font-size: 1.4rem;
		margin: 0;
		color: #f8fafc;
	}
	.waiting-room {
		font-size: 0.95rem;
		margin: 0;
		color: #94a3b8;
	}
	.room-code {
		color: #38bdf8;
		font-weight: 700;
		margin-left: 0.35rem;
	}
	.waiting-sub {
		font-size: 0.85rem;
		color: #64748b;
		margin: 0;
	}
	.share-box {
		display: flex;
		width: 100%;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.share-input {
		flex: 1;
		background: #1e293b;
		border: 1px solid #334155;
		color: #cbd5e1;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		outline: none;
	}
	.btn-copy {
		background: #0284c7;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-cancel {
		background: transparent;
		color: #94a3b8;
		border: 1px solid #334155;
		border-radius: 0.5rem;
		padding: 0.5rem 1.5rem;
		cursor: pointer;
		margin-top: 1rem;
	}
	.btn-cancel:hover {
		color: #fff;
		border-color: #64748b;
	}

	/* ARENA */
	.arena-container {
		width: 100%;
		max-width: 900px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	.duel-hud {
		width: 100%;
		background: #0f172a;
		border: 1px solid #1e293b;
		border-radius: 0.75rem;
		padding: 0.75rem 1.25rem;
		box-sizing: border-box;
	}
	.hud-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}
	.round-badge {
		font-size: 0.85rem;
		font-weight: 700;
		color: #38bdf8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.settings-btn {
		background: transparent;
		border: none;
		font-size: 1.1rem;
		cursor: pointer;
		opacity: 0.8;
		transition: opacity 0.2s;
	}
	.settings-btn:hover {
		opacity: 1;
	}
	.score-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.player-hud {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.player-hud.opp {
		flex-direction: row-reverse;
	}
	.hud-name {
		font-weight: 700;
		font-size: 1rem;
		color: #f1f5f9;
	}
	.vs-badge {
		font-weight: 900;
		font-size: 1.1rem;
		color: #64748b;
		letter-spacing: 0.1em;
	}
	.stars {
		display: flex;
		gap: 0.25rem;
	}
	.star {
		font-size: 1.25rem;
		color: #334155;
	}
	.star.filled {
		color: #eab308;
		text-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
	}

	.duel-arena {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		gap: 2rem;
		width: 100%;
	}
	@media (max-width: 680px) {
		.duel-arena {
			gap: 1rem;
		}
	}
	.player-col {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}
	.side-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.panel-box {
		background: #0f172a;
		border: 1px solid #1e293b;
		border-radius: 0.5rem;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.box-label {
		font-size: 0.7rem;
		color: #94a3b8;
		font-weight: 600;
		text-transform: uppercase;
		margin-bottom: 0.25rem;
	}
	.stats-box {
		background: #0f172a;
		border: 1px solid #1e293b;
		border-radius: 0.5rem;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.stat-item {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.stat-label {
		font-size: 0.65rem;
		color: #64748b;
		text-transform: uppercase;
	}
	.stat-val {
		font-size: 0.95rem;
		font-weight: 700;
		color: #38bdf8;
	}

	.board-wrapper {
		position: relative;
		width: 240px;
		height: 480px;
		border: 2px solid #334155;
		border-radius: 0.5rem;
		overflow: hidden;
		background: #111b29;
		outline: none;
	}
	.board-wrapper:focus-visible {
		border-color: #38bdf8;
		box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
	}
	@media (max-width: 500px) {
		.board-wrapper {
			width: 170px;
			height: 340px;
		}
	}

	.garbage-indicator {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 6px;
		height: 100%;
		background: rgba(0, 0, 0, 0.4);
		pointer-events: none;
	}
	.garbage-fill {
		position: absolute;
		bottom: 0;
		width: 100%;
		background: #ef4444;
		box-shadow: 0 0 8px #ef4444;
		transition: height 0.15s ease-out;
	}
	.garbage-count {
		position: absolute;
		left: 10px;
		bottom: 4px;
		font-size: 0.75rem;
		font-weight: 800;
		color: #ef4444;
		text-shadow: 0 0 4px #000;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(11, 17, 32, 0.85);
		backdrop-filter: blur(2px);
		z-index: 10;
	}
	.countdown-num {
		font-size: 4.5rem;
		font-weight: 900;
		color: #38bdf8;
		text-shadow: 0 0 20px rgba(56, 189, 248, 0.8);
		line-height: 1;
	}
	.countdown-sub {
		font-size: 1rem;
		color: #94a3b8;
		margin-top: 0.5rem;
		font-weight: 600;
	}
	.round-overlay {
		background: rgba(15, 23, 42, 0.9);
	}
	.round-msg {
		font-size: 1.5rem;
		font-weight: 800;
		color: #f87171;
	}
	.round-overlay.won .round-msg {
		color: #4ade80;
	}

	.opponent-col {
		display: flex;
	}

	/* TOUCH CONTROLS */
	.touch-wrapper {
		display: none;
		width: 100%;
		margin-top: 1rem;
	}
	@media (pointer: coarse) {
		.touch-wrapper {
			display: block;
		}
	}
	.touch-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		max-width: 500px;
		margin: 0 auto;
	}
	.touch-controls.left-handed {
		flex-direction: row-reverse;
	}
	.stick-zone {
		touch-action: none;
	}
	.buttons-zone {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.btn-row {
		display: flex;
		gap: 0.75rem;
	}

	/* MATCH OVER MODAL */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		backdrop-filter: blur(4px);
	}
	.match-modal {
		background: #0f172a;
		border: 2px solid #334155;
		border-radius: 1rem;
		padding: 2rem;
		max-width: 400px;
		width: 90%;
		text-align: center;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
	}
	.modal-trophy {
		font-size: 3.5rem;
		margin-bottom: 0.5rem;
	}
	.modal-title {
		font-size: 1.75rem;
		font-weight: 800;
		margin: 0 0 1rem;
		color: #f87171;
	}
	.modal-title.victory {
		color: #4ade80;
		text-shadow: 0 0 16px rgba(74, 222, 128, 0.4);
	}
	.final-score {
		font-size: 2.5rem;
		font-weight: 900;
		color: #f1f5f9;
		margin-bottom: 1rem;
	}
	.score-sep {
		color: #64748b;
		margin: 0 0.5rem;
	}
	.rematch-status {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 1.5rem;
	}
	.ready-badge {
		font-size: 0.85rem;
		color: #38bdf8;
		font-weight: 600;
	}
	.opp-ready-badge {
		font-size: 0.85rem;
		color: #4ade80;
		font-weight: 600;
	}
	.modal-actions {
		display: flex;
		gap: 0.75rem;
	}
	.btn-rematch {
		flex: 1;
		background: #0284c7;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-rematch:hover:not(:disabled) {
		background: #0369a1;
	}
	.btn-rematch:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.btn-lobby {
		background: #334155;
		color: #cbd5e1;
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-lobby:hover {
		background: #475569;
		color: #fff;
	}
</style>
