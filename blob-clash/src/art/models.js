// Procedural models built from primitives, styled after the reference art:
// glossy gummy humanoids, glass gates, a boxing-ring boss arena and a bonus ladder.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PALETTE } from '../config.js';
import { checkerTexture, coinFaceTexture, melonFaceTexture, stripeTexture, textTexture } from './textures.js';
import { gateLabel, isGoodGate } from '../rules.js';

// ---- Materials ----------------------------------------------------------------
export function gummyMaterial({ opacity = 1, emissive = 0x000000 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffe0c0),
    emissive,
    transparent: opacity < 1,
    opacity,
  });
}

export const glossy = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, ...extra });

// Vertical colour gradient baked into vertex colours (bottom -> top), like the jelly in the reference.
export function paintGradient(geometry, bottom, top, y0, y1) {
  geometry.userData.gradient = [y0, y1]; // remembered so repaintGradients() can re-skin the body later
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const [low, high, out] = [new THREE.Color(bottom), new THREE.Color(top), new THREE.Color()];
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp((position.getY(i) - y0) / (y1 - y0), 0, 1);
    out.copy(low).lerp(high, t).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Re-bakes the gradient of every painted part under `root` in new colours (skins). */
export function repaintGradients(root, { bottom, top }) {
  root.traverse((node) => {
    const range = node.geometry?.userData.gradient;
    if (range) paintGradient(node.geometry, bottom, top, ...range);
  });
}

// ---- Gummy humanoid (one merged geometry, instanced for the whole crowd) --------
export function beanGeometry(segments = 16) {
  // Chubby jelly-bean: wide hips, round head, no neck.
  const outline = [[0, 0.26], [0.3, 0.29], [0.46, 0.42], [0.52, 0.64], [0.5, 0.9], [0.44, 1.1],
    [0.34, 1.26], [0.2, 1.36], [0, 1.39]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(new THREE.SplineCurve(outline).getPoints(20), segments);
}

export function limb(radius, length, x, y, tilt) {
  return new THREE.CapsuleGeometry(radius, length, 4, 8).rotateZ(tilt).translate(x, y, 0);
}

// Melting drops that hang off a jelly body, merged into its geometry.
export function dripGeometries(spots, segments = 8) {
  return spots.map(([x, y, z, size]) => new THREE.SphereGeometry(size, segments, segments - 2)
    .scale(1, 1.7, 1).translate(x, y - size * 0.6, z));
}

export function humanoidGeometry({ bottom, top }) {
  const parts = [
    beanGeometry(),
    limb(0.14, 0.24, -0.21, 0.24, 0.06),
    limb(0.14, 0.24, 0.21, 0.24, -0.06),
    limb(0.13, 0.34, -0.6, 0.74, 0.95),
    limb(0.13, 0.34, 0.6, 0.74, -0.95),
    ...dripGeometries([[0.36, 0.42, 0.18, 0.07], [-0.3, 0.38, -0.22, 0.06], [0.82, 0.92, 0, 0.06]]),
  ];
  return paintGradient(mergeGeometries(parts), bottom, top, 0.1, 1.35);
}

// ---- Boxing glove (bosses, champion and the spring-glove obstacle) ---------------
export function glove(color = PALETTE.glove) {
  const group = new THREE.Group();
  const material = glossy(color, { roughness: 0.22, metalness: 0.05 });
  const trim = glossy(0xffffff, { roughness: 0.3 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), material);
  fist.scale.set(1, 1.1, 1.15);
  const knuckles = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), material);
  knuckles.scale.set(1.15, 0.9, 1);
  knuckles.position.set(0, -0.14, 0.04);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.12, 4, 10), material);
  thumb.position.set(0.2, 0.06, 0.16);
  thumb.rotation.set(0.5, 0, -0.5);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.24, 20), material);
  cuff.position.y = 0.32;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.035, 8, 24), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.3;
  const lace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.05), trim);
  lace.position.set(0, 0.32, -0.23);
  group.add(fist, knuckles, thumb, cuff, band, lace);
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

// ---- Obstacles ------------------------------------------------------------------
export function createMelon(radius) {
  const face = new THREE.MeshStandardMaterial({ map: melonFaceTexture(), roughness: 0.5 });
  const rind = glossy(0x2f8a2f);
  // Half cylinder standing up, its cut face looking at the player.
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.7, 40, 1, false, Math.PI / 2, Math.PI)
    .rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, [rind, face, face]);
  mesh.castShadow = true;
  return mesh;
}

// Spring-loaded boxing glove punching out of a pillar at the track edge.
export function createSpringGlove(radius, side) {
  const group = new THREE.Group();
  const fist = glove(0xe8584a);
  fist.scale.setScalar(radius * 2.6); // fist ≈ collision radius, so hits look fair
  fist.rotation.z = -side * Math.PI / 2; // fist faces the track centre, cuff the pillar
  fist.position.y = 1.3;
  group.add(fist);
  // The spring is a helix that stretches back to the pillar; game.js scales it along x.
  const points = Array.from({ length: 120 }, (_, i) => {
    const t = i / 119;
    const a = t * Math.PI * 2 * 9;
    return new THREE.Vector3(t, Math.sin(a) * 0.25, Math.cos(a) * 0.25);
  });
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 240, 0.05, 6),
    glossy(0x5a5ad6),
  );
  spring.position.y = 1.3;
  group.add(spring);
  return { group, fist, spring };
}

export function createPillar(height = 3.2) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, height, 1.1), glossy(0xf08080));
  pillar.position.y = height / 2;
  pillar.castShadow = true;
  return pillar;
}

export function createSpikePad(halfWidth, halfDepth) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, 0.25, halfDepth * 2), glossy(PALETTE.spikeBase));
  base.position.y = 0.12;
  base.receiveShadow = true;
  group.add(base);
  const spikeGeometry = new THREE.ConeGeometry(0.22, 1.1, 10);
  const spikeMaterial = glossy(PALETTE.spike, { roughness: 0.2 });
  for (let x = -halfWidth + 0.4; x <= halfWidth - 0.3; x += 0.75) {
    for (let z = -halfDepth + 0.4; z <= halfDepth - 0.3; z += 0.75) {
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      spike.position.set(x + (Math.random() - 0.5) * 0.15, 0.75, z);
      spike.castShadow = true;
      group.add(spike);
    }
  }
  return group;
}

export function createButton(radius) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.25, radius * 1.35, 0.18, 32), glossy(0x6a3fc8));
  base.position.y = 0.09;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius, 0.3, 32),
    glossy(PALETTE.button, { emissive: PALETTE.button, emissiveIntensity: 0.25 }));
  cap.position.y = 0.3;
  base.receiveShadow = true;
  cap.castShadow = true;
  group.add(base, cap);
  return { group, cap };
}

// Spikes across the whole track; `spikes` is lowered into the floor once disarmed.
export function createSpikeField(halfDepth) {
  const half = CONFIG.track.width / 2;
  const group = createSpikePad(half, halfDepth);
  const spikes = new THREE.Group();
  [...group.children].slice(1).forEach((spike) => spikes.add(spike));
  group.add(spikes);
  return { group, spikes };
}

export function createKey() {
  const group = new THREE.Group();
  const material = glossy(PALETTE.key, { metalness: 0.4, roughness: 0.25, emissive: PALETTE.key, emissiveIntensity: 0.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 12, 24), material);
  ring.position.y = 0.45;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.12), material);
  shaft.position.y = -0.15;
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.12), material);
  tooth.position.set(0.14, -0.42, 0);
  const tooth2 = tooth.clone();
  tooth2.position.y = -0.24;
  group.add(ring, shaft, tooth, tooth2);
  group.traverse((o) => { o.castShadow = true; });
  return group;
}

const coinGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28).rotateX(Math.PI / 2);
const coinMaterials = () => {
  const face = new THREE.MeshStandardMaterial({ map: coinFaceTexture(), metalness: 0.3, roughness: 0.3 });
  return [glossy(0xe0a000, { metalness: 0.4 }), face, face];
};
export function createCoin() {
  const coin = new THREE.Mesh(coinGeometry, coinMaterials());
  coin.castShadow = true;
  return coin;
}

/** `count` coins drawn in one call; the caller writes each instance matrix. */
export function createCoinSwarm(count) {
  const swarm = new THREE.InstancedMesh(coinGeometry, coinMaterials(), count);
  swarm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  swarm.frustumCulled = false;
  return swarm;
}

// ---- Track pieces ---------------------------------------------------------------
export function textPlane(text, height, options) {
  const texture = textTexture(text, options);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(height * texture.userData.aspect, height), material);
}

export function createTrack(fromD, toD) {
  const { width } = CONFIG.track;
  const length = toD - fromD;
  const texture = stripeTexture().clone();
  texture.repeat.set(1, length / 5);
  texture.needsUpdate = true;
  const group = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ color: 0xd9d2f2, roughness: 0.8 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, length), [side, side, top, side, side, side]);
  deck.position.set(0, -0.6, -(fromD + length / 2));
  deck.receiveShadow = true;
  group.add(deck);

  const railMaterial = glossy(PALETTE.rail);
  for (const x of [-width / 2 - 0.2, width / 2 + 0.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, length), railMaterial);
    rail.position.set(x, 0.05, deck.position.z);
    rail.receiveShadow = rail.castShadow = true;
    group.add(rail);
  }
  return group;
}

export function createGate(pair) {
  const { width } = CONFIG.track;
  const half = width / 2;
  const group = new THREE.Group();
  const postMaterial = glossy(0xf2f2f7);
  for (const x of [-half, 0, half]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 12), postMaterial);
    post.position.set(x, 1.6, 0);
    post.castShadow = true;
    group.add(post);
  }
  const panels = [[pair.left, -half / 2], [pair.right, half / 2]].map(([gate, x]) => {
    const color = isGoodGate(gate) ? PALETTE.goodGlass : PALETTE.badGlass;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(half - 0.3, 2.8, 0.12),
      new THREE.MeshPhysicalMaterial({
        color, emissive: color, emissiveIntensity: 0.25, transparent: true, opacity: 0.5, roughness: 0.1,
      }),
    );
    glass.position.set(x, 1.5, 0);
    const label = textPlane(gateLabel(gate), 2.3);
    label.position.set(x, 1.7, 0.2);
    label.renderOrder = 2;
    group.add(glass, label);
    return { glass, label };
  });
  return { group, panels };
}

export function createFinishLine() {
  const texture = checkerTexture().clone();
  texture.repeat.set(CONFIG.track.width / 2, 1);
  texture.needsUpdate = true;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.track.width, 1.2),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.01;
  strip.receiveShadow = true;
  return strip;
}

// Boxing ring with corner posts, yellow ropes and a glass arch behind the boss.
export function createRing(depth) {
  const { width } = CONFIG.track;
  const group = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.5, depth), glossy(0xf6f2ff));
  platform.position.set(0, 0, -depth / 2); // top surface at y = 0.25
  platform.receiveShadow = true;
  const mat = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.06, depth * 0.45), glossy(PALETTE.mat, { roughness: 0.8 }));
  mat.position.set(0, 0.28, -depth * 0.55);
  mat.receiveShadow = true;
  group.add(platform, mat);

  const postMaterial = glossy(PALETTE.post, { roughness: 0.3 });
  const ropeMaterial = glossy(PALETTE.rope, { roughness: 0.3, emissive: PALETTE.rope, emissiveIntensity: 0.2 });
  const corners = [[-width / 2, -0.4], [width / 2, -0.4], [-width / 2, -depth + 0.4], [width / 2, -depth + 0.4]];
  for (const [x, z] of corners) {
    const post = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.6, 4, 12), postMaterial);
    post.position.set(x, 1.1, z);
    post.castShadow = true;
    group.add(post);
  }
  const rope = (from, to, y) => {
    const a = new THREE.Vector3(from[0], y, from[1]);
    const b = new THREE.Vector3(to[0], y, to[1]);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, a.distanceTo(b), 8), ropeMaterial);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(mesh);
  };
  for (const y of [1.1, 1.7]) {
    rope(corners[0], corners[2], y);
    rope(corners[1], corners[3], y);
  }

  const archMaterial = glossy(PALETTE.arch, { roughness: 0.3 });
  const archZ = -depth - 0.6;
  for (const x of [-2.6, 2.6]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), archMaterial);
    pillar.position.set(x, 3.5, archZ);
    group.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.7, 0.8), archMaterial);
  beam.position.set(0, 7.2, archZ);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 6.8),
    new THREE.MeshPhysicalMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.35, roughness: 0.05 }),
  );
  door.position.set(0, 3.4, archZ);
  group.add(beam, door);
  return group;
}

// Bonus ladder: tiles x1.0 … x5.0 where the knocked-out boss lands.
export function createLadder() {
  const { maxMultiplier, step, tileDepth } = CONFIG.bonus;
  const group = new THREE.Group();
  const tiles = [];
  const steps = Math.round((maxMultiplier - 1) / step);
  for (let i = 0; i <= steps; i++) {
    const multiplier = Math.round((1 + i * step) * 10) / 10;
    const material = new THREE.MeshStandardMaterial({ color: i % 2 ? 0xdff0ff : 0xffffff, roughness: 0.8 });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.track.width, 0.1, tileDepth), material);
    tile.position.set(0, 0.02, -(i + 0.5) * tileDepth);
    tile.receiveShadow = true;
    const label = textPlane(`x${multiplier.toFixed(1)}`, 1.3);
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.1, tile.position.z);
    group.add(tile, label);
    tiles.push({ multiplier, tile, d: (i + 0.5) * tileDepth });
  }
  return { group, tiles, length: (steps + 1) * tileDepth };
}
