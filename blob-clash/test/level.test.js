import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel } from '../src/level.js';
import { CONFIG } from '../src/config.js';
import { isGoodGate, requiredTapRate } from '../src/rules.js';

test('levels are deterministic for the same number', () => {
  assert.deepEqual(generateLevel(3), generateLevel(3));
  assert.notDeepEqual(generateLevel(3), generateLevel(4));
});

test('level data is well formed', () => {
  const half = CONFIG.track.width / 2;
  for (let n = 1; n <= 30; n++) {
    const level = generateLevel(n);
    const ds = [...level.gates, ...level.obstacles, ...level.coins, ...level.enemies].map((e) => e.d);
    assert.ok(ds.every((d) => d > 0 && d < level.finishD), `level ${n}: content beyond the finish line`);
    assert.ok(level.coins.every((c) => Math.abs(c.x) < half));
    assert.ok(level.gates.every((g) => isGoodGate(g.left) || isGoodGate(g.right)), 'every gate pair has a good side');
    assert.ok(isGoodGate(level.gates[0].left) && isGoodGate(level.gates[0].right), 'first gate grows a 1-blob crowd');
    // Spike pads always leave a wide enough gap for the crowd to squeeze through.
    for (const { pads } of level.obstacles.filter((o) => o.kind === 'spikes')) {
      const edges = [-half, ...pads.flatMap((p) => [p.x - p.halfWidth, p.x + p.halfWidth]), half].sort((a, b) => a - b);
      const gaps = edges.filter((_, i) => i % 2 === 0).map((e, i) => edges[i * 2 + 1] - e);
      assert.ok(Math.max(...gaps) >= CONFIG.obstacle.minSpikeGap - 1e-9, `level ${n}: spike gap too small`);
    }
    assert.ok(level.boss.d > level.finishD && level.ladderStart > level.boss.d);
    for (const trap of level.obstacles.filter((o) => o.kind === 'trap')) {
      assert.ok(trap.button.d < trap.d - trap.halfDepth && Math.abs(trap.button.x) < half, `level ${n}: unreachable trap button`);
    }
    assert.ok(level.key.d > 0 && level.key.d < level.finishD && Math.abs(level.key.x) < half);
  }
});

test('with the best crowd the boss needs a humane tapping speed, and gets harder', () => {
  const rates = [1, 5, 10, 20].map((n) => {
    const { boss, bestCount } = generateLevel(n);
    const rate = requiredTapRate(bestCount, boss.hp, 1);
    assert.ok(rate <= 6, `level ${n}: needs ${rate.toFixed(1)} taps/s`);
    return rate;
  });
  assert.ok(rates[0] < rates[3]);
  assert.ok(rates[0] <= 3, 'level 1 is gentle');
});
