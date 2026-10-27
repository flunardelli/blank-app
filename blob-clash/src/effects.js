// Short-lived visual effects. Each effect is a function(dt) that returns false when finished.
import * as THREE from 'three';
import { puffTexture, starTexture } from './art/textures.js';

const bitGeometry = new THREE.SphereGeometry(1, 12, 8);
const WHITE = new THREE.Color(0xffffff);

export class Effects {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = [];
    this.materials = new Map();
    this.shake = 0;
  }

  // Jelly bits are a light, shiny tint of the body colour: cartoon confetti, never gore.
  bitMaterial(color) {
    if (!this.materials.has(color)) {
      const tint = new THREE.Color(color).lerp(WHITE, 0.5);
      this.materials.set(color, new THREE.MeshPhysicalMaterial({
        color: tint, emissive: tint, emissiveIntensity: 0.25, roughness: 0.2, clearcoat: 1,
      }));
    }
    return this.materials.get(color);
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
    this.shake = 0;
  }

  // Shiny jelly bits that fly up, float and pop in mid-air (they never land on the floor).
  burst(position, color, { count = 10, speed = 6, size = 0.16 } = {}) {
    const material = this.bitMaterial(color);
    for (let i = 0; i < count; i++) {
      const bit = new THREE.Mesh(bitGeometry, material);
      bit.position.copy(position);
      const scale = size * (0.6 + Math.random() * 0.8);
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.root.add(bit);
      const life = 0.45 + Math.random() * 0.2;
      let t = 0;
      this.add((dt) => {
        t += dt;
        velocity.y -= 9 * dt;
        velocity.multiplyScalar(1 - dt * 2.5);
        bit.position.addScaledVector(velocity, dt);
        bit.scale.setScalar(scale * Math.max(0, 1 - (t / life) ** 2));
        if (t < life) return true;
        this.root.remove(bit);
        return false;
      });
    }
  }

  // A blob leaving the game: a puff of smoke, a couple of stars and jelly bits.
  pop(x, z, color, { y = 0.5, size = 1.4 } = {}) {
    const at = new THREE.Vector3(x, y, z);
    this.sprite(puffTexture(), at, { size: size * 0.9, velocity: new THREE.Vector3(0, 1.2, 0), life: 0.45 });
    this.sprite(starTexture(), at.clone().setY(y + 0.5), { size: 0.5, velocity: new THREE.Vector3(0, 2.2, 0), life: 0.5, spin: 6 });
    this.burst(at, color, { count: 4, speed: 4, size: 0.12 });
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
