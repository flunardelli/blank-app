// Procedural, seeded level generator built from authored chunks. Output is plain data;
// levelView.js renders it. Every chunk keeps a running estimate of the best reachable crowd
// (`ctx.count`), so gates can be tuned into real decisions and the boss sized fairly.
import { CONFIG } from './config.js';
import { createRng } from './rng.js';
import { expectedUpgrades } from './economy.js';
import {
  applyGate, bestGate, bossDifficulty, damageFor, gateGap, isBigBossLevel, startBlobsFor,
} from './rules.js';

const MIN_GATE_GAP = 0.15; // closer than this, the choice wouldn't matter

// ---- Gate pairs -------------------------------------------------------------------
// Candidate styles; each returns [better-ish, other] for the current crowd size.
const GATE_STYLES = {
  // ×m against +N where N is tuned so neither always wins: requires a little mental math.
  mathDuel(rng, count, cfg) {
    const m = rng.pick(cfg.gates.multipliers);
    const r = rng.chance(0.5) ? 0.55 + rng.next() * 0.25 : 1.2 + rng.next() * 0.4;
    return [{ op: 'x', value: m }, { op: '+', value: Math.max(2, Math.round(Math.max(count, 2) * (m - 1) * r)) }];
  },
  twoAdds(rng, count, cfg, level) {
    const a = rng.int(cfg.gates.addMin, cfg.gates.addMax + level);
    return [{ op: '+', value: a }, { op: '+', value: Math.max(1, Math.round(a * (0.3 + rng.next() * 0.35))) }];
  },
  // Good against bad: only a real choice when something tempting sits on the bad side.
  lure(rng, count, cfg, level) {
    const bad = rng.chance(0.7) ? { op: '-', value: rng.int(cfg.gates.subMin, cfg.gates.subMax) } : { op: '/', value: 2 };
    return [GATE_STYLES.twoAdds(rng, count, cfg, level)[0], bad];
  },
};

function pickGateOptions(ctx, styles) {
  const { rng, count, cfg, level } = ctx;
  for (let tries = 0; tries < 12; tries++) {
    const [a, b] = GATE_STYLES[rng.pick(styles)](rng, count, cfg, level);
    const pair = rng.chance(0.5) ? { left: a, right: b } : { left: b, right: a };
    if (gateGap(count, pair) >= MIN_GATE_GAP) return pair;
  }
  // Near the crowd cap growth stops mattering; a halving gate keeps the choice meaningful.
  return { left: { op: '+', value: rng.int(cfg.gates.addMin, cfg.gates.addMax) }, right: { op: '/', value: 2 } };
}

function addCoinRow(ctx, d, x = ctx.rng.pick(ctx.cfg.track.lanes), count = ctx.cfg.coins.perRow) {
  for (let i = 0; i < count; i++) ctx.out.coins.push({ x, d: d + i * ctx.cfg.coins.spacing });
}

function addGate(ctx, d, pair) {
  ctx.out.gates.push({ d, ...pair });
  ctx.count = applyGate(ctx.count, bestGate(ctx.count, pair), ctx.cfg.gates.maxCount);
}

const sideOf = (pair, option) => (pair.left === option ? -1 : 1);

// ---- Chunks: (ctx, { intro }) => advance ctx.d ------------------------------------------
const CHUNKS = {
  gate(ctx) {
    const styles = ctx.level <= 1 || ctx.gateIndex === 0 ? ['twoAdds', 'mathDuel'] : ['mathDuel', 'mathDuel', 'twoAdds', 'lure'];
    const pair = pickGateOptions(ctx, styles);
    const better = bestGate(ctx.count, pair);
    const worse = better === pair.left ? pair.right : pair.left;
    // Lure: the coins lead into the worse gate; otherwise they sit in a random lane.
    const lureX = styles.includes('lure') && worse.op !== 'x' && worse.op !== '+' ? sideOf(pair, worse) * 3.3 : undefined;
    addCoinRow(ctx, ctx.d + 2, lureX);
    addGate(ctx, ctx.d + 14, pair);
    ctx.gateIndex += 1;
    ctx.d += 20;
  },

  // The better gate is followed by a hazard on its own side: greed has a price.
  gateRisk(ctx) {
    const pair = pickGateOptions(ctx, ['mathDuel', 'twoAdds']);
    const side = sideOf(pair, bestGate(ctx.count, pair));
    addCoinRow(ctx, ctx.d + 2);
    addGate(ctx, ctx.d + 12, pair);
    const half = ctx.cfg.track.width / 2;
    if (ctx.rng.chance(0.5)) {
      ctx.out.obstacles.push({ kind: 'spikes', d: ctx.d + 22, pads: [{ x: side * 2.9, halfWidth: 2.1, halfDepth: ctx.cfg.obstacle.spikeHalfDepth }] });
    } else {
      ctx.out.obstacles.push(slider(ctx, ctx.d + 22, side * half, 0));
    }
    ctx.gateIndex += 1;
    ctx.d += 30;
  },

  // "WALL 15 → ×3": pay blobs to smash through for a big multiplier, or take the safe gate.
  wall(ctx, { intro }) {
    const { rng, count, cfg } = ctx;
    const share = cfg.wall.costMin + rng.next() * (cfg.wall.costMax - cfg.wall.costMin);
    const wall = { op: 'x', value: cfg.wall.multiplier, cost: Math.max(3, Math.round(count * share)) };
    const wallResult = applyGate(count, wall);
    // Make the safe side land 20-40% above or below the wall's result (intro: wall clearly wins).
    const target = wallResult * (intro || rng.chance(0.5) ? 0.6 + rng.next() * 0.2 : 1.2 + rng.next() * 0.2);
    const safe = { op: '+', value: Math.max(2, Math.round(target - count)) };
    const pair = rng.chance(0.5) ? { left: wall, right: safe } : { left: safe, right: wall };
    addCoinRow(ctx, ctx.d + 2);
    addGate(ctx, ctx.d + 14, pair);
    ctx.gateIndex += 1;
    ctx.d += 22;
  },

  enemy(ctx, { intro }) {
    const { rng, cfg, level } = ctx;
    const shareMax = intro ? cfg.enemy.minShare : cfg.enemy.maxShare;
    const share = cfg.enemy.minShare + rng.next() * (shareMax - cfg.enemy.minShare) + Math.min(0.08, level * 0.005);
    const count = Math.max(2, Math.round(ctx.count * share));
    addCoinRow(ctx, ctx.d + 2);
    ctx.out.enemies.push({ d: ctx.d + 16, count });
    ctx.count -= count;
    ctx.d += 24;
  },

  slider(ctx, { intro }) {
    const { rng } = ctx;
    const half = ctx.cfg.track.width / 2;
    if (intro || rng.chance(0.5)) {
      ctx.out.obstacles.push(slider(ctx, ctx.d + 10, rng.pick([-1, 1]) * half, 0, intro ? 0.7 : 1));
    } else {
      const phase = rng.next() * Math.PI * 2;
      ctx.out.obstacles.push(slider(ctx, ctx.d + 10, -half, phase), slider(ctx, ctx.d + 10, half, phase + Math.PI));
    }
    addCoinRow(ctx, ctx.d + 16, 0);
    ctx.d += 26;
  },

  // Slalom: pads on alternating sides (intro: a single pad).
  spikes(ctx, { intro }) {
    const { rng, cfg } = ctx;
    const first = rng.pick([-1, 1]);
    const pads = intro ? [first] : [first, -first];
    pads.forEach((side, i) => ctx.out.obstacles.push({
      kind: 'spikes', d: ctx.d + 8 + i * 10, pads: [{ x: side * 2.9, halfWidth: 2.1, halfDepth: cfg.obstacle.spikeHalfDepth }],
    }));
    addCoinRow(ctx, ctx.d + 6, -first * 2.4, 3);
    ctx.d += intro ? 18 : 28;
  },

  // Full-width spikes, disarmed by stepping on the button ahead (intro: button dead centre).
  trap(ctx, { intro }) {
    const { rng, cfg } = ctx;
    const ob = cfg.obstacle;
    const d = ctx.d + 6 + ob.trapButtonLead;
    const button = { x: intro ? 0 : rng.pick(cfg.track.lanes), d: d - ob.trapButtonLead, radius: ob.trapButtonRadius };
    ctx.out.obstacles.push({ kind: 'trap', d, halfDepth: ob.trapHalfDepth, button });
    ctx.d += 6 + ob.trapButtonLead + 8;
  },

  // Narrow bridge over the water: the crowd squeezes, edge blobs fall. Coins down the middle.
  bridge(ctx, { intro }) {
    const { cfg } = ctx;
    const d0 = ctx.d + 6;
    const d1 = d0 + cfg.bridge.length;
    ctx.out.bridges.push({ d0, d1, halfWidth: intro ? cfg.bridge.introHalfWidth : cfg.bridge.halfWidth });
    addCoinRow(ctx, d0 + 3, 0, Math.floor((d1 - d0 - 6) / cfg.coins.spacing));
    ctx.d = d1 + 6;
  },
};

function slider(ctx, d, edgeX, phase, speedScale = 1) {
  const ob = ctx.cfg.obstacle;
  const skin = ctx.level >= ctx.cfg.chunks.gloveSkinFrom && ctx.rng.chance(0.5) ? 'glove' : 'melon';
  return {
    kind: 'slider', skin, d, radius: ob.sliderRadius, edgeX,
    reach: ob.sliderReach, speed: ob.sliderSpeed * speedScale, phase: phase || ctx.rng.next() * Math.PI * 2,
  };
}

const GATE_CHUNKS = ['gate', 'gateRisk', 'wall'];
const CHALLENGE_CHUNKS = ['enemy', 'slider', 'spikes', 'trap', 'bridge'];

// Mechanic introduced on this level, if any (its chunk leads the level, alone, with a hint).
export function newMechanic(level, unlock = CONFIG.chunks.unlock) {
  return Object.keys(unlock).find((id) => unlock[id] === level && id !== 'gate') ?? null;
}

/** Chunk sequence: gate-type and challenge chunks alternate, enemies at least every third challenge. */
function planChunks(rng, level, cfg) {
  const { unlock, countBase, countPerLevel, countMax } = cfg.chunks;
  const unlocked = (ids) => ids.filter((id) => unlock[id] <= level);
  let count = Math.min(countMax, countBase + countPerLevel * (level - 1));
  if (isBigBossLevel(level, cfg.boss)) count += 1;
  else if (level > 1 && level % cfg.boss.bossEvery === 1) count -= 1; // breather
  const fresh = newMechanic(level, unlock);
  const plan = [];
  let sinceEnemy = 0;
  for (let i = 0; i < count; i++) {
    const last = plan[plan.length - 1];
    if (i % 2 === 0) {
      const options = unlocked(GATE_CHUNKS).filter((id) => id !== last || id === 'gate');
      const pick = i === 0 ? 'gate' : (fresh && GATE_CHUNKS.includes(fresh) && !plan.includes(fresh) ? fresh : rng.pick(options));
      plan.push(pick);
    } else {
      const lastChallenge = plan.filter((id) => CHALLENGE_CHUNKS.includes(id)).pop();
      let pick;
      if (fresh && CHALLENGE_CHUNKS.includes(fresh) && !plan.includes(fresh)) pick = fresh;
      else if (sinceEnemy >= 2) pick = 'enemy';
      else {
        const options = unlocked(CHALLENGE_CHUNKS).filter((id) => id !== lastChallenge && id !== fresh);
        pick = options.length ? rng.pick(options) : 'enemy';
      }
      sinceEnemy = pick === 'enemy' ? 0 : sinceEnemy + 1;
      plan.push(pick);
    }
  }
  if (!plan.includes('enemy')) plan[plan.length - 1 - (plan.length % 2 === 0 ? 0 : 1)] = 'enemy';
  return plan;
}

export function generateLevel(level, cfg = CONFIG) {
  const rng = createRng(level * 7919 + 13);
  // Best reachable crowd with perfect gate choices, starting from the upgrades a typical
  // player owns at this level (see economy.js), so the boss is sized for that player.
  const expected = expectedUpgrades(level);
  const ctx = {
    rng, level, cfg, gateIndex: 0,
    count: startBlobsFor(expected.blobs, cfg.upgrades),
    d: cfg.track.introLength,
    out: { gates: [], obstacles: [], coins: [], enemies: [], bridges: [], hints: [] },
  };
  const fresh = newMechanic(level, cfg.chunks.unlock);
  const plan = planChunks(rng, level, cfg);
  const boundaries = [];
  plan.forEach((id) => {
    const intro = id === fresh && !ctx.introduced;
    if (intro) {
      ctx.introduced = true;
      ctx.out.hints.push({ d: ctx.d, id });
    }
    boundaries.push(ctx.d);
    CHUNKS[id](ctx, { intro });
  });
  if (level === 1) ctx.out.hints.unshift({ d: 0, id: 'gate' });

  const finishD = ctx.d + cfg.boss.finishGap;
  // One key per level, at a chunk boundary in a random lane (never on a bridge).
  const keyD = rng.pick(boundaries.slice(1)) - 2;
  const keyOnBridge = ctx.out.bridges.some((b) => keyD >= b.d0 - 2 && keyD <= b.d1 + 2);
  const key = { x: keyOnBridge ? 0 : rng.pick(cfg.track.lanes), d: keyD };
  const bossD = finishD + cfg.boss.ringDepth / 2 + 1;
  const { gates, obstacles, coins, enemies, bridges, hints } = ctx.out;
  return {
    level,
    plan,
    gates,
    obstacles,
    bridges,
    hints,
    coins: coins.map((c, id) => ({ ...c, id })),
    enemies: enemies.map((e, id) => ({ ...e, id })),
    key,
    finishD,
    boss: {
      d: bossD,
      hp: Math.max(5, Math.round(ctx.count * bossDifficulty(level, cfg.boss) * damageFor(expected.damage, cfg.upgrades))),
      big: isBigBossLevel(level, cfg.boss),
    },
    ladderStart: finishD + cfg.boss.ringDepth + 1,
    bestCount: ctx.count,
    expected,
  };
}
