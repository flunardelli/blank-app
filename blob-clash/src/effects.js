// Short-lived visual effects. Each effect is a function(dt) that returns false when finished.
import * as THREE from 'three';
import { emojiTexture, puffTexture, splatTextures, starTexture } from './art/textures.js';

const dropGeometry = new THREE.SphereGeometry(1, 6, 4); // tiny on screen: low poly is invisible
const splatGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const MAX_DROPS = 400;
const SPLATS_PER_VARIANT = 40;
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();
const tint = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// Juice drops: one InstancedMesh for every drop on screen, recycled as a ring buffer.
// (One mesh per drop meant hundreds of new meshes in a single big clash.)
class DropPool {
  constructor(parent) {
    this.mesh = new THREE.InstancedMesh(dropGeometry, new THREE.MeshStandardMaterial({ roughness: 0.3 }), MAX_DROPS);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tint.set(0xffffff));
    parent.add(this.mesh);
    this.pos = new Float32Array(MAX_DROPS * 3);
    this.vel = new Float32Array(MAX_DROPS * 3);
    this.size = new Float32Array(MAX_DROPS);
    this.life = new Float32Array(MAX_DROPS);
    this.next = 0;
  }

  spawn(position, color, velocity, size) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_DROPS;
    position.toArray(this.pos, i * 3);
    velocity.toArray(this.vel, i * 3);
    this.size[i] = size;
    this.life[i] = 0.8;
    this.mesh.setColorAt(i, tint.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const { pos, vel, size, life } = this;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (life[i] <= 0) {
        if (size[i] !== 0) { // hide once, then skip
          size[i] = 0;
          this.mesh.setMatrixAt(i, matrix.makeScale(0, 0, 0));
        }
        continue;
      }
      life[i] -= dt;
      const p = i * 3;
      vel[p + 1] -= 20 * dt;
      pos[p] += vel[p] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;
      if (pos[p + 1] < 0.05) {
        pos[p + 1] = 0.05;
        vel[p] *= 0.5; vel[p + 1] *= -0.3; vel[p + 2] *= 0.5;
      }
      size[i] *= 1 - dt * 1.5;
      matrix.makeScale(size[i], size[i], size[i]).setPosition(pos[p], pos[p + 1], pos[p + 2]);
      this.mesh.setMatrixAt(i, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(1); // forces one hide pass
  }
}

// Paint splats on the floor: three InstancedMeshes (one per splat shape), oldest recycled first.
class SplatPool {
  constructor(parent) {
    this.variants = splatTextures().map((map) => {
      const mesh = new THREE.InstancedMesh(splatGeometry, new THREE.MeshStandardMaterial({
        map, transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2,
      }), SPLATS_PER_VARIANT);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.setColorAt(0, tint.set(0xffffff));
      parent.add(mesh);
      return { mesh, next: 0, growing: [] };
    });
    this.clear();
  }

  spawn(x, y, z, color, size) {
    const variant = this.variants[Math.floor(Math.random() * this.variants.length)];
    const i = variant.next;
    variant.next = (variant.next + 1) % SPLATS_PER_VARIANT;
    variant.mesh.setColorAt(i, tint.set(color));
    variant.mesh.instanceColor.needsUpdate = true;
    variant.growing.push({ i, x, y, z, size, t: 0, angle: Math.random() * Math.PI * 2 });
  }

  update(dt) {
    for (const variant of this.variants) {
      if (!variant.growing.length) continue;
      variant.growing = variant.growing.filter((s) => {
        s.t = Math.min(1, s.t + dt * 8);
        quaternion.setFromAxisAngle(UP, s.angle);
        scaleVector.setScalar(s.size * (0.4 + 0.6 * s.t));
        variant.mesh.setMatrixAt(s.i, matrix.compose(new THREE.Vector3(s.x, s.y, s.z), quaternion, scaleVector));
        return s.t < 1;
      });
      variant.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    for (const variant of this.variants) {
      for (let i = 0; i < SPLATS_PER_VARIANT; i++) variant.mesh.setMatrixAt(i, matrix.makeScale(0, 0, 0));
      variant.mesh.instanceMatrix.needsUpdate = true;
      variant.growing = [];
      variant.next = 0;
    }
  }
}

export class Effects {
  constructor(scene) {
    this.root = new THREE.Group(); // per-level transient objects, cleared between levels
    const pools = new THREE.Group(); // persistent instanced pools
    scene.add(this.root, pools);
    this.drops = new DropPool(pools);
    this.splats = new SplatPool(pools);
    this.active = [];
    this.shake = 0;
  }

  add(effect) {
    this.active.push(effect);
  }

  update(dt) {
    // Effects may start new effects (e.g. a tween's onDone); keep those, don't overwrite them.
    const running = this.active;
    this.active = [];
    this.active = running.filter((effect) => effect(dt)).concat(this.active);
    this.drops.update(dt);
    this.splats.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  clear() {
    this.root.clear();
    this.active = [];
    this.drops.clear();
    this.splats.clear();
    this.shake = 0;
  }

  splat(x, z, color, size = 1.6, y = 0.02) {
    this.splats.spawn(x, y + Math.random() * 0.005, z, color, size);
  }

  burst(position, color, { count = 10, speed = 6, size = 0.16 } = {}) {
    const velocity = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      velocity.set(Math.random() - 0.5, Math.random() * 0.8 + 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.drops.spawn(position, color, velocity, size * (0.6 + Math.random() * 0.8));
    }
  }

  // Blob death: a splash of drops plus a paint splat on the floor.
  pop(x, z, color, { y = 0.5, size = 1.4 } = {}) {
    this.burst(new THREE.Vector3(x, y, z), color, { count: 6, speed: 5 });
    this.splat(x, z, color, size * (0.8 + Math.random() * 0.5));
  }

  // A sprite that pops, drifts by `velocity` and fades out.
  sprite(texture, position, { size = 1, velocity = new THREE.Vector3(), life = 0.7, spin = 0 } = {}) {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    this.root.add(sprite);
    let t = 0;
    this.add((dt) => {
      t += dt;
      const k = t / life;
      sprite.position.addScaledVector(velocity, dt);
      sprite.scale.setScalar(size * Math.min(1, k * 5) * (1 - k * 0.3));
      material.rotation += spin * dt;
      material.opacity = 1 - Math.max(0, k - 0.6) / 0.4;
      if (k < 1) return true;
      this.root.remove(sprite);
      material.dispose();
      return false;
    });
  }

  // Cartoon impact: yellow stars flying out plus a dust puff.
  impact(position, { stars = 4, scale = 1 } = {}) {
    for (let i = 0; i < stars; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(4 * scale);
      this.sprite(starTexture(), position, { size: (0.6 + Math.random() * 0.6) * scale, velocity: v, life: 0.6, spin: 6 });
    }
    this.sprite(puffTexture(), position, { size: 1.6 * scale, life: 0.35 });
  }

  // Ring of dust on the floor (boss slam, landings).
  dustRing(position, radius = 3) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(radius * 1.8);
      this.sprite(puffTexture(), position, { size: 1.4, velocity: v, life: 0.55 });
    }
  }

  emojis(position, count = 3) {
    const faces = ['😀', '😎', '😊', '😄', '🤩', '😁'];
    for (let i = 0; i < count; i++) {
      const at = position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random(), (Math.random() - 0.5) * 2));
      const face = faces[Math.floor(Math.random() * faces.length)];
      this.sprite(emojiTexture(face), at, { size: 1.3, velocity: new THREE.Vector3(0, 1.6, 0), life: 1.1 });
    }
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
