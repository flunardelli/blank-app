import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeLevel, defaultSave, isUnlocked, migrateV2, normalizeSave, starsFor } from '../src/progress.js';

test('starsFor: x1-x2 is one star, up to x4 two, above three', () => {
  assert.deepEqual([1, 2, 2.2, 4, 4.2, 5].map((m) => starsFor(m)), [1, 1, 2, 2, 3, 3]);
});

test('v2 save migrates: levels before the current one are done with one star', () => {
  const save = migrateV2({ level: 4, coins: 120, keys: 2, upgrades: { damage: 3, blobs: 2 } });
  assert.equal(save.version, 3);
  assert.equal(save.current, 4);
  assert.equal(save.unlocked, 4);
  assert.deepEqual(Object.keys(save.completed), ['1', '2', '3']);
  assert.equal(save.completed[3].stars, 1);
  assert.deepEqual([save.coins, save.keys, save.upgrades], [120, 2, { damage: 3, blobs: 2 }]);
});

test('v2 migration caps at the campaign length and survives junk', () => {
  assert.equal(migrateV2({ level: 999 }, 30).unlocked, 30);
  assert.deepEqual(migrateV2({ level: 'x', coins: -5 }), { ...defaultSave() });
});

test('winning unlocks only the next level', () => {
  const save = completeLevel(defaultSave(), 1, 2.4);
  assert.equal(save.unlocked, 2);
  assert.equal(save.current, 2);
  assert.ok(isUnlocked(save, 2));
  assert.ok(!isUnlocked(save, 3));
  assert.equal(save.completed[1].stars, 2);
});

test('replaying never lowers stars, best multiplier or progress', () => {
  let save = completeLevel(defaultSave(), 1, 5);
  save = completeLevel(save, 2, 1.2);
  save = completeLevel(save, 1, 1.2);
  assert.deepEqual(save.completed[1], { stars: 3, bestMultiplier: 5 });
  assert.equal(save.unlocked, 3);
  assert.equal(save.current, 3);
  save = completeLevel(save, 2, 5);
  assert.equal(save.completed[2].stars, 3);
  assert.equal(save.completed[1].stars, 3);
});

test('completeLevel does not mutate its input and stops at the last level', () => {
  const before = defaultSave();
  completeLevel(before, 1, 3);
  assert.deepEqual(before, defaultSave());
  assert.equal(completeLevel({ ...before, unlocked: 30 }, 30, 3, 30).unlocked, 30);
});

test('corrupted or foreign saves fall back to the defaults', () => {
  for (const junk of [null, 'oops', 42, [], { version: 2, coins: 9 }]) {
    assert.deepEqual(normalizeSave(junk), defaultSave());
  }
  const save = normalizeSave({
    version: 3, current: 99, unlocked: 'abc', coins: -3, keys: 'x',
    completed: { 2: { stars: 9, bestMultiplier: 'n' }, 77: { stars: 1 }, foo: {}, 3: null },
    upgrades: { damage: 0 },
  });
  assert.deepEqual(save.completed, { 2: { stars: 3, bestMultiplier: 1 } });
  assert.equal(save.unlocked, 3);
  assert.equal(save.current, 3);
  assert.deepEqual([save.coins, save.keys, save.upgrades], [0, 0, { damage: 1, blobs: 1 }]);
});

test('a valid v3 save round-trips unchanged', () => {
  const save = completeLevel(completeLevel(defaultSave(), 1, 3), 2, 5);
  assert.deepEqual(normalizeSave(JSON.parse(JSON.stringify(save))), save);
});
