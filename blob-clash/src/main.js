import * as THREE from 'three';
import { createWorld } from './world.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Pause } from './pause.js';
import { SkinShop } from './skinShop.js';
import { GameAudio } from './audio.js';
import { loadMuted, writeMuted } from './save.js';

// Canvas textures render text with Fredoka, so wait for the font before building the level.
await document.fonts.load('700 64px Fredoka').catch(() => {});

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
let world;
try {
  world = createWorld(canvas);
} catch (error) {
  // No WebGL (very old device, or disabled): say so instead of showing a blank screen.
  loading.querySelector('.spinner').remove();
  document.getElementById('loading-error').textContent = 'Este aparelho não consegue rodar jogos 3D no navegador.';
  throw error;
}
const hud = new Hud();
const input = new Input(canvas);
const audio = new GameAudio({
  createContext: () => new (window.AudioContext ?? window.webkitAudioContext)(),
  vibrate: (pattern) => navigator.vibrate?.(pattern),
  muted: loadMuted(),
  onMuteChange: writeMuted,
});
// Browsers keep audio silent until the first gesture.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { once: true });
hud.bindSound({ muted: audio.muted, onToggle: () => { audio.toggleMuted(); return audio.muted; } });
const game = new Game({ world, hud, input, audio });
const skinShop = new SkinShop({ game, hud, scene: world.scene });
const pause = new Pause({
  canPause: () => hud.canPause(),
  onChange: (paused) => {
    input.setLocked(paused);
    audio.setPaused(paused);
    hud.showPause(paused);
  },
});
hud.bindPause({
  onPause: () => pause.pause(),
  onResume: () => pause.resume(),
  onMap: () => { pause.resume(); game.loadLevel(game.level.level); game.openMap(); },
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !e.repeat) pause.toggle();
});
// Losing focus (tab switch, app switch on mobile) pauses so the boss can't land hits unseen. Returning does not auto-resume.
document.addEventListener('visibilitychange', () => { if (document.hidden) pause.pause(); });
window.addEventListener('blur', () => pause.pause());
const clock = new THREE.Clock();

let firstFrame = true;
world.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20); // avoid tunnelling after a tab switch
  if (!pause.paused) game.update(dt); // still render while paused so the frozen scene stays on screen
  skinShop.update();
  world.render();
  if (firstFrame) {
    firstFrame = false;
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 500);
  }
});

// Console and test-harness access only with ?debug, not in the shipped game.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __game: game, __pause: pause });

// Installable and playable offline (needs HTTPS, e.g. GitHub Pages).
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
