// Game state machine: menu -> running <-> skirmish -> boss -> bonus -> complete | lost.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { Effects } from './effects.js';
import { generateLevel } from './level.js';
import { buildLevelView, createPlayerCrowd, toZ } from './levelView.js';
import {
  applyGate, bonusMultiplier, bossFightResult, bossFightStep, bossLaunchRate, chooseGate, clashRate,
  clashStep, crossesObstacle, damageFor, melonX, rewardCoins, startBlobsFor, upgradeCost,
} from './rules.js';
import { loadSave, writeSave } from './save.js';

const UPGRADES = [
  { id: 'damage', title: 'Damage', icon: '🥊' },
  { id: 'blobs', title: 'Blobs', icon: '🫧' },
];

const cameraGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const lookCurrent = new THREE.Vector3();
const bubbleAnchor = new THREE.Vector3();
const bossChest = new THREE.Vector3();

export class Game {
  constructor({ world, hud, input }) {
    this.world = world;
    this.hud = hud;
    this.input = input;
    this.save = loadSave();
    this.effects = new Effects(world.scene);
    this.player = createPlayerCrowd(world.scene);
    this.time = 0;
    this.view = null;
    input.onPress(() => {
      if (this.state === 'menu') this.start();
    });
    this.loadLevel(this.save.level);
  }

  // ---- Level lifecycle ----------------------------------------------------------
  loadLevel(levelNumber) {
    this.view?.dispose();
    this.effects.clear();
    this.hud.clearBubbles();
    this.level = generateLevel(levelNumber);
    this.view = buildLevelView(this.world.scene, this.level);

    this.state = 'menu';
    this.nextGate = 0;
    this.nextEnemy = 0;
    this.remainingCoins = [...this.level.coins];
    this.runCoins = 0;
    this.bossHpShown = this.level.boss.hp;
    this.bossPunch = [0, 0];
    this.fight = null;

    this.player.center = { x: 0, d: 0 };
    this.player.units = [];
    this.player.setCount(startBlobsFor(this.save.upgrades.blobs));
    this.player.mood = 'idle';

    this.playerBubble = this.hud.createBubble('player');
    this.bossBubble = this.hud.createBubble('boss');
    this.view.enemies.forEach((e) => { e.bubble = this.hud.createBubble('enemy'); });

    this.snapCamera = true;
    this.hud.setCoins(this.save.coins);
    this.showMenu();
  }

  showMenu() {
    const { upgrades, coins } = this.save;
    this.hud.showMenu({
      level: this.level.level,
      upgrades: UPGRADES.map((u) => ({
        ...u, level: upgrades[u.id], cost: upgradeCost(upgrades[u.id]), affordable: coins >= upgradeCost(upgrades[u.id]),
      })),
      onBuy: (id) => this.buyUpgrade(id),
    });
  }

  buyUpgrade(id) {
    const cost = upgradeCost(this.save.upgrades[id]);
    if (this.state !== 'menu' || this.save.coins < cost) return;
    this.save.coins -= cost;
    this.save.upgrades[id] += 1;
    writeSave(this.save);
    this.hud.setCoins(this.save.coins);
    if (id === 'blobs') this.player.setCount(startBlobsFor(this.save.upgrades.blobs));
    this.showMenu();
  }

  start() {
    this.state = 'running';
    this.player.mood = 'run';
    this.hud.hideScreens();
  }

  // ---- Frame update -------------------------------------------------------------
  update(dt) {
    this.time += dt;
    if (this.state === 'running') this.updateRunning(dt);
    else if (this.state === 'skirmish') this.updateSkirmish(dt);
    else if (this.state === 'boss') this.updateBoss(dt);

    this.animateScene(dt);
    this.player.update(dt, this.time);
    this.view.enemies.forEach(({ crowd }) => crowd.update(dt, this.time));
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateHud();
  }

  updateRunning(dt) {
    const { player } = this;
    const { forwardSpeed } = CONFIG.crowd;
    const maxX = Math.max(0, CONFIG.track.width / 2 - player.radius);
    player.center.d += forwardSpeed * dt;
    player.center.x = THREE.MathUtils.clamp(player.center.x + this.input.consumeLateral(dt, CONFIG.crowd), -maxX, maxX);

    this.checkGates();
    this.checkCoins();
    this.checkObstacles();
    this.checkEnemies();

    if (player.count <= 0) this.lose();
    else if (player.center.d >= this.level.finishD - 1) this.startBoss();
  }

  checkGates() {
    const gate = this.view.gates[this.nextGate];
    if (!gate || this.player.center.d < gate.pair.d) return;
    this.nextGate += 1;
    const chosen = chooseGate(gate.pair, this.player.center.x);
    const removed = this.player.setCount(applyGate(this.player.count, chosen));
    removed.forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    const panel = gate.panels[chosen === gate.pair.left ? 0 : 1];
    this.effects.tween(0.35, (k) => {
      panel.glass.material.opacity = 0.5 + Math.sin(k * Math.PI) * 0.4;
      panel.label.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.4);
    }, () => { panel.glass.visible = panel.label.visible = false; });
  }

  checkCoins() {
    const { center } = this.player;
    const reach = this.player.radius + 0.6;
    this.remainingCoins = this.remainingCoins.filter((coin) => {
      if (Math.abs(coin.d - center.d) > reach || Math.abs(coin.x - center.x) > reach) return true;
      this.runCoins += CONFIG.coins.value;
      this.hud.setCoins(this.save.coins + this.runCoins);
      const mesh = this.view.coins.get(coin.id);
      const startY = mesh.position.y;
      this.effects.tween(0.3, (k) => {
        mesh.position.y = startY + k * 2.5;
        mesh.scale.setScalar(1 - k);
      }, () => { mesh.visible = false; });
      return false;
    });
  }

  checkObstacles() {
    const { player } = this;
    const near = this.view.obstacles.filter(({ obstacle }) => Math.abs(obstacle.d - player.center.d) < player.radius + 3);
    if (!near.length) return;
    const { unitRadius } = CONFIG.crowd;
    // Each body is tested once, when it crosses the obstacle line. Testing overlap every frame
    // would wipe the crowd: survivors re-pack into the dead bodies' slots, right on the spikes.
    const hits = [];
    player.units.forEach((u, i) => {
      if (near.some(({ obstacle }) => crossesObstacle(obstacle, this.time, u.x, u.prevD, u.d, unitRadius))) hits.push(i);
    });
    if (!hits.length) return;
    player.kill(hits).forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    this.effects.shake = Math.max(this.effects.shake, 0.4);
  }

  checkEnemies() {
    const target = this.view.enemies[this.nextEnemy];
    if (!target) return;
    const { player } = this;
    if (player.center.d + player.radius < target.enemy.d - target.crowd.radius) return;
    this.state = 'skirmish';
    this.skirmish = { target, a: player.count, b: target.crowd.count, rate: clashRate(player.count, target.crowd.count) };
    player.mood = target.crowd.mood = 'fight';
  }

  updateSkirmish(dt) {
    const s = this.skirmish;
    const { player } = this;
    const enemy = s.target.crowd;
    [s.a, s.b] = clashStep(s.a, s.b, s.rate, dt);
    player.setCount(Math.ceil(s.a)).forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    enemy.setCount(Math.ceil(s.b)).forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.enemy.splat));
    // Both crowds lean into each other.
    const gap = enemy.center.d - player.center.d;
    player.center.d += Math.min(gap * 0.5, CONFIG.crowd.forwardSpeed * 0.25 * dt);
    this.effects.shake = Math.max(this.effects.shake, 0.25);

    if (player.count <= 0) return this.lose();
    if (enemy.count <= 0) {
      this.nextEnemy += 1;
      this.state = 'running';
      player.mood = 'run';
    }
  }

  // ---- Boss ---------------------------------------------------------------------
  startBoss() {
    const { player } = this;
    this.state = 'boss';
    player.center.d = this.level.finishD - 1;
    player.mood = 'fight';
    this.fight = {
      count: player.count, hp: this.level.boss.hp, carry: 0,
      damage: damageFor(this.save.upgrades.damage), result: null,
    };
    this.launchRate = bossLaunchRate(player.count);
  }

  updateBoss(dt) {
    const { fight, player } = this;
    if (fight.result) return;
    Object.assign(fight, bossFightStep(fight, this.launchRate, dt));
    if (fight.launched) {
      const bodies = player.take(fight.launched);
      player.setCount(fight.count);
      bodies.forEach((body, i) => this.launchAtBoss(body, i * 0.04));
    }
    fight.result = bossFightResult(fight);
    if (fight.result) {
      this.effects.tween(0.7, () => {}, () => (fight.result === 'won' ? this.startBonus() : this.lose()));
    }
  }

  launchAtBoss(body, delay) {
    const mesh = new THREE.Mesh(this.player.mesh.geometry, this.player.mesh.material);
    mesh.scale.setScalar(0.9);
    mesh.rotation.y = Math.PI;
    const from = new THREE.Vector3(body.x, 0, toZ(body.d));
    bossChest.set((Math.random() - 0.5) * 1.6, 3.2 + Math.random(), toZ(this.level.boss.d) + 1.2);
    const to = bossChest.clone();
    this.effects.root.add(mesh);
    this.effects.tween(0.32 + delay, (k) => {
      const t = Math.max(0, (k * (0.32 + delay) - delay) / 0.32);
      mesh.position.lerpVectors(from, to, t);
      mesh.position.y += Math.sin(t * Math.PI) * 2.2;
      mesh.rotation.x = -t * 1.5;
    }, () => {
      this.effects.root.remove(mesh);
      this.effects.burst(to, PALETTE.player.splat, { count: 8, speed: 7, size: 0.2 });
      this.effects.splat(to.x + (Math.random() - 0.5) * 3, to.z + 1 + Math.random() * 2, PALETTE.player.splat, 1.6, 0.3);
      this.bossHpShown = Math.max(this.fight.hp, this.bossHpShown - this.fight.damage);
      const arm = Math.random() < 0.5 ? 0 : 1;
      this.bossPunch[arm] = 1;
      this.effects.shake = Math.max(this.effects.shake, 0.3);
    });
  }

  startBonus() {
    this.state = 'bonus';
    this.bossHpShown = 0;
    this.player.mood = 'cheer';
    this.multiplier = bonusMultiplier(this.fight.count, this.level.boss.hp);
    const { tiles } = this.view.ladder;
    const tile = tiles.find((t) => t.multiplier === this.multiplier) ?? tiles[tiles.length - 1];
    const boss = this.view.boss.root;
    const from = boss.position.clone();
    const to = new THREE.Vector3(0, 0.25, toZ(this.level.ladderStart + tile.d));
    const height = 3 + (from.z - to.z) * 0.06;
    this.effects.burst(new THREE.Vector3(0, 4, from.z), PALETTE.boss.top, { count: 30, speed: 10, size: 0.3 });
    this.effects.tween(1.4 + (from.z - to.z) * 0.012, (k) => {
      boss.position.lerpVectors(from, to, k);
      boss.position.y += Math.sin(k * Math.PI) * height;
      boss.rotation.x = -k * Math.PI * 3;
    }, () => {
      boss.rotation.x = -Math.PI / 2; // KO: flat on its back
      boss.position.y = 0.6;
      tile.tile.material.color.set(0x7cf05a);
      this.effects.splat(to.x, to.z, PALETTE.boss.top, 7, 0.08);
      this.effects.burst(new THREE.Vector3(to.x, 1, to.z), PALETTE.boss.top, { count: 30, speed: 9, size: 0.3 });
      this.effects.shake = 1;
      this.effects.tween(0.9, () => {}, () => this.complete());
    });
  }

  complete() {
    this.state = 'complete';
    const reward = rewardCoins(this.runCoins, this.level.level, this.multiplier);
    this.save.coins += reward;
    this.save.level = this.level.level + 1;
    writeSave(this.save);
    this.hud.setCoins(this.save.coins);
    this.hud.showComplete({
      level: this.level.level, coins: reward, multiplier: this.multiplier,
      onNext: () => this.loadLevel(this.save.level),
    });
  }

  lose() {
    this.state = 'lost';
    this.player.setCount(0).forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    this.save.coins += this.runCoins;
    writeSave(this.save);
    this.hud.setCoins(this.save.coins);
    this.effects.tween(0.8, () => {}, () => this.hud.showLose({
      coins: this.runCoins, onContinue: () => this.loadLevel(this.level.level),
    }));
  }

  // ---- Presentation -------------------------------------------------------------
  animateScene(dt) {
    for (const { obstacle, object } of this.view.obstacles) {
      if (obstacle.kind !== 'melon') continue;
      object.position.x = melonX(obstacle, this.time);
      object.rotation.z = Math.sign(obstacle.edgeX) * (0.5 + 0.5 * Math.cos(obstacle.speed * this.time + obstacle.phase)) * 0.6;
    }
    for (const mesh of this.view.coins.values()) mesh.rotation.y += dt * 3;

    if (this.state === 'bonus' || this.state === 'complete') return;
    const { body, arms } = this.view.boss;
    const fighting = this.state === 'boss';
    body.scale.y = 1 + Math.sin(this.time * (fighting ? 8 : 3)) * 0.03;
    arms.forEach((arm, i) => {
      this.bossPunch[i] = Math.max(0, this.bossPunch[i] - dt * 4);
      const guard = fighting ? 0.6 + Math.sin(this.time * 6 + i * Math.PI) * 0.15 : 0.25;
      arm.rotation.x = -(guard + this.bossPunch[i] * 1.3);
    });
  }

  cameraFocus() {
    const { center } = this.player;
    const r = this.player.radius;
    switch (this.state) {
      case 'boss':
        return { pos: [0, 9, toZ(this.level.finishD) + 9], look: [0, 2.5, toZ(this.level.boss.d)] };
      case 'bonus':
      case 'complete': {
        const { position } = this.view.boss.root;
        return { pos: [position.x, 17, position.z + 11], look: [position.x, 0, position.z - 4] };
      }
      default:
        return {
          pos: [center.x * 0.5, 7.5 + r * 0.9, toZ(center.d) + 8.5 + r * 0.8],
          look: [center.x * 0.35, 0.6, toZ(center.d) - 7],
        };
    }
  }

  updateCamera(dt) {
    const { camera } = this.world;
    if (this.state !== 'lost') {
      const focus = this.cameraFocus();
      cameraGoal.fromArray(focus.pos);
      lookGoal.fromArray(focus.look);
    }
    const k = this.snapCamera ? 1 : Math.min(1, dt * (this.state === 'bonus' ? 7 : 4));
    this.snapCamera = false;
    camera.position.lerp(cameraGoal, k);
    lookCurrent.lerp(lookGoal, k);
    const shake = this.effects.shake * 0.25;
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.lookAt(lookCurrent);
    this.world.follow(lookCurrent, this.time);
  }

  updateHud() {
    const { camera } = this.world;
    const { player } = this;
    this.hud.setProgress(player.center.d / this.level.finishD);

    bubbleAnchor.set(player.center.x, 2.3, toZ(player.center.d));
    this.hud.placeBubble(this.playerBubble, bubbleAnchor, camera, player.count, player.count > 0 && this.state !== 'complete');

    const inRange = (d) => d - player.center.d < CONFIG.hud.bubbleRange;
    for (const { crowd, bubble } of this.view.enemies) {
      bubbleAnchor.set(crowd.center.x, 2.2, toZ(crowd.center.d));
      this.hud.placeBubble(bubble, bubbleAnchor, camera, crowd.count, crowd.count > 0 && inRange(crowd.center.d));
    }

    bubbleAnchor.set(0, 6.6, toZ(this.level.boss.d));
    const bossAlive = this.state !== 'bonus' && this.state !== 'complete' && inRange(this.level.boss.d);
    this.hud.placeBubble(this.bossBubble, bubbleAnchor, camera, Math.ceil(this.bossHpShown), bossAlive);
  }
}
