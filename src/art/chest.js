// Giant wooden treasure chest with gold bands. Local frame: front faces +z, the lid hinges at the back.
import * as THREE from 'three';
import { glossy } from './models.js';
import { puffTexture, woodTexture } from './textures.js';

const W = 5.4; // x
const H = 1.8; // body height
const D = 3.6; // z
const BAND_X = 1.7;
const DAIS_TOP = 0.25; // same floor as the boss ring

const gold = () => glossy(0xffc21a, { metalness: 0.7, roughness: 0.25, emissive: 0x4a2c00 });

// Half cylinder lying along x, arching up: the chest's rounded lid.
const halfRound = (radius, length) =>
  new THREE.CylinderGeometry(radius, radius, length, 28, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);

export function createChest() {
  const root = new THREE.Group();
  const rig = new THREE.Group(); // squashes and wobbles as one
  rig.position.y = DAIS_TOP;
  root.add(rig);

  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.7 });
  const goldMat = gold();

  const dais = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6, DAIS_TOP, 40), glossy(0xf6f2ff));
  dais.position.y = DAIS_TOP / 2;
  dais.receiveShadow = true;
  root.add(dais);

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wood);
  body.position.y = H / 2;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.28, D + 0.1), goldMat);
  rim.position.y = 0.14;
  rig.add(body, rim);
  [-BAND_X, BAND_X].forEach((x) => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, H + 0.04, D + 0.04), goldMat);
    band.position.set(x, H / 2, 0);
    rig.add(band);
  });

  // Gold inside: shows when the lid opens, hidden under it while closed.
  const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), glossy(0xffc21a, { metalness: 0.5, emissive: 0x7a4a00 }));
  pile.scale.set(W * 0.42, 0.7, D * 0.4);
  pile.position.y = H - 0.15;
  rig.add(pile);

  // Lid: pivot on the back edge, so rotation.x < 0 swings the front up.
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const lidShell = new THREE.Mesh(halfRound(D / 2, W), wood);
  lidShell.position.z = D / 2;
  lid.add(lidShell);
  [-BAND_X, BAND_X].forEach((x) => {
    const band = new THREE.Mesh(halfRound(D / 2 + 0.04, 0.5), goldMat);
    band.position.set(x, 0, D / 2);
    lid.add(band);
  });
  rig.add(lid);

  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.32), goldMat);
  lock.position.set(0, H - 0.5, D / 2 + 0.14);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 12).rotateX(Math.PI / 2), glossy(0x2a1204));
  hole.position.set(0, H - 0.5, D / 2 + 0.32);
  rig.add(lock, hole);

  rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // Warm light haloing out of the opening chest.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: puffTexture(), color: 0xffd24a, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  glow.position.y = DAIS_TOP + H + 0.8;
  root.add(glow);

  return { root, rig, lid, glow };
}
