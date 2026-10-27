// Plays the chest stage: lid, camera swing and the coin fountain. Rules live in chest.js; the blobs'
// hops are launched by the game, which calls thump() as each one lands.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createCoinSwarm } from './art/models.js';
import { chestCamera, chestShake, chestTimeline, coinAt, coinLaunch, lidAngle } from './chest.js';
import { createRng } from './rng.js';

const dummy = new THREE.Object3D();
const mount = new THREE.Vector3();

export class ChestStage {
  constructor(chest, effects, { seed = 1, onDone, cfg = CONFIG.chest } = {}) {
    this.chest = chest;
    this.effects = effects;
    this.onDone = onDone;
    this.cfg = cfg;
    this.time = 0;
    this.squash = 0;
    this.burst = false;
    this.timeline = chestTimeline(cfg);
    const rng = createRng(seed);
    this.launches = Array.from({ length: cfg.coins }, () => coinLaunch(rng, cfg));
    this.swarm = createCoinSwarm(cfg.coins);
    this.swarm.position.y = chest.rig.position.y;
    this.swarm.visible = false;
    chest.root.add(this.swarm);
  }

  get center() {
    return this.chest.root.getWorldPosition(mount);
  }

  // A blob dropped in: the chest gives a little.
  thump() {
    this.squash = Math.min(0.12, this.squash + 0.03);
  }

  camera() {
    return chestCamera(this.time - this.timeline.rotateStart, this.center, this.cfg);
  }

  update(dt) {
    if (this.done) return;
    this.time += dt;
    const { rig, lid, glow } = this.chest;
    const s = this.time - this.timeline.rotateStart;
    const { burstAt, end } = this.timeline;

    this.squash *= Math.exp(-dt * 9);
    rig.scale.set(1 + this.squash * 0.5, 1 - this.squash, 1 + this.squash * 0.5);
    rig.rotation.z = chestShake(s, this.cfg);
    lid.rotation.x = -(lidAngle(s, this.cfg) + (s < 0 ? this.squash * 3 : 0)); // the lid flaps as it swallows a blob

    if (!this.burst && this.time >= burstAt) this.openUp();
    if (this.burst) {
      this.placeCoins(this.time - burstAt);
      const pour = (this.time - burstAt) / (end - burstAt);
      glow.material.opacity = Math.max(0, 0.9 * (1 - pour * 1.6));
      glow.scale.setScalar(7 + pour * 6);
    }
    if (this.time >= end) {
      this.done = true;
      this.swarm.removeFromParent();
      this.swarm.dispose();
      this.onDone?.();
    }
  }

  // The jolt that throws the lid open: shake, star burst and a dust ring (cartoon only).
  openUp() {
    this.burst = true;
    this.swarm.visible = true;
    this.squash = 0.14;
    const top = this.center.setY(3.4);
    this.effects.shake = 1;
    this.effects.impact(top, { stars: 10, scale: 1.8 });
    this.effects.dustRing(this.center.setY(0.5), 3.5);
  }

  placeCoins(t) {
    this.launches.forEach((launch, i) => {
      const coin = coinAt(launch, t, this.cfg);
      if (!coin) {
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(coin.x, coin.y, coin.z);
        dummy.rotation.set(coin.tilt, coin.turn, 0);
        dummy.scale.setScalar(coin.size);
      }
      dummy.updateMatrix();
      this.swarm.setMatrixAt(i, dummy.matrix);
    });
    this.swarm.instanceMatrix.needsUpdate = true;
  }
}
