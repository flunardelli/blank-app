// Procedural sound effects and music with the Web Audio API: no audio files to download.
// Every sound is a tiny recipe of oscillators/noise with envelopes, so it's easy to tune.

const NOTE = (semitones) => 440 * 2 ** (semitones / 12); // semitones from A4

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicEnabled = true;
    this.lastPlayed = new Map();
    this.music = null;
  }

  // Browsers only allow audio after a user gesture: call this from the first tap.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.ctx = new Context();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.gainNode(1, this.master);
    this.musicBus = this.gainNode(0.32, this.master);
    this.noiseBuffer = this.makeNoise();
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? 1 : 0;
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    if (this.musicBus) this.musicBus.gain.value = on ? 0.32 : 0;
  }

  gainNode(value, destination) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(destination);
    return g;
  }

  makeNoise() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // A plucked/blippy tone with a pitch slide and a fast attack/decay envelope.
  tone({ freq, to = freq, type = 'sine', at = 0, dur = 0.12, vol = 0.3, bus = this.sfxBus }) {
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ at = 0, dur = 0.15, vol = 0.25, filter = 1800, type = 'lowpass', sweepTo, bus = this.sfxBus }) {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = type;
    biquad.frequency.setValueAtTime(filter, t);
    if (sweepTo) biquad.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biquad).connect(env).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Plays a named effect. `minGap` throttles spammy sounds (e.g. many blobs popping at once). */
  play(name, { minGap = 0, pitch = 0 } = {}) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (minGap && now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);
    RECIPES[name]?.(this, pitch);
  }

  // Tiny upbeat loop (bass + plucks + hats) scheduled ahead in bars; stops with stopMusic().
  startMusic(tempo = 118) {
    if (!this.ctx || this.music) return;
    const beat = 60 / tempo;
    const bass = [-21, -21, -14, -16]; // A1 A1 E2 D2 (relative to A4)
    const chords = [[0, 4, 7], [0, 4, 7], [-5, -1, 2], [-7, -3, 0]];
    let bar = 0;
    let next = this.ctx.currentTime + 0.1;
    const scheduleBar = () => {
      const root = bar % 4;
      for (let i = 0; i < 8; i++) {
        const at = next - this.ctx.currentTime + i * beat / 2;
        if (i % 2 === 0) this.tone({ freq: NOTE(bass[root]), type: 'triangle', at, dur: beat * 0.45, vol: 0.35, bus: this.musicBus });
        this.noise({ at, dur: 0.04, vol: i % 2 ? 0.05 : 0.025, filter: 7000, type: 'highpass', bus: this.musicBus });
        if (i === 3 || i === 6) {
          chords[root].forEach((n) => this.tone({ freq: NOTE(n + 12), type: 'square', at, dur: beat * 0.3, vol: 0.035, bus: this.musicBus }));
        }
      }
      if (bar % 2 === 1) this.noise({ at: next - this.ctx.currentTime + beat * 2, dur: 0.12, vol: 0.08, filter: 1200, bus: this.musicBus });
      bar += 1;
      next += beat * 4;
    };
    scheduleBar();
    this.music = setInterval(() => {
      while (next - this.ctx.currentTime < beat * 4) scheduleBar();
    }, 250);
  }

  stopMusic() {
    clearInterval(this.music);
    this.music = null;
  }
}

// Sound recipes: (sound, pitch) => schedule oscillators/noise.
const RECIPES = {
  tap: (s) => s.tone({ freq: 900, to: 1200, type: 'square', dur: 0.05, vol: 0.12 }),
  gateGood: (s) => [0, 4, 7, 12].forEach((n, i) => s.tone({ freq: NOTE(n + 3), type: 'triangle', at: i * 0.045, dur: 0.14, vol: 0.22 })),
  gateBad: (s) => s.tone({ freq: 320, to: 120, type: 'sawtooth', dur: 0.28, vol: 0.14 }),
  coin: (s, p) => {
    s.tone({ freq: NOTE(26 + p), type: 'square', dur: 0.06, vol: 0.1 });
    s.tone({ freq: NOTE(31 + p), type: 'square', at: 0.06, dur: 0.12, vol: 0.1 });
  },
  pop: (s) => {
    const f = 500 + Math.random() * 500;
    s.tone({ freq: f, to: f * 0.4, type: 'sine', dur: 0.09, vol: 0.18 });
    s.noise({ dur: 0.06, vol: 0.08, filter: 2500 });
  },
  key: (s) => [12, 16, 19, 24].forEach((n, i) => s.tone({ freq: NOTE(n), type: 'triangle', at: i * 0.07, dur: 0.25, vol: 0.18 })),
  button: (s) => {
    s.tone({ freq: 180, to: 90, type: 'square', dur: 0.1, vol: 0.18 });
    s.noise({ at: 0.05, dur: 0.35, vol: 0.12, filter: 800, sweepTo: 200 });
  },
  clash: (s) => s.noise({ dur: 0.08, vol: 0.12, filter: 1400 }),
  jab: (s) => {
    s.noise({ dur: 0.07, vol: 0.3, filter: 3000, sweepTo: 600 });
    s.tone({ freq: 160, to: 70, type: 'sine', dur: 0.12, vol: 0.35 });
  },
  jumpPunch: (s) => {
    s.noise({ dur: 0.3, vol: 0.18, filter: 600, sweepTo: 4000, type: 'bandpass' });
    s.noise({ at: 0.26, dur: 0.18, vol: 0.4, filter: 2500, sweepTo: 300 });
    s.tone({ freq: 120, to: 40, type: 'sine', at: 0.26, dur: 0.3, vol: 0.5 });
  },
  hurt: (s) => {
    s.tone({ freq: 220, to: 90, type: 'sawtooth', dur: 0.18, vol: 0.16 });
    s.noise({ dur: 0.12, vol: 0.2, filter: 900 });
  },
  windup: (s) => s.tone({ freq: 200, to: 420, type: 'triangle', dur: 0.3, vol: 0.08 }),
  slam: (s) => {
    s.tone({ freq: 90, to: 30, type: 'sine', dur: 0.5, vol: 0.6 });
    s.noise({ dur: 0.45, vol: 0.3, filter: 500, sweepTo: 100 });
  },
  ko: (s) => {
    s.tone({ freq: NOTE(7), type: 'triangle', dur: 0.8, vol: 0.25 });
    s.tone({ freq: NOTE(19), type: 'sine', dur: 1.2, vol: 0.15 });
    s.noise({ at: 0.1, dur: 1.2, vol: 0.12, filter: 1500, type: 'bandpass' }); // crowd cheer swell
  },
  whoosh: (s) => s.noise({ dur: 0.5, vol: 0.18, filter: 400, sweepTo: 3000, type: 'bandpass' }),
  land: (s) => {
    s.tone({ freq: 110, to: 45, type: 'sine', dur: 0.35, vol: 0.5 });
    s.noise({ dur: 0.3, vol: 0.25, filter: 700 });
  },
  win: (s) => [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => s.tone({ freq: NOTE(n + 3), type: 'triangle', at: i * 0.07, dur: 0.3, vol: 0.2 })),
  lose: (s) => [7, 4, 0, -5].forEach((n, i) => s.tone({ freq: NOTE(n), to: NOTE(n - 1), type: 'triangle', at: i * 0.16, dur: 0.3, vol: 0.2 })),
  chest: (s) => {
    s.noise({ dur: 0.2, vol: 0.15, filter: 1200 });
    [12, 16, 19, 24, 28].forEach((n, i) => s.tone({ freq: NOTE(n), type: 'sine', at: 0.12 + i * 0.05, dur: 0.4, vol: 0.15 }));
  },
  buy: (s) => [7, 12, 19].forEach((n, i) => s.tone({ freq: NOTE(n), type: 'square', at: i * 0.05, dur: 0.1, vol: 0.08 })),
};

// Haptics: short vibrations where supported (Android browsers; iOS Safari ignores it).
export class Haptics {
  constructor() {
    this.enabled = true;
  }

  pulse(pattern) {
    if (this.enabled && navigator.vibrate) navigator.vibrate(pattern);
  }
}
