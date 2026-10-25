// Game state machine: ready -> running -> clash -> won | lost.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Blob } from './blob.js';
import { Effects } from './effects.js';
import { generateLevel } from './level.js';
import { buildLevelView, toZ } from './levelView.js';
import {
  applyObstacleHit, applyPickup, circlesOverlap, clashRate, clashResult, clashStep,
  gateColor, massToRadius, obstacleHits, obstacleX,
} from './rules.js';

const SAVE_KEY = 'blob-clash.level';
const labelOffset = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function loadSavedLevel() {
  try {
    return Number(localStorage.getItem(SAVE_KEY)) || 1;
  } catch {
    return 1;
  }
}

function saveLevel(level) {
  try {
    localStorage.setItem(SAVE_KEY, String(level));
  } catch {
    // storage blocked (private mode): progress just isn't remembered
  }
}

export class Game {
  constructor({ world, hud, input }) {
    this.world = world;
    this.hud = hud;
    this.input = input;
    this.effects = new Effects(world.scene);
    this.player = new Blob('blue', massToRadius(CONFIG.player.startMass));
    world.scene.add(this.player.group);
    this.time = 0;
    this.view = null;
    this.loadLevel(loadSavedLevel());
  }

  loadLevel(levelNumber) {
    this.view?.dispose();
    this.effects.clear();
    this.level = generateLevel(levelNumber);
    this.view = buildLevelView(this.world.scene, this.level);

    this.state = 'ready';
    this.mass = CONFIG.player.startMass;
    this.bossMass = this.level.boss.mass;
    this.x = 0;
    this.d = 0;
    this.invulnerable = 0;
    this.nextGate = 0;
    this.remainingPickups = [...this.level.pickups];

    this.player.setColor(this.level.startColor);
    this.player.setRadius(massToRadius(this.mass), { instant: true });
    this.player.group.visible = true;
    this.player.group.position.set(0, this.player.group.position.y, 0);
    this.view.boss.group.visible = true;

    this.hud.setLevel(levelNumber);
    this.hud.showOverlay({
      title: 'Blob Clash',
      body: `Pass through gates to pick your colour, absorb blobs of <b>your</b> colour and dodge the rest.<br>
             Beat the boss of <b>${this.bossMass}</b> at the end!<br><small>Drag or use ← → / A D</small>`,
      button: 'Play',
      onClick: () => { this.state = 'running'; },
    });
  }

  get radius() {
    return massToRadius(this.mass);
  }

  update(dt) {
    this.time += dt;
    if (this.state === 'running') this.updateRunning(dt);
    else if (this.state === 'clash') this.updateClash(dt);

    this.animateScene(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateHud();
  }

  updateRunning(dt) {
    const previousD = this.d;
    const { forwardSpeed } = CONFIG.player;
    const { squeezeFactor } = CONFIG.blob;
    const coreRadius = this.radius * squeezeFactor;
    const halfWidth = CONFIG.track.width / 2 - coreRadius;

    this.d += forwardSpeed * dt;
    this.x = THREE.MathUtils.clamp(this.x + this.input.consumeLateral(dt, CONFIG.player), -halfWidth, halfWidth);
    this.invulnerable -= dt;

    this.checkGates(previousD);
    this.checkPickups();
    this.checkObstacles(coreRadius);

    if (this.mass <= 0) return this.finish('lost');
    const contact = this.level.boss.d - this.radius - massToRadius(this.bossMass);
    if (this.d >= contact) {
      this.d = contact;
      this.state = 'clash';
      this.clashRate = clashRate(this.mass, this.bossMass);
    }
  }

  checkGates(previousD) {
    const gate = this.level.gates[this.nextGate];
    if (!gate || gate.d > this.d || gate.d <= previousD) return;
    this.nextGate += 1;
    const color = gateColor(gate, this.x);
    if (color !== this.player.color) this.effects.burst(this.player.group.position, color, { count: 10, speed: 4 });
    this.player.setColor(color);
  }

  checkPickups() {
    const r = this.radius;
    this.remainingPickups = this.remainingPickups.filter((pickup) => {
      if (pickup.d < this.d - 5) return false; // already behind the player
      if (!circlesOverlap(this.x, this.d, r, pickup.x, pickup.d, massToRadius(pickup.mass))) return true;

      const blob = this.view.pickups.get(pickup.id);
      const before = this.mass;
      this.mass = applyPickup(this.mass, this.player.color, pickup);
      if (this.mass > before) {
        this.effects.absorb(blob.group, this.player.group);
      } else {
        blob.group.visible = false;
        this.effects.burst(blob.group.position, pickup.color, { count: 8, speed: 5 });
      }
      return false;
    });
  }

  checkObstacles(coreRadius) {
    if (this.invulnerable > 0) return;
    const hit = this.view.obstacles.find(({ obstacle }) =>
      Math.abs(obstacle.d - this.d) < 3 && obstacleHits(obstacle, this.time, this.x, this.d, coreRadius));
    if (!hit) return;
    this.mass = applyObstacleHit(this.mass);
    this.invulnerable = CONFIG.player.invulnerableSeconds;
    this.effects.shake = 1;
    this.effects.burst(this.player.group.position, this.player.color, { count: 18, speed: 8 });
  }

  updateClash(dt) {
    ({ playerMass: this.mass, bossMass: this.bossMass } = clashStep(this.mass, this.bossMass, this.clashRate, dt));
    this.effects.shake = Math.max(this.effects.shake, 0.35);
    if (Math.random() < dt * 20) {
      this.effects.burst(this.player.group.position, this.player.color, { count: 2, speed: 6 });
    }
    const result = clashResult(this.mass, this.bossMass);
    if (result) this.finish(result);
  }

  finish(result) {
    const lostInClash = this.state === 'clash';
    this.state = result;
    const levelNumber = this.level.level;
    if (result === 'won') {
      this.view.boss.group.visible = false;
      this.effects.burst(this.view.boss.group.position, 'red', { count: 40, speed: 12, size: 0.4 });
      saveLevel(levelNumber + 1);
      this.hud.showOverlay({
        title: 'You win! 🎉',
        body: `Level ${levelNumber} cleared with <b>${Math.round(this.mass)}</b> mass left.`,
        button: 'Next level',
        onClick: () => this.loadLevel(levelNumber + 1),
      });
      return;
    }
    this.player.group.visible = false;
    this.effects.burst(this.player.group.position, this.player.color, { count: 40, speed: 12, size: 0.4 });
    this.hud.showOverlay({
      title: 'Splat! 💥',
      body: lostInClash
        ? `The boss still had <b>${Math.round(this.bossMass)}</b> mass. Grow bigger before the clash.`
        : 'You lost all your mass.',
      button: 'Try again',
      onClick: () => this.loadLevel(levelNumber),
    });
  }

  animateScene(dt) {
    const running = this.state === 'running' || this.state === 'clash';
    this.player.setRadius(this.radius);
    this.player.group.position.x = this.x;
    this.player.group.position.z = toZ(this.d);
    // Blink while invulnerable after a hit.
    this.player.body.visible = this.invulnerable <= 0 || Math.floor(this.time * 20) % 2 === 0;
    this.player.update(dt, this.time, running ? 1 : 0.5);

    const { boss } = this.view;
    boss.setRadius(massToRadius(this.bossMass));
    boss.update(dt, this.time, this.state === 'clash' ? 2.5 : 1);

    for (const { obstacle, moving } of this.view.obstacles) {
      if (!moving) continue;
      moving.position.x = obstacleX(obstacle, this.time);
      moving.rotation.x -= dt * 12;
    }
    for (const blob of this.view.pickups.values()) blob.update(dt, this.time, 0.6);
  }

  updateCamera(dt) {
    const { camera } = this.world;
    const r = this.player.radius;
    const z = toZ(this.d);
    const shake = this.effects.shake * 0.3;
    // At the finale swing to the side so both the player and the boss stay in view.
    const finale = this.state !== 'ready' && this.state !== 'running' ? 1 : 0;
    cameraTarget.set(
      this.x * 0.5 + finale * (7 + r * 2) + (Math.random() - 0.5) * shake,
      4.5 + r * 2.2 + finale * 2,
      z + 8 + r * 2.8 - finale * 6,
    );
    camera.position.lerp(cameraTarget, Math.min(1, dt * (finale ? 2 : 5)));
    lookTarget.set(this.x * 0.3, r, z - 8 + finale * 4);
    camera.lookAt(lookTarget);
    this.world.followSun(this.player.group.position);
  }

  updateHud() {
    const { camera } = this.world;
    this.hud.setProgress(this.d / this.level.boss.d);
    for (const [label, blob, mass] of [
      [this.hud.playerLabel, this.player, this.mass],
      [this.hud.bossLabel, this.view.boss, this.bossMass],
    ]) {
      labelOffset.copy(blob.group.position).setY(blob.radius * 2 + 0.4);
      this.hud.placeLabel(label, labelOffset, camera, Math.ceil(mass), blob.group.visible);
    }
  }
}
