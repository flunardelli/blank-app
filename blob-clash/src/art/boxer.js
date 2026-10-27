// Articulated boxers (the champion and every boss), posed by the keyframe clips in moves.js.
//
// Rig hierarchy (rig units, feet at y = 0, facing +z):
//   root (world placement & scale) -> frame (body proportions) -> hips (height, squash)
//     -> torso (lean, twist) -> head, shoulders -> upper arm -> elbow -> forearm, glove
//     -> legs (swing at the hip)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config.js';
import { beanGeometry, dripGeometries, glossy, glove, gummyMaterial, paintGradient } from './models.js';

const shadowed = (mesh) => {
  mesh.castShadow = true;
  return mesh;
};

// A body part painted with the boxer's jelly gradient, sampled at the height the part rests at.
function part(geometry, material, { bottom, top }, restY, [y0, y1]) {
  return shadowed(new THREE.Mesh(paintGradient(geometry, bottom, top, y0 - restY, y1 - restY), material));
}

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

// ---- Generic rig ------------------------------------------------------------------
function buildArm(side, { shoulder, upper, fore, radius, gloveColor, gloveScale }, paint) {
  const pivot = new THREE.Group();
  pivot.position.set(side * shoulder[0], shoulder[1], 0);
  const restY = shoulder[1];
  const upperArm = paint(new THREE.CapsuleGeometry(radius, upper, 4, 10).translate(0, -upper / 2, 0), restY);
  const elbow = new THREE.Group();
  elbow.position.y = -upper;
  const forearm = paint(new THREE.CapsuleGeometry(radius * 0.92, fore, 4, 10).translate(0, -fore / 2, 0), restY - upper);
  const fist = glove(gloveColor);
  fist.scale.setScalar(gloveScale);
  fist.position.y = -fore - 0.12 * gloveScale;
  elbow.add(forearm, fist);
  pivot.add(upperArm, elbow);
  return { pivot, elbow, glove: fist };
}

function buildLeg(side, { hipX, length, radius, boot }, paint) {
  const pivot = new THREE.Group();
  pivot.position.x = side * hipX;
  pivot.add(paint(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 10).translate(0, -length / 2, 0), 0));
  if (boot) {
    const foot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.5, 14, 10), glossy(boot)));
    foot.scale.set(1, 0.7, 1.5);
    foot.position.set(0, -length + radius * 0.6, radius * 0.6);
    pivot.add(foot);
  }
  return pivot;
}

function createRig({ hipY, torso, head, arms, legs, frame = [1, 1] }) {
  const root = new THREE.Group();
  const frameGroup = new THREE.Group();
  frameGroup.scale.set(frame[0], frame[1], frame[0]);
  const hips = new THREE.Group();
  hips.position.y = hipY;
  const torsoPivot = new THREE.Group();
  torsoPivot.add(...torso);
  if (head) torsoPivot.add(head);
  const armRigs = [1, -1].map((side) => arms(side));
  armRigs.forEach((arm) => torsoPivot.add(arm.pivot));
  const legRigs = [1, -1].map((side) => legs(side));
  hips.add(torsoPivot, ...legRigs);
  frameGroup.add(hips);
  root.add(frameGroup);
  const [l, r] = armRigs;
  return {
    root, hips, torso: torsoPivot, head, hipY,
    arms: { l, r }, legs: { l: legRigs[0], r: legRigs[1] },
    gloves: [l.glove, r.glove],
    anchor: new THREE.Vector3(),
  };
}

/** Makes a boss's jelly glow (0 = off): the warning before its big punch. */
export function setGlow(rig, amount, color = 0xff3a2a) {
  rig.material.emissive.set(color).multiplyScalar(amount);
}

/** Puts a rig in `pose` (see moves.js); dash/lift move the root away from rig.anchor. */
export function applyPose(rig, pose) {
  const stretch = 1 + pose.squash;
  rig.hips.position.y = rig.hipY + pose.y;
  rig.hips.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  rig.torso.rotation.set(pose.lean, pose.twist, 0);
  if (rig.head) rig.head.rotation.x = -pose.head;
  for (const [key, side] of [['l', 1], ['r', -1]]) {
    const arm = rig.arms[key];
    arm.pivot.rotation.set(-pose[`${key}Raise`], 0, side * pose[`${key}Spread`]);
    arm.elbow.rotation.x = -pose[`${key}Elbow`];
    rig.legs[key].rotation.x = -pose[`${key}Leg`];
  }
  const facing = rig.root.rotation.y;
  rig.root.position.set(
    rig.anchor.x + Math.sin(facing) * pose.dash,
    rig.anchor.y + pose.lift,
    rig.anchor.z + Math.cos(facing) * pose.dash,
  );
}

// ---- The two kinds of boxer ------------------------------------------------------
/** Boss from a roster entry (bosses.js): a lean gummy fighter in trunks, like the reference. */
export function createBoss({ colors, glove: gloveColor, headgear, body }) {
  const material = gummyMaterial();
  const range = [0, 1.75];
  const hipY = 0.6;
  const paint = (restY) => (geometry) => part(geometry, material, colors, restY, range);

  // Chest wider than the waist; the outline is revolved around the spine.
  const outline = [[0, -0.04], [0.24, 0], [0.27, 0.12], [0.33, 0.36], [0.36, 0.5], [0.3, 0.6], [0.14, 0.66], [0, 0.68]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const chest = paint(hipY)(new THREE.LatheGeometry(new THREE.SplineCurve(outline).getPoints(18), 28).scale(1, 1, 0.78));
  const trunks = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.3, 24), glossy(0xffffff, { roughness: 0.4 })));
  trunks.position.y = 0.0;
  const waistband = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 28), glossy(gloveColor)));
  waistband.rotation.x = Math.PI / 2;
  waistband.position.y = 0.14;

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.95;
  const neck = paint(hipY + 0.95)(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 12).translate(0, -0.3, 0));
  const skull = paint(hipY + 0.95)(new THREE.SphereGeometry(0.4, 28, 20).scale(1, 1.05, 0.95));
  headGroup.add(neck, skull, angryEyes(0.4), HEADGEAR[headgear]());
  headGroup.scale.setScalar(0.8);

  const rig = createRig({
    hipY,
    frame: body,
    torso: [chest, trunks, waistband],
    head: headGroup,
    arms: (side) => buildArm(side, {
      shoulder: [0.38, 0.52], upper: 0.26, fore: 0.24, radius: 0.085, gloveColor, gloveScale: 0.85,
    }, (geometry, restY) => paint(hipY + restY)(geometry)),
    legs: (side) => buildLeg(side, { hipX: 0.14, length: 0.62, radius: 0.1, boot: 0x2b2b3a }, paint(hipY)),
  });
  rig.material = material;
  rig.root.scale.setScalar(2.6);
  return rig;
}

/** The crowd merged into one jelly boxer, dripping, with red gloves. */
export function createChampion(material, colors) {
  const range = [0.1, 1.35];
  const hipY = 0.3;
  const paint = (restY) => (geometry) => part(geometry, material, colors, restY, range);
  const body = paint(0)(mergeGeometries([
    beanGeometry(28),
    ...dripGeometries([[0.4, 0.45, 0.16, 0.08], [-0.34, 0.4, -0.2, 0.07], [0.1, 0.32, -0.38, 0.06], [-0.2, 0.36, 0.34, 0.07]], 10),
  ]));
  body.position.y = -hipY;

  const rig = createRig({
    hipY,
    torso: [body],
    arms: (side) => buildArm(side, {
      shoulder: [0.5, 0.5], upper: 0.24, fore: 0.18, radius: 0.12, gloveColor: PALETTE.championGlove, gloveScale: 0.78,
    }, (geometry, restY) => paint(hipY + restY)(geometry)),
    legs: (side) => buildLeg(side, { hipX: 0.2, length: 0.34, radius: 0.14 }, paint(hipY)),
  });
  return rig;
}
