import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { GameAudio, musicStep, SOUNDS } from '../src/audio.js';

// Just enough of the WebAudio graph to count what gets scheduled.
function fakeContext() {
  const started = [];
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (next) => next, disconnect() {}, gain: param(), frequency: param() });
  return {
    started,
    currentTime: 0,
    destination: node(),
    createGain: node,
    createOscillator: () => ({ ...node(), start: () => started.push(1), stop() {} }),
    resume() {},
    suspend() {},
  };
}

test('without audio support nothing throws', () => {
  for (const createContext of [undefined, () => { throw new Error('no audio'); }]) {
    const audio = new GameAudio({ createContext });
    audio.play('coin'); // before unlock
    audio.unlock();
    audio.play('coin');
    audio.startMusic();
    audio.stopMusic();
  }
});

test('nothing sounds before the first gesture or while muted', () => {
  const ctx = fakeContext();
  const audio = new GameAudio({ createContext: () => ctx });
  audio.play('coin');
  assert.equal(ctx.started.length, 0);
  audio.unlock();
  audio.play('coin');
  assert.equal(ctx.started.length, SOUNDS.coin.length);
  audio.setMuted(true);
  audio.play('coin');
  assert.equal(ctx.started.length, SOUNDS.coin.length);
});

test('muting reports the change and silences vibration', () => {
  const calls = [];
  const buzzes = [];
  const audio = new GameAudio({ onMuteChange: (m) => calls.push(m), vibrate: (p) => buzzes.push(p) });
  audio.vibrate(40);
  audio.toggleMuted();
  audio.vibrate(40);
  assert.deepEqual(calls, [true]);
  assert.deepEqual(buzzes, [40]);
});

test('music loops: the bass lands on the first step of each bar and the tune repeats', () => {
  const { musicScale, musicBass } = CONFIG.audio;
  const bar = musicScale.length;
  assert.equal(musicStep(0).length, 2);
  assert.equal(musicStep(1).length, 1);
  assert.equal(musicStep(bar).find((n) => n.type === 'sine').f, musicBass[1]);
  assert.equal(musicStep(bar * musicBass.length).find((n) => n.type === 'sine').f, musicBass[0]);
});

test('music starts after unlock and stops cleanly', () => {
  const ctx = fakeContext();
  const audio = new GameAudio({ createContext: () => ctx });
  audio.startMusic(); // asked before the first tap: waits for it
  assert.equal(audio.timer, null);
  audio.unlock();
  assert.ok(audio.timer);
  assert.ok(ctx.started.length > 0);
  audio.stopMusic();
  assert.equal(audio.timer, null);
});
