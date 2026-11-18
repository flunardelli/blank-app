// Procedural, seeded level generator. Output is plain data; levelView.js renders it.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { expectedUpgrades } from './economy.js';
import { applyGate, bestGate, bossDifficulty, damageFor, startBlobsFor } from './rules.js';
import { levelInfo } from './worlds.js';

// Some segments open with two gate rows in a row. The gap is short enough that the crowd can still
// cross the track between the rows (the test checks it against crowd.lateralSpeed), yet long enough
// to read the second row. Chance grows with the campaign pressure; the first segment stays single.
const DOUBLE_ROW = { gap: 5, baseChance: 0.15, pressureChance: 0.35 };

const multiplyGate = (rng, cfg) => ({ op: 'x', value: rng.pick(cfg.multipliers) });
const addGate = (rng, level, cfg) => ({ op: '+', value: rng.int(cfg.addMin, cfg.addMax + level) });

function goodGate(rng, level, cfg) {
  return rng.chance(0.4) ? multiplyGate(rng, cfg) : addGate(rng, level, cfg);
}

function badGate(rng, cfg) {
  return rng.chance(0.7) ? { op: '-', value: rng.int(cfg.subMin, cfg.subMax) } : { op: '/', value: 2 };
}

// Two good doors are always one × and one +: never the same operation twice (no "×2 | ×2"),
// so the choice depends on the crowd size instead of being a coin flip.
// Below this relative difference the two doors land on about the same crowd: not a choice.
export const MIN_GATE_GAP = 0.15;

function makeGatePair(rng, d, level, cfg, forceGood, count = 1) {
  const good = goodGate(rng, level, cfg);
  let other;
  if (!forceGood && rng.chance(cfg.badChance)) other = badGate(rng, cfg);
  else other = good.op === 'x' ? addGate(rng, level, cfg) : multiplyGate(rng, cfg);
  const add = [good, other].find((o) => o.op === '+');
  const mul = [good, other].find((o) => o.op === 'x');
  // Big crowds only get ×2: ×3 on a few hundred blobs would pin every later gate at maxCount.
  if (mul && count > cfg.softCap) mul.value = 2;
  // A × and a + that land within MIN_GATE_GAP of each other: push the + further from the × until
  // the choice matters. Deterministic (no rng draw), so it never reshuffles the rest of the level.
  if (add && mul) {
    for (let tries = 0; tries < 4 && gapOf(count, add, mul) < MIN_GATE_GAP; tries++) {
      const addWins = applyGate(count, add) >= applyGate(count, mul);
      add.value = Math.max(1, Math.round(add.value * (addWins ? 1.6 : 0.55)));
    }
  }
  const [left, right] = rng.chance(0.5) ? [good, other] : [other, good];
  return { d, row: 0, left, right };
}

function gapOf(count, a, b) {
  const [x, y] = [applyGate(count, a), applyGate(count, b)];
  return Math.abs(x - y) / Math.max(x, y, 1);
}

// One slider on a random edge, or a pair on both edges sliding in turns.
function makeSliders(rng, d, cfg) {
  const ob = cfg.obstacle;
  const half = cfg.track.width / 2;
  const phase = rng.next() * Math.PI * 2;
  const skin = rng.pick(['melon', 'glove']);
  const slider = (side, offset) => ({
    kind: 'slider', skin, d, radius: ob.sliderRadius, edgeX: side * half,
    reach: ob.sliderReach, speed: ob.sliderSpeed, phase: phase + offset,
  });
  return rng.chance(0.5) ? [slider(rng.pick([-1, 1]), 0)] : [slider(-1, 0), slider(1, Math.PI)];
}

function makeSpikes(rng, d, cfg) {
  const ob = cfg.obstacle;
  const pads = rng.pick(ob.spikeLayouts).map(([x, halfWidth]) => ({ x, halfWidth, halfDepth: ob.spikeHalfDepth }));
  return [{ kind: 'spikes', d, pads }];
}

// Full-width spikes: deadly unless the crowd steps on the button placed ahead of them.
function makeTrap(rng, d, cfg) {
  const ob = cfg.obstacle;
  const button = { x: rng.pick(cfg.track.lanes), d: d - ob.trapButtonLead, radius: ob.trapButtonRadius };
  return [{ kind: 'trap', d, halfDepth: ob.trapHalfDepth, button }];
}

function saw(rng, d, cfg, phaseOffset = 0) {
  const ob = cfg.obstacle;
  const range = cfg.track.width / 2 - ob.sawRadius * 0.5; // the blade reaches the rails
  return {
    kind: 'saw', d, radius: ob.sawRadius, halfDepth: ob.sawHalfDepth, range,
    speed: ob.sawSpeed * (0.85 + rng.next() * 0.3), phase: rng.next() * Math.PI * 2 + phaseOffset,
  };
}

// One or two rails, each with a blade sliding across the whole track.
function makeSaws(rng, d, cfg) {
  return rng.chance(0.5) ? [saw(rng, d, cfg)] : [saw(rng, d, cfg), saw(rng, d + 3.5, cfg, Math.PI)];
}

function axe(rng, d, cfg, phaseOffset = 0) {
  const ob = cfg.obstacle;
  return {
    kind: 'axe', d, length: ob.axeLength, pivotHeight: ob.axePivotHeight, swing: ob.axeSwing,
    halfWidth: ob.axeHalfWidth, halfDepth: ob.axeHalfDepth, clearance: ob.axeClearance,
    speed: ob.axeSpeed * (0.9 + rng.next() * 0.2), phase: rng.next() * Math.PI * 2 + phaseOffset,
  };
}

// One pendulum axe, or two a few units apart swinging in opposite phase.
function makeAxes(rng, d, cfg) {
  return rng.chance(0.5) ? [axe(rng, d, cfg)] : [axe(rng, d, cfg), axe(rng, d + 4.5, cfg, Math.PI)];
}

// Spiked pillars at both rails, one or two pairs in a row; the middle stays open for the biggest crowd.
function makePillars(rng, d, cfg) {
  const ob = cfg.obstacle;
  const half = cfg.track.width / 2;
  const pair = (rowD) => {
    const halfWidth = ob.pillarMinHalfWidth + rng.next() * (ob.pillarMaxHalfWidth - ob.pillarMinHalfWidth);
    const pads = [-1, 1].map((side) => ({ x: side * (half - halfWidth), halfWidth, halfDepth: ob.pillarHalfDepth }));
    return { kind: 'pillars', d: rowD, pads };
  };
  return rng.chance(0.5) ? [pair(d)] : [pair(d), pair(d + ob.pillarPairGap)];
}

// A big block sliding in from one rail, or two from alternate rails taking turns.
function makePushers(rng, d, cfg) {
  const ob = cfg.obstacle;
  const half = cfg.track.width / 2;
  const phase = rng.next() * Math.PI * 2;
  const pusher = (side, rowD, offset) => ({
    kind: 'pusher', d: rowD, edgeX: side * half, halfWidth: ob.pusherHalfWidth, halfDepth: ob.pusherHalfDepth,
    reach: ob.pusherReach, speed: ob.pusherSpeed, phase: phase + offset,
  });
  const side = rng.pick([-1, 1]);
  return rng.chance(0.5) ? [pusher(side, d, 0)] : [pusher(side, d, 0), pusher(-side, d + 5, Math.PI)];
}

function ball(rng, d, cfg, x, offset) {
  const ob = cfg.obstacle.ball;
  const half = cfg.track.width / 2;
  return {
    kind: 'ball', d, x, offset, side: x === 0 ? rng.pick([-1, 1]) : Math.sign(x), radius: ob.radius, span: ob.span,
    speed: ob.speed, fallTime: ob.fallTime, waitTime: ob.waitTime, warnTime: ob.warnTime,
    fallReach: half + ob.radius + 1 - Math.abs(x), fallDepth: 6, // slides past the rail, then down below the water line
  };
}

// One ball in one lane, or two in different lanes that roll in turns: never all three lanes at once.
function makeBalls(rng, d, cfg) {
  const ob = cfg.obstacle.ball;
  const first = rng.pick(cfg.track.lanes);
  const lanes = rng.chance(0.5) ? [first] : [first, rng.pick(cfg.track.lanes.filter((x) => x !== first))];
  const period = (2 * ob.span) / ob.speed + ob.fallTime + ob.waitTime;
  const start = rng.next() * period;
  return lanes.map((x, i) => ball(rng, d, cfg, x, start + (i * period) / 2));
}

// A ramp that does not cover the whole track, with saws behind it: take the ramp and fly over them.
function makeJump(rng, d, cfg) {
  const ob = cfg.obstacle;
  const half = cfg.track.width / 2;
  const x = rng.pick([-1, 0, 1]) * (half - ob.rampHalfWidth);
  const ramp = { kind: 'ramp', d, x, halfWidth: ob.rampHalfWidth, halfDepth: ob.rampHalfDepth, length: ob.jumpLength };
  const landing = d + ob.rampHalfDepth;
  return [ramp, saw(rng, landing + ob.jumpLength * 0.35, cfg), saw(rng, landing + ob.jumpLength * 0.65, cfg, Math.PI)];
}

// Two rows of bombs packed on alternate sides: dodge left, then right (or the other way round).
function makeBombs(rng, d, cfg) {
  const ob = cfg.obstacle;
  const first = rng.pick([-1, 1]);
  return [[first, d], [-first, d + ob.bombRowGap]].flatMap(([side, rowD]) =>
    ob.bombSlots.map((x) => ({ kind: 'bomb', x: side * x, d: rowD, radius: ob.bombRadius, blast: ob.bombBlast })));
}

const OBSTACLE_MAKERS = {
  slider: makeSliders, spikes: makeSpikes, trap: makeTrap, saw: makeSaws, jump: makeJump, bombs: makeBombs, axe: makeAxes,
  ball: makeBalls, pillars: makePillars, pusher: makePushers,
};

/** Hazard weights for a level: only unlocked kinds, with this level's featured kind boosted. */
export function hazardWeights(level, { weights, unlockLevel, featuredBoost } = CONFIG.obstacle) {
  const unlocked = Object.keys(weights).filter((kind) => unlockLevel[kind] <= level);
  const { featured } = levelInfo(level).world;
  return Object.fromEntries(unlocked.map((kind) => [kind, weights[kind] * (kind === featured ? featuredBoost : 1)]));
}

function makeObstacles(rng, d, weights, cfg) {
  let roll = rng.next() * Object.values(weights).reduce((a, b) => a + b, 0);
  const kind = Object.keys(weights).find((k) => (roll -= weights[k]) < 0) ?? 'slider';
  return OBSTACLE_MAKERS[kind](rng, d, cfg);
}

// A small group of gray walkers pacing side to side, each on its own row and rhythm.
function makeWalkers(rng, d, level, pressure, cfg) {
  const w = cfg.walkers;
  const half = cfg.track.width / 2;
  const most = Math.min(w.perGroupMax, 1 + Math.floor(pressure * w.perGroupMax * 1.5));
  return Array.from({ length: rng.int(w.perGroupMin, most) }, (_, i) => {
    const brute = level >= w.bruteFromLevel && rng.chance(w.bruteChance);
    const radius = w.radius * (brute ? w.bruteScale : 1);
    return {
      d: d + i * 2.2, radius, range: half - radius - 0.3, strength: brute ? w.bruteStrength : 1,
      speed: w.speed * (0.8 + rng.next() * 0.5), phase: rng.next() * Math.PI * 2,
    };
  });
}

// A few sleeping blobs huddled in one lane (two rows of three at most): steer into the lane to wake them.
function makeRecruits(rng, d, pressure, cfg) {
  const r = cfg.recruits;
  const most = Math.min(r.perGroupMax, 1 + Math.floor(pressure * r.perGroupMax * 1.5));
  const laneX = rng.pick(cfg.track.lanes);
  return Array.from({ length: rng.int(r.perGroupMin, most) }, (_, i) => ({
    x: laneX + ((i % 3) - 1) * r.slotSpacing, d: d + Math.floor(i / 3) * r.slotSpacing, radius: r.radius,
  }));
}

function makeCoinRow(rng, d, cfg, lureX) {
  const lane = rng.pick(cfg.track.lanes); // always drawn, so a lure doesn't reshuffle the rest of the level
  const x = lureX ?? lane;
  return Array.from({ length: cfg.coins.perRow }, (_, i) => ({ x, d: d + i * cfg.coins.spacing }));
}

export const DOUBLE_ROW_GAP = DOUBLE_ROW.gap;

export function generateLevel(level, cfg = CONFIG) {
  const rng = createRng(level * 7919 + 13);
  const { track } = cfg;
  const { pressure, kind, world } = levelInfo(level);
  const segments = track.minSegments + Math.round((track.maxSegments - track.minSegments) * pressure);
  const gates = [];
  const obstacles = [];
  const coins = [];
  const enemies = [];
  const walkers = [];
  const recruits = [];
  // Own stream, so adding recruits never reshuffles the rest of a level.
  const recruitRng = createRng(level * 104729 + 5);
  const weights = hazardWeights(level, cfg.obstacle);
  // Best reachable crowd with perfect gate choices, starting from the upgrades a typical player
  // owns at this level (economy.js): the boss is sized for that player.
  const expected = expectedUpgrades(level);
  let bestCount = startBlobsFor(expected.blobs, cfg.upgrades);
  // The crowd the gates are tuned for: like bestCount but without recruits, so adding or removing
  // recruits never changes a gate.
  let gateCount = bestCount;
  let d = track.introLength;

  for (let s = 0; s < segments; s++, d += track.segmentLength) {
    const rowChance = DOUBLE_ROW.baseChance + DOUBLE_ROW.pressureChance * pressure;
    const rows = s > 0 && rng.chance(rowChance) ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const pair = { ...makeGatePair(rng, d + row * DOUBLE_ROW.gap, level, cfg.gates, s === 0, gateCount), row };
      gates.push(pair);
      bestCount = applyGate(bestCount, bestGate(bestCount, pair), cfg.gates.maxCount);
      gateCount = applyGate(gateCount, bestGate(gateCount, pair), cfg.gates.maxCount);
    }

    // Lure: when a bad door is on offer, the coin row waits right behind it (coins vs blobs).
    const lastPair = gates[gates.length - 1];
    const bad = [lastPair.left, lastPair.right].find((o) => o.op === '-' || o.op === '/');
    const lureX = bad ? (bad === lastPair.left ? -1 : 1) * cfg.track.lanes[2] : undefined;
    coins.push(...makeCoinRow(rng, d + 6, cfg, lureX));
    obstacles.push(...makeObstacles(rng, d + 16, weights, cfg));

    if (recruitRng.chance(cfg.recruits.chance)) {
      const group = makeRecruits(recruitRng, d + cfg.recruits.offsetD, pressure, cfg);
      recruits.push(...group);
      bestCount += group.length; // every sleeper is reachable by steering, so perfect play wakes them all
    }

    if (s % 2 === 1) {
      const rise = cfg.enemy.pressureShare * pressure;
      const ease = level <= cfg.enemy.easeLevels ? cfg.enemy.easeFactor : 1;
      const share = ease * (cfg.enemy.minShare + rise + rng.next() * (cfg.enemy.maxShare - cfg.enemy.minShare));
      const enemyFor = (crowd) => Math.max(2, Math.round(crowd * share));
      const count = enemyFor(bestCount);
      enemies.push({ d: d + 29, count });
      bestCount -= count;
      gateCount -= enemyFor(gateCount);
    } else if (s > 0 && level >= cfg.walkers.fromLevel) {
      walkers.push(...makeWalkers(rng, d + 28, level, pressure, cfg)); // dodgeable: perfect play loses nothing
    }
  }

  // A crowd that grew far past the soft cap meets a guard crowd just before the finish line, so the
  // boss fight (and the chest payout) starts from the hundreds, not from maxCount. Sized on what a
  // *typical* crowd (economy.crowdShare of the best one) carries past the cap: sizing it on the
  // perfect crowd would wall off everyone else.
  let finishD = d + cfg.boss.finishGap;
  const typicalCrowd = bestCount * cfg.economy.crowdShare;
  if (typicalCrowd > cfg.gates.softCap) {
    const count = Math.round((typicalCrowd - cfg.gates.softCap) * 0.8 + cfg.gates.softCap * cfg.enemy.minShare);
    enemies.push({ d: d + 2, count, guard: true }); // resized in play to the crowd that really arrives (game.js)
    bestCount -= count;
    finishD += 8;
  }
  // One key per level, between two segments' coin rows.
  const keySegment = rng.int(1, segments - 1);
  const key = { x: rng.pick(track.lanes), d: track.introLength + keySegment * track.segmentLength - 4 };
  const bossD = finishD + cfg.boss.ringDepth / 2 + 1;
  return {
    level,
    world: world.id,
    kind, // 'mini' | 'boss' | 'chest' (see worlds.js)
    gates,
    obstacles,
    coins: coins.map((c, id) => ({ ...c, id })),
    key,
    enemies: enemies.map((e, id) => ({ ...e, id })),
    walkers: walkers.map((w, id) => ({ ...w, id })),
    recruits: recruits.map((r, id) => ({ ...r, id })),
    finishD,
    boss: {
      d: bossD,
      hp: Math.max(5, Math.round(bestCount * bossDifficulty(level, cfg.boss) * damageFor(expected.damage, cfg.upgrades))),
    },
    expected,
    ladderStart: finishD + cfg.boss.ringDepth + 1,
    bestCount,
  };
}
