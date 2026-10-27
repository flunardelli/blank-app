// Pure gameplay rules: no three.js, no DOM. Everything here is unit-tested.
import { CONFIG } from './config.js';
import { levelInfo } from './worlds.js';

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

// Wobble phase of the i-th body: the golden angle keeps neighbours (and re-indexed survivors) out of step.
export const jellyPhase = (index) => (index * GOLDEN_ANGLE) % (Math.PI * 2);

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

const pusherInset = ({ reach, speed, phase }, time) => reach * (0.5 - 0.5 * Math.cos(speed * time + phase));

/** The pusher block: its inner face slides `reach` units in from the rail and back (slider rhythm). */
export function pusherBox(pusher, time) {
  const { edgeX, halfWidth, halfDepth, d } = pusher;
  return { x: edgeX - Math.sign(edgeX) * (pusherInset(pusher, time) - halfWidth), d, halfWidth, halfDepth };
}

/** Free width between the pusher's inner face and the opposite rail. */
export const pusherGap = (pusher, time, trackWidth = CONFIG.track.width) => trackWidth - pusherInset(pusher, time);

// Saw blades and walkers swing across the track: x = range · sin(speed · t + phase).
export const sweepX = ({ range, speed, phase }, time) => range * Math.sin(speed * time + phase);

// Axe pendulum: angle = swing · sin(speed · t + phase). The blade centre hangs `length` below the pivot.
export const axeAngle = ({ swing, speed, phase }, time) => swing * Math.sin(speed * time + phase);
export const axeBladeX = (axe, time) => axe.length * Math.sin(axeAngle(axe, time));
export const axeBladeHeight = (axe, time) => axe.pivotHeight - axe.length * Math.cos(axeAngle(axe, time));
/** The blade cuts only while it hangs low: out at the ends of the swing it is above everyone's head. */
export const axeIsLow = (axe, time) => axeBladeHeight(axe, time) < axe.clearance;

// Rolling ball: every `period` seconds it rolls from d + span to d - span (towards the player), then
// veers off the nearest edge and drops into the water, then waits. `offset` shifts the cycle in time.
export const ballRollTime = ({ span, speed }) => (2 * span) / speed;
export const ballPeriod = (ball) => ballRollTime(ball) + ball.fallTime + ball.waitTime;

/** Where the ball is: phase 'roll' | 'fall' | 'wait', progress t in 0..1 of the phase, and warn while a roll is imminent. */
export function ballState(ball, time) {
  const period = ballPeriod(ball);
  const local = (((time + ball.offset) % period) + period) % period;
  const roll = ballRollTime(ball);
  const rest = { x: ball.x, d: ball.d - ball.span, y: ball.radius };
  if (local < roll) return { phase: 'roll', t: local / roll, warn: false, x: ball.x, d: ball.d + ball.span - ball.speed * local, y: ball.radius };
  if (local < roll + ball.fallTime) {
    const t = (local - roll) / ball.fallTime;
    // Momentum carries it on while it slides sideways over the edge and falls under gravity.
    return { phase: 'fall', t, warn: false, x: ball.x + ball.side * t * ball.fallReach, d: rest.d - ball.speed * (local - roll) * 0.5, y: ball.radius - t * t * ball.fallDepth };
  }
  return { phase: 'wait', t: 0, warn: local >= period - ball.warnTime, ...rest };
}

/** The ball only crushes while it rolls on the track; it is a moving circle, so there is no line to cross. */
export function ballHits(ball, time, x, d, r) {
  const state = ballState(ball, time);
  return state.phase === 'roll' && circlesOverlap(x, d, r, state.x, state.d, ball.radius);
}

/** Height of a blob `distance` units after leaving a jump ramp; 0 once it has landed. */
export function jumpLift(distance, length, height = CONFIG.obstacle.jumpHeight) {
  if (distance < 0 || distance > length) return 0;
  return Math.sin((distance / length) * Math.PI) * height;
}

export function onRamp(ramp, x) {
  return Math.abs(x - ramp.x) <= ramp.halfWidth;
}

/** Indices of the bodies caught in a bomb's blast. */
export function blastVictims(bomb, bodies) {
  return bodies.flatMap((b, i) => (circlesOverlap(b.x, b.d, 0, bomb.x, bomb.d, bomb.blast) ? [i] : []));
}

/** True when a body moving from prevD to d crosses the obstacle line while overlapping it sideways. */
export function crossesObstacle(obstacle, time, x, prevD, d, r) {
  if (obstacle.kind === 'ball') return false; // moves: the game tests it every frame (ballHits)
  return prevD < obstacle.d && d >= obstacle.d && obstacleHits(obstacle, time, x, obstacle.d, r);
}

export function obstacleHits(obstacle, time, x, d, r) {
  if (obstacle.kind === 'slider') {
    return circlesOverlap(x, d, r, sliderX(obstacle, time), obstacle.d, obstacle.radius);
  }
  if (obstacle.kind === 'trap') return Math.abs(d - obstacle.d) < obstacle.halfDepth + r; // full width
  if (obstacle.kind === 'saw') {
    return circleHitsBox(x, d, r, { x: sweepX(obstacle, time), d: obstacle.d, halfWidth: obstacle.radius, halfDepth: obstacle.halfDepth });
  }
  if (obstacle.kind === 'axe') {
    return axeIsLow(obstacle, time)
      && circleHitsBox(x, d, r, { x: axeBladeX(obstacle, time), d: obstacle.d, halfWidth: obstacle.halfWidth, halfDepth: obstacle.halfDepth });
  }
  if (obstacle.kind === 'pusher') return circleHitsBox(x, d, r, pusherBox(obstacle, time));
  if (obstacle.kind === 'ball') return ballHits(obstacle, time, x, d, r);
  if (!obstacle.pads) return false; // ramps and bombs are handled by the game loop
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

// Every boss drains any champion in `bossKillSeconds`, whatever its attack pattern:
// slow bosses hit harder, combo bosses split the same damage over several strikes.
export function bossPunchDamage(championHp, { interval, strikes }, { bossKillSeconds } = CONFIG.boxing) {
  return ((championHp / bossKillSeconds) * interval) / strikes;
}

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

/** Boss HP as a share of the best reachable crowd: rises inside a world, eases off when a new one starts. */
export function bossDifficulty(level, { minDifficulty, maxDifficulty, kindFactor } = CONFIG.boss) {
  const { pressure, kind } = levelInfo(level);
  return (minDifficulty + (maxDifficulty - minDifficulty) * pressure) * kindFactor[kind];
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
