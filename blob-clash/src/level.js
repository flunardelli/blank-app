// Procedural, seeded level generator. Output is plain data; levelView.js renders it.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { applyGate, bestGate, bossDifficulty } from './rules.js';

function goodGate(rng, level, cfg) {
  return rng.chance(0.4)
    ? { op: 'x', value: rng.pick(cfg.multipliers) }
    : { op: '+', value: rng.int(cfg.addMin, cfg.addMax + level) };
}

function badGate(rng, cfg) {
  return rng.chance(0.7) ? { op: '-', value: rng.int(cfg.subMin, cfg.subMax) } : { op: '/', value: 2 };
}

function makeGatePair(rng, d, level, cfg, forceGood) {
  const good = goodGate(rng, level, cfg);
  const other = !forceGood && rng.chance(cfg.badChance) ? badGate(rng, cfg) : goodGate(rng, level, cfg);
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

const OBSTACLE_MAKERS = { slider: makeSliders, spikes: makeSpikes, trap: makeTrap };

function makeObstacles(rng, d, cfg) {
  const { weights } = cfg.obstacle;
  let roll = rng.next() * Object.values(weights).reduce((a, b) => a + b, 0);
  const kind = Object.keys(weights).find((k) => (roll -= weights[k]) < 0) ?? 'slider';
  return OBSTACLE_MAKERS[kind](rng, d, cfg);
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
  // Best reachable crowd with a fresh (non-upgraded) start and perfect gate choices.
  let bestCount = 1;
  let d = track.introLength;

  for (let s = 0; s < segments; s++, d += track.segmentLength) {
    const pair = makeGatePair(rng, d, level, cfg.gates, s === 0);
    gates.push(pair);
    bestCount = applyGate(bestCount, bestGate(bestCount, pair), cfg.gates.maxCount);

    coins.push(...makeCoinRow(rng, d + 6, cfg));
    obstacles.push(...makeObstacles(rng, d + 18, cfg));

    if (s % 2 === 1) {
      const share = cfg.enemy.minShare + rng.next() * (cfg.enemy.maxShare - cfg.enemy.minShare);
      const count = Math.max(2, Math.round(bestCount * share));
      enemies.push({ d: d + 29, count });
      bestCount -= count;
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
    finishD,
    boss: { d: bossD, hp: Math.max(5, Math.round(bestCount * bossDifficulty(level, cfg.boss))) },
    ladderStart: finishD + cfg.boss.ringDepth + 1,
    bestCount,
  };
}
