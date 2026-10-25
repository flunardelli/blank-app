// Turns level data (level.js) into three.js objects. Distance d along the track maps to z = -d.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import {
  createButton, createCoin, createFinishLine, createGate, createKey, createLadder,
  createMelon, createPillar, createRing, createSpikeField, createSpikePad, createSpringGlove, createTrack,
  gummyMaterial, humanoidGeometry,
} from './art/models.js';
import { createBoss, createChampion } from './art/boxer.js';
import { bossForLevel } from './bosses.js';
import { Crowd } from './crowd.js';

export const toZ = (d) => -d;

// Geometries/materials shared by every level.
const shared = {
  playerGeometry: humanoidGeometry(PALETTE.player),
  enemyGeometry: humanoidGeometry(PALETTE.enemy),
  playerMaterial: gummyMaterial({ emissive: 0x3a0c00 }),
  enemyMaterial: gummyMaterial({ opacity: 0.82, emissive: 0x200006 }),
};

export function createPlayerCrowd(scene) {
  return new Crowd(scene, shared.playerGeometry, shared.playerMaterial, {
    maxVisible: CONFIG.crowd.maxVisible, facing: Math.PI,
  });
}

export function createPlayerChampion() {
  return createChampion(shared.playerMaterial, PALETTE.player);
}

function buildSlider(obstacle) {
  if (obstacle.skin === 'melon') return { object: createMelon(obstacle.radius) };
  const side = Math.sign(obstacle.edgeX);
  const holder = new THREE.Group();
  const pillar = createPillar();
  pillar.position.x = side * 0.8; // just outside the rail
  const springGlove = createSpringGlove(obstacle.radius * 0.45, side);
  springGlove.spring.rotation.y = side > 0 ? Math.PI : 0; // spring grows from the pillar inwards
  holder.add(pillar, springGlove.group);
  return { object: holder, springGlove };
}

export function buildLevelView(scene, level) {
  const root = new THREE.Group();
  scene.add(root);
  const place = (object, d, x = 0) => {
    object.position.x = x;
    object.position.z = toZ(d);
    root.add(object);
    return object;
  };

  const ladder = createLadder();
  const trackEnd = level.ladderStart + ladder.length + 6;
  root.add(createTrack(-12, trackEnd));

  const gates = level.gates.map((pair) => {
    const gate = createGate(pair);
    place(gate.group, pair.d);
    return { pair, ...gate };
  });

  const obstacles = level.obstacles.map((obstacle) => {
    if (obstacle.kind === 'slider') {
      const view = buildSlider(obstacle);
      place(view.object, obstacle.d, obstacle.skin === 'glove' ? obstacle.edgeX : 0);
      return { obstacle, ...view };
    }
    if (obstacle.kind === 'trap') {
      const field = createSpikeField(obstacle.halfDepth);
      const button = createButton(obstacle.button.radius);
      place(field.group, obstacle.d);
      place(button.group, obstacle.button.d, obstacle.button.x);
      return { obstacle, object: field.group, field, button, armed: true };
    }
    const group = new THREE.Group();
    obstacle.pads.forEach((pad) => {
      const mesh = createSpikePad(pad.halfWidth, pad.halfDepth);
      mesh.position.x = pad.x;
      group.add(mesh);
    });
    return { obstacle, object: place(group, obstacle.d) };
  });

  const coins = new Map(level.coins.map((coin) => {
    const mesh = place(createCoin(), coin.d, coin.x);
    mesh.position.y = 0.8;
    return [coin.id, mesh];
  }));

  const enemies = level.enemies.map((enemy) => {
    const crowd = new Crowd(root, shared.enemyGeometry, shared.enemyMaterial, {
      maxVisible: CONFIG.enemy.maxVisible, facing: 0,
    });
    crowd.center = { x: 0, d: enemy.d };
    crowd.setCount(enemy.count);
    crowd.units.forEach((u) => { u.grow = 1; });
    return { enemy, crowd };
  });

  const key = place(createKey(), level.key.d, level.key.x);
  key.position.y = 1.2;

  place(createFinishLine(), level.finishD);
  place(createRing(CONFIG.boss.ringDepth), level.finishD + 0.6);
  const boss = createBoss(bossForLevel(level.level));
  boss.anchor.set(0, 0.25, toZ(level.boss.d));
  root.add(boss.root);
  place(ladder.group, level.ladderStart);

  return {
    root,
    gates,
    obstacles,
    coins,
    enemies,
    key,
    boss,
    ladder,
    dispose() {
      enemies.forEach(({ crowd }) => crowd.mesh.dispose());
      scene.remove(root);
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
      });
    },
  };
}
