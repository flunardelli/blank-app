import * as THREE from 'three';
import { createWorld } from './world.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';

// Canvas textures render text with Fredoka, so wait for the font before building the level.
await document.fonts.load('700 64px Fredoka').catch(() => {});

const canvas = document.getElementById('scene');
const world = createWorld(canvas);
const game = new Game({ world, hud: new Hud(), input: new Input(canvas) });
const clock = new THREE.Clock();

world.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20); // avoid tunnelling after a tab switch
  game.update(dt);
  world.render();
});

window.__game = game; // handy for debugging from the console
