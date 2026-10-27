// Procedural, seeded level generator. Output is plain data; levelView.js renders it.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { applyGate, bestGate, bossDifficulty } from './rules.js';
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
function makeGatePair(rng, d, level, cfg, forceGood) {
  const good = goodGate(rng, level, cfg);
  let other;
  if (!forceGood && rng.chance(cfg.badChance)) other = badGate(rng, cfg);
  else other = good.op === 'x' ? addGate(rng, level, cfg) : multiplyGate(rng, cfg);
  const [left, right] = rng.chance(0.5) ? [good, other] : [other, good];
  return { d, row: 0, left, right };
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
  pillars: makePillars, pusher: makePushers,
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

function makeCoinRow(rng, d, cfg) {
  const x = rng.pick(cfg.track.lanes);
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
  const weights = hazardWeights(level, cfg.obstacle);
  // Best reachable crowd with a fresh (non-upgraded) start and perfect gate choices.
  let bestCount = 1;
  let d = track.introLength;

  for (let s = 0; s < segments; s++, d += track.segmentLength) {
    const rowChance = DOUBLE_ROW.baseChance + DOUBLE_ROW.pressureChance * pressure;
    const rows = s > 0 && rng.chance(rowChance) ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const pair = { ...makeGatePair(rng, d + row * DOUBLE_ROW.gap, level, cfg.gates, s === 0), row };
      gates.push(pair);
      bestCount = applyGate(bestCount, bestGate(bestCount, pair), cfg.gates.maxCount);
    }

    coins.push(...makeCoinRow(rng, d + 6, cfg));
    obstacles.push(...makeObstacles(rng, d + 16, weights, cfg));

    if (s % 2 === 1) {
      const rise = cfg.enemy.pressureShare * pressure;
      const share = cfg.enemy.minShare + rise + rng.next() * (cfg.enemy.maxShare - cfg.enemy.minShare);
      const count = Math.max(2, Math.round(bestCount * share));
      enemies.push({ d: d + 29, count });
      bestCount -= count;
    } else if (s > 0 && level >= cfg.walkers.fromLevel) {
      walkers.push(...makeWalkers(rng, d + 28, level, pressure, cfg)); // dodgeable: perfect play loses nothing
    }
  }

  const finishD = d + cfg.boss.finishGap;
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
    finishD,
    boss: { d: bossD, hp: Math.max(5, Math.round(bestCount * bossDifficulty(level, cfg.boss))) },
    ladderStart: finishD + cfg.boss.ringDepth + 1,
    bestCount,
  };
}
