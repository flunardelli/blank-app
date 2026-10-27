// Turns level data (level.js) into three.js objects. Distance d along the track maps to z = -d.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import {
  createButton, createCoin, createFinishLine, createGate, createKey, createLadder,
  createMelon, createPillar, createRing, createSpikeField, createSpikePad, createSpringGlove, createTrack,
  gummyMaterial, humanoidGeometry,
} from './art/models.js';
import { createBoss, createChampion } from './art/boxer.js';
import { createAxe, createBomb, createRamp, createSaw, createSawRail } from './art/hazards.js';
import { bossForLevel } from './bosses.js';
import { makeJelly, withJellyPhases } from './art/jelly.js';
import { Crowd } from './crowd.js';
import { axeAngle, sliderX, sweepX } from './rules.js';

export const toZ = (d) => -d;

// Geometries/materials shared by every level.
const shared = {
  playerGeometry: withJellyPhases(humanoidGeometry(PALETTE.player), CONFIG.crowd.maxVisible),
  enemyGeometry: withJellyPhases(humanoidGeometry(PALETTE.enemy), CONFIG.enemy.maxVisible),
  playerMaterial: makeJelly(gummyMaterial({ emissive: 0x3a0c00 })),
  enemyMaterial: makeJelly(gummyMaterial({ opacity: 0.82, emissive: 0x200006 }), { angry: true }),
  walkerGeometry: humanoidGeometry(PALETTE.walker),
  walkerMaterial: gummyMaterial({ opacity: 0.85, emissive: 0x101018 }),
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

// Sliders either push a spring glove's fist out of its pillar or slide a melon in and out.
function sliderUpdater(obstacle, { object, springGlove }) {
  return (time) => {
    const x = sliderX(obstacle, time);
    const inset = Math.abs(x - obstacle.edgeX);
    if (springGlove) {
      springGlove.fist.position.x = x - obstacle.edgeX;
      springGlove.spring.scale.x = Math.max(0.05, inset - 0.3);
    } else {
      object.position.x = x;
      object.rotation.z = Math.sign(obstacle.edgeX) * (inset / obstacle.reach) * 0.6;
    }
  };
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
      return { obstacle, ...view, update: sliderUpdater(obstacle, view) };
    }
    if (obstacle.kind === 'saw') {
      const group = place(createSawRail(), obstacle.d);
      const saw = createSaw(obstacle.radius);
      group.add(saw.group);
      return {
        obstacle,
        object: group,
        saw,
        update(time, dt) {
          saw.group.position.x = sweepX(obstacle, time);
          // Roll in the direction of travel (the derivative of sweepX).
          saw.blade.rotation.z -= dt * 14 * Math.sign(Math.cos(obstacle.speed * time + obstacle.phase) || 1);
        },
      };
    }
    if (obstacle.kind === 'axe') {
      const axe = createAxe(obstacle.length, obstacle.pivotHeight, obstacle.halfWidth);
      return {
        obstacle,
        object: place(axe.group, obstacle.d),
        update(time) { axe.pivot.rotation.z = axeAngle(obstacle, time); },
      };
    }
    if (obstacle.kind === 'ramp') {
      return { obstacle, object: place(createRamp(obstacle.halfWidth, obstacle.halfDepth), obstacle.d, obstacle.x) };
    }
    if (obstacle.kind === 'bomb') {
      const bomb = createBomb(obstacle.radius);
      return {
        obstacle,
        object: place(bomb.group, obstacle.d, obstacle.x),
        bomb,
        armed: true,
        update(time) {
          bomb.spark.scale.setScalar(0.8 + Math.abs(Math.sin(time * 18 + obstacle.d)) * 0.6);
          bomb.ring.material.emissiveIntensity = 0.5 + Math.sin(time * 5 + obstacle.x) * 0.4;
        },
      };
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

  const walkers = level.walkers.map((walker) => {
    const mesh = new THREE.Mesh(shared.walkerGeometry, shared.walkerMaterial);
    mesh.castShadow = true;
    mesh.userData.size = walker.radius / CONFIG.walkers.radius;
    mesh.scale.setScalar(mesh.userData.size);
    return { walker, mesh: place(mesh, walker.d), alive: true };
  });

  const recruits = level.recruits.map((recruit) => {
    const mesh = new THREE.Mesh(shared.walkerGeometry, shared.walkerMaterial);
    mesh.castShadow = true;
    mesh.scale.setScalar(recruit.radius / CONFIG.walkers.radius);
    mesh.rotation.y = Math.PI; // facing the runners
    place(mesh, recruit.d, recruit.x);
    const size = mesh.scale.x;
    const phase = recruit.id * 1.7;
    // Asleep: a slow breath and a slight slump.
    return {
      recruit, mesh, alive: true,
      update(time) {
        const breath = Math.sin(time * 2 + phase);
        mesh.scale.set(size * (1 - breath * 0.02), size * (1 + breath * 0.04), size * (1 - breath * 0.02));
        mesh.rotation.x = 0.12;
      },
    };
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
    walkers,
    recruits,
    key,
    boss,
    ladder,
    /** Animates every moving hazard; a new hazard only needs an `update(time, dt)` on its entry. */
    update(time, dt) {
      [...obstacles, ...recruits].forEach((entry) => entry.update?.(time, dt));
    },
    dispose() {
      enemies.forEach(({ crowd }) => crowd.mesh.dispose());
      scene.remove(root);
      root.traverse((object) => {
        if (!object.isMesh || Object.values(shared).includes(object.geometry)) return;
        object.geometry.dispose();
      });
    },
  };
}
