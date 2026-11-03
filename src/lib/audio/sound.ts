import type { AudioSettings } from '../settings/types';

// Note frequencies in Hz (A4 = 440Hz)
const NOTE_FREQS: Record<string, number> = {
	C3: 130.81,
	D3: 146.83,
	E3: 164.81,
	F3: 174.61,
	G3: 196.0,
	'G#3': 207.65,
	A3: 220.0,
	B3: 246.94,
	C4: 261.63,
	'C#4': 277.18,
	D4: 293.66,
	'D#4': 311.13,
	E4: 329.63,
	F4: 349.23,
	'F#4': 369.99,
	G4: 392.0,
	'G#4': 415.3,
	A4: 440.0,
	'A#4': 466.16,
	B4: 493.88,
	C5: 523.25,
	'C#5': 554.37,
	D5: 587.33,
	'D#5': 622.25,
	E5: 659.25,
	F5: 698.46,
	'F#5': 739.99,
	G5: 783.99,
	'G#5': 830.61,
	A5: 880.0,
	'A#5': 932.33,
	B5: 987.77,
	C6: 1046.5,
	D6: 1174.66,
	E6: 1318.51
};

interface MusicNote {
	note: string | null; // null for rest
	dur: number; // in 16th beats
}

// Korobeiniki (Classic Tetris Theme A)
// 16th beat units (4 units = 1 quarter beat, 2 units = 1 eighth beat)
const THEME_MELODY: MusicNote[] = [
	// Measure 1
	{ note: 'E5', dur: 4 },
	{ note: 'B4', dur: 2 },
	{ note: 'C5', dur: 2 },
	{ note: 'D5', dur: 4 },
	{ note: 'C5', dur: 2 },
	{ note: 'B4', dur: 2 },
	// Measure 2
	{ note: 'A4', dur: 4 },
	{ note: 'A4', dur: 2 },
	{ note: 'C5', dur: 2 },
	{ note: 'E5', dur: 4 },
	{ note: 'D5', dur: 2 },
	{ note: 'C5', dur: 2 },
	// Measure 3
	{ note: 'B4', dur: 6 },
	{ note: 'C5', dur: 2 },
	{ note: 'D5', dur: 4 },
	{ note: 'E5', dur: 4 },
	// Measure 4
	{ note: 'C5', dur: 4 },
	{ note: 'A4', dur: 4 },
	{ note: 'A4', dur: 6 },
	{ note: null, dur: 2 },
	// Measure 5
	{ note: 'D5', dur: 6 },
	{ note: 'F5', dur: 2 },
	{ note: 'A5', dur: 4 },
	{ note: 'G5', dur: 2 },
	{ note: 'F5', dur: 2 },
	// Measure 6
	{ note: 'E5', dur: 6 },
	{ note: 'C5', dur: 2 },
	{ note: 'E5', dur: 4 },
	{ note: 'D5', dur: 2 },
	{ note: 'C5', dur: 2 },
	// Measure 7
	{ note: 'B4', dur: 4 },
	{ note: 'B4', dur: 2 },
	{ note: 'C5', dur: 2 },
	{ note: 'D5', dur: 4 },
	{ note: 'E5', dur: 4 },
	// Measure 8
	{ note: 'C5', dur: 4 },
	{ note: 'A4', dur: 4 },
	{ note: 'A4', dur: 6 },
	{ note: null, dur: 2 }
];

const THEME_BASS: MusicNote[] = [
	// Measure 1 (E / B)
	{ note: 'E3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'B3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'E3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'B3', dur: 2 },
	{ note: 'E4', dur: 2 },
	// Measure 2 (A / E)
	{ note: 'A3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'C4', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'A3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'C4', dur: 2 },
	{ note: 'E4', dur: 2 },
	// Measure 3 (G# / E)
	{ note: 'G#3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'B3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'E3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'G#3', dur: 2 },
	{ note: 'E4', dur: 2 },
	// Measure 4 (A / E)
	{ note: 'A3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'C4', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'A3', dur: 4 },
	{ note: null, dur: 4 },
	// Measure 5 (D / A)
	{ note: 'D3', dur: 2 },
	{ note: 'A3', dur: 2 },
	{ note: 'F3', dur: 2 },
	{ note: 'A3', dur: 2 },
	{ note: 'D3', dur: 2 },
	{ note: 'A3', dur: 2 },
	{ note: 'F3', dur: 2 },
	{ note: 'A3', dur: 2 },
	// Measure 6 (C / G)
	{ note: 'C3', dur: 2 },
	{ note: 'G3', dur: 2 },
	{ note: 'E3', dur: 2 },
	{ note: 'G3', dur: 2 },
	{ note: 'C3', dur: 2 },
	{ note: 'G3', dur: 2 },
	{ note: 'E3', dur: 2 },
	{ note: 'G3', dur: 2 },
	// Measure 7 (B / E)
	{ note: 'B3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'G#3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'E3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'G#3', dur: 2 },
	{ note: 'E4', dur: 2 },
	// Measure 8 (A / E)
	{ note: 'A3', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'C4', dur: 2 },
	{ note: 'E4', dur: 2 },
	{ note: 'A3', dur: 4 },
	{ note: null, dur: 4 }
];

export class SoundManager {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private sfxGain: GainNode | null = null;
	private bgmGain: GainNode | null = null;
	private filterNode: BiquadFilterNode | null = null;

	private settings: AudioSettings = {
		masterVolume: 0.7,
		sfxVolume: 0.8,
		bgmVolume: 0.45,
		sfxMuted: false,
		bgmMuted: false
	};

	// Music scheduling state
	private bgmTimer: ReturnType<typeof setInterval> | null = null;
	private bgmRunning = false;
	private nextLeadStep = 0;
	private nextBassStep = 0;
	private nextNoteTime = 0;
	private nextBassTime = 0;
	private leadIndex = 0;
	private bassIndex = 0;

	// Tempo: 146 BPM, sixteenth note duration in seconds
	private readonly tempoBpm = 146;
	private readonly sixteenthSec = 60 / 146 / 4;

	constructor() {
		// Lazily created on user interaction
	}

	private initContext(): AudioContext | null {
		if (this.ctx) return this.ctx;
		if (typeof window === 'undefined') return null;

		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtx) return null;

		try {
			const ctx = new AudioCtx();
			this.ctx = ctx;

			// Lowpass filter for warm retro CRT / Chiptune character
			const filter = ctx.createBiquadFilter();
			filter.type = 'lowpass';
			filter.frequency.value = 7500;
			filter.Q.value = 1.0;
			this.filterNode = filter;

			const master = ctx.createGain();
			this.masterGain = master;

			const sfx = ctx.createGain();
			this.sfxGain = sfx;

			const bgm = ctx.createGain();
			this.bgmGain = bgm;

			sfx.connect(master);
			bgm.connect(master);
			master.connect(filter);
			filter.connect(ctx.destination);

			this.applyVolumes();
			return ctx;
		} catch {
			return null;
		}
	}

	/** Ensure audio context is running (unlocked by user interaction) */
	async resume(): Promise<void> {
		const ctx = this.initContext();
		if (!ctx) return;
		if (ctx.state === 'suspended') {
			try {
				await ctx.resume();
			} catch {
				// handled
			}
		}
	}

	updateSettings(settings: AudioSettings): void {
		this.settings = { ...settings };
		this.applyVolumes();
	}

	private applyVolumes(): void {
		if (!this.ctx || !this.masterGain || !this.sfxGain || !this.bgmGain) return;
		const now = this.ctx.currentTime;
		const master = this.settings.masterVolume;
		const sfx = this.settings.sfxMuted ? 0 : this.settings.sfxVolume * master;
		const bgm = this.settings.bgmMuted ? 0 : this.settings.bgmVolume * master;

		this.masterGain.gain.setTargetAtTime(master, now, 0.05);
		this.sfxGain.gain.setTargetAtTime(sfx, now, 0.05);
		this.bgmGain.gain.setTargetAtTime(bgm, now, 0.05);
	}

	// --------------------------------------------------------------------------
	// SOUND EFFECTS (Procedural Web Audio Chiptune)
	// --------------------------------------------------------------------------

	/** Move piece: very short crisp chirp */
	playMove(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'square';
		osc.frequency.setValueAtTime(320, t);
		osc.frequency.exponentialRampToValueAtTime(480, t + 0.025);

		gain.gain.setValueAtTime(0.08, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.03);
	}

	/** Rotate piece: snappy ascending double tone */
	playRotate(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(360, t);
		osc.frequency.exponentialRampToValueAtTime(720, t + 0.04);

		gain.gain.setValueAtTime(0.14, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.05);
	}

	/** Soft drop: subtle low tick */
	playSoftDrop(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(140, t);
		osc.frequency.exponentialRampToValueAtTime(70, t + 0.02);

		gain.gain.setValueAtTime(0.06, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.025);
	}

	/** Hard drop: percussive punchy thud */
	playHardDrop(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'square';
		osc.frequency.setValueAtTime(240, t);
		osc.frequency.exponentialRampToValueAtTime(50, t + 0.09);

		gain.gain.setValueAtTime(0.2, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.1);
	}

	/** Lock piece: mechanical click */
	playLock(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'square';
		osc.frequency.setValueAtTime(180, t);
		osc.frequency.setValueAtTime(320, t + 0.025);

		gain.gain.setValueAtTime(0.12, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.065);
	}

	/** Hold swap */
	playHold(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(440, t);
		osc.frequency.setValueAtTime(659.25, t + 0.04);

		gain.gain.setValueAtTime(0.15, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.09);
	}

	/** Line clear (1 to 3 lines) */
	playClear(lines: number): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const notes =
			lines === 1
				? [523.25, 659.25] // C5, E5
				: lines === 2
					? [523.25, 659.25, 783.99] // C5, E5, G5
					: [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

		const noteDur = 0.06;
		notes.forEach((freq, i) => {
			const start = t + i * noteDur;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'square';
			osc.frequency.setValueAtTime(freq, start);

			gain.gain.setValueAtTime(0.18, start);
			gain.gain.exponentialRampToValueAtTime(0.001, start + noteDur * 0.95);

			osc.connect(gain);
			gain.connect(this.sfxGain!);

			osc.start(start);
			osc.stop(start + noteDur);
		});
	}

	/** 4 Lines cleared: Tetris fanfare! */
	playTetris(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		// Victorious chord sequence (E5, G#5, B5, E6) + bass accent
		const chord = [329.63, 659.25, 830.61, 987.77, 1318.51];
		chord.forEach((freq, idx) => {
			const start = t + idx * 0.04;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = idx === 0 ? 'triangle' : 'square';
			osc.frequency.setValueAtTime(freq, start);

			gain.gain.setValueAtTime(0.22, start);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

			osc.connect(gain);
			gain.connect(this.sfxGain!);

			osc.start(start);
			osc.stop(start + 0.36);
		});
	}

	/** Level up */
	playLevelUp(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const notes = [440, 554.37, 659.25, 880]; // A major arpeggio
		notes.forEach((freq, idx) => {
			const start = t + idx * 0.07;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'square';
			osc.frequency.setValueAtTime(freq, start);

			gain.gain.setValueAtTime(0.16, start);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

			osc.connect(gain);
			gain.connect(this.sfxGain!);

			osc.start(start);
			osc.stop(start + 0.13);
		});
	}

	/** Game over */
	playGameOver(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const notes = [311.13, 293.66, 277.18, 261.63, 246.94, 220.0]; // Descending slide
		notes.forEach((freq, idx) => {
			const start = t + idx * 0.1;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'sawtooth';
			osc.frequency.setValueAtTime(freq, start);
			osc.frequency.exponentialRampToValueAtTime(freq * 0.9, start + 0.09);

			gain.gain.setValueAtTime(0.18, start);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

			osc.connect(gain);
			gain.connect(this.sfxGain!);

			osc.start(start);
			osc.stop(start + 0.11);
		});
	}

	/** Victory / Marathon finished */
	playVictory(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		// Fanfare
		const melody = [
			{ f: 523.25, d: 0.12 },
			{ f: 659.25, d: 0.12 },
			{ f: 783.99, d: 0.12 },
			{ f: 1046.5, d: 0.35 }
		];
		let curr = t;
		melody.forEach(({ f, d }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'square';
			osc.frequency.setValueAtTime(f, curr);

			gain.gain.setValueAtTime(0.2, curr);
			gain.gain.exponentialRampToValueAtTime(0.001, curr + d * 0.9);

			osc.connect(gain);
			gain.connect(this.sfxGain!);

			osc.start(curr);
			osc.stop(curr + d);
			curr += d;
		});
	}

	/** Countdown beep */
	playCountdown(value: number): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'square';
		const freq = value === 0 ? 880 : 440;
		const dur = value === 0 ? 0.2 : 0.09;

		osc.frequency.setValueAtTime(freq, t);
		gain.gain.setValueAtTime(0.18, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + dur + 0.01);
	}

	/** UI button click */
	playUiClick(): void {
		const ctx = this.initContext();
		if (!ctx || this.settings.sfxMuted || !this.sfxGain) return;
		const t = ctx.currentTime;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(800, t);
		osc.frequency.exponentialRampToValueAtTime(400, t + 0.015);

		gain.gain.setValueAtTime(0.08, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

		osc.connect(gain);
		gain.connect(this.sfxGain);

		osc.start(t);
		osc.stop(t + 0.02);
	}

	// --------------------------------------------------------------------------
	// BGM (Korobeiniki Chiptune Synthesizer)
	// --------------------------------------------------------------------------

	startBgm(): void {
		if (this.bgmRunning) return;
		const ctx = this.initContext();
		if (!ctx) return;

		this.bgmRunning = true;
		this.leadIndex = 0;
		this.bassIndex = 0;
		this.nextNoteTime = ctx.currentTime + 0.05;
		this.nextBassTime = ctx.currentTime + 0.05;

		if (this.bgmTimer) clearInterval(this.bgmTimer);
		this.bgmTimer = setInterval(() => this.scheduleBgm(), 25);
	}

	stopBgm(): void {
		this.bgmRunning = false;
		if (this.bgmTimer) {
			clearInterval(this.bgmTimer);
			this.bgmTimer = null;
		}
	}

	pauseBgm(): void {
		this.stopBgm();
	}

	resumeBgm(): void {
		if (this.settings.bgmMuted) return;
		this.startBgm();
	}

	private scheduleBgm(): void {
		if (!this.bgmRunning || !this.ctx || !this.bgmGain) return;
		const lookAhead = 0.15; // Schedule 150ms ahead

		// Schedule Lead Melody
		while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
			const item = THEME_MELODY[this.leadIndex];
			const durSec = item.dur * this.sixteenthSec;

			if (item.note && !this.settings.bgmMuted) {
				const freq = NOTE_FREQS[item.note];
				if (freq) {
					const osc = this.ctx.createOscillator();
					const gain = this.ctx.createGain();
					osc.type = 'square';
					osc.frequency.setValueAtTime(freq, this.nextNoteTime);

					// Chiptune staccato envelope
					const playDur = durSec * 0.88;
					gain.gain.setValueAtTime(0.09, this.nextNoteTime);
					gain.gain.setTargetAtTime(0.001, this.nextNoteTime + playDur * 0.7, 0.015);

					osc.connect(gain);
					gain.connect(this.bgmGain);

					osc.start(this.nextNoteTime);
					osc.stop(this.nextNoteTime + playDur);
				}
			}

			this.nextNoteTime += durSec;
			this.leadIndex = (this.leadIndex + 1) % THEME_MELODY.length;
		}

		// Schedule Bass
		while (this.nextBassTime < this.ctx.currentTime + lookAhead) {
			const item = THEME_BASS[this.bassIndex];
			const durSec = item.dur * this.sixteenthSec;

			if (item.note && !this.settings.bgmMuted) {
				const freq = NOTE_FREQS[item.note];
				if (freq) {
					const osc = this.ctx.createOscillator();
					const gain = this.ctx.createGain();
					osc.type = 'triangle';
					osc.frequency.setValueAtTime(freq, this.nextBassTime);

					const playDur = durSec * 0.85;
					gain.gain.setValueAtTime(0.14, this.nextBassTime);
					gain.gain.setTargetAtTime(0.001, this.nextBassTime + playDur * 0.7, 0.02);

					osc.connect(gain);
					gain.connect(this.bgmGain);

					osc.start(this.nextBassTime);
					osc.stop(this.nextBassTime + playDur);
				}
			}

			this.nextBassTime += durSec;
			this.bassIndex = (this.bassIndex + 1) % THEME_BASS.length;
		}
	}
}

// Global singleton instance for the browser app
export const soundManager = new SoundManager();
