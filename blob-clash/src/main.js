import * as THREE from 'three';
import { createWorld } from './world.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Haptics, Sound } from './audio.js';

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
  document.getElementById('loading-error').textContent = "Sorry, this device can't run 3D games in the browser.";
  throw error;
}
const sound = new Sound();
const haptics = new Haptics();
const game = new Game({ world, hud: new Hud(), input: new Input(canvas), sound, haptics });
// Audio may only start after a user gesture.
window.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
window.addEventListener('keydown', () => sound.unlock(), { capture: true });
const clock = new THREE.Clock();

let firstFrame = true;
world.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20); // avoid tunnelling after a tab switch
  game.update(dt);
  world.render();
  if (firstFrame) {
    firstFrame = false;
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 500);
  }
});

if (new URLSearchParams(location.search).has('debug')) window.__game = game; // console & test harness access

// Installable / offline (served over HTTPS only, e.g. GitHub Pages).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
