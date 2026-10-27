// 3D side of the skins: accessories ("gear") plus the two places a skin shows up, the crowd leader
// and the champion. Gear is modelled in bean coordinates (see beanGeometry: head centre y ≈ 1.05,
// front is +z), so the same group fits the leader mesh and the champion body.
import * as THREE from 'three';
import { makeJelly } from './jelly.js';
import { glossy, gummyMaterial, humanoidGeometry, repaintGradients } from './models.js';

const mesh = (geometry, material) => {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  return m;
};

const GEAR = {
  headband() {
    const group = new THREE.Group();
    const cloth = glossy(0xe8203a, { roughness: 0.6 });
    const band = mesh(new THREE.TorusGeometry(0.385, 0.05, 8, 32), cloth);
    band.rotation.x = Math.PI / 2;
    band.position.y = 1.24;
    const knot = mesh(new THREE.SphereGeometry(0.075, 10, 8), cloth);
    knot.position.set(0, 1.24, -0.4);
    for (const side of [-1, 1]) {
      const tail = mesh(new THREE.BoxGeometry(0.07, 0.03, 0.34), cloth);
      tail.position.set(side * 0.1, 1.2, -0.58);
      tail.rotation.set(0.35, side * 0.4, 0);
      group.add(tail);
    }
    group.add(band, knot);
    return group;
  },
  crown() {
    const group = new THREE.Group();
    const gold = glossy(0xfff0a0, { metalness: 0.6, roughness: 0.2 });
    const band = mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.16, 24, 1, true), gold);
    band.material.side = THREE.DoubleSide;
    group.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = mesh(new THREE.ConeGeometry(0.06, 0.2, 8), gold);
      spike.position.set(Math.sin(a) * 0.25, 0.16, Math.cos(a) * 0.25);
      const gem = mesh(new THREE.SphereGeometry(0.04, 8, 6), glossy(i % 2 ? 0xe8203a : 0x2f56d6));
      gem.position.set(Math.sin(a) * 0.27, 0, Math.cos(a) * 0.27);
      group.add(spike, gem);
    }
    group.position.y = 1.4;
    return group;
  },
  shades() {
    const group = new THREE.Group();
    const lens = glossy(0x111118, { roughness: 0.1, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const glass = mesh(new THREE.SphereGeometry(0.13, 16, 10), lens);
      glass.scale.set(1.15, 0.8, 0.35);
      glass.position.set(side * 0.18, 1.0, 0.43);
      glass.rotation.y = side * 0.35;
      group.add(glass);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), lens);
    bridge.position.set(0, 1.02, 0.47);
    group.add(bridge);
    return group;
  },
  cape() {
    const group = new THREE.Group();
    const cloth = glossy(0xe8203a, { roughness: 0.55 });
    cloth.side = THREE.DoubleSide;
    const body = mesh(new THREE.BoxGeometry(0.85, 0.85, 0.04), cloth);
    body.position.set(0, 0.75, -0.55);
    body.rotation.x = 0.18; // flares out behind the runner
    const collar = mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 20, Math.PI), glossy(0xffd23a));
    collar.rotation.set(-Math.PI / 2, 0, Math.PI);
    collar.position.set(0, 1.12, -0.05);
    group.add(body, collar);
    return group;
  },
};

export const buildGear = (id) => (id ? GEAR[id]() : new THREE.Group());

const disposeGear = (group) => group.traverse((node) => {
  node.geometry?.dispose();
  node.material?.dispose();
});

/** The leader: a lone jelly with its own colours and gear, standing in for body 0 of the crowd. */
export function createLeader() {
  const root = new THREE.Group();
  root.matrixAutoUpdate = false; // the crowd hands us a ready matrix every frame
  root.visible = false;
  const material = makeJelly(gummyMaterial({ emissive: 0x2a0a00 }));
  let body = null;
  let gear = null;
  return {
    root,
    /** Dresses the leader in `skin` (see skins.js). */
    set(skin) {
      if (body) body.geometry.dispose();
      if (gear) { root.remove(gear); disposeGear(gear); }
      const geometry = humanoidGeometry(skin.colors);
      // The jelly shader expects a per-vertex wobble phase; a single body needs just one.
      geometry.setAttribute('aJellyPhase', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count), 1));
      if (body) root.remove(body);
      body = mesh(geometry, material);
      gear = buildGear(skin.gear);
      root.add(body, gear);
    },
  };
}

/** Repaints the champion and swaps its gear. `rig` comes from createChampion (boxer.js). */
export function dressChampion(rig, skin) {
  repaintGradients(rig.root, skin.colors);
  if (rig.skinGear) { rig.torso.remove(rig.skinGear); disposeGear(rig.skinGear); }
  rig.skinGear = buildGear(skin.gear);
  rig.skinGear.position.y = -rig.hipY; // the champion's body sits hipY below its torso pivot
  rig.torso.add(rig.skinGear);
}
