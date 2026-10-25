// Game state machine: menu -> running <-> skirmish -> merge -> boxing -> bonus -> complete | lost.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { Effects } from './effects.js';
import { generateLevel } from './level.js';
import { buildLevelView, createPlayerChampion, createPlayerCrowd, toZ } from './levelView.js';
import { bossForLevel } from './bosses.js';
import {
  applyGate, bonusMultiplier, bossPunchDamage, championStats, chestReward, chooseGate, clashRate, clashStep,
  comboStep, crossesObstacle, pressesButton, rewardCoins, sliderX, startBlobsFor, upgradeCost,
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

export class Game {
  constructor({ world, hud, input }) {
    this.world = world;
    this.hud = hud;
    this.input = input;
    this.save = loadSave();
    this.effects = new Effects(world.scene);
    this.player = createPlayerCrowd(world.scene);
    this.champion = createPlayerChampion();
    world.scene.add(this.champion.root);
    this.time = 0;
    this.view = null;
    input.onPress(() => {
      if (this.state === 'menu') this.start();
      else if (this.state === 'boxing') this.championPunch();
    });
    this.loadLevel(this.save.level);
  }

  // ---- Level lifecycle ----------------------------------------------------------
  loadLevel(levelNumber) {
    this.view?.dispose();
    this.effects.clear();
    this.hud.clearBubbles();
    this.hud.showFight(false);
    this.level = generateLevel(levelNumber);
    this.boss = bossForLevel(levelNumber);
    this.view = buildLevelView(this.world.scene, this.level);

    this.state = 'menu';
    this.nextGate = 0;
    this.nextEnemy = 0;
    this.remainingCoins = [...this.level.coins];
    this.runCoins = 0;
    this.keyTaken = false;
    this.fight = null;

    this.player.center = { x: 0, d: 0 };
    this.player.units = [];
    this.player.setCount(startBlobsFor(this.save.upgrades.blobs));
    this.player.mood = 'idle';
    this.champion.root.visible = false;

    this.playerBubble = this.hud.createBubble('player');
    this.bossBubble = this.hud.createBubble('boss');
    this.view.enemies.forEach((e) => { e.bubble = this.hud.createBubble('enemy'); });

    this.snapCamera = true;
    this.hud.setCoins(this.save.coins);
    this.hud.setLevel(levelNumber);
    this.hud.setKeys(this.save.keys);
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
    else if (this.state === 'boxing') this.updateBoxing(dt);

    this.animateScene(dt);
    this.player.update(dt, this.time);
    this.view.enemies.forEach(({ crowd }) => crowd.update(dt, this.time));
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateHud();
  }

  updateRunning(dt) {
    const { player } = this;
    const maxX = Math.max(0, CONFIG.track.width / 2 - player.radius);
    player.center.d += CONFIG.crowd.forwardSpeed * dt;
    player.center.x = THREE.MathUtils.clamp(player.center.x + this.input.consumeLateral(dt, CONFIG.crowd), -maxX, maxX);

    this.checkGates();
    this.checkPickups();
    this.checkButtons();
    this.checkObstacles();
    this.checkEnemies();

    if (player.count <= 0) this.lose();
    else if (player.center.d >= this.level.finishD - 1) this.startMerge();
  }

  checkGates() {
    const gate = this.view.gates[this.nextGate];
    if (!gate || this.player.center.d < gate.pair.d) return;
    this.nextGate += 1;
    const chosen = chooseGate(gate.pair, this.player.center.x);
    const before = this.player.count;
    const removed = this.player.setCount(applyGate(before, chosen));
    if (this.player.count > before) {
      this.effects.emojis(new THREE.Vector3(this.player.center.x, 3, toZ(this.player.center.d)), 3);
    }
    removed.forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    const panel = gate.panels[chosen === gate.pair.left ? 0 : 1];
    this.effects.tween(0.35, (k) => {
      panel.glass.material.opacity = 0.5 + Math.sin(k * Math.PI) * 0.4;
      panel.label.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.4);
    }, () => { panel.glass.visible = panel.label.visible = false; });
  }

  // Coins and the key are collected by any part of the crowd's footprint.
  inReach(x, d, margin = 0.6) {
    const { center } = this.player;
    const reach = this.player.radius + margin;
    return Math.abs(d - center.d) <= reach && Math.abs(x - center.x) <= reach;
  }

  collectAnimation(mesh) {
    const startY = mesh.position.y;
    this.effects.tween(0.3, (k) => {
      mesh.position.y = startY + k * 2.5;
      mesh.scale.setScalar(1 - k);
    }, () => { mesh.visible = false; });
  }

  checkPickups() {
    this.remainingCoins = this.remainingCoins.filter((coin) => {
      if (!this.inReach(coin.x, coin.d)) return true;
      this.runCoins += CONFIG.coins.value;
      this.hud.setCoins(this.save.coins + this.runCoins);
      this.collectAnimation(this.view.coins.get(coin.id));
      return false;
    });
    const { key } = this.level;
    if (!this.keyTaken && this.inReach(key.x, key.d)) {
      this.keyTaken = true;
      this.collectAnimation(this.view.key);
      this.hud.setKeys(Math.min(CONFIG.keys.perChest, this.save.keys + 1));
    }
  }

  // Any blob touching a trap's button retracts that trap's spikes.
  checkButtons() {
    const { unitRadius } = CONFIG.crowd;
    for (const trap of this.view.obstacles) {
      if (!trap.armed) continue;
      const { button } = trap.obstacle;
      if (Math.abs(button.d - this.player.center.d) > this.player.radius + 2) continue;
      if (!this.player.units.some((u) => pressesButton(button, u.x, u.d, unitRadius))) continue;
      trap.armed = false;
      trap.button.cap.position.y = 0.12;
      trap.button.cap.material = trap.button.cap.material.clone();
      trap.button.cap.material.color.set(0x8a8a9a);
      trap.button.cap.material.emissiveIntensity = 0;
      this.effects.tween(0.4, (k) => { trap.field.spikes.position.y = -1.1 * k; });
    }
  }

  checkObstacles() {
    const { player } = this;
    const near = this.view.obstacles.filter(({ obstacle, armed }) =>
      armed !== false && Math.abs(obstacle.d - player.center.d) < player.radius + 3);
    if (!near.length) return;
    const { unitRadius } = CONFIG.crowd;
    // Each body is tested once, when it crosses the obstacle line. Testing overlap every frame
    // would wipe the crowd: survivors re-pack into the dead bodies' slots, right on the spikes.
    const hits = [];
    player.units.forEach((u, i) => {
      if (near.some(({ obstacle }) => crossesObstacle(obstacle, this.time, u.x, u.prevD, u.d, unitRadius))) hits.push(i);
    });
    if (!hits.length) return;
    // Bodies we don't draw (count > maxVisible) die with the same share as the visible ones.
    const hidden = player.count - player.units.length;
    const hiddenLosses = Math.round(hidden * (hits.length / player.units.length));
    player.kill(hits).forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    player.setCount(player.count - hiddenLosses);
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

  // ---- Boss: the crowd merges into one champion, then it's a tapping boxing match ----
  championSpot() {
    return new THREE.Vector3(0, 0.25, toZ(this.level.boss.d - 5.2));
  }

  bossChest() {
    return new THREE.Vector3(0, 3.4, toZ(this.level.boss.d) + 1.2);
  }

  startMerge() {
    const { player, champion } = this;
    this.state = 'merge';
    const stats = championStats(player.count, this.save.upgrades.damage);
    this.fight = {
      ...stats, maxHp: stats.hp, bossHp: this.level.boss.hp, bossMaxHp: this.level.boss.hp,
      bossTimer: this.boss.attack.interval + 0.8, combo: 0, lastTap: -10, jumping: false,
      flinch: 0, bossFlinch: 0, slam: 0, nextGlove: 0, nextBossArm: 0,
    };
    const spot = this.championSpot();
    this.championScale = 1.2 + Math.min(1.6, Math.cbrt(player.count) * 0.3);
    champion.root.position.copy(spot);
    champion.root.rotation.y = Math.PI;
    champion.root.scale.setScalar(0.01);
    champion.root.visible = true;
    this.hud.showBanner(`VS ${this.boss.name}`);

    const bodies = player.take(player.units.length);
    player.setCount(0);
    bodies.forEach((body, i) => this.flyInto(body, spot, i * 0.012));
    this.effects.tween(0.9, (k) => champion.root.scale.setScalar(Math.max(0.01, this.championScale * k)), () => {
      this.state = 'boxing';
      this.hud.showFight(true, this.boss.colors.top);
      this.jumpPunch(CONFIG.boxing.openingMultiplier); // the fight opens with a flying punch
    });
  }

  flyInto(body, target, delay) {
    const mesh = new THREE.Mesh(this.player.mesh.geometry, this.player.mesh.material);
    mesh.scale.setScalar(0.9);
    mesh.rotation.y = Math.PI;
    const from = new THREE.Vector3(body.x, 0, toZ(body.d));
    const to = target.clone().setY(1.2);
    const flight = 0.4;
    this.effects.root.add(mesh);
    this.effects.tween(flight + delay, (k) => {
      const t = Math.max(0, (k * (flight + delay) - delay) / flight);
      mesh.position.lerpVectors(from, to, t);
      mesh.position.y += Math.sin(t * Math.PI) * 2;
      mesh.scale.setScalar(0.9 * (1 - t * 0.6));
    }, () => this.effects.root.remove(mesh));
  }

  // ---- Player moves ----
  championPunch() {
    const f = this.fight;
    if (this.time - f.lastTap < CONFIG.boxing.tapCooldown) return;
    const step = comboStep(f, this.time);
    Object.assign(f, { combo: step.combo, lastTap: step.lastTap });
    if (step.finisher && !f.jumping) return this.jumpPunch(step.multiplier);
    const glove = this.champion.gloves[f.nextGlove];
    f.nextGlove = 1 - f.nextGlove;
    glove.userData.punch = 1;
    this.hitBoss(f.punch * step.multiplier, { stars: 2, scale: 0.7 });
  }

  // Flying "superman" punch: leap at the boss with both gloves forward, land back in place.
  jumpPunch(multiplier) {
    const f = this.fight;
    const { root, body, gloves } = this.champion;
    const spot = this.championSpot();
    f.jumping = true;
    this.hud.popText('JUMP PUNCH!');
    let landed = false;
    this.effects.tween(0.55, (k) => {
      const out = Math.sin(Math.min(k / 0.5, 1) * Math.PI / 2) * (1 - Math.max(0, k - 0.5) * 2);
      root.position.set(spot.x, spot.y + Math.sin(k * Math.PI) * 2.6, spot.z - out * 3.2);
      body.rotation.x = out * 1.2; // dive forward, body almost horizontal
      gloves.forEach((g) => { g.userData.punch = out; });
      if (!landed && k >= 0.45) {
        landed = true;
        this.hitBoss(f.punch * multiplier, { stars: 7, scale: 1.4 });
        this.effects.shake = 0.8;
      }
    }, () => {
      root.position.copy(spot);
      body.rotation.x = 0;
      f.jumping = false;
      this.effects.dustRing(spot.clone().setY(0.4), 1.2);
    });
  }

  hitBoss(damage, impact) {
    const f = this.fight;
    if (this.state !== 'boxing') return;
    f.bossHp = Math.max(0, f.bossHp - damage);
    f.bossFlinch = 1;
    const at = this.bossChest().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5), 0));
    this.effects.impact(at, impact);
    this.effects.burst(at, this.boss.colors.top, { count: 5, speed: 6, size: 0.18 });
    this.effects.shake = Math.max(this.effects.shake, 0.15);
    if (f.bossHp <= 0) this.knockOut();
  }

  // ---- Boss moves (data-driven by bosses.js) ----
  updateBoxing(dt) {
    const f = this.fight;
    const { attack } = this.boss;
    f.bossTimer -= dt;
    if (f.bossTimer > 0) return;
    f.bossTimer = attack.interval;
    const damage = bossPunchDamage(f.maxHp, attack);
    if (attack.move === 'slam') return this.bossSlam(damage);
    const gap = attack.move === 'flurry' ? 0.15 : 0.22;
    for (let i = 0; i < attack.strikes; i++) {
      this.effects.tween(i * gap, () => {}, () => this.bossStrike(damage, attack.move === 'heavy' ? 1.6 : 1));
    }
  }

  // Wind-up progress 0 -> 1 during the last `windup` seconds before an attack lands.
  windup() {
    const f = this.fight;
    if (this.state !== 'boxing' || !f) return 0;
    return THREE.MathUtils.clamp(1 - f.bossTimer / this.boss.attack.windup, 0, 1);
  }

  bossStrike(damage, weight = 1) {
    const f = this.fight;
    if (this.state !== 'boxing') return;
    const arm = this.view.boss.arms[f.nextBossArm];
    f.nextBossArm = 1 - f.nextBossArm;
    arm.userData.strike = 1;
    f.hp = Math.max(0, f.hp - damage);
    f.flinch = 1;
    const at = this.champion.root.position.clone().setY(1.6 * this.championScale / 2 + 0.6);
    this.effects.impact(at, { stars: Math.round(3 * weight), scale: 0.8 * weight });
    this.effects.burst(at, PALETTE.player.splat, { count: Math.round(8 * weight), speed: 7, size: 0.2 });
    this.effects.splat(at.x + (Math.random() - 0.5) * 2, at.z + (Math.random() - 0.5) * 2, PALETTE.player.splat, 1.4, 0.3);
    this.effects.shake = 0.4 * weight;
    if (f.hp <= 0) this.championDown();
  }

  // Viking special: hop and smash the ring; the shockwave hits the champion.
  bossSlam(damage) {
    const boss = this.view.boss.root;
    const baseY = boss.position.y;
    this.effects.tween(0.45, (k) => { boss.position.y = baseY + Math.sin(k * Math.PI) * 2.2; }, () => {
      boss.position.y = baseY;
      this.effects.dustRing(boss.position.clone().setY(0.5), 3);
      this.effects.shake = 1;
      this.bossStrike(damage, 1.4);
    });
  }

  knockOut() {
    this.hud.showFight(false);
    this.hud.popText('K.O.!');
    this.startBonus(this.fight.hp / this.fight.maxHp);
  }

  championDown() {
    this.hud.showFight(false);
    const { position } = this.champion.root;
    this.champion.root.visible = false;
    this.effects.burst(position.clone().setY(1.5), PALETTE.player.splat, { count: 40, speed: 10, size: 0.3 });
    this.effects.splat(position.x, position.z, PALETTE.player.splat, 5, 0.3);
    this.lose();
  }

  startBonus(healthFraction) {
    this.state = 'bonus';
    this.multiplier = bonusMultiplier(healthFraction);
    const { tiles } = this.view.ladder;
    const tile = tiles.find((t) => t.multiplier === this.multiplier) ?? tiles[tiles.length - 1];
    const boss = this.view.boss.root;
    const from = boss.position.clone();
    const to = new THREE.Vector3(0, 0.25, toZ(this.level.ladderStart + tile.d));
    const height = 3 + (from.z - to.z) * 0.06;
    this.champion.gloves[0].userData.punch = this.champion.gloves[1].userData.punch = 1;
    this.effects.burst(new THREE.Vector3(0, 4, from.z), this.boss.colors.top, { count: 30, speed: 10, size: 0.3 });
    this.effects.shake = 1;
    this.effects.tween(1.4 + (from.z - to.z) * 0.012, (k) => {
      boss.position.lerpVectors(from, to, k);
      boss.position.y += Math.sin(k * Math.PI) * height;
      boss.rotation.x = -k * Math.PI * 3;
    }, () => {
      boss.rotation.x = -Math.PI / 2; // KO: flat on its back
      boss.position.y = 0.6;
      tile.tile.material.color.set(0x7cf05a);
      this.effects.splat(to.x, to.z, this.boss.colors.top, 7, 0.08);
      this.effects.burst(new THREE.Vector3(to.x, 1, to.z), this.boss.colors.top, { count: 30, speed: 9, size: 0.3 });
      this.effects.shake = 1;
      this.effects.tween(0.9, () => {}, () => this.complete());
    });
  }

  complete() {
    this.state = 'complete';
    const reward = rewardCoins(this.runCoins, this.level.level, this.multiplier);
    let chest = 0;
    if (this.keyTaken) this.save.keys += 1;
    if (this.save.keys >= CONFIG.keys.perChest) {
      chest = chestReward(this.level.level);
      this.save.keys = 0;
    }
    this.save.coins += reward + chest;
    this.save.level = this.level.level + 1;
    writeSave(this.save);
    this.hud.setCoins(this.save.coins);
    this.hud.setKeys(this.save.keys);
    this.hud.showComplete({
      level: this.level.level, coins: reward, multiplier: this.multiplier, chest,
      onNext: () => this.loadLevel(this.save.level),
    });
  }

  lose() {
    this.state = 'lost';
    this.player.setCount(0).forEach(({ x, d }) => this.effects.pop(x, toZ(d), PALETTE.player.splat));
    this.save.coins += this.runCoins; // keys only count on a win
    writeSave(this.save);
    this.hud.setCoins(this.save.coins);
    this.hud.setKeys(this.save.keys);
    this.effects.tween(0.8, () => {}, () => this.hud.showLose({
      coins: this.runCoins, onContinue: () => this.loadLevel(this.level.level),
    }));
  }

  // ---- Presentation -------------------------------------------------------------
  animateScene(dt) {
    for (const { obstacle, object, springGlove } of this.view.obstacles) {
      if (obstacle.kind !== 'slider') continue;
      const x = sliderX(obstacle, this.time);
      const inset = Math.abs(x - obstacle.edgeX);
      if (springGlove) {
        springGlove.fist.position.x = x - obstacle.edgeX;
        springGlove.spring.scale.x = Math.max(0.05, inset - 0.3);
      } else {
        object.position.x = x;
        object.rotation.z = Math.sign(obstacle.edgeX) * (inset / obstacle.reach) * 0.6;
      }
    }
    for (const mesh of this.view.coins.values()) mesh.rotation.y += dt * 3;
    this.view.key.rotation.y += dt * 2;
    this.animateBoxers(dt);
  }

  animateBoxers(dt) {
    if (this.state === 'bonus' || this.state === 'complete') {
      this.animateGloves(dt);
      return;
    }
    const { body, arms } = this.view.boss;
    const f = this.fight;
    const boxing = this.state === 'boxing';
    const windup = this.windup();
    const { move } = this.boss.attack;
    if (f) f.bossFlinch = Math.max(0, f.bossFlinch - dt * 6);
    // Slam crouches before jumping; everyone else pulls their arms back.
    const crouch = move === 'slam' ? windup * 0.18 : 0;
    const base = body.userData.baseScale ??= body.scale.clone();
    body.scale.set(base.x * (1 + crouch * 0.5), base.y * (1 - crouch + Math.sin(this.time * (boxing ? 8 : 3)) * 0.03), base.z);
    body.rotation.x = f ? -f.bossFlinch * 0.18 + (move === 'heavy' ? -windup * 0.2 : 0) : 0;
    arms.forEach((arm, i) => {
      arm.userData.strike = Math.max(0, (arm.userData.strike ?? 0) - dt * 4);
      const guard = boxing ? 0.7 + Math.sin(this.time * 6 + i * Math.PI) * 0.12 : 0.25;
      const pull = move === 'slam' ? -windup * 1.2 : windup * 0.7;
      arm.rotation.x = -(guard - pull + arm.userData.strike * 1.6);
    });
    this.animateGloves(dt);
  }

  animateGloves(dt) {
    const f = this.fight;
    if (!this.champion.root.visible || !f) return;
    f.flinch = Math.max(0, f.flinch - dt * 4);
    if (!f.jumping) this.champion.body.rotation.x = -f.flinch * 0.3; // knocked back
    this.champion.gloves.forEach((glove, i) => {
      if (!f.jumping) glove.userData.punch = Math.max(0, (glove.userData.punch ?? 0) - dt * 7);
      glove.position.copy(glove.userData.rest);
      glove.position.z += glove.userData.punch * 0.9;
      glove.position.y += Math.sin(this.time * 7 + i * Math.PI) * 0.05;
    });
  }

  cameraFocus() {
    const { center } = this.player;
    const r = this.player.radius;
    switch (this.state) {
      case 'merge':
      case 'boxing':
      case 'lost': {
        if (!this.fight) break;
        // Side-on ring view like the reference: champion left, boss right.
        const mid = toZ(this.level.boss.d - 2.6);
        return { pos: [13, 6.5, mid + 5], look: [0, 2.8, mid - 0.5] };
      }
      case 'bonus':
      case 'complete': {
        const { position } = this.view.boss.root;
        return { pos: [position.x, 17, position.z + 11], look: [position.x, 0, position.z - 4] };
      }
      default:
        break;
    }
    return {
      pos: [center.x * 0.5, 7.5 + r * 0.9, toZ(center.d) + 8.5 + r * 0.8],
      look: [center.x * 0.35, 0.6, toZ(center.d) - 7],
    };
  }

  updateCamera(dt) {
    const { camera } = this.world;
    if (this.state !== 'lost' || this.fight) {
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
    const { player, fight } = this;
    this.hud.setProgress(player.center.d / this.level.finishD);
    if (fight) this.hud.setFight(fight.hp / fight.maxHp, fight.bossHp / fight.bossMaxHp);

    bubbleAnchor.set(player.center.x, 2.3, toZ(player.center.d));
    this.hud.placeBubble(this.playerBubble, bubbleAnchor, camera, player.count, player.count > 0);

    const inRange = (d) => d - player.center.d < CONFIG.hud.bubbleRange;
    for (const { crowd, bubble } of this.view.enemies) {
      bubbleAnchor.set(crowd.center.x, 2.2, toZ(crowd.center.d));
      this.hud.placeBubble(bubble, bubbleAnchor, camera, crowd.count, crowd.count > 0 && inRange(crowd.center.d));
    }

    bubbleAnchor.set(0, 6.6, toZ(this.level.boss.d));
    const showBossHp = this.state === 'running' || this.state === 'skirmish';
    this.hud.placeBubble(this.bossBubble, bubbleAnchor, camera, this.level.boss.hp, showBossHp && inRange(this.level.boss.d));
  }
}
