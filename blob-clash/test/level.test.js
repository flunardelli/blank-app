import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, hazardWeights } from '../src/level.js';
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
    for (const w of level.walkers) {
      assert.ok(w.range + w.radius < half && w.d > 0 && w.d < level.finishD, `level ${n}: walker off the track`);
    }
  }
});

test('a gate pair never offers the same operation twice (no "×2 | ×2")', () => {
  for (let n = 1; n <= 60; n++) {
    for (const { left, right } of generateLevel(n).gates) {
      assert.notEqual(left.op, right.op, `level ${n}: ${left.op}${left.value} | ${right.op}${right.value}`);
    }
  }
});

test('every jump ramp is followed by saws the jump clears', () => {
  const { airborneHeight, jumpHeight } = CONFIG.obstacle;
  for (let n = 1; n <= 30; n++) {
    const { obstacles } = generateLevel(n);
    for (const ramp of obstacles.filter((o) => o.kind === 'ramp')) {
      const saws = obstacles.filter((o) => o.kind === 'saw' && o.d > ramp.d && o.d < ramp.d + ramp.length);
      assert.equal(saws.length, 2);
      for (const saw of saws) {
        const lift = Math.sin(((saw.d - ramp.d) / ramp.length) * Math.PI) * jumpHeight;
        assert.ok(lift > airborneHeight, `level ${n}: blobs would land on the saw`);
      }
      assert.ok(Math.abs(ramp.x) + ramp.halfWidth <= CONFIG.track.width / 2 + 1e-9);
    }
  }
});

test('bomb rows always leave a free lane, and a different one each row', () => {
  for (let n = 1; n <= 30; n++) {
    const bombs = generateLevel(n).obstacles.filter((o) => o.kind === 'bomb');
    const rows = Object.values(Object.groupBy(bombs, (b) => b.d));
    rows.forEach((row) => assert.equal(row.length, CONFIG.track.lanes.length - 1));
    const freeLane = (row) => CONFIG.track.lanes.find((x) => !row.some((b) => b.x === x));
    for (let i = 1; i < rows.length; i += 2) assert.notEqual(freeLane(rows[i - 1]), freeLane(rows[i]));
  }
});

test('phases unlock new hazards and each one features a different kind', () => {
  assert.deepEqual(Object.keys(hazardWeights(1)).sort(), ['slider', 'spikes', 'trap']);
  assert.ok('saw' in hazardWeights(2) && !('bombs' in hazardWeights(2)));
  assert.ok('bombs' in hazardWeights(3));
  const featured = (level) => Object.entries(hazardWeights(level)).sort((a, b) => b[1] - a[1])[0][0];
  for (let n = 1; n < 12; n++) assert.notEqual(featured(n), featured(n + 1));
  assert.equal(featured(2), 'saw', 'a newly unlocked hazard is the star of its phase');
  assert.equal(generateLevel(1).walkers.length, 0, 'phase 1 has no walkers yet');
  assert.ok(generateLevel(2).walkers.length > 0);
  assert.ok([4, 5, 6, 7, 8].some((n) => generateLevel(n).walkers.some((w) => w.strength > 1)), 'brutes show up later');
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
