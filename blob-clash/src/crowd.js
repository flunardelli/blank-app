// A crowd of gummy humanoids rendered as one InstancedMesh.
// `count` is the logical size (can exceed what we draw); `units` are the visible bodies.
import * as THREE from 'three';
import { jellyClock } from './art/jelly.js';
import { crowdSpacing, formationRadius, formationSlot } from './rules.js';

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();

export class Crowd {
  /**
   * @param {THREE.BufferGeometry} geometry humanoid geometry
   * @param {THREE.Material} material
   * @param {{maxVisible: number, facing: number}} options facing: yaw in radians
   */
  constructor(scene, geometry, material, { maxVisible, facing }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, maxVisible);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.maxVisible = maxVisible;
    this.facing = facing;
    this.units = [];
    this.count = 0;
    this.center = { x: 0, d: 0 };
    this.mood = 'idle'; // idle | run | fight | cheer
  }

  get radius() {
    return formationRadius(this.units.length);
  }

  spawnUnit() {
    const { x, d } = this.center;
    this.units.push({ x, d, prevD: d, phase: Math.random() * Math.PI * 2, grow: 0 });
  }

  /** Sets the logical size. Returns positions of removed bodies (for pop effects). */
  setCount(count) {
    this.count = Math.max(0, count);
    const visible = Math.min(this.count, this.maxVisible);
    while (this.units.length < visible) this.spawnUnit();
    return this.units.splice(visible).map(({ x, d }) => ({ x, d }));
  }

  /** Removes specific bodies (hit by an obstacle); hidden reserves step in if available. */
  kill(indices) {
    const killed = new Set(indices);
    const removed = this.units.filter((_, i) => killed.has(i)).map(({ x, d }) => ({ x, d }));
    this.units = this.units.filter((_, i) => !killed.has(i));
    this.setCount(this.count - removed.length);
    return removed;
  }

  /** Takes `n` bodies out of the crowd (e.g. launched at the boss), front-most first. */
  take(n) {
    const order = this.units.map((u, i) => [u.d, i]).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, i]) => i);
    return this.kill(order);
  }

  update(dt, time) {
    jellyClock.value = time;
    const spacing = crowdSpacing(this.units.length);
    const follow = Math.min(1, dt * 9);
    const tightness = this.mood === 'fight' ? 0.75 : 1;
    this.units.forEach((unit, i) => {
      const slot = formationSlot(i, spacing * tightness);
      unit.prevD = unit.d;
      unit.x += (this.center.x + slot.x - unit.x) * follow;
      unit.d += (this.center.d + slot.d - unit.d) * follow;
      unit.grow = Math.min(1, unit.grow + dt * 5);

      const t = time * 11 + unit.phase;
      const moving = this.mood === 'run' || this.mood === 'fight';
      const hop = this.mood === 'cheer' ? Math.abs(Math.sin(time * 6 + unit.phase)) * 0.6 : 0;
      position.set(unit.x, (moving ? Math.abs(Math.sin(t)) * 0.18 : 0) + hop + (unit.lift ?? 0), -unit.d);
      euler.set(moving ? -0.15 : 0, this.facing, moving ? Math.sin(t) * 0.14 : Math.sin(time * 2 + unit.phase) * 0.05);
      rotation.setFromEuler(euler);
      // Pop in with a little overshoot, and squash on every step.
      const pop = unit.grow < 1 ? 1 + Math.sin(unit.grow * Math.PI) * 0.35 : 1;
      const squash = moving ? 1 + Math.sin(t * 2) * 0.05 : 1;
      scale.set(pop / Math.sqrt(squash), pop * squash, pop / Math.sqrt(squash)).multiplyScalar(unit.grow * 0.9 + 0.1);
      this.mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
    });
    this.mesh.count = this.units.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.dispose();
  }
}
