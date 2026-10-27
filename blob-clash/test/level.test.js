import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axeIsLow, ballState } from '../src/rules.js';
import { DOUBLE_ROW_GAP, generateLevel, hazardWeights } from '../src/level.js';
import { CONFIG } from '../src/config.js';
import { bossDifficulty, isGoodGate, requiredTapRate } from '../src/rules.js';
import { WORLDS } from '../src/worlds.js';

const HUMAN_TAPS_PER_SECOND = 6;

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

test('double gate rows: second row sits right behind the first, appears later, and is crossable', () => {
  const { forwardSpeed, lateralSpeed } = CONFIG.crowd;
  const laneSwitch = CONFIG.track.width / 2; // distance between the two panel centres
  assert.ok((DOUBLE_ROW_GAP / forwardSpeed) * lateralSpeed >= laneSwitch, 'crowd can switch sides between rows');
  const doubles = (n) => generateLevel(n).gates.filter((g) => g.row === 1);
  const total = Array.from({ length: 30 }, (_, i) => doubles(i + 1).length).reduce((a, b) => a + b);
  assert.ok(total > 15, 'double rows are common');
  for (let n = 1; n <= 30; n++) {
    const { gates } = generateLevel(n);
    assert.equal(gates[0].row, 0);
    assert.equal(gates[1].row === 1 && gates[1].d === gates[0].d + DOUBLE_ROW_GAP, false, `level ${n}: first segment doubled`);
    gates.forEach((g, i) => {
      if (i > 0) assert.ok(g.d > gates[i - 1].d, `level ${n}: gates out of order`);
      if (g.row === 1) {
        assert.equal(gates[i - 1].row, 0);
        assert.equal(g.d - gates[i - 1].d, DOUBLE_ROW_GAP);
      }
    });
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

test('bomb rows alternate sides and leave room for the biggest crowd', () => {
  const { unitRadius, maxRadius } = CONFIG.crowd;
  const maxX = CONFIG.track.width / 2 - maxRadius; // how far the biggest crowd can move sideways
  for (let n = 1; n <= 30; n++) {
    const bombs = generateLevel(n).obstacles.filter((o) => o.kind === 'bomb');
    const rows = Object.values(Object.groupBy(bombs, (b) => b.d));
    const side = (row) => Math.sign(row[0].x);
    rows.forEach((row) => {
      assert.ok(row.every((b) => Math.sign(b.x) === side(row)), `level ${n}: bombs on both sides`);
      // Crowd hugging the free side: its nearest body must not touch any bomb.
      const nearestBody = -side(row) * maxX + side(row) * (maxRadius - unitRadius);
      row.forEach((b) => assert.ok(Math.abs(b.x - nearestBody) > b.radius + unitRadius, `level ${n}: no way past`));
    });
    for (let i = 1; i < rows.length; i += 2) assert.notEqual(side(rows[i - 1]), side(rows[i]));
  }
});

test('axes are raised long enough for the biggest crowd to cross, and stay out of the early worlds', () => {
  const { forwardSpeed, maxRadius } = CONFIG.crowd;
  const crossing = (2 * maxRadius) / forwardSpeed; // seconds the largest crowd takes to cross the axe line
  const axes = [];
  for (let n = 1; n <= 30; n++) {
    const found = generateLevel(n).obstacles.filter((o) => o.kind === 'axe');
    if (n < CONFIG.obstacle.unlockLevel.axe) assert.equal(found.length, 0, `level ${n}: axe too early`);
    axes.push(...found);
  }
  assert.ok(axes.length > 0, 'axes show up in the campaign');
  for (const axe of axes) {
    // Sample a full period: the longest raised stretch must cover the crossing, and the blade must stay
    // narrower than the track so the crowd can always slip past the low blade.
    const period = (2 * Math.PI) / axe.speed;
    let raised = 0;
    let longest = 0;
    for (let t = 0; t < 2 * period; t += 0.01) {
      raised = axeIsLow(axe, t) ? 0 : raised + 0.01;
      longest = Math.max(longest, raised);
    }
    assert.ok(longest > crossing * 1.5, `axe at ${axe.d}: raised window too short`);
    assert.ok(2 * (axe.halfWidth + CONFIG.crowd.unitRadius) < CONFIG.track.width / 2);
    assert.ok(axe.length * Math.sin(axe.swing) >= CONFIG.track.width / 2 - 1, 'swings edge to edge');
  }
});

test('balls come from world 4 on and never fill all three lanes at the same time', () => {
  const { lanes } = CONFIG.track;
  const { radius } = CONFIG.obstacle.ball;
  let found = 0;
  for (let n = 1; n <= 30; n++) {
    const balls = generateLevel(n).obstacles.filter((o) => o.kind === 'ball');
    if (n < CONFIG.obstacle.unlockLevel.ball) assert.equal(balls.length, 0, `level ${n}: ball too early`);
    found += balls.length;
    const groups = Map.groupBy(balls, (b) => b.d);
    for (const group of groups.values()) {
      assert.ok(group.length < lanes.length, 'a group never has a ball for every lane');
      assert.equal(new Set(group.map((b) => b.x)).size, group.length, 'one ball per lane');
      const period = (2 * group[0].span) / group[0].speed + group[0].fallTime + group[0].waitTime;
      for (let t = 0; t < 2 * period; t += 0.02) {
        const rolling = group.filter((b) => ballState(b, t).phase === 'roll');
        const covered = lanes.filter((x) => rolling.some((b) => Math.abs(b.x - x) < radius + CONFIG.crowd.unitRadius));
        assert.ok(covered.length < lanes.length, `level ${n} t=${t}: every lane blocked`);
        assert.ok(rolling.length <= 1, 'balls of a group roll in turns');
      }
    }
  }
  assert.ok(found > 0, 'balls show up in the campaign');
});

test('hazards unlock gradually and every world features its own kind', () => {
  assert.deepEqual(Object.keys(hazardWeights(1)).sort(), ['slider', 'spikes', 'trap']);
  assert.ok('saw' in hazardWeights(2) && !('bombs' in hazardWeights(2)));
  assert.ok('bombs' in hazardWeights(3));
  const featured = (level) => Object.entries(hazardWeights(level)).sort((a, b) => b[1] - a[1])[0][0];
  WORLDS.forEach((world, i) => {
    for (let slot = 1; slot <= 3; slot++) {
      const level = i * 3 + slot;
      if (CONFIG.obstacle.unlockLevel[world.featured] <= level) assert.equal(featured(level), world.featured, `level ${level}`);
    }
    if (i > 0) assert.notEqual(world.featured, WORLDS[i - 1].featured, 'neighbouring worlds differ');
  });
  assert.equal(generateLevel(1).walkers.length, 0, 'level 1 has no walkers yet');
  assert.ok(generateLevel(2).walkers.length > 0);
  assert.ok([4, 5, 6, 7, 8].some((n) => generateLevel(n).walkers.some((w) => w.strength > 1)), 'brutes show up later');
});

test('levels are longer and the enemy crowds bigger as the campaign goes on', () => {
  const { minSegments, maxSegments } = CONFIG.track;
  const segmentsOf = (n) => generateLevel(n).gates.filter((g) => g.row === 0).length;
  assert.equal(segmentsOf(1), minSegments);
  assert.equal(segmentsOf(30), maxSegments);
  const segments = Array.from({ length: 30 }, (_, i) => segmentsOf(i + 1));
  assert.ok(segments.every((n, i) => i === 0 || n >= segments[i - 1] - 1), 'segments only dip by one at most');
  // Enemy crowds as a share of the best crowd, averaged over a world's three levels.
  const share = (world) => {
    const levels = [1, 2, 3].map((slot) => generateLevel(world * 3 + slot));
    return levels.flatMap((l) => l.enemies.map((e) => e.count / l.bestCount)).reduce((a, b) => a + b) / 15;
  };
  assert.ok(share(9) > share(0), 'the last world fights bigger crowds than the first');
});

test('each level knows its world and kind: mini boss, world boss, chest', () => {
  for (let n = 1; n <= 30; n++) {
    const level = generateLevel(n);
    assert.equal(level.kind, ['mini', 'boss', 'chest'][(n - 1) % 3]);
    assert.equal(level.world, WORLDS[Math.floor((n - 1) / 3)].id);
  }
});

test('levels 28–30 are not a copy of levels 4–6', () => {
  for (let i = 0; i < 3; i++) {
    const early = generateLevel(4 + i);
    const late = generateLevel(28 + i);
    assert.notEqual(early.world, late.world);
    assert.ok(late.gates.filter((g) => g.row === 0).length > early.gates.filter((g) => g.row === 0).length, 'longer');
    assert.ok(bossDifficulty(28 + i) > bossDifficulty(4 + i), 'stronger boss');
  }
});

test('with the best crowd the boss needs a humane tapping speed on every level', () => {
  for (let n = 1; n <= 30; n++) {
    const { boss, bestCount } = generateLevel(n);
    const rate = requiredTapRate(bestCount, boss.hp, 1);
    assert.ok(rate <= HUMAN_TAPS_PER_SECOND, `level ${n}: needs ${rate.toFixed(1)} taps/s`);
  }
  const first = generateLevel(1);
  assert.ok(requiredTapRate(first.bestCount, first.boss.hp, 1) <= 1.5, 'level 1 is gentle');
});

test('boss strength rises through each world and eases off when the next one starts', () => {
  // Boss HP follows the best crowd, which depends on the gate rolls, so compare the HP share of that crowd.
  const strength = (n) => bossDifficulty(n);
  for (let w = 0; w < 10; w++) {
    const [a, b, c] = [1, 2, 3].map((slot) => strength(w * 3 + slot));
    assert.ok(a < b && b <= c, `world ${w + 1}: ${a} ${b} ${c}`);
    if (w > 0) assert.ok(a < strength(w * 3), `world ${w + 1} starts with a breather`);
  }
  for (let w = 1; w < 10; w++) assert.ok(strength(w * 3 + 2) > strength((w - 1) * 3 + 2), 'each world boss beats the previous one');
});
