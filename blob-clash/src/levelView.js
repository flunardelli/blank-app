// Turns level data (level.js) into three.js objects. Distance d along the track maps to z = -d.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import {
  createBoss, createCoin, createFinishLine, createGate, createLadder, createMelon, createRing,
  createSpikePad, createTrack, gummyMaterial, humanoidGeometry,
} from './art/models.js';
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
    if (obstacle.kind === 'melon') {
      return { obstacle, object: place(createMelon(obstacle.radius), obstacle.d) };
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

  place(createFinishLine(), level.finishD);
  place(createRing(CONFIG.boss.ringDepth), level.finishD + 0.6);
  const boss = createBoss();
  place(boss.root, level.boss.d);
  boss.root.position.y = 0.25;
  place(ladder.group, level.ladderStart);

  return {
    root,
    gates,
    obstacles,
    coins,
    enemies,
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
