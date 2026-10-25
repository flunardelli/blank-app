// Procedural, seeded level generator. Output is plain data; levelView.js renders it.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { applyGate, bestGate, bossDifficulty } from './rules.js';

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
  return { d, left, right };
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

// A ramp that does not cover the whole track, with saws behind it: take the ramp and fly over them.
function makeJump(rng, d, cfg) {
  const ob = cfg.obstacle;
  const half = cfg.track.width / 2;
  const x = rng.pick([-1, 0, 1]) * (half - ob.rampHalfWidth);
  const ramp = { kind: 'ramp', d, x, halfWidth: ob.rampHalfWidth, halfDepth: ob.rampHalfDepth, length: ob.jumpLength };
  const landing = d + ob.rampHalfDepth;
  return [ramp, saw(rng, landing + ob.jumpLength * 0.35, cfg), saw(rng, landing + ob.jumpLength * 0.65, cfg, Math.PI)];
}

// Two staggered rows of bombs: each row leaves one lane free, and never the same lane twice.
function makeBombs(rng, d, cfg) {
  const ob = cfg.obstacle;
  const { lanes } = cfg.track;
  const free = rng.int(0, lanes.length - 1);
  const nextFree = (free + rng.int(1, lanes.length - 1)) % lanes.length;
  return [[free, d], [nextFree, d + ob.bombRowGap]].flatMap(([open, rowD]) =>
    lanes.filter((_, i) => i !== open).map((x) => ({ kind: 'bomb', x, d: rowD, radius: ob.bombRadius, blast: ob.bombBlast })));
}

const OBSTACLE_MAKERS = {
  slider: makeSliders, spikes: makeSpikes, trap: makeTrap, saw: makeSaws, jump: makeJump, bombs: makeBombs,
};

/** Hazard weights for a level: only unlocked kinds, with this level's featured kind boosted. */
export function hazardWeights(level, { weights, unlockLevel, featured: cycle, featuredBoost } = CONFIG.obstacle) {
  const unlocked = Object.keys(weights).filter((kind) => unlockLevel[kind] <= level);
  const featured = cycle[(level - 1) % cycle.length];
  return Object.fromEntries(unlocked.map((kind) => [kind, weights[kind] * (kind === featured ? featuredBoost : 1)]));
}

function makeObstacles(rng, d, weights, cfg) {
  let roll = rng.next() * Object.values(weights).reduce((a, b) => a + b, 0);
  const kind = Object.keys(weights).find((k) => (roll -= weights[k]) < 0) ?? 'slider';
  return OBSTACLE_MAKERS[kind](rng, d, cfg);
}

// A small group of gray walkers pacing side to side, each on its own row and rhythm.
function makeWalkers(rng, d, level, cfg) {
  const w = cfg.walkers;
  const half = cfg.track.width / 2;
  const most = Math.min(w.perGroupMax, 1 + Math.floor((level - 1) / 2));
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

export function generateLevel(level, cfg = CONFIG) {
  const rng = createRng(level * 7919 + 13);
  const { track } = cfg;
  const segments = 5 + Math.min(level, 5);
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
    const pair = makeGatePair(rng, d, level, cfg.gates, s === 0);
    gates.push(pair);
    bestCount = applyGate(bestCount, bestGate(bestCount, pair), cfg.gates.maxCount);

    coins.push(...makeCoinRow(rng, d + 6, cfg));
    obstacles.push(...makeObstacles(rng, d + 16, weights, cfg));

    if (s % 2 === 1) {
      const share = cfg.enemy.minShare + rng.next() * (cfg.enemy.maxShare - cfg.enemy.minShare);
      const count = Math.max(2, Math.round(bestCount * share));
      enemies.push({ d: d + 29, count });
      bestCount -= count;
    } else if (s > 0 && level >= cfg.walkers.fromLevel) {
      walkers.push(...makeWalkers(rng, d + 28, level, cfg)); // dodgeable: perfect play loses nothing
    }
  }

  const finishD = d + cfg.boss.finishGap;
  // One key per level, between two segments' coin rows.
  const keySegment = rng.int(1, segments - 1);
  const key = { x: rng.pick(track.lanes), d: track.introLength + keySegment * track.segmentLength - 4 };
  const bossD = finishD + cfg.boss.ringDepth / 2 + 1;
  return {
    level,
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
