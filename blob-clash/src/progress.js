// Pure save-data rules (no storage, no three.js) so they can be unit tested.
import { CONFIG } from './config.js';
import { LEVEL_COUNT } from './worlds.js';

export const SAVE_VERSION = 3;

export const defaultSave = () => ({
  version: SAVE_VERSION,
  current: 1, // level that "Continue" plays
  unlocked: 1, // highest level that can be played
  completed: {}, // { [level]: { stars, bestMultiplier } }
  coins: 0,
  keys: 0,
  upgrades: { damage: 1, blobs: 1 },
});

export function starsFor(multiplier, [oneStarUpTo, twoStarsUpTo] = CONFIG.campaign.starsAt) {
  if (multiplier <= oneStarUpTo) return 1;
  return multiplier <= twoStarsUpTo ? 2 : 3;
}

// Anything worth protecting from "new game": a finished level, or having moved past the first one.
export const hasProgress = (save) => save.current > 1 || Object.keys(save.completed).length > 0;

export const isUnlocked = (save, level) => Number.isInteger(level) && level >= 1 && level <= save.unlocked;

const clampLevel = (n, levels) => Math.min(levels, Math.max(1, Math.floor(Number(n)) || 1));
const count = (n) => Math.max(0, Math.floor(Number(n)) || 0);

// Returns a new save; stars and best multiplier never go down, and only the next level unlocks.
export function completeLevel(save, level, multiplier, levels = LEVEL_COUNT) {
  const before = save.completed[level];
  const completed = {
    ...save.completed,
    [level]: {
      stars: Math.max(before?.stars ?? 0, starsFor(multiplier)),
      bestMultiplier: Math.max(before?.bestMultiplier ?? 0, multiplier),
    },
  };
  const unlocked = Math.max(save.unlocked, Math.min(level + 1, levels));
  return { ...save, completed, unlocked, current: unlocked };
}

// v2 only knew the level the player was on: everything before it counts as done with one star.
export function migrateV2(v2, levels = LEVEL_COUNT) {
  const base = defaultSave();
  const level = clampLevel(v2?.level, levels);
  const completed = {};
  for (let n = 1; n < level; n++) completed[n] = { stars: 1, bestMultiplier: 1 };
  return {
    ...base, current: level, unlocked: level, completed,
    coins: count(v2?.coins), keys: count(v2?.keys),
    upgrades: {
      damage: Math.max(1, count(v2?.upgrades?.damage)),
      blobs: Math.max(1, count(v2?.upgrades?.blobs)),
    },
  };
}

// Anything that doesn't look like a v3 save falls back field by field to the defaults.
export function normalizeSave(raw, levels = LEVEL_COUNT) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return base;
  const completed = {};
  for (const [key, entry] of Object.entries(raw.completed ?? {})) {
    const level = Number(key);
    if (!Number.isInteger(level) || level < 1 || level > levels || !entry) continue;
    completed[level] = {
      stars: Math.min(3, Math.max(1, count(entry.stars))),
      bestMultiplier: Math.max(1, Number(entry.bestMultiplier) || 1),
    };
  }
  const furthest = Math.max(0, ...Object.keys(completed).map(Number));
  const unlocked = Math.max(clampLevel(raw.unlocked, levels), Math.min(furthest + 1, levels));
  return {
    ...base, completed, unlocked,
    current: Math.min(clampLevel(raw.current, levels), unlocked),
    coins: count(raw.coins), keys: count(raw.keys),
    upgrades: {
      damage: Math.max(1, count(raw.upgrades?.damage)),
      blobs: Math.max(1, count(raw.upgrades?.blobs)),
    },
  };
}
