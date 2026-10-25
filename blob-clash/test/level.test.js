import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/level.js';
import { CONFIG } from '../src/config.js';

test('levels are deterministic for the same number', () => {
  assert.deepEqual(generateLevel(3), generateLevel(3));
  assert.notDeepEqual(generateLevel(3), generateLevel(4));
});

test('level data is well formed', () => {
  for (let n = 1; n <= 20; n++) {
    const level = generateLevel(n);
    const half = CONFIG.track.width / 2;
    assert.ok(level.pickups.every((p) => Math.abs(p.x) < half && p.d < level.boss.d));
    assert.ok(level.gates.every((g) => g.left !== g.right));
    assert.equal(new Set(level.pickups.map((p) => p.id)).size, level.pickups.length);
    // Every wall leaves a lane open.
    assert.ok(level.obstacles.filter((o) => o.kind === 'wall')
      .every((w) => Math.abs(w.x) + w.halfWidth < half));
  }
});

test('the boss is always beatable with good play, and gets harder', () => {
  const ratios = [1, 5, 10].map((n) => {
    const { boss, bestMass } = generateLevel(n);
    assert.ok(boss.mass < bestMass, `level ${n}: boss ${boss.mass} >= best ${bestMass}`);
    return boss.mass / bestMass;
  });
  assert.ok(ratios[0] < ratios[2]);
});
