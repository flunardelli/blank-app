// Pure gameplay rules: no three.js, no DOM. Everything here is unit-tested.
import { CONFIG } from './config.js';

export function massToRadius(mass, { radiusPerCbrtMass, maxRadius } = CONFIG.blob) {
  return Math.min(maxRadius, radiusPerCbrtMass * Math.cbrt(Math.max(mass, 0)));
}

export function applyPickup(mass, playerColor, pickup) {
  return playerColor === pickup.color ? mass + pickup.mass : Math.max(0, mass - pickup.mass);
}

export function applyObstacleHit(mass, { damageFraction, minDamage } = CONFIG.obstacle) {
  return Math.max(0, mass - Math.max(minDamage, mass * damageFraction));
}

export function gateColor(gate, x) {
  return x < 0 ? gate.left : gate.right;
}

export function obstacleX(obstacle, time) {
  if (obstacle.kind !== 'saw') return obstacle.x;
  return obstacle.amplitude * Math.sin(obstacle.speed * time + obstacle.phase);
}

// Positions live on the (x, d) plane, where d is the distance travelled along the track.
export function circlesOverlap(ax, ad, ar, bx, bd, br) {
  return (ax - bx) ** 2 + (ad - bd) ** 2 < (ar + br) ** 2;
}

export function circleHitsBox(cx, cd, r, box) {
  const dx = Math.max(Math.abs(cx - box.x) - box.halfWidth, 0);
  const dd = Math.max(Math.abs(cd - box.d) - box.halfDepth, 0);
  return dx * dx + dd * dd < r * r;
}

export function obstacleHits(obstacle, time, x, d, coreRadius) {
  if (obstacle.kind === 'saw') {
    return circlesOverlap(x, d, coreRadius, obstacleX(obstacle, time), obstacle.d, obstacle.radius);
  }
  return circleHitsBox(x, d, coreRadius, obstacle);
}

// Drain rate is fixed when the clash starts, so every clash lasts ~1/rateFraction seconds.
export function clashRate(playerMass, bossMass, { minRatePerSecond, rateFraction } = CONFIG.clash) {
  return Math.max(minRatePerSecond, Math.min(playerMass, bossMass) * rateFraction);
}

// Both blobs lose the same amount: the bigger one survives with the difference.
export function clashStep(playerMass, bossMass, rate, dt) {
  const loss = Math.min(rate * dt, playerMass, bossMass);
  return { playerMass: playerMass - loss, bossMass: bossMass - loss };
}

export function clashResult(playerMass, bossMass) {
  if (bossMass <= 0 && playerMass > 0) return 'won';
  if (playerMass <= 0) return 'lost';
  return null;
}

export function bossDifficulty(level, { baseDifficulty, difficultyPerLevel, maxDifficulty } = CONFIG.boss) {
  return Math.min(maxDifficulty, baseDifficulty + difficultyPerLevel * (level - 1));
}
