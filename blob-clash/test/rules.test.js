import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGate, bestGate, blastVictims, jumpLift, onRamp, sweepX, bonusMultiplier, bossPunchDamage, championStats, circleHitsBox, clashStep,
  crowdSpacing, formationRadius, formatCoins, gateLabel, axeAngle, axeBladeX, axeIsLow, ballHits, ballRollTime, ballState, obstacleHits,
  crossesObstacle, pusherBox, pusherGap, pressesButton, requiredTapRate,
  rewardCoins, upgradeCost, jellyPhase,
} from '../src/rules.js';

test('gates apply their operation and clamp to [0, max]', () => {
  assert.equal(applyGate(5, { op: '+', value: 10 }), 15);
  assert.equal(applyGate(5, { op: 'x', value: 3 }), 15);
  assert.equal(applyGate(5, { op: '-', value: 8 }), 0);
  assert.equal(applyGate(7, { op: '/', value: 2 }), 3);
  assert.equal(applyGate(600, { op: 'x', value: 2 }, 999), 999);
  assert.equal(gateLabel({ op: 'x', value: 20 }), '×20');
});

test('bestGate picks the option that yields the bigger crowd', () => {
  const pair = { left: { op: '+', value: 15 }, right: { op: 'x', value: 2 } };
  assert.equal(bestGate(5, pair), pair.left); // 20 vs 10
  assert.equal(bestGate(40, pair), pair.right); // 55 vs 80
});

test('big crowds pack tighter so they never exceed the max radius', () => {
  const cfg = { spacing: 0.55, maxRadius: 3.2, unitRadius: 0.3 };
  assert.equal(crowdSpacing(5, cfg), 0.55);
  assert.ok(crowdSpacing(500, cfg) < 0.55);
  assert.ok(formationRadius(500, cfg) <= 3.2 + 1e-9);
  assert.equal(formationRadius(1, cfg), 0.3);
});

test('circle vs box collision', () => {
  const box = { x: 0, d: 10, halfWidth: 2, halfDepth: 0.5 };
  assert.ok(circleHitsBox(2.5, 10, 1, box));
  assert.ok(!circleHitsBox(3.5, 10, 1, box));
  assert.ok(!circleHitsBox(2.9, 11.4, 1, box)); // corner gap
});

test('sliders move in from their edge and back; spike pads are static; traps span the track', () => {
  const slider = { kind: 'slider', d: 0, radius: 1, edgeX: 5, reach: 3, speed: 1, phase: 0 };
  assert.ok(!obstacleHits(slider, 0, 2, 0, 0.3)); // retracted at the edge (x = 5)
  assert.ok(obstacleHits(slider, Math.PI, 2, 0, 0.3)); // fully in (x = 2)
  assert.ok(obstacleHits(slider, 0, 4.5, 0, 0.3)); // the edge is never safe
  const spikes = { kind: 'spikes', d: 5, pads: [{ x: -3, halfWidth: 1, halfDepth: 1 }] };
  assert.ok(obstacleHits(spikes, 0, -3, 5, 0.3));
  assert.ok(!obstacleHits(spikes, 0, 0, 5, 0.3));
  const trap = { kind: 'trap', d: 5, halfDepth: 1 };
  assert.ok([-4.5, 0, 4.5].every((x) => obstacleHits(trap, 0, x, 5, 0.3)));
});

test('a body on the button presses it', () => {
  const button = { x: 3, d: 10, radius: 0.9 };
  assert.ok(pressesButton(button, 3.5, 10.5, 0.3));
  assert.ok(!pressesButton(button, 0, 10, 0.3));
});

test('crowd clash: the bigger side survives with the difference', () => {
  let [a, b] = [30, 20];
  while (a > 0 && b > 0) [a, b] = clashStep(a, b, 10, 0.016);
  assert.equal(b, 0);
  assert.ok(Math.abs(a - 10) < 1e-9);
});

test('champion scales with the crowd; tapping speed needed scales with boss HP', () => {
  const small = championStats(20, 1);
  const big = championStats(80, 1);
  assert.equal(big.hp, 80);
  assert.ok(big.punch === small.punch * 4);
  assert.ok(championStats(20, 3).punch > small.punch); // Damage upgrade
  assert.ok(requiredTapRate(80, 50, 1) < requiredTapRate(40, 50, 1));
  assert.ok(requiredTapRate(80, 100, 1) > requiredTapRate(80, 50, 1));
});

test('every boss in the roster knocks out a champion in bossKillSeconds on average', async () => {
  const { BOSSES } = await import('../src/bosses.js');
  const { attackStats } = await import('../src/moves.js');
  for (const { id, attack } of BOSSES) {
    const stats = attackStats(attack);
    const perSecond = (bossPunchDamage(100, stats, { bossKillSeconds: 10 }) * stats.strikes) / stats.interval;
    assert.ok(Math.abs(perSecond - 10) < 1e-9, `${id} deals ${perSecond}/s`);
    assert.ok(stats.windup < stats.interval, `${id} winds up longer than its interval`);
  }
});

test('chained taps build a combo whose 5th hit is a jump punch', async () => {
  const { comboStep } = await import('../src/rules.js');
  const cfg = { comboWindow: 0.5, finisherEvery: 5, jumpPunchMultiplier: 2.5 };
  let state = { combo: 0, lastTap: -10 };
  const hits = [];
  for (let i = 0; i < 6; i++) {
    state = comboStep(state, i * 0.2, cfg);
    hits.push(state.multiplier);
  }
  assert.deepEqual(hits, [1, 1, 1, 1, 2.5, 1]);
  assert.equal(comboStep(state, 5, cfg).combo, 1); // a pause breaks the combo
});

test('bonus multiplier grows with remaining health, snapped to 0.2 steps, capped at x5', () => {
  assert.equal(bonusMultiplier(0), 1);
  assert.equal(bonusMultiplier(0.5), 3);
  assert.equal(bonusMultiplier(2), 5);
  assert.equal(bonusMultiplier(0.14), 1.6);
});

test('rewards, upgrade costs and coin formatting', () => {
  assert.equal(rewardCoins(40, 2, 1.5, { base: 50, perLevel: 10 }), 165);
  assert.equal(upgradeCost(1), 50);
  assert.ok(upgradeCost(3) > upgradeCost(2));
  assert.equal(formatCoins(950), '950');
  assert.equal(formatCoins(8190), '8.19K');
  assert.equal(formatCoins(12345), '12.3K');
  assert.equal(formatCoins(2500000), '2.5M');
});

test('obstacles hit a body only on the frame it crosses the obstacle line', async () => {
  const { crossesObstacle } = await import('../src/rules.js');
  const spikes = { kind: 'spikes', d: 10, pads: [{ x: 0, halfWidth: 1, halfDepth: 1 }] };
  assert.ok(crossesObstacle(spikes, 0, 0, 9.9, 10.1, 0.3));
  assert.ok(!crossesObstacle(spikes, 0, 0, 10.1, 10.3, 0.3)); // already past: no second hit
  assert.ok(!crossesObstacle(spikes, 0, 2, 9.9, 10.1, 0.3)); // crossed beside the pad
});

test('saws sweep the whole track and cut what they touch', () => {
  const saw = { kind: 'saw', d: 10, radius: 0.9, halfDepth: 0.25, range: 4.5, speed: 1, phase: 0 };
  assert.equal(sweepX(saw, 0), 0);
  assert.ok(Math.abs(sweepX(saw, Math.PI / 2) - 4.5) < 1e-9);
  assert.ok(obstacleHits(saw, 0, 0.5, 10, 0.3));
  assert.ok(!obstacleHits(saw, 0, 2, 10, 0.3));
  assert.ok(obstacleHits(saw, Math.PI / 2, 4, 10, 0.3));
});

test('jumps arc up and land; only blobs on the ramp take off', () => {
  assert.equal(jumpLift(-1, 9), 0);
  assert.equal(jumpLift(10, 9), 0);
  assert.ok(Math.abs(jumpLift(4.5, 9, 2.6) - 2.6) < 1e-9);
  const ramp = { x: 1.6, halfWidth: 3.4 };
  assert.ok(onRamp(ramp, -1.7) && onRamp(ramp, 4.9));
  assert.ok(!onRamp(ramp, -2.5));
});

test('a bomb blast takes everyone inside its radius', () => {
  const bomb = { x: 0, d: 10, blast: 2 };
  const bodies = [{ x: 0, d: 10 }, { x: 1.5, d: 11 }, { x: 3, d: 10 }, { x: 0, d: 12.5 }];
  assert.deepEqual(blastVictims(bomb, bodies), [0, 1]);
});

test('jelly phases stay in one turn and keep bodies out of step', () => {
  const phases = Array.from({ length: 90 }, (_, i) => jellyPhase(i));
  assert.ok(phases.every((p) => p >= 0 && p < Math.PI * 2));
  assert.equal(new Set(phases.map((p) => p.toFixed(6))).size, phases.length);
  assert.ok(phases.slice(1).every((p, i) => Math.abs(p - phases[i]) > 0.5 || Math.abs(p - phases[i]) > Math.PI * 2 - 0.5));
});

test('the axe cuts only while the blade hangs low, at three moments of the swing', () => {
  const axe = { kind: 'axe', d: 10, length: 5.6, pivotHeight: 6.4, swing: 0.95, speed: 1, phase: 0, halfWidth: 0.9, halfDepth: 0.3, clearance: 1.6 };
  // t = 0: hanging straight down, low and centred.
  assert.equal(axeAngle(axe, 0), 0);
  assert.ok(axeIsLow(axe, 0));
  assert.ok(obstacleHits(axe, 0, 0.5, 10, 0.3));
  assert.ok(!obstacleHits(axe, 0, 3, 10, 0.3), 'beside the blade is safe');
  // Quarter period: top of the swing, blade out at the side and above head height.
  const top = Math.PI / 2;
  assert.ok(!axeIsLow(axe, top));
  assert.ok(Math.abs(axeBladeX(axe, top)) > 4.5, 'reaches the track edge');
  assert.ok(!obstacleHits(axe, top, axeBladeX(axe, top), 10, 0.3), 'raised blade cuts nobody');
  // In between: low again but already off to the side, so the centre is clear.
  const swinging = 0.4; // angle 0.95 · sin(0.4) ≈ 0.37 rad
  assert.ok(axeIsLow(axe, swinging));
  assert.ok(obstacleHits(axe, swinging, axeBladeX(axe, swinging), 10, 0.3));
  assert.ok(!obstacleHits(axe, swinging, -axeBladeX(axe, swinging), 10, 0.3));
  assert.ok(!obstacleHits(axe, 0, 0, 14, 0.3), 'only at its own distance');
});

test('the pusher block hits only where it has slid to, at three moments', () => {
  // Left rail at x = -5; inner face starts at the rail and slides 2.8 in. Period = 2π / 1 s.
  const pusher = { kind: 'pusher', d: 10, edgeX: -5, halfWidth: 1.8, halfDepth: 1.1, reach: 2.8, speed: 1, phase: 0 };
  const retracted = 0;
  const half = Math.PI; // fully extended
  const quarter = Math.PI / 2; // half way in
  assert.equal(pusherBox(pusher, retracted).x, -5 - 1.8, 'retracted: the whole block waits outside the rail');
  assert.ok(!obstacleHits(pusher, retracted, -4.5, 10, 0.3), 'retracted: the track is clear');
  // Half way: inner face 1.4 in from the rail, at x = -3.6.
  assert.ok(obstacleHits(pusher, quarter, -3.9, 10, 0.3));
  assert.ok(!obstacleHits(pusher, quarter, -3.0, 10, 0.3));
  // Fully in: face at -2.2.
  assert.ok(obstacleHits(pusher, half, -2.6, 10, 0.3));
  assert.ok(!obstacleHits(pusher, half, -1.8, 10, 0.3));
  assert.ok(!obstacleHits(pusher, half, -2.6, 14, 0.3), 'only at its own distance');
  assert.ok(Math.abs(pusherGap(pusher, half) - 7.2) < 1e-9, 'extended: 10 - 2.8 units left');
  assert.equal(pusherGap(pusher, retracted), 10);
  // The mirrored block on the right rail behaves the same way.
  const right = { ...pusher, edgeX: 5 };
  assert.ok(obstacleHits(right, half, 2.6, 10, 0.3));
  assert.ok(!obstacleHits(right, half, -2.6, 10, 0.3));
});

test('spiked pillars kill whoever touches a pad, and leave the middle open', () => {
  const pillars = { kind: 'pillars', d: 10, pads: [-1, 1].map((s) => ({ x: s * 4.25, halfWidth: 0.75, halfDepth: 0.7 })) };
  assert.ok(obstacleHits(pillars, 0, -4.0, 10, 0.3));
  assert.ok(obstacleHits(pillars, 0, 4.4, 10.5, 0.3));
  assert.ok(!obstacleHits(pillars, 0, 0, 10, 0.3));
  assert.ok(!obstacleHits(pillars, 0, -4.0, 12, 0.3), 'only at its own distance');
});

test('the ball rolls down its lane, falls off the edge into the water and waits', () => {
  const ball = {
    kind: 'ball', d: 50, x: 3.3, side: 1, offset: 0, radius: 1.25, span: 6, speed: 9, fallTime: 0.7, waitTime: 1.7, warnTime: 1.1,
    fallReach: 4, fallDepth: 6,
  };
  const roll = ballRollTime(ball);
  assert.deepEqual([ballState(ball, 0).phase, ballState(ball, 0).d], ['roll', 56]);
  assert.ok(Math.abs(ballState(ball, roll / 2).d - 50) < 1e-9, 'middle of the run');
  const fall = ballState(ball, roll + 0.5 * ball.fallTime);
  assert.equal(fall.phase, 'fall');
  assert.ok(fall.x > ball.x && fall.y < ball.radius, 'slides sideways and sinks');
  assert.ok(ballState(ball, roll + ball.fallTime + 0.1).phase === 'wait');
  assert.ok(!ballState(ball, roll + ball.fallTime + 0.1).warn && ballState(ball, roll + ball.fallTime + ball.waitTime - 0.5).warn, 'warns just before the next run');
  const period = roll + ball.fallTime + ball.waitTime;
  assert.equal(ballState(ball, period + 0.2).d, ballState(ball, 0.2).d, 'repeats every period');
});

test('the ball crushes what it overlaps only while it rolls, and never in the other lanes', () => {
  const ball = {
    kind: 'ball', d: 50, x: 3.3, side: 1, offset: 0, radius: 1.25, span: 6, speed: 9, fallTime: 0.7, waitTime: 1.7, warnTime: 1.1,
    fallReach: 4, fallDepth: 6,
  };
  const at = ballState(ball, 0.3); // d = 53.3
  assert.ok(ballHits(ball, 0.3, 3.3, at.d - 1, 0.3), 'in its lane, in its way');
  assert.ok(obstacleHits(ball, 0.3, 3.0, at.d, 0.3));
  assert.ok(!ballHits(ball, 0.3, 0, at.d, 0.3), 'middle lane is safe');
  assert.ok(!ballHits(ball, 0.3, -3.3, at.d, 0.3), 'far lane is safe');
  assert.ok(!ballHits(ball, 0.3, 3.3, at.d + 4, 0.3), 'not yet there');
  assert.ok(!ballHits(ball, ballRollTime(ball) + 0.2, 3.3, 44, 0.3), 'falling balls crush nobody');
  assert.ok(!crossesObstacle(ball, 0.3, 3.3, 49, 51, 0.3), 'no crossing line: the game tests it every frame');
});
