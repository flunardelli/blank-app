// Pure gameplay rules: no three.js, no DOM. Everything here is unit-tested.
import { CONFIG } from './config.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ---- Gates -------------------------------------------------------------------
const GATE_OPS = {
  '+': { apply: (c, v) => c + v, symbol: '+', good: true },
  x: { apply: (c, v) => c * v, symbol: '×', good: true },
  '-': { apply: (c, v) => c - v, symbol: '-', good: false },
  '/': { apply: (c, v) => Math.floor(c / v), symbol: '÷', good: false },
};

// A gate may carry a `cost`: a numbered wall that eats that many blobs before the gate applies.
export function applyGate(count, { op, value, cost = 0 }, maxCount = CONFIG.gates.maxCount) {
  const survivors = Math.max(0, count - cost);
  return clamp(Math.round(GATE_OPS[op].apply(survivors, value)), 0, maxCount);
}

/** Relative difference between a pair's outcomes: below ~0.15 the choice doesn't matter. */
export function gateGap(count, pair) {
  const a = applyGate(count, pair.left);
  const b = applyGate(count, pair.right);
  return Math.abs(a - b) / Math.max(a, b, 1);
}

export const gateLabel = ({ op, value }) => `${GATE_OPS[op].symbol}${value}`;
export const isGoodGate = ({ op }) => GATE_OPS[op].good;
export const chooseGate = (pair, x) => (x < 0 ? pair.left : pair.right);
export const bestGate = (count, pair) =>
  (applyGate(count, pair.left) >= applyGate(count, pair.right) ? pair.left : pair.right);

// ---- Crowd formation ---------------------------------------------------------
// Sunflower (phyllotaxis) packing: round, dense and stable as the crowd grows.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function formationSlot(index, spacing) {
  const r = spacing * Math.sqrt(index);
  const a = index * GOLDEN_ANGLE;
  return { x: r * Math.cos(a), d: r * Math.sin(a) };
}

// Spacing shrinks once the crowd would grow wider than maxRadius.
export function crowdSpacing(count, { spacing, maxRadius, unitRadius } = CONFIG.crowd) {
  const n = Math.max(count - 1, 1);
  return Math.min(spacing, (maxRadius - unitRadius) / Math.sqrt(n));
}

export function formationRadius(count, cfg = CONFIG.crowd) {
  return crowdSpacing(count, cfg) * Math.sqrt(Math.max(count - 1, 0)) + cfg.unitRadius;
}

// ---- Collisions (on the x/d plane; d = distance along the track) --------------
export function circlesOverlap(ax, ad, ar, bx, bd, br) {
  return (ax - bx) ** 2 + (ad - bd) ** 2 < (ar + br) ** 2;
}

export function circleHitsBox(cx, cd, r, box) {
  const dx = Math.max(Math.abs(cx - box.x) - box.halfWidth, 0);
  const dd = Math.max(Math.abs(cd - box.d) - box.halfDepth, 0);
  return dx * dx + dd * dd < r * r;
}

export function sliderX({ edgeX, reach, speed, phase }, time) {
  const inset = reach * (0.5 - 0.5 * Math.cos(speed * time + phase));
  return edgeX - Math.sign(edgeX) * inset;
}

/** True when a body moving from prevD to d crosses the obstacle line while overlapping it sideways. */
export function crossesObstacle(obstacle, time, x, prevD, d, r) {
  return prevD < obstacle.d && d >= obstacle.d && obstacleHits(obstacle, time, x, obstacle.d, r);
}

export function obstacleHits(obstacle, time, x, d, r) {
  if (obstacle.kind === 'slider') {
    return circlesOverlap(x, d, r, sliderX(obstacle, time), obstacle.d, obstacle.radius);
  }
  if (obstacle.kind === 'trap') return Math.abs(d - obstacle.d) < obstacle.halfDepth + r; // full width
  return obstacle.pads.some((pad) => circleHitsBox(x, d, r, { ...pad, d: obstacle.d }));
}

// ---- Crowd vs crowd ----------------------------------------------------------
// Drain rate is fixed when the fight starts, so every fight lasts about the same time.
export function clashRate(a, b, { minRatePerSecond, rateFraction } = CONFIG.skirmish) {
  return Math.max(minRatePerSecond, Math.min(a, b) * rateFraction);
}

// Both sides lose the same amount: the bigger one survives with the difference.
export function clashStep(a, b, rate, dt) {
  const loss = Math.min(rate * dt, a, b);
  return [a - loss, b - loss];
}

// ---- Narrow bridge -------------------------------------------------------------
export const bridgeAt = (bridges, d) => bridges.find((b) => d >= b.d0 && d <= b.d1) ?? null;

/** A body falls off when it is mostly past the bridge edge. */
export const fallsOffBridge = (bridge, x, r) => Math.abs(x) - r * 0.5 > bridge.halfWidth;

export function pressesButton(button, x, d, r) {
  return circlesOverlap(x, d, r, button.x, button.d, button.radius);
}

// ---- Boss fight (boxing) -----------------------------------------------------
// The crowd merges into one champion: HP is the crowd size, punch power grows with it.
export function championStats(count, damageLevel, { punchPerBlob } = CONFIG.boxing) {
  return { hp: count, punch: count * punchPerBlob * damageFor(damageLevel) };
}

// Every boss drains any champion in `bossKillSeconds`, whatever its attack pattern:
// slow bosses hit harder, combo bosses split the same damage over several strikes.
export function bossPunchDamage(championHp, { interval, strikes }, { bossKillSeconds } = CONFIG.boxing) {
  return ((championHp / bossKillSeconds) * interval) / strikes;
}

// One-finger defence: a player who stops tapping through the boss's wind-up blocks the strike,
// and a tap right after a block lands a counter punch.
export const isBlocked = (lastTap, windupStart) => lastTap < windupStart;

export function strikeDamage(championMaxHp, attack, blocked, cfg = CONFIG.boxing) {
  return bossPunchDamage(championMaxHp, attack, cfg) * (blocked ? cfg.blockFactor : 1);
}

export const isCounter = (now, lastBlock, { counterWindow } = CONFIG.boxing) => now - lastBlock <= counterWindow;

/**
 * Advances the player's combo on a tap. Taps within `comboWindow` chain; every
 * `finisherEvery`-th chained tap is a flying jump punch with extra damage.
 */
export function comboStep({ combo, lastTap }, now, { comboWindow, finisherEvery, jumpPunchMultiplier } = CONFIG.boxing) {
  const chained = now - lastTap <= comboWindow ? combo + 1 : 1;
  const finisher = chained % finisherEvery === 0;
  return { combo: chained, lastTap: now, finisher, multiplier: finisher ? jumpPunchMultiplier : 1 };
}

/** Taps per second needed to knock the boss out before the boss wins. */
export function requiredTapRate(count, bossHp, damageLevel, cfg = CONFIG.boxing) {
  const { punch } = championStats(count, damageLevel, cfg);
  return bossHp / (punch * cfg.bossKillSeconds);
}

// Sawtooth: a steady climb, a spike on every `bossEvery`-th level and a breather right after.
export function bossDifficulty(level, cfg = CONFIG.boss) {
  const { baseDifficulty, difficultyPerLevel, maxDifficulty, bossEvery, spike, relief } = cfg;
  const trend = Math.min(maxDifficulty, baseDifficulty + difficultyPerLevel * (level - 1));
  if (level % bossEvery === 0) return trend + spike;
  if (level > 1 && level % bossEvery === 1) return trend - relief;
  return trend;
}

export const isBigBossLevel = (level, { bossEvery } = CONFIG.boss) => level % bossEvery === 0;

// ---- Rewards & progression -----------------------------------------------------
// The champion's remaining health decides how far the boss flies down the x1.0 … x5.0 ladder.
export function bonusMultiplier(healthFraction, { maxMultiplier, step } = CONFIG.bonus) {
  const raw = 1 + (maxMultiplier - 1) * clamp(healthFraction, 0, 1);
  return Math.round(Math.round(raw / step) * step * 10) / 10;
}

export function rewardCoins(collected, level, multiplier, { base, perLevel } = CONFIG.reward) {
  return Math.round((base + perLevel * level + collected) * multiplier);
}

export function chestReward(level, { chestCoinsPerLevel } = CONFIG.keys) {
  return chestCoinsPerLevel * (level + 4);
}

export function upgradeCost(level, { baseCost, costGrowth } = CONFIG.upgrades) {
  return Math.round((baseCost * costGrowth ** (level - 1)) / 10) * 10;
}

export const damageFor = (level, { damagePerLevel } = CONFIG.upgrades) => 1 + damagePerLevel * (level - 1);
export const startBlobsFor = (level, { blobsPerLevel } = CONFIG.upgrades) => 1 + blobsPerLevel * (level - 1);

export function formatCoins(n) {
  if (n < 1000) return String(Math.floor(n));
  if (n < 1e6) return `${Number((n / 1e3).toPrecision(3))}K`;
  return `${Number((n / 1e6).toPrecision(3))}M`;
}
