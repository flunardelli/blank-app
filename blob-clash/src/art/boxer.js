// The boxers (the champion and every boss): a skinned jelly body (character.js) dressed with rigid
// accessories (gloves, boots, trunks, faces, headgear) that ride on its bones. They are posed either by the
// keyframed clips of moves.js (`applyPose`) or by retargeted clips (animPlayer.js).
//
// Rig (rig units, feet at y = 0, facing +z):
//   root (world placement & scale) -> frame (body proportions) -> skinned mesh -> bones
import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { BOSS_BODY, CHAMPION_BODY } from './bodySpecs.js';
import { createSkinnedBody, posesToBones } from './character.js';
import { glossy, glove, gummyMaterial } from './models.js';

const shadowed = (mesh) => {
  mesh.castShadow = true;
  return mesh;
};

// ---- Faces & headgear (positions are relative to the head centre) -------------------
function angryEyes(radius) {
  const face = new THREE.Group();
  const white = glossy(0xffffff, { roughness: 0.15 });
  const black = glossy(0x111111, { roughness: 0.15 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.28, 16, 12), white);
    eye.scale.set(1, 1.15, 0.6);
    eye.position.set(side * radius * 0.4, radius * 0.08, radius * 0.86);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.15, 12, 10), black);
    pupil.position.set(-side * radius * 0.04, -radius * 0.03, radius * 0.2);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.045, 8, 6), shine);
    glint.position.set(radius * 0.05, radius * 0.06, radius * 0.12);
    pupil.add(glint);
    eye.add(pupil);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.06, radius * 0.38, 4, 8), black);
    brow.rotation.z = Math.PI / 2 + side * 0.45;
    brow.position.set(side * radius * 0.36, radius * 0.42, radius * 0.9);
    face.add(eye, brow);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.2, radius * 0.045, 6, 16, Math.PI), black);
  mouth.position.set(0, -radius * 0.42, radius * 0.9);
  face.add(mouth);
  return face;
}

const cap = (radius, color, extent = 0.55) => new THREE.Mesh(
  new THREE.SphereGeometry(radius, 28, 16, 0, Math.PI * 2, 0, Math.PI * extent),
  glossy(color, { roughness: 0.25, metalness: 0.15 }),
);

// One builder per roster `headgear` value, sized for a head of radius 0.4.
const HEADGEAR = {
  football() {
    const group = new THREE.Group();
    const shell = cap(0.46, 0xd8262e, 0.6);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.465, 0.045, 8, 32, Math.PI), glossy(0xffffff));
    stripe.rotation.y = Math.PI / 2;
    const maskMaterial = glossy(0xdedede, { metalness: 0.5 });
    const bars = [0.02, -0.12, -0.24].map((y) => {
      const bar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.028, 6, 20, Math.PI * 0.7), maskMaterial);
      bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.15);
      bar.position.set(0, y, 0.12);
      return bar;
    });
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), maskMaterial);
    guard.position.set(0, -0.12, 0.5);
    group.add(shell, stripe, guard, ...bars);
    return group;
  },
  spartan() {
    const group = new THREE.Group();
    const shell = cap(0.46, 0xe8b23a, 0.62);
    const crest = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 4, 10), glossy(0xd8262e));
    crest.rotation.x = Math.PI / 2;
    crest.scale.set(1, 1, 3);
    crest.position.set(0, 0.5, -0.05);
    const cheeks = [-1, 1].map((side) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.28), glossy(0xe8b23a, { metalness: 0.3 }));
      plate.position.set(side * 0.38, -0.14, 0.2);
      plate.rotation.y = side * 0.4;
      return plate;
    });
    group.add(shell, crest, ...cheeks);
    return group;
  },
  crown() {
    const group = new THREE.Group();
    const gold = glossy(0xffc21a, { metalness: 0.5, roughness: 0.2 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.2, 24, 1, true), gold);
    band.material.side = THREE.DoubleSide;
    group.add(band);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), gold);
      spike.position.set(Math.sin(a) * 0.3, 0.2, Math.cos(a) * 0.3);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glossy(i % 2 ? 0xd8262e : 0x2f56d6));
      gem.position.set(Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32);
      group.add(spike, gem);
    }
    group.position.y = 0.36;
    return group;
  },
  viking() {
    const group = new THREE.Group();
    group.add(cap(0.45, 0x9aa3b5, 0.5));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 32), glossy(0x6b7280, { metalness: 0.4 }));
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    const horn = glossy(0xfff1d0);
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 12), horn);
      h.position.set(side * 0.5, 0.24, 0);
      h.rotation.z = -side * 0.9;
      group.add(h);
    }
    group.position.y = 0.04;
    return group;
  },
  mohawk() {
    const group = new THREE.Group();
    const hair = glossy(0xff2f8e);
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 8), hair);
      spike.position.set(0, 0.12 + Math.sin((i / 5) * Math.PI) * 0.06, -0.32 + i * 0.13);
      spike.rotation.x = (i - 2.5) * 0.18;
      group.add(spike);
    }
    group.position.y = 0.3;
    return group;
  },
};

// ---- Rig ------------------------------------------------------------------------
function createRig(body, material, frame = [1, 1]) {
  const root = new THREE.Group();
  const frameGroup = new THREE.Group();
  frameGroup.scale.set(frame[0], frame[1], frame[0]);
  frameGroup.add(body.mesh);
  root.add(frameGroup);
  const torsoY = body.spec.joints.find((joint) => joint.name === 'Torso').pos[1];
  return {
    root, body, material, hipY: body.spec.hipY,
    head: body.bones.Head,
    torso: body.bones.Torso, // skin gear rides on it...
    gearOffset: new THREE.Vector3(0, -torsoY, 0), // ...and is modelled from the ground up
    anchor: new THREE.Vector3(),
  };
}

const attach = (bone, object, { position, scale } = {}) => {
  if (position) object.position.set(...position);
  if (scale) object.scale.setScalar(scale);
  bone.add(object);
  return object;
};

function addGloves(body, color, scale) {
  for (const suffix of ['L', 'R']) {
    attach(body.bones[`Hand${suffix}`], glove(color), { position: [0, -0.12 * scale, 0], scale });
  }
}

function addBoots(body, color) {
  const material = glossy(color);
  for (const suffix of ['L', 'R']) {
    const foot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), material));
    foot.scale.set(1, 0.7, 1.5);
    attach(body.bones[`Foot${suffix}`], foot, { position: [0, -0.06, 0.06] });
  }
}

/** Makes a boss's jelly glow (0 = off): the warning before its big punch. */
export function setGlow(rig, amount, color = 0xff3a2a) {
  rig.material.emissive.set(color).multiplyScalar(amount);
}

/** Puts a rig in `pose` (see moves.js); dash/lift move the root away from rig.anchor. */
export function applyPose(rig, pose) {
  posesToBones(rig.body, pose);
  placeRoot(rig, pose);
}

/** Dash and lift of a pose, the part of it that moves the whole fighter rather than its bones. */
export function placeRoot(rig, { dash, lift }) {
  const facing = rig.root.rotation.y;
  rig.root.position.set(
    rig.anchor.x + Math.sin(facing) * dash,
    rig.anchor.y + lift,
    rig.anchor.z + Math.cos(facing) * dash,
  );
}

// ---- The two kinds of boxer ------------------------------------------------------
/** Boss from a roster entry (bosses.js): a lean gummy fighter in trunks, like the reference. */
export function createBoss({ colors, glove: gloveColor, headgear, body: frame }) {
  const material = gummyMaterial();
  const body = createSkinnedBody(BOSS_BODY, material, colors);
  const hips = body.bones.Hips;

  const trunks = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.3, 24), glossy(0xffffff, { roughness: 0.4 })));
  const waistband = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 28), glossy(gloveColor)));
  waistband.rotation.x = Math.PI / 2;
  attach(hips, trunks);
  attach(hips, waistband, { position: [0, 0.14, 0] });

  const headGroup = new THREE.Group();
  headGroup.add(angryEyes(0.4), HEADGEAR[headgear]());
  attach(body.bones.Head, headGroup, { position: [0, 0, 0.03], scale: 0.8 });
  addGloves(body, gloveColor, 0.85);
  addBoots(body, 0x2b2b3a);

  const rig = createRig(body, material, frame);
  rig.root.scale.setScalar(2.6);
  return rig;
}

/** The crowd merged into one jelly boxer, dripping, with red gloves. */
export function createChampion(material, colors) {
  const body = createSkinnedBody(CHAMPION_BODY, material, colors);
  addGloves(body, PALETTE.championGlove, 0.78);
  return createRig(body, material);
}
