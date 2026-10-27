import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AnimPlayer, RotationSpring, clipLibrary } from '../src/animPlayer.js';
import { createBoss, createChampion } from '../src/art/boxer.js';
import { BOSS_BODY, CHAMPION_BODY } from '../src/art/bodySpecs.js';
import { gummyMaterial } from '../src/art/models.js';
import { BOSSES } from '../src/bosses.js';
import { CONFIG, PALETTE } from '../src/config.js';
import { BOSS_MOVES, CHAMPION_MOVES, DANCES, GUARD, KNOCKED_OUT, REACTIONS, danceFor, idlePose } from '../src/moves.js';
import { Animator, clipDuration } from '../src/anim.js';
import { loadRobotFromDisk } from './support/robot.mjs';

const DT = 1 / 60;
const BONES = ['Body', 'Abdomen', 'Torso', 'Head', 'UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'UpperLegL', 'UpperLegR'];

const frame = (player, rig, seconds, { ambient = null, idle = () => idlePose(0, 1) } = {}) => {
  const poses = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    player.drive(rig, DT, idle(), ambient);
    poses.push(Object.fromEntries(BONES.map((name) => [name, rig.body.bones[name].quaternion.clone()])));
  }
  return poses;
};
const biggestStep = (poses, bones = BONES) => Math.max(...poses.slice(1).map((pose, i) => Math.max(...bones.map((n) => pose[n].angleTo(poses[i][n])))));
const turned = (a, b, bones = BONES) => Math.max(...bones.map((name) => a[name].angleTo(b[name])));

// The most a bone may turn in one frame while crossfading `before` into `incoming` (a function that starts
// the new motion on a player): the clip's own motion over those frames, plus an even share of the whole
// difference (a smoothstep peaks at 1.5x of it).
const blendLimit = (before, poses, incoming, makeRig, seconds = CONFIG.character.blendSeconds, bones = BONES) => {
  const frames = Math.round(seconds / DT);
  const alone = new AnimPlayer(GUARD);
  incoming(alone);
  const own = biggestStep(frame(alone, makeRig(), (frames + 1) * DT), bones);
  return own + 0.05 + (1.5 * turned(before, poses[frames], bones)) / frames;
};

// ---- Without clips (the library is empty until the last tests): the keyframed moves carry the game ----
test('without retargeted clips a move plays its keyframes and ends, as before', () => {
  const rig = createBoss(BOSSES[0]);
  const player = new AnimPlayer(GUARD);
  player.play(BOSS_MOVES.jab);
  assert.ok(player.busy);
  frame(player, rig, clipDuration(BOSS_MOVES.jab) + 0.2);
  assert.ok(!player.busy, 'the move finished');
  assert.ok(!player.running);
});

test('without clips playClip falls back to the keyframed move, and holds it', () => {
  const rig = createChampion(gummyMaterial(), PALETTE.player);
  const player = new AnimPlayer(GUARD);
  player.playClip('ThumbsUp', { loop: true, hold: true, fallback: CHAMPION_MOVES.cheer });
  frame(player, rig, 2);
  assert.ok(!player.running);
  assert.ok(player.action || player.pose.lRaise > 2, 'the cheer pose is held');
  const knocked = new AnimPlayer(GUARD);
  knocked.playClip('Death', { hold: true, fallback: KNOCKED_OUT });
  frame(knocked, rig, 1.5);
  assert.ok(knocked.busy && knocked.pose.lSpread > 1, 'the fallback hold stays up');
});

test('a retargeted clip that is not loaded never blocks idling', () => {
  const rig = createBoss(BOSSES[0]);
  const player = new AnimPlayer(GUARD);
  frame(player, rig, 0.5, { ambient: 'Idle' });
  assert.ok(!player.running, 'no clip, so the keyframed idle stays');
});

// ---- Springs ----
test('the jelly spring settles on its target after overshooting it', () => {
  const spring = new RotationSpring(220, 12);
  const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
  spring.update(new THREE.Quaternion(), DT);
  let overshoot = 0;
  let value;
  for (let t = 0; t < 4; t += DT) {
    value = spring.update(target, DT);
    overshoot = Math.max(overshoot, new THREE.Euler().setFromQuaternion(value).x - 0.8);
  }
  assert.ok(overshoot > 0.02, `wobbles past the target by ${overshoot.toFixed(3)} rad`);
  assert.ok(value.angleTo(target) < 1e-3, 'and comes to rest');
});

test('the jelly spring stays finite on long frames and takes the short way round', () => {
  const spring = new RotationSpring(300, 16);
  spring.update(new THREE.Quaternion(), DT);
  const far = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 3.1);
  const flipped = new THREE.Quaternion(-far.x, -far.y, -far.z, -far.w); // the same rotation, the other quaternion
  for (const dt of [0.2, 0.5, 1, DT]) {
    for (const target of [far, flipped]) {
      const value = spring.update(target, dt);
      assert.ok([value.x, value.y, value.z, value.w].every(Number.isFinite));
      assert.ok(Math.abs(value.length() - 1) < 1e-6);
    }
  }
  const second = new RotationSpring(300, 16);
  second.update(new THREE.Quaternion(), DT);
  second.update(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2), DT);
  assert.ok(second.velocity.y > 0, 'turns towards the target');
});

// ---- Victory dances ----
test('a keyframed dance loops past its length and blends in and out of the guard without a jump', () => {
  for (const id of ['viking', 'punk', 'king', 'rookie']) {
    const rig = createBoss(BOSSES.find((b) => b.id === id));
    const player = new AnimPlayer(GUARD);
    const before = frame(player, rig, 0.5);
    const start = before[before.length - 1];
    player.dance({ clip: null, move: danceFor(id).move });
    const dancing = frame(player, rig, 3);
    assert.ok(player.busy, `${id} is still dancing after 3 s`);
    assert.ok(biggestStep([start, ...dancing]) < 0.5, `${id}: biggest frame step ${biggestStep([start, ...dancing]).toFixed(2)} rad, wrap-around included`);
    player.play(BOSS_MOVES.jab);
    const out = frame(player, rig, 0.3);
    assert.ok(biggestStep([dancing[dancing.length - 1], ...out]) < 0.6, `${id} leaves the dance smoothly`);
  }
});

test('a dance with a clip falls back to its looping keyframes while the clip is not loaded', () => {
  const rig = createChampion(gummyMaterial(), PALETTE.player);
  const player = new AnimPlayer(GUARD);
  player.dance(DANCES.champion);
  frame(player, rig, 2.5);
  assert.ok(!player.running && player.action?.loop, 'keyframes, looping');
});

test('the landing reaction squashes and then stretches the body', () => {
  const anim = new Animator(GUARD);
  anim.react(REACTIONS.land);
  const squash = [];
  for (let i = 0; i < 40; i++) squash.push(anim.update(DT, GUARD).squash);
  assert.ok(Math.min(...squash) < -0.2, 'flattens');
  assert.ok(Math.max(...squash) > 0.05, 'springs back taller');
  assert.ok(Math.abs(squash[squash.length - 1]) < 0.01, 'and settles');
});

// ---- With the robot's clips ----
await clipLibrary.load([BOSS_BODY, CHAMPION_BODY], { robot: await loadRobotFromDisk(), pause: async () => {} });

test('the library holds every configured clip for both bodies', () => {
  for (const spec of [BOSS_BODY, CHAMPION_BODY]) {
    for (const name of CONFIG.character.clips) assert.ok(clipLibrary.get(spec, name), `${spec.name} ${name}`);
  }
  assert.equal(clipLibrary.get(BOSS_BODY, 'Moonwalk'), undefined);
});

test('switching from the keyframed idle to a clip never jumps: the pose blends over blendSeconds', () => {
  const rig = createChampion(gummyMaterial(), PALETTE.player);
  const player = new AnimPlayer(GUARD);
  frame(player, rig, 1);
  const before = Object.fromEntries(BONES.map((name) => [name, rig.body.bones[name].quaternion.clone()]));
  player.playClip('Dance', { loop: true });
  const poses = frame(player, rig, CONFIG.character.blendSeconds + 0.3);
  const first = Math.max(...BONES.map((name) => poses[0][name].angleTo(before[name])));
  assert.ok(first < 0.1, `first frame of the clip moves ${first.toFixed(3)} rad`);
  const limit = blendLimit(before, poses, (p) => p.playClip('Dance', { loop: true }), () => createChampion(gummyMaterial(), PALETTE.player));
  assert.ok(biggestStep([before, ...poses]) < limit, `no frame jumps (${biggestStep([before, ...poses]).toFixed(3)} rad, limit ${limit.toFixed(2)})`);
  assert.ok(player.running?.name === 'Dance');
});

test('the same switch with no blend would jump, so the blend is what keeps it smooth', () => {
  const original = CONFIG.character.blendSeconds;
  CONFIG.character.blendSeconds = 1e-6;
  try {
    const rig = createChampion(gummyMaterial(), PALETTE.player);
    const player = new AnimPlayer(GUARD);
    const idle = frame(player, rig, 1);
    player.playClip('Dance', { loop: true });
    const poses = frame(player, rig, 0.2);
    const before = idle[idle.length - 1];
    // The arms ride on springs that smooth any cut, so the legs show it.
    const legs = ['Body', 'UpperLegL', 'UpperLegR'];
    const limit = blendLimit(before, poses, (p) => p.playClip('Dance', { loop: true }), () => createChampion(gummyMaterial(), PALETTE.player), original, legs);
    assert.ok(biggestStep([before, ...poses], legs) > limit, 'a hard cut turns far more than a blend allows');
  } finally {
    CONFIG.character.blendSeconds = original;
  }
});

test('a clip and a keyframed move hand over to each other without a jump', () => {
  const rig = createBoss(BOSSES[1]);
  const player = new AnimPlayer(GUARD);
  player.playClip('Wave', { hold: false });
  const waving = frame(player, rig, 1);
  player.play(BOSS_MOVES.heavy);
  const handOver = frame(player, rig, 0.4);
  const wave = waving[waving.length - 1];
  const makeBoss = () => createBoss(BOSSES[1]);
  assert.ok(biggestStep([wave, ...handOver]) < blendLimit(wave, handOver, (p) => p.play(BOSS_MOVES.heavy), makeBoss));
  player.playClip('Dance', { loop: true });
  const dance = frame(player, rig, 0.4);
  const move = handOver[handOver.length - 1];
  assert.ok(biggestStep([move, ...dance]) < blendLimit(move, dance, (p) => p.playClip('Dance', { loop: true }), makeBoss));
});

test('a clip that is not held and not looped ends, then the idle blends back in', () => {
  const rig = createBoss(BOSSES[0]);
  const player = new AnimPlayer(GUARD);
  player.playClip('Wave');
  frame(player, rig, clipLibrary.get(BOSS_BODY, 'Wave').duration + 0.1);
  assert.ok(!player.running && !player.busy);
});

test('a held clip stays on its last pose', () => {
  const rig = createBoss(BOSSES[0]);
  const player = new AnimPlayer(GUARD);
  player.playClip('Death', { hold: true });
  const poses = frame(player, rig, 3);
  assert.ok(player.running);
  assert.ok(biggestStep(poses.slice(-60)) < 0.02, 'resting on the floor');
  assert.ok(rig.body.bones.Body.position.y < rig.body.rest.Body.position.y * 0.7, 'the collapsed body is low');
});

test('before the bell the boss idles with the animators clip, then the keyframed guard takes over', () => {
  const rig = createBoss(BOSSES[1]);
  const player = new AnimPlayer(GUARD);
  const calm = frame(player, rig, 0.5, { ambient: 'Idle' });
  assert.equal(player.running?.name, 'Idle');
  const fight = frame(player, rig, 0.5, { ambient: null });
  assert.ok(!player.running);
  const last = calm[calm.length - 1];
  assert.ok(biggestStep([last, ...fight]) < blendLimit(last, fight, () => {}, () => createBoss(BOSSES[1])), 'handing over is smooth');
});

test('Punch is sped up or slowed down so its impact frame lands on the move`s hit time', () => {
  const player = new AnimPlayer(GUARD);
  const speed = player.impactSpeed(BOSS_MOVES.jab);
  assert.ok(Math.abs(CONFIG.character.clipImpact.Punch / speed - BOSS_MOVES.jab.hits[0]) < 1e-9);
  assert.equal(player.impactSpeed(BOSS_MOVES.heavy), 1, 'moves without a retargeted clip are untouched');

  const rig = createBoss(BOSSES[0]);
  const hand = new THREE.Vector3();
  player.play(BOSS_MOVES.jab);
  let [best, bestAt] = [-Infinity, 0];
  for (let i = 0; i * DT < 1; i++) {
    player.drive(rig, DT, idlePose(0, 1));
    rig.root.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      rig.body.bones[`Hand${side}`].getWorldPosition(hand);
      if (hand.z > best) [best, bestAt] = [hand.z, i * DT];
    }
  }
  assert.ok(player.running || bestAt > 0);
  assert.ok(Math.abs(bestAt - BOSS_MOVES.jab.hits[0]) < 0.09, `fist furthest at ${bestAt.toFixed(2)}s, hit at ${BOSS_MOVES.jab.hits[0]}s`);
});

test('flinches still show on top of a retargeted clip', () => {
  const rig = createBoss(BOSSES[0]);
  const player = new AnimPlayer(GUARD);
  player.playClip('Idle', { loop: true });
  frame(player, rig, 0.5);
  const calm = rig.body.bones.Abdomen.quaternion.clone();
  player.react(REACTIONS.hurtBig);
  let most = 0;
  for (let i = 0; i < 12; i++) {
    player.drive(rig, DT, idlePose(0, 1));
    most = Math.max(most, rig.body.bones.Abdomen.quaternion.angleTo(calm));
  }
  assert.ok(most > 0.2, `the torso flinches ${most.toFixed(2)} rad`);
});

test('driving a new rig with the same player rebinds the mixer and starts from scratch', () => {
  const player = new AnimPlayer(GUARD);
  const [a, b] = [createBoss(BOSSES[0]), createBoss(BOSSES[1])];
  player.playClip('Dance', { loop: true });
  frame(player, a, 0.3);
  assert.ok(player.running);
  frame(player, b, 0.1);
  assert.equal(player.rig, b);
  assert.equal(player.mixer.getRoot(), player.driver.root);
  assert.notEqual(player.driver.root, a.body.mesh);
  assert.ok(!player.running);
});

test('the retargeted Dance and Wave clips loop without a jump at the wrap, and every boss dance blends in from the guard', () => {
  for (const [id, { clip }] of Object.entries(DANCES)) {
    if (!clip) continue;
    const rig = createBoss(BOSSES.find((b) => b.id === id) ?? BOSSES[0]);
    const player = new AnimPlayer(GUARD);
    const before = frame(player, rig, 0.5);
    player.dance(DANCES[id]);
    const poses = frame(player, rig, 3);
    assert.equal(player.running?.name, clip);
    assert.ok(biggestStep([before[before.length - 1], ...poses]) < 0.6, `${id}: ${clip} loops smoothly`);
  }
});
