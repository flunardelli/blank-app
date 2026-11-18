import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, newMechanic } from '../src/level.js';
import { CONFIG } from '../src/config.js';
import { applyGate, bestGate, bossDifficulty, gateGap, isGoodGate, requiredTapRate, startBlobsFor } from '../src/rules.js';

const LEVELS = Array.from({ length: 30 }, (_, i) => i + 1);
const half = CONFIG.track.width / 2;

test('levels are deterministic for the same number', () => {
  assert.deepEqual(generateLevel(3), generateLevel(3));
  assert.notDeepEqual(generateLevel(3), generateLevel(4));
});

test('level data is well formed', () => {
  for (const n of LEVELS) {
    const level = generateLevel(n);
    const ds = [...level.gates, ...level.obstacles, ...level.coins, ...level.enemies, level.key].map((e) => e.d);
    assert.ok(ds.every((d) => d > 0 && d < level.finishD), `level ${n}: content beyond the finish line`);
    assert.ok(level.coins.every((c) => Math.abs(c.x) < half));
    assert.equal(new Set(level.coins.map((c) => c.id)).size, level.coins.length);
    assert.ok(Math.abs(level.key.x) < half);
    assert.ok(level.boss.d > level.finishD && level.ladderStart > level.boss.d);
    assert.ok(level.plan.includes('enemy'), `level ${n}: no enemy crowd`);
    for (const trap of level.obstacles.filter((o) => o.kind === 'trap')) {
      assert.ok(trap.button.d < trap.d - trap.halfDepth && Math.abs(trap.button.x) < half, `level ${n}: unreachable trap button`);
    }
    for (const { pads } of level.obstacles.filter((o) => o.kind === 'spikes')) {
      const edges = [-half, ...pads.flatMap((p) => [p.x - p.halfWidth, p.x + p.halfWidth]), half].sort((a, b) => a - b);
      const gaps = edges.filter((_, i) => i % 2 === 0).map((e, i) => edges[i * 2 + 1] - e);
      assert.ok(Math.max(...gaps) >= CONFIG.obstacle.minSpikeGap - 1e-9, `level ${n}: spike gap too small`);
    }
    for (const bridge of level.bridges) {
      const onBridge = level.coins.filter((c) => c.d >= bridge.d0 && c.d <= bridge.d1);
      assert.ok(onBridge.length > 0 && onBridge.every((c) => Math.abs(c.x) < bridge.halfWidth), `level ${n}: bridge coins off the bridge`);
      assert.ok(!level.obstacles.some((o) => o.d >= bridge.d0 - 2 && o.d <= bridge.d1 + 2), `level ${n}: obstacle on a bridge`);
    }
  }
});

test('mechanics unlock gradually: each debuts alone, first in its level, with a hint', () => {
  const { unlock } = CONFIG.chunks;
  for (const n of LEVELS) {
    const level = generateLevel(n);
    for (const id of level.plan) assert.ok(unlock[id] <= n, `level ${n}: ${id} before its unlock level ${unlock[id]}`);
    const fresh = newMechanic(n);
    if (fresh) {
      // Gate-type mechanics debut in the first gate slot after the opener, challenges in the first challenge slot.
      const slot = ['wall', 'gateRisk'].includes(fresh) ? 2 : 1;
      assert.equal(level.plan[slot], fresh, `level ${n}: ${fresh} is not the first new thing`);
      assert.ok(level.hints.some((h) => h.id === fresh), `level ${n}: no hint for ${fresh}`);
    }
  }
  assert.ok(!generateLevel(1).obstacles.length, 'level 1 has no obstacles: just gates and crowds');
});

test('gate pairs are real decisions: no near-ties at the expected crowd size', () => {
  let goodVsBad = 0;
  let total = 0;
  for (const n of LEVELS) {
    const level = generateLevel(n);
    // Replay the generator's running estimate: best gates, minus enemies in order.
    let count = startBlobsFor(level.expected.blobs);
    const events = [...level.gates.map((g) => ({ d: g.d, g })), ...level.enemies.map((e) => ({ d: e.d, e }))].sort((a, b) => a.d - b.d);
    for (const { g, e } of events) {
      if (e) { count -= e.count; continue; }
      total += 1;
      assert.ok(gateGap(count, g) >= 0.15 - 1e-9, `level ${n}: near-tie gate at d=${g.d}`);
      if (isGoodGate(g.left) !== isGoodGate(g.right)) goodVsBad += 1;
      count = applyGate(count, bestGate(count, g));
    }
  }
  assert.ok(goodVsBad / total < 0.15, `${goodVsBad}/${total} gates are an obvious good-vs-bad`);
});

test('numbered walls are a genuine gamble: sometimes worth smashing, sometimes not', () => {
  let worth = 0;
  let notWorth = 0;
  for (let n = 6; n <= 60; n++) {
    const level = generateLevel(n);
    let count = startBlobsFor(level.expected.blobs);
    const events = [...level.gates.map((g) => ({ d: g.d, g })), ...level.enemies.map((e) => ({ d: e.d, e }))].sort((a, b) => a.d - b.d);
    for (const { g, e } of events) {
      if (e) { count -= e.count; continue; }
      const wall = [g.left, g.right].find((o) => o.cost);
      if (wall) (bestGate(count, g) === wall ? worth++ : notWorth++);
      count = applyGate(count, bestGate(count, g));
    }
  }
  assert.ok(worth > 3 && notWorth > 3, `walls worth smashing: ${worth}, not: ${notWorth}`);
});

test('difficulty is a sawtooth: big boss every 5th level, a breather right after', () => {
  assert.ok(bossDifficulty(5) > bossDifficulty(4) && bossDifficulty(5) > bossDifficulty(6));
  assert.ok(bossDifficulty(6) < bossDifficulty(4) + 0.035 * 2);
  assert.ok(generateLevel(5).boss.big && !generateLevel(6).boss.big);
  assert.ok(generateLevel(5).plan.length > generateLevel(6).plan.length);
});

test('a typical player can beat the boss with plain jabs; it gets harder', () => {
  const rates = [1, 4, 10, 20].map((n) => {
    // A typical player: the upgrades the economy expects at this level, 60% of the best crowd.
    const { boss, bestCount, expected } = generateLevel(n);
    const rate = requiredTapRate(bestCount * 0.6, boss.hp, expected.damage);
    // Plain jabs only: combos, counters and blocking make the real fight easier than this.
    assert.ok(rate <= 8, `level ${n}: needs ${rate.toFixed(1)} taps/s`);
    return rate;
  });
  assert.ok(rates[0] < rates[3]);
  assert.ok(rates[0] <= 3.5, 'level 1 is gentle');
});
