// Track hazards from the later phases: saw blades on rails, jump ramps, bombs and gray walkers.
import * as THREE from 'three';
import { CONFIG, PALETTE } from '../config.js';
import { glossy } from './models.js';

// Yellow ramp face with three white "jump" triangles pointing down the track (like the reference).
let rampTexture;
function getRampTexture() {
  if (rampTexture) return rampTexture;
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 128 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${PALETTE.ramp.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffffff';
  for (const cx of [48, 128, 208]) {
    ctx.beginPath();
    ctx.moveTo(cx, 22);
    ctx.lineTo(cx + 30, 106);
    ctx.lineTo(cx - 30, 106);
    ctx.closePath();
    ctx.fill();
  }
  rampTexture = new THREE.CanvasTexture(canvas);
  rampTexture.colorSpace = THREE.SRGBColorSpace;
  rampTexture.anisotropy = 4;
  return rampTexture;
}

/** Wedge rising towards the far end; its top face carries the triangles. */
export function createRamp(halfWidth, halfDepth, height = 0.7) {
  const depth = halfDepth * 2;
  const shape = new THREE.Shape([new THREE.Vector2(-halfDepth, 0), new THREE.Vector2(halfDepth, 0), new THREE.Vector2(halfDepth, height)]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: halfWidth * 2, bevelEnabled: false });
  // Shape lies in x/y with depth along z: turn it so the slope climbs along -z (down the track).
  geometry.translate(0, 0, -halfWidth).rotateY(Math.PI / 2);
  const side = glossy(0xe0a020);
  const wedge = new THREE.Mesh(geometry, side);
  wedge.castShadow = wedge.receiveShadow = true;
  // Textured plane laid on the slope.
  const slope = Math.atan2(height, depth);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth * 2, Math.hypot(depth, height)),
    new THREE.MeshStandardMaterial({ map: getRampTexture(), roughness: 0.5 }),
  );
  face.rotation.x = -Math.PI / 2 + slope;
  face.position.set(0, height / 2 + 0.01, 0);
  face.receiveShadow = true;
  const group = new THREE.Group();
  group.add(wedge, face);
  return group;
}

/** Dark rail across the whole track that a saw blade slides along. */
export function createSawRail() {
  const width = CONFIG.track.width + 0.4;
  const group = new THREE.Group();
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.5), glossy(PALETTE.sawRail));
  rail.position.y = 0.06;
  const lips = [-1, 1].map((side) => {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 0.1), glossy(0x5a4ab8));
    lip.position.set(0, 0.09, side * 0.3);
    return lip;
  });
  group.add(rail, ...lips);
  group.traverse((o) => { o.receiveShadow = true; });
  return group;
}

/** Half-sunk spinning blade: purple disc with orange teeth. Spin `blade.rotation.z`. */
export function createSaw(radius) {
  const group = new THREE.Group();
  const blade = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.16, 32).rotateX(Math.PI / 2), glossy(PALETTE.saw, { metalness: 0.2 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, 0.24, 16).rotateX(Math.PI / 2), glossy(0xdedcf0, { metalness: 0.6 }));
  blade.add(disc, hub);
  const toothMaterial = glossy(PALETTE.sawTeeth, { roughness: 0.25 });
  const teeth = 16;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.16, radius * 0.34, 4), toothMaterial);
    tooth.position.set(Math.cos(a) * radius * 0.88, Math.sin(a) * radius * 0.88, 0);
    tooth.rotation.z = a - Math.PI / 2 - 0.35; // raked like a real blade
    tooth.scale.z = 0.4;
    blade.add(tooth);
  }
  blade.traverse((o) => { o.castShadow = true; });
  blade.position.y = radius * 0.35; // mostly above the rail, the rest sunk in the slot
  group.add(blade);
  return { group, blade };
}

/** Round black bomb with a lit fuse, sitting on a purple pad. Pulse `spark` to make it fizz. */
export function createBomb(radius) {
  const group = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.6, radius * 1.8, 0.16, 8), glossy(PALETTE.bombPad));
  pad.position.y = 0.08;
  pad.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.45, 0.07, 8, 32).rotateX(Math.PI / 2),
    glossy(0xff8a3a, { emissive: 0xff6a1a, emissiveIntensity: 0.8 }),
  );
  ring.position.y = 0.17;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), glossy(PALETTE.bomb, { roughness: 0.2, metalness: 0.3 }));
  shell.position.y = radius + 0.12;
  shell.castShadow = true;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.28, radius * 0.32, radius * 0.3, 12), glossy(0x5c5670));
  neck.position.y = radius * 2 + 0.12;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, radius * 0.5, 6), glossy(0xd8c8a0));
  fuse.position.set(0.06, radius * 2.35 + 0.12, 0);
  fuse.rotation.z = -0.4;
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.fuse, toneMapped: false }),
  );
  spark.position.set(0.16, radius * 2.55 + 0.12, 0);
  group.add(pad, ring, shell, neck, fuse, spark);
  return { group, spark, ring };
}

/**
 * Pendulum axe on a gantry over the track. Swing `pivot.rotation.z`: the blade centre sits `length`
 * below the pivot, which is `pivotHeight` above the floor.
 */
export function createAxe(length, pivotHeight, halfWidth) {
  const half = CONFIG.track.width / 2 + 0.3;
  const group = new THREE.Group();
  const frame = glossy(PALETTE.sawRail);
  const posts = [-1, 1].map((side) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, pivotHeight + 0.4, 0.4), frame);
    post.position.set(side * half, (pivotHeight + 0.4) / 2, 0);
    return post;
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.4, 0.4, 0.5), frame);
  beam.position.y = pivotHeight + 0.2;

  const pivot = new THREE.Group();
  pivot.position.y = pivotHeight;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, length, 8), glossy(PALETTE.axeHandle));
  arm.position.y = -length / 2;
  // Crescent head: flat top against the arm, curved cutting edge underneath.
  const head = new THREE.Shape();
  head.moveTo(-halfWidth, 0.45);
  head.lineTo(halfWidth, 0.45);
  head.quadraticCurveTo(halfWidth * 1.2, -0.35, 0, -0.6);
  head.quadraticCurveTo(-halfWidth * 1.2, -0.35, -halfWidth, 0.45);
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(head, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }),
    glossy(PALETTE.axe, { roughness: 0.2, metalness: 0.5 }),
  );
  blade.position.set(0, -length, -0.11);
  pivot.add(arm, blade);

  group.add(...posts, beam, pivot);
  group.traverse((o) => { o.castShadow = true; });
  return { group, pivot };
}

/** Stone pillar with a crown of spikes. Sits on the floor, centred on the origin. */
export function createSpikedPillar(halfWidth, halfDepth, height = 2.2) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, height, halfDepth * 2), glossy(PALETTE.pillar));
  shaft.position.y = height / 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 + 0.2, 0.25, halfDepth * 2 + 0.2), glossy(PALETTE.pillarCap));
  cap.position.y = height + 0.12;
  group.add(shaft, cap);
  const spikeGeometry = new THREE.ConeGeometry(0.2, 0.8, 8);
  const spikeMaterial = glossy(PALETTE.spike, { roughness: 0.2 });
  for (let x = -halfWidth + 0.35; x <= halfWidth - 0.3; x += 0.6) {
    for (let z = -halfDepth + 0.3; z <= halfDepth - 0.25; z += 0.6) {
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      spike.position.set(x, height + 0.65, z);
      group.add(spike);
    }
  }
  group.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  return group;
}

/**
 * Heavy block that slides in from a rail on a piston. Move `block.position.x` (its centre) and the
 * piston stretches back to the rail by itself through `setCentre`.
 */
export function createPusher(halfWidth, halfDepth, edgeX) {
  const side = Math.sign(edgeX);
  const height = 1.6;
  const group = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, height, halfDepth * 2), glossy(PALETTE.pusher));
  block.position.y = height / 2;
  // Dark chevron ribs on the inner face, so it reads as "this pushes".
  const ribMaterial = glossy(PALETTE.pillarCap);
  for (const dz of [-0.55, 0, 0.55]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, height * 0.7, 0.28), ribMaterial);
    rib.position.set(-side * (halfWidth + 0.05), height / 2, dz * halfDepth * 1.6);
    block.add(rib);
  }
  const piston = new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 0.5), glossy(PALETTE.pusherPiston, { metalness: 0.5 }));
  piston.position.y = height / 2;
  group.add(block, piston);
  group.traverse((o) => { o.castShadow = true; });
  /** `x` is the block centre; the piston spans from the rail (just outside it) to the block. */
  const setCentre = (x) => {
    block.position.x = x;
    const from = edgeX + side * (halfWidth + 0.4);
    piston.scale.x = Math.max(0.01, Math.abs(from - x));
    piston.position.x = (from + x) / 2;
  };
  return { group, block, setCentre };
}

/** Studded crusher ball. Spin `roller.rotation.x` to roll it; `group` is what to move. */
export function createBall(radius) {
  const group = new THREE.Group();
  const roller = new THREE.Group();
  roller.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), glossy(PALETTE.ball, { roughness: 0.3, metalness: 0.2 })));
  const studs = glossy(PALETTE.ballStud, { roughness: 0.3 });
  // Studs on a fibonacci sphere: evenly spread, so the roll reads from every angle.
  const count = 18;
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const normal = new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    const stud = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.17, radius * 0.4, 8), studs);
    stud.position.copy(normal).multiplyScalar(radius * 1.02);
    stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    roller.add(stud);
  }
  group.add(roller);
  group.traverse((o) => { o.castShadow = true; });
  return { group, roller };
}

/** Translucent yellow strip on the floor that warns which lane the ball will take. Fade `strip.material`. */
export function createBallLane(width, length) {
  const material = new THREE.MeshBasicMaterial({ color: PALETTE.ballWarn, transparent: true, opacity: 0, depthWrite: false });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
  strip.position.y = 0.04;
  strip.renderOrder = 1;
  return strip;
}

/** Flat ring that grows on the water where the ball landed. Scale it and fade `material`. */
export function createRipple() {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32).rotateX(-Math.PI / 2), material);
  ring.visible = false;
  return ring;
}
