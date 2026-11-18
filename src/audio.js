// Synthesized WebAudio: every sound is a few oscillator notes described in data, no files.
// Browsers only allow audio after a user gesture, so nothing is created until unlock(); without support everything is a no-op.
import { CONFIG } from './config.js';

const note = (f, at, d, extra = {}) => ({ f, at, d, type: 'square', gain: 1, ...extra });

export const SOUNDS = {
  goodGate: [note(523, 0, 0.09), note(659, 0.08, 0.09), note(784, 0.16, 0.16)],
  badGate: [note(330, 0, 0.12, { type: 'sawtooth' }), note(220, 0.1, 0.22, { type: 'sawtooth' })],
  coin: [note(988, 0, 0.06), note(1319, 0.06, 0.14)],
  key: [note(784, 0, 0.08), note(988, 0.08, 0.08), note(1175, 0.16, 0.08), note(1568, 0.24, 0.2)],
  punch: [note(180, 0, 0.1, { to: 60, type: 'triangle' })],
  heavy: [note(120, 0, 0.25, { to: 40, type: 'sawtooth', gain: 1.2 }), note(300, 0, 0.06, { to: 80 })],
  ko: [note(440, 0, 0.1), note(330, 0.1, 0.1), note(220, 0.2, 0.1), note(110, 0.3, 0.4, { to: 55, type: 'sawtooth' })],
  win: [note(523, 0, 0.12), note(659, 0.12, 0.12), note(784, 0.24, 0.12), note(1047, 0.36, 0.4)],
  lose: [note(392, 0, 0.2, { type: 'triangle' }), note(330, 0.2, 0.2, { type: 'triangle' }), note(262, 0.4, 0.5, { type: 'triangle' })],
};

/** Notes of music step `n` (steps count up forever; the tune repeats). Bass lands on the first step of each bar. */
export function musicStep(n, { musicScale, musicBass } = CONFIG.audio) {
  const bar = Math.floor(n / musicScale.length);
  const step = n % musicScale.length;
  const lead = [note(musicScale[step], 0, 0.16, { type: 'triangle' })];
  return step === 0 ? [...lead, note(musicBass[bar % musicBass.length], 0, 0.6, { type: 'sine', gain: 1.4 })] : lead;
}

export class GameAudio {
  constructor({ createContext, vibrate = () => {}, muted = false, onMuteChange = () => {} } = {}) {
    this.createContext = createContext;
    this.vibrateFn = vibrate;
    this.muted = muted;
    this.onMuteChange = onMuteChange;
    this.ctx = null;
    this.musicOn = false;
    this.timer = null;
    this.nextStep = 0;
    this.nextTime = 0;
  }

  /** Call from a user gesture. Safe to call again; fails silently when audio is unsupported. */
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = this.createContext?.() ?? null;
        if (this.ctx) {
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : CONFIG.audio.master;
          this.master.connect(this.ctx.destination);
        }
      }
      this.ctx?.resume?.();
    } catch {
      this.ctx = null;
    }
    if (this.ctx && this.musicOn) this.startMusic();
  }

  /** Freezes the clock (and with it the music) while the game is paused. */
  setPaused(paused) {
    try {
      if (paused) this.ctx?.suspend?.();
      else this.ctx?.resume?.();
    } catch {
      // nothing to pause
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : CONFIG.audio.master;
    this.onMuteChange(muted);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  schedule(notes, start, gainScale = 1, destination = this.master) {
    const { ctx } = this;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const t = start + n.at;
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.f, t);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
      amp.gain.setValueAtTime(0.3 * n.gain * gainScale, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + n.d);
      osc.connect(amp).connect(destination);
      osc.start(t);
      osc.stop(t + n.d + 0.02);
    }
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    try {
      this.schedule(SOUNDS[name], this.ctx.currentTime);
    } catch {
      // a failed sound must never break the game
    }
  }

  vibrate(pattern) {
    if (!this.muted) this.vibrateFn(pattern);
  }

  startMusic() {
    this.musicOn = true;
    if (!this.ctx || this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.bus = this.ctx.createGain(); // lets stopMusic cut notes that are already scheduled
    this.bus.connect(this.master);
    const pump = () => {
      const { musicTempo, musicLookahead, musicGain } = CONFIG.audio;
      try {
        while (this.nextTime < this.ctx.currentTime + musicLookahead) {
          this.schedule(musicStep(this.nextStep), this.nextTime, musicGain / 0.3, this.bus);
          this.nextStep += 1;
          this.nextTime += musicTempo;
        }
      } catch {
        this.stopMusic();
      }
    };
    pump();
    this.timer = setInterval(pump, CONFIG.audio.musicTick);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
    this.timer = null;
    try {
      this.bus?.disconnect();
    } catch {
      // already gone
    }
    this.bus = null;
  }
}
