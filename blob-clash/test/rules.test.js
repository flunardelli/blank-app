import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGate, bestGate, bonusMultiplier, bossFightResult, bossFightStep, circleHitsBox, clashStep,
  crowdSpacing, formationRadius, formatCoins, gateLabel, obstacleHits, rewardCoins, upgradeCost,
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

test('melon slides in from its edge and back; spike pads are static boxes', () => {
  const melon = { kind: 'melon', d: 0, radius: 1, edgeX: 5, reach: 3, speed: 1, phase: 0 };
  assert.ok(!obstacleHits(melon, 0, 2, 0, 0.3)); // retracted at the edge (x = 5)
  assert.ok(obstacleHits(melon, Math.PI, 2, 0, 0.3)); // fully in (x = 2)
  assert.ok(obstacleHits(melon, 0, 4.5, 0, 0.3)); // the edge is never safe
  const spikes = { kind: 'spikes', d: 5, pads: [{ x: -3, halfWidth: 1, halfDepth: 1 }] };
  assert.ok(obstacleHits(spikes, 0, -3, 5, 0.3));
  assert.ok(!obstacleHits(spikes, 0, 0, 5, 0.3));
});

test('crowd clash: the bigger side survives with the difference', () => {
  let [a, b] = [30, 20];
  while (a > 0 && b > 0) [a, b] = clashStep(a, b, 10, 0.016);
  assert.equal(b, 0);
  assert.ok(Math.abs(a - 10) < 1e-9);
});

test('boss fight spends exactly enough blobs to finish the boss', () => {
  let state = { count: 30, hp: 20, carry: 0, damage: 1 };
  while (!bossFightResult(state)) state = bossFightStep(state, 12, 1 / 60);
  assert.equal(bossFightResult(state), 'won');
  assert.equal(state.count, 10);
});

test('boss fight with stronger damage needs fewer blobs; too few blobs lose', () => {
  let strong = { count: 10, hp: 20, carry: 0, damage: 2.5 };
  while (!bossFightResult(strong)) strong = bossFightStep(strong, 12, 1 / 60);
  assert.equal(strong.count, 2);
  let weak = { count: 10, hp: 20, carry: 0, damage: 1 };
  while (!bossFightResult(weak)) weak = bossFightStep(weak, 12, 1 / 60);
  assert.equal(bossFightResult(weak), 'lost');
});

test('bonus multiplier grows with survivors, snapped to 0.2 steps, capped at x5', () => {
  assert.equal(bonusMultiplier(0, 50), 1);
  assert.equal(bonusMultiplier(25, 50), 3);
  assert.equal(bonusMultiplier(500, 50), 5);
  assert.equal(bonusMultiplier(7, 50), 1.6);
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
