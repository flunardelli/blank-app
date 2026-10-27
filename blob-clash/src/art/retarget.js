// Moves the animator-made clips of the RobotExpressive model (Quaternius, CC0, shipped with three.js)
// onto our jelly skeleton with three.js's SkeletonUtils.retargetClip.
//
// The robot and our bodies share bone names but not proportions or bind poses, so each bone's world
// rotation is carried over together with an offset between the two rest orientations, and the hip's
// travel is scaled by the ratio of hip heights. Only the clips are reused: the robot's mesh never shows.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { createSkinnedBody } from './character.js';

// Our bone -> the robot's (glTF strips dots from names; the robot has two nodes called Torso).
const SOURCE_BONES = {
  Body: 'Body', Hips: 'Hips', Abdomen: 'Abdomen', Torso: 'Torso_1', Neck: 'Neck', Head: 'Head',
  UpperArmL: 'UpperArmL', LowerArmL: 'LowerArmL', UpperArmR: 'UpperArmR', LowerArmR: 'LowerArmR',
  UpperLegL: 'UpperLegL', LowerLegL: 'LowerLegL', UpperLegR: 'UpperLegR', LowerLegR: 'LowerLegR',
};
// Our bones with no counterpart: retargetClip falls back to a bone's own name, which would wrongly match
// the robot's foot IK targets, so these point at a name the robot does not have.
const NO_SOURCE = '(none)';
const IGNORED_BONES = { HandL: NO_SOURCE, HandR: NO_SOURCE, FootL: NO_SOURCE, FootR: NO_SOURCE };
const HIP = 'Body';

const worldRotation = (bone) => {
  const rotation = new THREE.Quaternion();
  bone.matrixWorld.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
  return rotation;
};

/** Reads the robot from a glb: its skinned mesh (for the skeleton) and its clips. */
export async function parseRobot(arrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
  let source = null;
  gltf.scene.traverse((node) => { if (node.isSkinnedMesh && !source) source = node; });
  gltf.scene.updateMatrixWorld(true);
  // Retargeting plays the clips on the robot, so its rest pose is recorded before that moves it.
  const rotations = Object.fromEntries(Object.values(SOURCE_BONES).map((name) => [name, worldRotation(source.skeleton.getBoneByName(name))]));
  const hip = new THREE.Vector3().setFromMatrixPosition(source.skeleton.getBoneByName(HIP).matrixWorld);
  return { source, animations: gltf.animations, rest: { rotations, hip } };
}

export async function loadRobot(url = CONFIG.character.clipFile) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return parseRobot(await response.arrayBuffer());
}

/**
 * The robot's clips named in `names`, retargeted for the body layout `spec`. The result maps a clip name
 * to an AnimationClip whose tracks address our bones by name, so it plays on any fighter built from `spec`.
 */
export function retargetClips(robot, spec, names = CONFIG.character.clips) {
  const body = createSkinnedBody(spec, new THREE.MeshBasicMaterial(), { bottom: 0, top: 0 });
  body.mesh.updateMatrixWorld(true);
  const { source } = robot;

  // Rest orientation offsets: world delta of the robot's bone, then the rest orientation of ours.
  const localOffsets = {};
  for (const [ours, theirs] of Object.entries(SOURCE_BONES)) {
    const offset = robot.rest.rotations[theirs].clone().invert().multiply(worldRotation(body.bones[ours]));
    localOffsets[ours] = new THREE.Matrix4().makeRotationFromQuaternion(offset);
  }
  const robotHip = robot.rest.hip;
  const scale = spec.hipY / robotHip.y;
  const restHip = body.rest.Body.position;

  const clips = new Map();
  for (const name of names) {
    const clip = robot.animations.find((candidate) => candidate.name === name);
    if (!clip) continue;
    // Only the bones' own tracks: the robot also animates face morphs we have no mesh for.
    const boneTracks = clip.tracks.filter((track) => Object.values(SOURCE_BONES).includes(track.name.split('.')[0]));
    const retargeted = SkeletonUtils.retargetClip(body.mesh, source, new THREE.AnimationClip(name, clip.duration, boneTracks), {
      names: { ...SOURCE_BONES, ...IGNORED_BONES }, hip: HIP, scale, localOffsets,
    });
    // The hip track holds absolute robot positions; ours moves relative to the bind pose.
    const hip = retargeted.tracks.find((track) => track.name === '.bones[Body].position');
    if (hip) {
      for (let i = 0; i < hip.values.length; i += 3) {
        hip.values[i] += restHip.x - robotHip.x * scale;
        hip.values[i + 1] += restHip.y - robotHip.y * scale;
        hip.values[i + 2] += restHip.z - robotHip.z * scale;
      }
    }
    retargeted.name = name;
    clips.set(name, retargeted);
  }
  return clips;
}
