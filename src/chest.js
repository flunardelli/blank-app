// Rules of the chest stage, no three.js: timeline, lid, camera swing and the coin fountain.
// Every coin follows a closed-form path, so the render loop only evaluates coinAt(launch, t).
import { CONFIG } from './config.js';

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const SLAM = 0.12; // seconds the lid takes to shut
const range = (rng, [lo, hi]) => lo + rng.next() * (hi - lo);

/** Seconds (after the first hop) each blob waits before jumping, spread evenly over `span`. */
export function hopDelays(count, span = CONFIG.chest.hopSpan) {
  return Array.from({ length: count }, (_, i) => (count > 1 ? (i / (count - 1)) * span : 0));
}

// Longest a coin can be alive after leaving the chest: pour delay + going up and down + vanishing.
function coinLifeBound(cfg) {
  const vy = cfg.coinSpeedUp[1];
  const fall = (vy + Math.sqrt(vy * vy + 2 * cfg.gravity * (cfg.coinStartY - cfg.coinFloor))) / cfg.gravity;
  return cfg.coinPour + fall + cfg.coinVanish;
}

/** Key moments, in seconds since the stage began. */
export function chestTimeline(cfg = CONFIG.chest) {
  const rotateStart = cfg.approach + cfg.hopSpan + cfg.hopFlight + 0.15;
  const burstAt = rotateStart + cfg.lidDelay + 0.1;
  return { rotateStart, burstAt, end: burstAt + coinLifeBound(cfg) + 0.4 };
}

/**
 * Lid angle in rad, `s` seconds after the camera swing began. Ajar while the blobs hop in, it slams shut,
 * waits through the shake, then jumps open with an overshoot.
 */
export function lidAngle(s, cfg = CONFIG.chest) {
  if (s < cfg.lidDelay) return cfg.lidAjar * (1 - clamp(s / SLAM));
  const k = clamp((s - cfg.lidDelay) / cfg.lidOpen);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return cfg.lidAngle * (1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2);
}

/** Sideways wobble in rad: builds up before the lid opens, dies out right after. */
export function chestShake(s, cfg = CONFIG.chest) {
  if (s < 0) return 0;
  const envelope = s < cfg.lidDelay ? s / cfg.lidDelay : Math.max(0, 1 - (s - cfg.lidDelay) / 0.4);
  return envelope * 0.05 * Math.sin(s * 70);
}

/** Camera while the chest opens: swings from the side (+x) to the front (+z) and zooms in. */
export function chestCamera(s, center, cfg = CONFIG.chest) {
  const { sideRadius, frontRadius, sideHeight, frontHeight, lookY, lookLead } = cfg.camera;
  const k = smooth(clamp(s / cfg.rotate));
  const angle = (Math.PI / 2) * (1 - k); // 90 deg = side, 0 = front
  const radius = lerp(sideRadius, frontRadius, k);
  return {
    pos: [center.x + radius * Math.sin(angle), lerp(sideHeight, frontHeight, k), center.z + radius * Math.cos(angle)],
    look: [center.x, lookY, center.z + lerp(lookLead, 0, k)],
  };
}

/** Where a coin starts and how it flies; `rng` is a createRng(). */
export function coinLaunch(rng, cfg = CONFIG.chest) {
  const heading = rng.next() * Math.PI * 2;
  const out = range(rng, cfg.coinSpeedOut);
  return {
    x0: (rng.next() - 0.5) * 2.4,
    z0: (rng.next() - 0.5) * 1.2,
    vx: Math.cos(heading) * out,
    vy: range(rng, cfg.coinSpeedUp),
    vz: Math.sin(heading) * out + 1, // a lean towards the camera in front of the chest
    delay: rng.next() * cfg.coinPour,
    size: 0.7 + rng.next() * 0.5,
    phase: rng.next() * Math.PI * 2,
    spin: [6 + rng.next() * 8, 6 + rng.next() * 8],
  };
}

/** A coin `t` seconds after the burst: null before it leaves and after it vanished. */
export function coinAt(c, t, cfg = CONFIG.chest) {
  const s = t - c.delay;
  if (s < 0) return null;
  const g = cfg.gravity;
  const landing = (c.vy + Math.sqrt(c.vy * c.vy + 2 * g * (cfg.coinStartY - cfg.coinFloor))) / g;
  const gone = (s - landing) / cfg.coinVanish;
  if (gone >= 1) return null;
  const fall = Math.min(s, landing);
  return {
    x: c.x0 + c.vx * fall,
    y: cfg.coinStartY + c.vy * fall - (g * fall * fall) / 2,
    z: c.z0 + c.vz * fall,
    size: c.size * (1 - Math.max(0, gone)),
    tilt: c.phase + c.spin[0] * s,
    turn: c.spin[1] * s,
  };
}

/** Coins one blob is worth in a chest of the given world (0 = the first). */
export const coinsPerBlob = (worldIndex, { coinsPerBlob: base, worldGrowth } = CONFIG.chest) =>
  Math.round(base * (1 + worldGrowth * worldIndex));

/** What the blobs that reached the chest are worth. */
export const chestStageCoins = (count, worldIndex = 0) => count * coinsPerBlob(worldIndex);
