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

export function applyGate(count, { op, value }, maxCount = CONFIG.gates.maxCount) {
  return clamp(Math.round(GATE_OPS[op].apply(count, value)), 0, maxCount);
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

export function pressesButton(button, x, d, r) {
  return circlesOverlap(x, d, r, button.x, button.d, button.radius);
}

// ---- Boss fight (boxing) -----------------------------------------------------
// The crowd merges into one champion: HP is the crowd size, punch power grows with it.
export function championStats(count, damageLevel, { punchPerBlob } = CONFIG.boxing) {
  return { hp: count, punch: count * punchPerBlob * damageFor(damageLevel) };
}

// The boss drains any champion in `bossKillSeconds`, so the player has to out-tap that clock.
export function bossPunchDamage(championHp, { bossKillSeconds, bossPunchInterval } = CONFIG.boxing) {
  return (championHp / bossKillSeconds) * bossPunchInterval;
}

/** Taps per second needed to knock the boss out before the boss wins. */
export function requiredTapRate(count, bossHp, damageLevel, cfg = CONFIG.boxing) {
  const { punch } = championStats(count, damageLevel, cfg);
  return bossHp / (punch * cfg.bossKillSeconds);
}

export function bossDifficulty(level, { baseDifficulty, difficultyPerLevel, maxDifficulty } = CONFIG.boss) {
  return Math.min(maxDifficulty, baseDifficulty + difficultyPerLevel * (level - 1));
}

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
