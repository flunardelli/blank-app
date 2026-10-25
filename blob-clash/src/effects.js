// Short-lived visual effects. Each effect is a function(dt) that returns false when finished.
import * as THREE from 'three';
import { splatTextures } from './art/textures.js';

const dropGeometry = new THREE.SphereGeometry(1, 10, 8);
const splatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const MAX_SPLATS = 90;

export class Effects {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = [];
    this.splats = [];
    this.materials = new Map();
    this.shake = 0;
  }

  material(color, kind) {
    const key = `${kind}:${color}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, kind === 'drop'
        ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1 })
        : splatTextures().map((map) => new THREE.MeshStandardMaterial({
          color, map, transparent: true, depthWrite: false, roughness: 0.4,
          polygonOffset: true, polygonOffsetFactor: -2,
        })));
    }
    return this.materials.get(key);
  }

  add(effect) {
    this.active.push(effect);
  }

  update(dt) {
    // Effects may start new effects (e.g. a tween's onDone); keep those, don't overwrite them.
    const running = this.active;
    this.active = [];
    this.active = running.filter((effect) => effect(dt)).concat(this.active);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  clear() {
    this.root.clear();
    this.active = [];
    this.splats = [];
    this.shake = 0;
  }

  // Paint splat decal on the floor; the oldest one is recycled past MAX_SPLATS.
  splat(x, z, color, size = 1.6, y = 0.02) {
    const materials = this.material(color, 'splat');
    const mesh = this.splats.length >= MAX_SPLATS ? this.splats.shift() : new THREE.Mesh(splatGeometry);
    mesh.material = materials[Math.floor(Math.random() * materials.length)];
    mesh.position.set(x, y + Math.random() * 0.005, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.splats.push(mesh);
    let t = 0;
    this.add((dt) => {
      t = Math.min(1, t + dt * 8);
      mesh.scale.setScalar(size * (0.4 + 0.6 * t));
      return t < 1;
    });
  }

  burst(position, color, { count = 10, speed = 6, size = 0.16 } = {}) {
    const material = this.material(color, 'drop');
    for (let i = 0; i < count; i++) {
      const drop = new THREE.Mesh(dropGeometry, material);
      drop.position.copy(position);
      drop.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.root.add(drop);
      let life = 0.8;
      this.add((dt) => {
        life -= dt;
        velocity.y -= 20 * dt;
        drop.position.addScaledVector(velocity, dt);
        if (drop.position.y < 0.05) {
          drop.position.y = 0.05;
          velocity.multiplyScalar(0.5);
        }
        drop.scale.multiplyScalar(1 - dt * 1.5);
        if (life > 0) return true;
        this.root.remove(drop);
        return false;
      });
    }
  }

  // Blob death: a splash of drops plus a paint splat on the floor.
  pop(x, z, color, { y = 0.5, size = 1.4 } = {}) {
    this.burst(new THREE.Vector3(x, y, z), color, { count: 6, speed: 5 });
    this.splat(x, z, color, size * (0.8 + Math.random() * 0.5));
  }

  // Generic tween: progress k goes 0 -> 1 over `duration`, then onDone runs once.
  tween(duration, onUpdate, onDone) {
    let t = 0;
    this.add((dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      onUpdate(k);
      if (k < 1) return true;
      onDone?.();
      return false;
    });
  }
}
