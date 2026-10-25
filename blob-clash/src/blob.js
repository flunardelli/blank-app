import * as THREE from 'three';
import { COLORS } from './config.js';

// Geometry and materials are shared by every blob: hundreds of pickups, one GPU buffer.
const sphereGeometry = new THREE.SphereGeometry(1, 32, 24);
const eyeGeometry = new THREE.SphereGeometry(0.22, 16, 12);
const pupilGeometry = new THREE.SphereGeometry(0.11, 12, 8);
const browGeometry = new THREE.BoxGeometry(0.42, 0.08, 0.08);
const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
const materialCache = new Map();

export function blobMaterial(color) {
  if (!materialCache.has(color)) {
    materialCache.set(color, new THREE.MeshStandardMaterial({
      color: COLORS[color],
      emissive: COLORS[color],
      emissiveIntensity: 0.15,
      roughness: 0.25,
      metalness: 0.05,
    }));
  }
  return materialCache.get(color);
}

export const sharedSphere = sphereGeometry;

export class Blob {
  /**
   * @param {string} color key of COLORS
   * @param {number} radius world units
   * @param {{face?: 'none'|'angry', faceDirection?: 1|-1}} options faceDirection +1 looks towards +z
   */
  constructor(color, radius, { face = 'none', faceDirection = 1 } = {}) {
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(sphereGeometry, blobMaterial(color));
    this.body.castShadow = true;
    this.group.add(this.body);
    if (face === 'angry') this.body.add(buildAngryFace(faceDirection));

    this.phase = Math.random() * Math.PI * 2;
    this.color = color;
    this.radius = radius;
    this.targetRadius = radius;
    this.applyRadius();
  }

  setColor(color) {
    this.color = color;
    this.body.material = blobMaterial(color);
  }

  // Radius eases towards its target so growing and shrinking feel gooey, not instant.
  setRadius(radius, { instant = false } = {}) {
    this.targetRadius = radius;
    if (instant) {
      this.radius = radius;
      this.applyRadius();
    }
  }

  applyRadius() {
    this.group.scale.setScalar(this.radius);
    this.group.position.y = this.radius * 0.9;
  }

  update(dt, time, wobble = 1) {
    this.radius += (this.targetRadius - this.radius) * Math.min(1, dt * 8);
    this.applyRadius();
    const squash = 1 + 0.07 * wobble * Math.sin(time * 7 + this.phase);
    const side = 1 / Math.sqrt(squash); // keep volume constant while squashing
    this.body.scale.set(side, squash, side);
  }
}

function buildAngryFace(direction) {
  const face = new THREE.Group();
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, whiteMaterial);
    eye.position.set(side * 0.35, 0.2, 0.82);
    const pupil = new THREE.Mesh(pupilGeometry, blackMaterial);
    pupil.position.set(0, 0, 0.16);
    eye.add(pupil);
    const brow = new THREE.Mesh(browGeometry, blackMaterial);
    brow.position.set(side * 0.33, 0.48, 0.85);
    brow.rotation.z = side * -0.45;
    face.add(eye, brow);
  }
  face.rotation.y = direction > 0 ? 0 : Math.PI;
  return face;
}
