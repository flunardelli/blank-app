import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBoss, createChampion, applyPose } from '../src/art/boxer.js';
import { addPoseOffset, posesToBones, restoreBones } from '../src/art/character.js';
import { gummyMaterial } from '../src/art/models.js';
import { BOSSES } from '../src/bosses.js';
import { PALETTE } from '../src/config.js';
import { BOSS_MOVES, CHAMPION_MOVES, GUARD, REACTIONS } from '../src/moves.js';
import { sampleClip } from '../src/anim.js';

const boss = createBoss(BOSSES[1]);
const champion = createChampion(gummyMaterial(), PALETTE.player);
const world = (rig, name) => rig.body.bones[name].getWorldPosition(new THREE.Vector3());

test('rigs expose what the game and the skin shop use', () => {
  for (const rig of [boss, champion]) {
    assert.ok(rig.root.isObject3D && rig.anchor.isVector3 && rig.material);
    assert.ok(rig.body.mesh.isSkinnedMesh);
    assert.ok(rig.torso.isBone && rig.head.isBone);
    assert.ok(rig.hipY > 0);
  }
  assert.equal(rig(boss).geometry.getAttribute('skinIndex').itemSize, 4);
  assert.ok(boss.body.mesh.geometry.getAttribute('color'), 'jelly gradient is baked into vertex colours');
  assert.deepEqual(champion.body.mesh.geometry.userData.gradient, [0.1, 1.35], 'skins can repaint it');
});
const rig = (r) => r.body.mesh;

test('a jab pose swings the glove forward, a guard keeps it near the body', () => {
  const rest = world(boss, 'HandL');
  applyPose(boss, GUARD);
  boss.root.updateMatrixWorld(true);
  const guard = world(boss, 'HandR');
  applyPose(boss, sampleClip(BOSS_MOVES.jab, 0.32, GUARD));
  boss.root.updateMatrixWorld(true);
  const jab = world(boss, 'HandR');
  assert.ok(jab.z - guard.z > 0.5, `glove travels ${jab.z - guard.z} forward`);
  assert.ok(rest.y > 0);
});

test('squash stretches and flattens the whole body around the hips', () => {
  applyPose(boss, { ...GUARD, squash: -0.2, y: 0 });
  assert.ok(boss.body.bones.Body.scale.y < 1 && boss.body.bones.Body.scale.x > 1);
  applyPose(boss, { ...GUARD, squash: 0.2, y: 0.1 });
  assert.ok(boss.body.bones.Body.scale.y > 1);
  assert.ok(Math.abs(boss.body.bones.Body.position.y - (boss.body.rest.Body.position.y + 0.1)) < 1e-9);
});

test('dash and lift move the root away from its anchor, along its facing', () => {
  boss.anchor.set(1, 0.25, -3);
  boss.root.rotation.y = Math.PI;
  applyPose(boss, { ...GUARD, dash: 2, lift: 1 });
  assert.ok(Math.abs(boss.root.position.x - 1) < 1e-9);
  assert.ok(Math.abs(boss.root.position.y - 1.25) < 1e-9);
  assert.ok(Math.abs(boss.root.position.z - -5) < 1e-9, 'facing -z means dashing towards -z');
  boss.root.rotation.y = 0;
});

test('reaction offsets add on top of a pose without replacing it', () => {
  applyPose(champion, GUARD);
  const before = champion.body.bones.Abdomen.quaternion.clone();
  addPoseOffset(champion.body, { lean: -0.4, head: 0.5 });
  assert.ok(champion.body.bones.Abdomen.quaternion.angleTo(before) > 0.3);
  assert.ok(REACTIONS.hurt.keys.length > 1);
});

test('restoring the bones brings back the bind pose', () => {
  applyPose(champion, sampleClip(CHAMPION_MOVES.jumpPunch, 0.4, GUARD));
  restoreBones(champion.body);
  for (const [name, bone] of Object.entries(champion.body.bones)) {
    assert.ok(bone.quaternion.angleTo(champion.body.rest[name].quaternion) < 1e-9, name);
    assert.ok(bone.position.distanceTo(champion.body.rest[name].position) < 1e-9, name);
  }
});

// The skin is one mesh, so bending a joint must stretch triangles smoothly (gelatin) instead of tearing
// them open: a seam would show as an edge between differently weighted vertices growing far beyond that.
for (const [name, fighter] of [['boss', boss], ['champion', champion]]) {
  test(`${name}: bending the elbow and the waist keeps every triangle edge connected (no seams)`, () => {
    const { mesh } = fighter.body;
    const count = mesh.geometry.getAttribute('position').count;
    const restPositions = Array.from({ length: count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()));
    applyPose(fighter, { ...GUARD, rElbow: 1.4, rRaise: 1.2, lean: 0.5, twist: 0.4, lLeg: 0.6 });
    fighter.root.updateMatrixWorld(true);
    const bent = Array.from({ length: count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()));
    const index = mesh.geometry.getIndex();
    let worst = 0;
    let moved = 0;
    for (let i = 0; i < index.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [index.getX(i + k), index.getX(i + ((k + 1) % 3))];
        const stretch = bent[a].distanceTo(bent[b]) / Math.max(restPositions[a].distanceTo(restPositions[b]), 1e-4);
        worst = Math.max(worst, stretch);
      }
    }
    bent.forEach((p, i) => { if (p.distanceTo(restPositions[i]) > 0.1) moved++; });
    assert.ok(moved > count * 0.1, 'the pose really moved the body');
    assert.ok(worst < 10, `an edge stretched ${worst.toFixed(1)}x`);
    applyPose(fighter, GUARD);
  });
}

test('the boss body keeps its proportions per roster entry', () => {
  const wide = createBoss(BOSSES.find((b) => b.id === 'king'));
  const lean = createBoss(BOSSES.find((b) => b.id === 'punk'));
  assert.ok(wide.root.children[0].scale.x > lean.root.children[0].scale.x);
  posesToBones(wide.body, GUARD);
});

test('all ten bosses build skinned bodies, and a world boss rig is 1.5x the ring size of a normal one', () => {
  for (const b of BOSSES) {
    const rig = createBoss(b);
    assert.ok(rig.body.mesh.isSkinnedMesh, b.id);
    applyPose(rig, GUARD);
  }
  const normal = createBoss(BOSSES[0]);
  const big = createBoss({ ...BOSSES[0], size: 1.5 });
  assert.ok(Math.abs(big.root.scale.y / normal.root.scale.y - 1.5) < 1e-9);
});
