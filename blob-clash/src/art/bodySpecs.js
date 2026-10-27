// Layouts of the two skinned jelly bodies: the lean boss and the chubby champion. Pure numbers, so the
// bone hierarchy and the parts that become the mesh can be tested without three.js.
//
// Rig units, feet at y = 0, facing +z, `L` is the side on +x. Bone names follow the Quaternius
// RobotExpressive skeleton (without the dots glTF strips from names), so its clips transfer by name.
import { CONFIG } from '../config.js';

const SIDES = [['L', 1], ['R', -1]];

/** Joints of one arm hanging from `shoulder`, bent outwards by the bind pose angle (CONFIG.character.bindSpread). */
function armJoints([sx, sy], { upper, fore }, side) {
  const spread = CONFIG.character.bindSpread;
  const [dx, dy] = [Math.sin(spread) * side, -Math.cos(spread)];
  const elbow = [sx * side + dx * upper, sy + dy * upper, 0];
  const wrist = [elbow[0] + dx * fore, elbow[1] + dy * fore, 0];
  return { shoulder: [sx * side, sy, 0], elbow, wrist, tilt: spread * side };
}

/**
 * Builds a body spec. `torso` and `head` are the y of the chest and head joints; `parts(joint)` returns
 * the shapes owned by each bone, given a lookup for joint positions.
 */
function buildSpec({ name, hipY, waist, torso, neck, head, arm, armSize, leg, legSize, parts, gradient }) {
  const joints = [
    { name: 'Body', parent: null, pos: [0, hipY, 0] },
    { name: 'Hips', parent: 'Body', pos: [0, hipY, 0] },
    { name: 'Abdomen', parent: 'Hips', pos: [0, waist, 0] },
    { name: 'Torso', parent: 'Abdomen', pos: [0, torso, 0] },
    { name: 'Neck', parent: 'Torso', pos: [0, neck, 0] },
    { name: 'Head', parent: 'Neck', pos: [0, head, 0] },
  ];
  for (const [suffix, side] of SIDES) {
    const a = armJoints(arm, armSize, side);
    joints.push(
      { name: `UpperArm${suffix}`, parent: 'Torso', pos: a.shoulder, tilt: a.tilt },
      { name: `LowerArm${suffix}`, parent: `UpperArm${suffix}`, pos: a.elbow },
      { name: `Hand${suffix}`, parent: `LowerArm${suffix}`, pos: a.wrist },
      { name: `UpperLeg${suffix}`, parent: 'Body', pos: [leg[0] * side, hipY, 0] },
      { name: `LowerLeg${suffix}`, parent: `UpperLeg${suffix}`, pos: [leg[0] * side, hipY - legSize.upper, 0] },
      { name: `Foot${suffix}`, parent: `LowerLeg${suffix}`, pos: [leg[0] * side, legSize.ankle, 0] },
    );
  }
  const at = (jointName) => joints.find((j) => j.name === jointName).pos;
  const shapes = parts(at);
  for (const [suffix] of SIDES) {
    shapes.push(
      { bone: `UpperArm${suffix}`, type: 'capsule', a: at(`UpperArm${suffix}`), b: at(`LowerArm${suffix}`), r: armSize.radius },
      { bone: `LowerArm${suffix}`, type: 'capsule', a: at(`LowerArm${suffix}`), b: at(`Hand${suffix}`), r: armSize.radius * 0.92 },
      { bone: `UpperLeg${suffix}`, type: 'capsule', a: at(`UpperLeg${suffix}`), b: at(`LowerLeg${suffix}`), r: legSize.radius },
      { bone: `LowerLeg${suffix}`, type: 'capsule', a: at(`LowerLeg${suffix}`), b: at(`Foot${suffix}`), r: legSize.radius },
    );
  }
  return { name, hipY, joints, parts: shapes, gradient, boneNames: joints.map((j) => j.name) };
}

const ellipsoid = (bone, c, radii) => ({ bone, type: 'ellipsoid', c, radii });

/** Lean gummy fighter in trunks: wide chest, thin waist, round head. */
export const BOSS_BODY = buildSpec({
  name: 'boss',
  hipY: 0.6,
  waist: 0.7,
  torso: 1.0,
  neck: 1.24,
  head: 1.55,
  arm: [0.38, 1.12],
  armSize: { upper: 0.26, fore: 0.24, radius: 0.085 },
  leg: [0.14],
  legSize: { upper: 0.31, ankle: 0.1, radius: 0.1 },
  gradient: [0, 1.75],
  parts: (at) => [
    ellipsoid('Hips', [0, 0.62, 0], [0.28, 0.2, 0.22]),
    ellipsoid('Abdomen', [0, 0.84, 0], [0.26, 0.2, 0.2]),
    ellipsoid('Torso', [0, 1.04, 0], [0.37, 0.3, 0.29]),
    { bone: 'Neck', type: 'capsule', a: [0, 1.2, 0], b: [0, 1.36, 0], r: 0.12 },
    ellipsoid('Head', at('Head'), [0.32, 0.336, 0.28]),
  ],
});

/** Jelly bean: wide hips, round head, no neck, a few melting drops. */
export const CHAMPION_BODY = buildSpec({
  name: 'champion',
  hipY: 0.3,
  waist: 0.55,
  torso: 0.85,
  neck: 0.95,
  head: 1.05,
  arm: [0.46, 0.82],
  armSize: { upper: 0.24, fore: 0.18, radius: 0.12 },
  leg: [0.2],
  legSize: { upper: 0.1, ankle: 0.14, radius: 0.14 },
  gradient: [0.1, 1.35],
  parts: (at) => [
    ellipsoid('Hips', [0, 0.5, 0], [0.46, 0.26, 0.44]),
    ellipsoid('Abdomen', [0, 0.68, 0], [0.52, 0.4, 0.5]),
    ellipsoid('Torso', [0, 0.82, 0], [0.5, 0.3, 0.46]),
    ellipsoid('Head', [0, at('Head')[1] - 0.01, 0], [0.42, 0.38, 0.4]),
    // Drops hanging off the body: [x, y, z, size], stretched downwards like melting jelly.
    ...[[0.4, 0.45, 0.16, 0.08], [-0.34, 0.4, -0.2, 0.07], [0.1, 0.32, -0.38, 0.06], [-0.2, 0.36, 0.34, 0.07]]
      .map(([x, y, z, size]) => ellipsoid('Abdomen', [x, y - size * 0.6, z], [size, size * 1.7, size])),
  ],
});
