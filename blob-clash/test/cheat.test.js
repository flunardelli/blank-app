import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequences } from '../src/cheat.js';
import { CONFIG } from '../src/config.js';

const BLOB = ['KeyB', 'KeyL', 'KeyO', 'KeyB'];
const IDDQD = ['KeyI', 'KeyD', 'KeyD', 'KeyQ', 'KeyD'];

// Types the keys 0.2 s apart starting at `t0`; returns what each key reported.
const type = (cheats, keys, t0 = 0, gap = 0.2) => keys.map((k, i) => cheats.feed(k, t0 + i * gap));

test('the configured cheats are the two requested sequences', () => {
  assert.deepEqual(CONFIG.dev.cheats, [BLOB, IDDQD]);
});

test('each sequence completes only on its last key', () => {
  const cheats = createSequences(CONFIG.dev.cheats, { timeout: 3 });
  assert.deepEqual(type(cheats, BLOB), [null, null, null, 0]);
  assert.deepEqual(type(cheats, IDDQD, 10), [null, null, null, null, 1]);
});

test('a wrong key resets the sequence', () => {
  const cheats = createSequences([BLOB, IDDQD], { timeout: 3 });
  assert.ok(type(cheats, ['KeyB', 'KeyL', 'KeyX', 'KeyO', 'KeyB']).every((r) => r === null));
  assert.equal(type(cheats, BLOB, 10).at(-1), 0);
});

test('a wrong key that starts the sequence again still counts', () => {
  const cheats = createSequences([BLOB, IDDQD], { timeout: 3 });
  assert.equal(type(cheats, ['KeyB', 'KeyB', 'KeyL', 'KeyO', 'KeyB']).at(-1), 0);
});

test('too slow between keys starts over', () => {
  const cheats = createSequences([BLOB, IDDQD], { timeout: 3 });
  assert.equal(cheats.feed('KeyB', 0), null);
  assert.equal(cheats.feed('KeyL', 0.5), null);
  assert.equal(cheats.feed('KeyO', 4), null); // 3.5 s gap: progress dropped
  assert.equal(cheats.feed('KeyB', 4.2), null);
  assert.equal(cheats.feed('KeyB', 20), null);
  assert.deepEqual(type(cheats, ['KeyL', 'KeyO', 'KeyB'], 20.2).at(-1), 0);
});

test('a sequence can be repeated back to back', () => {
  const cheats = createSequences([BLOB, IDDQD], { timeout: 3 });
  assert.equal(type(cheats, BLOB, 0).at(-1), 0);
  assert.equal(type(cheats, BLOB, 1).at(-1), 0);
  assert.equal(type(cheats, [...IDDQD, ...IDDQD], 2).filter((r) => r === 1).length, 2);
});

test('one sequence typed on top of the other', () => {
  const cheats = createSequences([BLOB, IDDQD], { timeout: 3 });
  assert.ok(type(cheats, ['KeyB', 'KeyL', 'KeyI', 'KeyD', 'KeyO']).every((r) => r === null));
  // The stray "B,L" prefix is dropped when "I" arrives, so IDDQD still works right after.
  assert.equal(type(cheats, ['KeyB', 'KeyL', ...IDDQD], 10).at(-1), 1);
  // ...and the other way around: "I,D,D" then B,L,O,B.
  assert.equal(type(cheats, ['KeyI', 'KeyD', 'KeyD', ...BLOB], 20).at(-1), 0);
});
