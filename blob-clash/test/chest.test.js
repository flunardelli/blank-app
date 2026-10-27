import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createRng } from '../src/rng.js';
import {
  chestCamera, chestShake, chestStageCoins, coinsPerBlob, chestTimeline, coinAt, coinLaunch, hopDelays, lidAngle,
} from '../src/chest.js';

const cfg = CONFIG.chest;
const launches = (seed = 1) => {
  const rng = createRng(seed);
  return Array.from({ length: cfg.coins }, () => coinLaunch(rng));
};

test('blobs hop in one by one, spread evenly over the hop span', () => {
  const delays = hopDelays(5, 2);
  assert.deepEqual(delays, [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(hopDelays(1), [0]);
  assert.deepEqual(hopDelays(0), []);
});

test('the timeline runs hops, then the swing and lid, then the coin fountain', () => {
  const { rotateStart, burstAt, end } = chestTimeline();
  assert.ok(rotateStart >= cfg.approach + cfg.hopSpan + cfg.hopFlight, 'every blob is in before the swing');
  assert.ok(burstAt > rotateStart + cfg.lidDelay, 'coins burst after the lid starts to open');
  assert.ok(end > burstAt);
});

test('the lid is ajar for the hops, slams shut, then jumps open past its final angle', () => {
  assert.equal(lidAngle(-1), cfg.lidAjar);
  assert.equal(lidAngle(cfg.lidDelay - 0.01), 0);
  assert.ok(Math.abs(lidAngle(cfg.lidDelay)) < 1e-9);
  const settled = lidAngle(cfg.lidDelay + cfg.lidOpen + 1);
  assert.ok(Math.abs(settled - cfg.lidAngle) < 1e-9);
  const peak = Math.max(...Array.from({ length: 50 }, (_, i) => lidAngle(cfg.lidDelay + (i / 49) * cfg.lidOpen)));
  assert.ok(peak > cfg.lidAngle, 'the jolt overshoots');
});

test('the chest shakes before the lid opens and is still again after', () => {
  assert.equal(chestShake(-1), 0);
  const peaks = (from, to) => Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(chestShake(from + ((to - from) * i) / 199))));
  assert.ok(peaks(0.1, cfg.lidDelay) > 0.02);
  assert.equal(chestShake(cfg.lidDelay + 1), 0);
});

test('the camera swings from the side to the front of the chest and zooms in', () => {
  const center = { x: 0, z: -50 };
  const side = chestCamera(0, center);
  const front = chestCamera(cfg.rotate, center);
  assert.ok(Math.abs(side.pos[0] - center.x) > Math.abs(side.pos[2] - center.z), 'starts on the side');
  assert.ok(Math.abs(front.pos[0] - center.x) < 1e-9 && front.pos[2] > center.z, 'ends in front');
  const dist = (c) => Math.hypot(c.pos[0] - center.x, c.pos[2] - center.z);
  assert.ok(dist(front) < dist(side), 'zoomed in');
  assert.deepEqual(chestCamera(cfg.rotate + 5, center), front, 'stays on the front');
  assert.deepEqual(chestCamera(-5, center), side);
});

test('hundreds of coins burst out, each one flies and then vanishes', () => {
  const coins = launches();
  assert.ok(coins.length >= 300);
  const { burstAt, end } = chestTimeline();
  for (const coin of coins) {
    assert.equal(coinAt(coin, coin.delay - 0.01), null, 'not out before its turn');
    const out = coinAt(coin, coin.delay + 0.05);
    assert.ok(out && out.y > cfg.coinStartY, 'rises out of the chest');
    assert.ok(out.size > 0);
  }
  assert.ok(coins.every((c) => coinAt(c, end - burstAt) === null), 'nothing is left when the stage ends');
});

test('coins never sink below the floor and shrink to nothing when they land', () => {
  for (const coin of launches(7)) {
    for (let t = 0; t < 5; t += 0.05) {
      const at = coinAt(coin, t);
      if (at) assert.ok(at.y >= cfg.coinFloor - 1e-9);
    }
  }
});

test('coins fly in different directions and are reproducible per seed', () => {
  const a = launches(3);
  assert.deepEqual(a, launches(3));
  assert.notDeepEqual(a, launches(4));
  assert.ok(new Set(a.map((c) => Math.sign(c.vx))).size === 2);
});

test('the chest pays per blob that made it, a little more in every world', () => {
  assert.equal(chestStageCoins(0), 0);
  assert.equal(chestStageCoins(1), cfg.coinsPerBlob, 'a lone blob still wins, and pays little');
  assert.equal(chestStageCoins(10, 0), 10 * cfg.coinsPerBlob);
  const perBlob = [0, 1, 2, 9].map((w) => coinsPerBlob(w));
  assert.ok(perBlob.every((v, i) => i === 0 || v > perBlob[i - 1]));
  assert.equal(chestStageCoins(10, 9), 10 * perBlob[3]);
});
