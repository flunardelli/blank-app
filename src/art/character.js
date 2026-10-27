// Skinned jelly fighters: one continuous mesh (see bodySdf.js) bent by a bone hierarchy that uses the
// names of the Quaternius RobotExpressive skeleton, so its animator-made clips can be retargeted onto it.
//
// Two ways of moving the bones share this rig:
//   - `posesToBones` turns a pose of the keyframed clips in moves.js (anim.js) into bone rotations;
//   - an AnimationMixer plays clips retargeted from the robot (retarget.js, animPlayer.js).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bodyField, partBounds, polygonize, skinWeights } from './bodySdf.js';
import { paintGradient } from './models.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Heavy part (isosurface + weights), done once per body layout and shared by every fighter built from it.
const meshes = new Map();
function bodyMesh(spec) {
  if (!meshes.has(spec.name)) {
    const c = CONFIG.character;
    const surface = polygonize(bodyField(spec.parts, c.blend), partBounds(spec.parts, 0.05), c.cell);
    const skin = skinWeights(spec.parts, spec.boneNames, surface.positions, { softness: c.softness, influences: c.influences });
    meshes.set(spec.name, { ...surface, skin });
  }
  return meshes.get(spec.name);
}

/** Bones in the bind pose: every joint at its rest position, arms bent outwards by their `tilt`. */
function buildBones(spec) {
  const bones = {};
  const tilts = {};
  for (const joint of spec.joints) {
    const bone = new THREE.Bone();
    bone.name = joint.name;
    const parent = joint.parent && bones[joint.parent];
    const parentTilt = joint.parent ? tilts[joint.parent] : 0;
    const origin = parent ? spec.joints.find((j) => j.name === joint.parent).pos : [0, 0, 0];
    // Joint positions are in the body frame; a bone sits in its parent's (possibly tilted) frame.
    bone.position.set(...joint.pos.map((v, i) => v - origin[i])).applyAxisAngle(Z_AXIS, -parentTilt);
    bone.rotation.z = joint.tilt ?? 0;
    tilts[joint.name] = parentTilt + (joint.tilt ?? 0);
    parent?.add(bone);
    bones[joint.name] = bone;
  }
  return bones;
}

/**
 * Creates the skinned body of a fighter. Returns the mesh (bones are its children), the bones by name
 * and their rest transforms. The gradient is painted into vertex colours so skins can repaint it.
 */
export function createSkinnedBody(spec, material, colors) {
  const { positions, normals, indices, skin } = bodyMesh(spec);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skin.indices, CONFIG.character.influences));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skin.weights, CONFIG.character.influences));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  paintGradient(geometry, colors.bottom, colors.top, ...spec.gradient);

  const bones = buildBones(spec);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(bones.Body);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(spec.boneNames.map((name) => bones[name])));
  mesh.castShadow = true;
  mesh.frustumCulled = false; // the bounds are those of the bind pose, but fighters dash and jump
  const rest = Object.fromEntries(spec.boneNames.map((name) => [name, {
    position: bones[name].position.clone(), quaternion: bones[name].quaternion.clone(), scale: bones[name].scale.clone(),
  }]));
  return { mesh, bones, rest, spec };
}

/**
 * A bare copy of the bones for an AnimationMixer to play on. A mixer only rewrites a bone when its own
 * value changes, so the real bones (which pose, blend and springs also write to) are fed from this copy
 * instead of being animated directly.
 */
export function createDriver(spec) {
  const bones = buildBones(spec);
  const root = new THREE.Object3D();
  root.skeleton = { bones: spec.boneNames.map((name) => bones[name]) }; // where `.bones[Name]` tracks look
  root.add(bones.Body);
  return { root, bones };
}

/** Copies the transform of every bone of `from` onto the bone of the same name in `to`. */
export function copyBones(from, to) {
  for (const name in to) {
    to[name].position.copy(from[name].position);
    to[name].quaternion.copy(from[name].quaternion);
    to[name].scale.copy(from[name].scale);
  }
}

export function restoreBones({ bones, rest }) {
  for (const name in bones) {
    const { position, quaternion, scale } = rest[name];
    bones[name].position.copy(position);
    bones[name].quaternion.copy(quaternion);
    bones[name].scale.copy(scale);
  }
}

const euler = new THREE.Euler();

/** Puts the bones in `pose` (channels as in moves.js) from the bind pose; dash/lift are left to the root. */
export function posesToBones(body, pose) {
  const { bones, rest } = body;
  restoreBones(body);
  const stretch = 1 + pose.squash;
  bones.Body.position.y = rest.Body.position.y + pose.y;
  bones.Body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  bones.Abdomen.quaternion.setFromEuler(euler.set(pose.lean, pose.twist, 0));
  bones.Head.quaternion.setFromEuler(euler.set(-pose.head, 0, 0));
  for (const [suffix, side] of [['L', 1], ['R', -1]]) {
    const key = suffix.toLowerCase();
    bones[`UpperArm${suffix}`].quaternion.setFromEuler(euler.set(-pose[`${key}Raise`], 0, side * pose[`${key}Spread`]));
    bones[`LowerArm${suffix}`].quaternion.setFromEuler(euler.set(-pose[`${key}Elbow`], 0, 0));
    bones[`UpperLeg${suffix}`].quaternion.setFromEuler(euler.set(-pose[`${key}Leg`], 0, 0));
  }
}

const delta = new THREE.Quaternion();
const squashed = new THREE.Vector3();

/** Adds the offset of the running reactions (flinches) on top of whatever pose the bones are in. */
export function addPoseOffset({ bones }, offset) {
  const turn = (bone, x, y, z) => {
    if (x || y || z) bone.quaternion.premultiply(delta.setFromEuler(euler.set(x, y, z)));
  };
  if (offset.y) bones.Body.position.y += offset.y;
  if (offset.squash) {
    const stretch = 1 + offset.squash;
    bones.Body.scale.multiply(squashed.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch)));
  }
  turn(bones.Abdomen, offset.lean ?? 0, offset.twist ?? 0, 0);
  turn(bones.Head, -(offset.head ?? 0), 0, 0);
  for (const [suffix, side] of [['L', 1], ['R', -1]]) {
    const key = suffix.toLowerCase();
    turn(bones[`UpperArm${suffix}`], -(offset[`${key}Raise`] ?? 0), 0, side * (offset[`${key}Spread`] ?? 0));
    turn(bones[`LowerArm${suffix}`], -(offset[`${key}Elbow`] ?? 0), 0, 0);
  }
}
