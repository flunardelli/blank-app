import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelStatus, mapRows } from '../src/map.js';
import { completeLevel, defaultSave } from '../src/progress.js';
import { LEVEL_COUNT } from '../src/worlds.js';

test('a fresh save: level 1 is current, everything else is locked', () => {
  const save = defaultSave();
  assert.equal(levelStatus(save, 1), 'current');
  assert.deepEqual([2, 3, 30].map((n) => levelStatus(save, n)), ['locked', 'locked', 'locked']);
});

test('winning a level marks it done and makes the next one current', () => {
  const save = completeLevel(defaultSave(), 1, 3);
  assert.deepEqual([1, 2, 3].map((n) => levelStatus(save, n)), ['done', 'current', 'locked']);
});

test('replaying an old level keeps the frontier level current', () => {
  let save = defaultSave();
  for (let n = 1; n <= 4; n++) save = completeLevel(save, n, 1);
  save = completeLevel(save, 2, 1); // replay
  assert.deepEqual([2, 4, 5, 6].map((n) => levelStatus(save, n)), ['done', 'done', 'current', 'locked']);
});

test('the last level can be done with nothing left to unlock', () => {
  const save = completeLevel({ ...defaultSave(), unlocked: LEVEL_COUNT }, LEVEL_COUNT, 5);
  assert.equal(levelStatus(save, LEVEL_COUNT), 'done');
});

test('mapRows is 10 rows of 3: mini, boss, chest, with stars on beaten levels', () => {
  const rows = mapRows(completeLevel(defaultSave(), 1, 5));
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => r.levels.length === 3));
  assert.deepEqual(rows[0].levels.map((l) => l.kind), ['mini', 'boss', 'chest']);
  assert.deepEqual(rows[9].levels.map((l) => l.level), [28, 29, 30]);
  assert.equal(rows[0].levels[0].stars, 3);
  assert.equal(rows[0].levels[1].stars, 0);
});
