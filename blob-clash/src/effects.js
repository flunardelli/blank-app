// Short-lived visual effects. Each effect is a function(dt) that returns false when finished.
import * as THREE from 'three';
import { blobMaterial, sharedSphere } from './blob.js';

export class Effects {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.active = [];
    this.shake = 0;
  }

  add(effect) {
    this.active.push(effect);
  }

  update(dt) {
    this.active = this.active.filter((effect) => effect(dt));
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  clear() {
    this.root.clear();
    this.active = [];
    this.shake = 0;
  }

  burst(position, color, { count = 14, speed = 7, size = 0.25 } = {}) {
    for (let i = 0; i < count; i++) {
      const drop = new THREE.Mesh(sharedSphere, blobMaterial(color));
      drop.position.copy(position);
      drop.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.root.add(drop);
      let life = 0.9;
      this.add((dt) => {
        life -= dt;
        velocity.y -= 18 * dt;
        drop.position.addScaledVector(velocity, dt);
        drop.position.y = Math.max(drop.position.y, 0.05);
        drop.scale.multiplyScalar(1 - dt * 1.2);
        if (life > 0) return true;
        this.root.remove(drop);
        return false;
      });
    }
  }

  // Slides a pickup into its target (the player) while shrinking it away.
  absorb(object, target, duration = 0.18) {
    let t = 0;
    const startScale = object.scale.x;
    this.add((dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      object.position.lerp(target.position, k);
      object.scale.setScalar(startScale * (1 - k));
      if (k < 1) return true;
      object.visible = false;
      return false;
    });
  }
}
