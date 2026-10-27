// Pure model of the campaign map (no DOM) so the unlock rules and layout can be unit tested.
import { isUnlocked } from './progress.js';
import { LEVELS_PER_WORLD, WORLDS, levelInfo } from './worlds.js';

/** locked | current (the next level to beat) | open (replayable, not beaten yet) | done */
export function levelStatus(save, level) {
  if (!isUnlocked(save, level)) return 'locked';
  if (save.completed[level]) return 'done';
  return level === save.unlocked ? 'current' : 'open';
}

/** One row per world, three squares per row, in level order. */
export function mapRows(save) {
  return WORLDS.map((world, worldIndex) => ({
    world,
    levels: Array.from({ length: LEVELS_PER_WORLD }, (_, slot) => {
      const level = worldIndex * LEVELS_PER_WORLD + slot + 1;
      return {
        level,
        kind: levelInfo(level).kind,
        status: levelStatus(save, level),
        stars: save.completed[level]?.stars ?? 0,
      };
    }),
  }));
}
