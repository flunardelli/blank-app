import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Animator, EASE, clipDuration, mirrorPose, sampleClip } from '../src/anim.js';
import { BOSS_MOVES, CHAMPION_MOVES, GUARD, REACTIONS } from '../src/moves.js';
import { BOSSES } from '../src/bosses.js';

const base = { a: 0, b: 10 };

test('easings start at 0 and end at 1', () => {
  for (const [name, ease] of Object.entries(EASE)) {
    assert.ok(Math.abs(ease(0)) < 1e-9 && Math.abs(ease(1) - 1) < 1e-9, name);
  }
  assert.ok(EASE.outBack(0.8) > 1, 'outBack overshoots for follow-through');
});

test('clips interpolate between keys and fill missing channels from the base pose', () => {
  const clip = { keys: [[0, {}], [1, { a: 2 }, 'linear'], [2, { b: 0 }, 'linear']] };
  assert.deepEqual(sampleClip(clip, 0.5, base), { a: 1, b: 10 });
  assert.deepEqual(sampleClip(clip, 1.5, base), { a: 1, b: 5 }); // a heads back to base
  assert.deepEqual(sampleClip(clip, 9, base), { a: 0, b: 0 }); // clamped to the last key
  assert.equal(clipDuration(clip), 2);
});

test('mirroring swaps sides and turns the other way', () => {
  assert.deepEqual(mirrorPose({ lRaise: 1, rElbow: 2, twist: 0.5, lean: 0.3 }), { rRaise: 1, lElbow: 2, twist: -0.5, lean: 0.3 });
});

test('the animator returns to idle after a clip; reactions add on top and fade', () => {
  const anim = new Animator(base);
  anim.play({ keys: [[0, {}], [0.5, { a: 4 }], [1, {}]] });
  let pose;
  for (let i = 0; i < 25; i++) pose = anim.update(0.02);
  assert.ok(pose.a > 3, 'mid-clip pose reached');
  for (let i = 0; i < 30; i++) pose = anim.update(0.02);
  assert.ok(!anim.busy);
  assert.deepEqual(pose, base);
  anim.react({ keys: [[0, {}], [0.1, { b: 12 }, 'linear'], [0.2, {}, 'linear']] });
  anim.react({ keys: [[0, {}], [0.1, { b: 12 }, 'linear'], [0.2, {}, 'linear']] });
  pose = anim.update(0.1);
  assert.equal(pose.b, 14);
});

test('replaying a reaction restarts it instead of stacking', () => {
  const anim = new Animator(GUARD);
  for (let i = 0; i < 10; i++) anim.react(REACTIONS.hurt);
  assert.equal(anim.reactions.length, 1);
});

test('every fight clip is well formed: rising key times, known channels, hits inside the clip', () => {
  const clips = { ...BOSS_MOVES, ...CHAMPION_MOVES, jabL: CHAMPION_MOVES.jab[0], jabR: CHAMPION_MOVES.jab[1], ...REACTIONS };
  delete clips.jab;
  for (const [name, clip] of Object.entries(clips)) {
    clip.keys.forEach(([t, pose, ease], i) => {
      if (i > 0) assert.ok(t > clip.keys[i - 1][0], `${name}: key ${i} goes back in time`);
      assert.ok(Object.keys(pose).every((channel) => channel in GUARD), `${name}: unknown channel in key ${i}`);
      assert.ok(!ease || ease in EASE, `${name}: unknown ease ${ease}`);
    });
    assert.deepEqual(sampleClip(clip, 0, GUARD), GUARD, `${name} must start in guard`);
    if (name !== 'cheer') assert.deepEqual(sampleClip(clip, clipDuration(clip), GUARD), GUARD, `${name} must end in guard`);
    (clip.hits ?? []).forEach((t) => assert.ok(t > 0 && t < clipDuration(clip), `${name}: hit outside the clip`));
  }
});

test('a boss move finishes before its next attack starts', () => {
  for (const { id, attack } of BOSSES) {
    assert.ok(clipDuration(BOSS_MOVES[attack.move]) <= attack.interval, `${id}: ${attack.move} overlaps the next attack`);
  }
});
