import * as THREE from 'three';
import { createWorld } from './world.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Pause } from './pause.js';
import { SkinShop } from './skinShop.js';

// Canvas textures render text with Fredoka, so wait for the font before building the level.
await document.fonts.load('700 64px Fredoka').catch(() => {});

const canvas = document.getElementById('scene');
const world = createWorld(canvas);
const hud = new Hud();
const input = new Input(canvas);
const game = new Game({ world, hud, input });
const skinShop = new SkinShop({ game, hud, scene: world.scene });
const pause = new Pause({
  canPause: () => hud.canPause(),
  onChange: (paused) => {
    input.setLocked(paused);
    hud.showPause(paused);
  },
});
hud.bindPause({ onPause: () => pause.pause(), onResume: () => pause.resume() });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !e.repeat) pause.toggle();
});
// Losing focus (tab switch, app switch on mobile) pauses so the boss can't land hits unseen. Returning does not auto-resume.
document.addEventListener('visibilitychange', () => { if (document.hidden) pause.pause(); });
window.addEventListener('blur', () => pause.pause());
const clock = new THREE.Clock();

world.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20); // avoid tunnelling after a tab switch
  if (!pause.paused) game.update(dt); // still render while paused so the frozen scene stays on screen
  skinShop.update();
  world.render();
});

window.__game = game;
window.__pause = pause; // handy for debugging from the console
