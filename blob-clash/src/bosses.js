import { CONFIG } from './config.js';
import { levelInfo } from './worlds.js';
import { MECHANICS } from './rules.js';

// Boss roster: one entry per level, cycling. Pure data, so adding a boss is adding a row.
//
// Attack fields (all bosses stay equally dangerous on average: see bossPunchDamage):
//   interval  seconds between attacks
//   move      a clip from BOSS_MOVES (moves.js): 'jab' | 'heavy' | 'double' | 'slam' | 'flurry'.
//             The clip decides the wind-up the player sees and how many strikes split the damage.
//   rage      the attack used in the second phase (below 50% health), same shape as `attack`.
//   mechanics which fight mechanics the boss can use (see MECHANICS in rules.js): 'dodge' (telegraphed big
//             punch), 'guard' (high guard) and 'enrage' (second phase). World 1 uses none; a mini boss
//             picks one of them, a world boss all of them (see bossForLevel).
export const BOSSES = [
  {
    id: 'rookie', name: 'ROOKIE', headgear: 'football',
    colors: { bottom: 0xff8f8f, top: 0xd8283e }, glove: 0x2f56d6, body: [1, 1],
    attack: { interval: 1.2, move: 'jab' },
    rage: { interval: 1.4, move: 'double' },
    mechanics: MECHANICS,
  },
  {
    id: 'spartan', name: 'SPARTAN', headgear: 'spartan',
    colors: { bottom: 0xb6ff4a, top: 0x2fbf1a }, glove: 0x2f56d6, body: [0.95, 1.12],
    attack: { interval: 1.9, move: 'heavy' },
    rage: { interval: 1.5, move: 'slam' },
    mechanics: MECHANICS,
  },
  {
    id: 'king', name: 'KING BLOB', headgear: 'crown',
    colors: { bottom: 0xd8a8ff, top: 0x7a3fe0 }, glove: 0xffc21a, body: [1.3, 0.95],
    attack: { interval: 1.6, move: 'double' },
    rage: { interval: 1.3, move: 'flurry' },
    mechanics: MECHANICS,
  },
  {
    id: 'viking', name: 'VIKING', headgear: 'viking',
    colors: { bottom: 0x9fd8ff, top: 0x2f7fd8 }, glove: 0xd8264a, body: [1.15, 1.05],
    attack: { interval: 2.2, move: 'slam' },
    rage: { interval: 1.8, move: 'heavy' },
    mechanics: MECHANICS,
  },
  {
    id: 'punk', name: 'PUNK', headgear: 'mohawk',
    colors: { bottom: 0xfff07a, top: 0xf0a800 }, glove: 0x2b2b3a, body: [0.9, 1.08],
    attack: { interval: 1.8, move: 'flurry' },
    rage: { interval: 1.5, move: 'double' },
    mechanics: MECHANICS,
  },
];

const bossById = (id) => BOSSES.find((b) => b.id === id);

// Mechanics switch on from the second world. A mini boss gets only one of them, rotating with the world.
function mechanicsFor(boss, { worldIndex, kind }) {
  if (worldIndex < CONFIG.boss.mechanicsFromWorld - 1) return [];
  if (kind !== 'mini') return boss.mechanics;
  const usable = MECHANICS.filter((m) => boss.mechanics.includes(m));
  return usable.length ? [usable[worldIndex % usable.length]] : [];
}

/**
 * The opponent of a level, read from its world: a mini boss on level 1 (smaller, in the world's colour,
 * simple jabs and at most one fight mechanic), the world boss on level 2 with all of them. Level 3 is a
 * chest stage and has no fight; it still answers with the world boss so callers always get a valid boss.
 */
export function bossForLevel(level) {
  const info = levelInfo(level);
  const { world, kind } = info;
  if (kind !== 'mini') {
    const boss = bossById(world.boss);
    return { ...boss, mechanics: mechanicsFor(boss, info) };
  }
  const { miniScale, miniAttack } = CONFIG.boss;
  const base = bossById(world.mini);
  return {
    ...base,
    mechanics: mechanicsFor(base, info),
    name: `MINI ${base.name}`,
    colors: world.tint,
    body: base.body.map((s) => s * miniScale),
    attack: miniAttack,
    rage: miniAttack, // an enraged mini boss only gets faster
  };
}
