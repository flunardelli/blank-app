import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyObstacleHit, applyPickup, circleHitsBox, clashResult, clashStep, massToRadius, obstacleHits,
} from '../src/rules.js';

test('radius grows with the cube root of mass and is capped', () => {
  assert.equal(massToRadius(8, { radiusPerCbrtMass: 0.5, maxRadius: 10 }), 1);
  assert.equal(massToRadius(1e6, { radiusPerCbrtMass: 0.5, maxRadius: 2 }), 2);
  assert.equal(massToRadius(-5), 0);
});

test('same colour pickups add mass, others subtract down to zero', () => {
  assert.equal(applyPickup(10, 'red', { color: 'red', mass: 3 }), 13);
  assert.equal(applyPickup(10, 'red', { color: 'blue', mass: 3 }), 7);
  assert.equal(applyPickup(2, 'red', { color: 'blue', mass: 3 }), 0);
});

test('obstacle damage is a fraction of mass with a floor', () => {
  const cfg = { damageFraction: 0.5, minDamage: 3 };
  assert.equal(applyObstacleHit(100, cfg), 50);
  assert.equal(applyObstacleHit(4, cfg), 1);
});

test('circle vs box collision', () => {
  const box = { x: 0, d: 10, halfWidth: 2, halfDepth: 0.5 };
  assert.ok(circleHitsBox(2.5, 10, 1, box));
  assert.ok(!circleHitsBox(3.5, 10, 1, box));
  assert.ok(!circleHitsBox(2.9, 11.4, 1, box)); // corner gap
});

test('moving saw position depends on time', () => {
  const saw = { kind: 'saw', d: 0, radius: 1, amplitude: 3, speed: 1, phase: 0 };
  assert.ok(obstacleHits(saw, 0, 0, 0, 0.5));
  assert.ok(!obstacleHits(saw, Math.PI / 2, 0, 0, 0.5)); // saw is at x = 3 now
});

test('clash: the bigger blob survives with the difference', () => {
  let state = { playerMass: 30, bossMass: 20 };
  while (!clashResult(state.playerMass, state.bossMass)) {
    state = clashStep(state.playerMass, state.bossMass, 10, 0.016);
  }
  assert.equal(clashResult(state.playerMass, state.bossMass), 'won');
  assert.ok(Math.abs(state.playerMass - 10) < 1e-9);
});

test('clash: a tie is a loss', () => {
  const { playerMass, bossMass } = clashStep(10, 10, 100, 1);
  assert.equal(clashResult(playerMass, bossMass), 'lost');
});
