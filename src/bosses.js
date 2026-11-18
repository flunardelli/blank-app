import { CONFIG } from './config.js';
import { levelInfo } from './worlds.js';
import { MECHANICS } from './rules.js';

// Boss roster: ten fighters, one world boss per world (worlds.js picks which); the first five also serve
// as mini bosses. Pure data, so adding a boss is adding a row.
//
// Look fields: `body` = [width, height] of the jelly, `headgear` = a builder in art/boxer.js, `trunks` = shorts
// colour, `outfit` = optional extra gear in art/boxer.js, `emoji` = its mark on the campaign map.
// Attack fields (all bosses stay equally dangerous on average: see bossPunchDamage):
//   interval  seconds between attacks
//   move      a clip from BOSS_MOVES (moves.js): 'jab' | 'heavy' | 'double' | 'slam' | 'flurry' | 'bellySlam' | 'spinKick' |
//             'rocketPunch' | 'cutlass' | 'decree'.
//             The clip decides the wind-up the player sees and how many strikes split the damage.
//   rage      the attack used in the second phase (below 50% health), same shape as `attack`.
//   mechanics which fight mechanics the boss can use (see MECHANICS in rules.js): 'dodge' (telegraphed big
//             punch), 'guard' (high guard) and 'enrage' (second phase). World 1 uses none; a mini boss
//             picks one of them, a world boss all of them (see bossForLevel).
export const BOSSES = [
  {
    id: 'rookie', name: 'ROOKIE', emoji: '🏈', headgear: 'football',
    colors: { bottom: 0xff8f8f, top: 0xd8283e }, glove: 0x2f56d6, body: [1, 1],
    attack: { interval: 1.2, move: 'jab' },
    rage: { interval: 1.4, move: 'double' },
    mechanics: MECHANICS,
  },
  {
    id: 'spartan', name: 'SPARTAN', emoji: '🛡️', headgear: 'spartan',
    colors: { bottom: 0xb6ff4a, top: 0x2fbf1a }, glove: 0x2f56d6, body: [0.95, 1.12],
    attack: { interval: 1.9, move: 'heavy' },
    rage: { interval: 1.5, move: 'slam' },
    mechanics: MECHANICS,
  },
  {
    id: 'king', name: 'KING BLOB', emoji: '👑', headgear: 'crown',
    colors: { bottom: 0xd8a8ff, top: 0x7a3fe0 }, glove: 0xffc21a, body: [1.3, 0.95],
    attack: { interval: 1.6, move: 'double' },
    rage: { interval: 1.3, move: 'flurry' },
    mechanics: MECHANICS,
  },
  {
    id: 'viking', name: 'VIKING', emoji: '🪓', headgear: 'viking',
    colors: { bottom: 0x9fd8ff, top: 0x2f7fd8 }, glove: 0xd8264a, body: [1.15, 1.05],
    attack: { interval: 2.2, move: 'slam' },
    rage: { interval: 1.8, move: 'heavy' },
    mechanics: MECHANICS,
  },
  {
    id: 'punk', name: 'PUNK', emoji: '🎸', headgear: 'mohawk',
    colors: { bottom: 0xfff07a, top: 0xf0a800 }, glove: 0x2b2b3a, body: [0.9, 1.08],
    attack: { interval: 1.8, move: 'flurry' },
    rage: { interval: 1.5, move: 'double' },
    mechanics: MECHANICS,
  },
  {
    id: 'sumo', name: 'SUMO', emoji: '🍙', headgear: 'topknot', trunks: 0xe8dcc0,
    colors: { bottom: 0xffd0a8, top: 0xe8803a }, glove: 0x2b2b3a, body: [1.55, 0.92],
    attack: { interval: 2.1, move: 'bellySlam' },
    rage: { interval: 1.7, move: 'heavy' },
    mechanics: MECHANICS,
  },
  {
    id: 'ninja', name: 'NINJA', emoji: '🥷', headgear: 'ninja', trunks: 0x2b2b3a,
    colors: { bottom: 0x9a9ab8, top: 0x3a3a5c }, glove: 0xd8264a, body: [0.82, 1.12],
    attack: { interval: 1.7, move: 'spinKick' },
    rage: { interval: 1.4, move: 'flurry' },
    mechanics: MECHANICS,
  },
  {
    id: 'robot', name: 'ROBOT', emoji: '🤖', headgear: 'antenna', trunks: 0x8a96ae,
    colors: { bottom: 0xdfe8f2, top: 0x7e8ea8 }, glove: 0xffc21a, body: [1.05, 1.15],
    attack: { interval: 2.1, move: 'rocketPunch' },
    rage: { interval: 1.6, move: 'double' },
    mechanics: MECHANICS,
  },
  {
    id: 'pirate', name: 'PIRATE', emoji: '🏴‍☠️', headgear: 'pirate', trunks: 0x7a4a2a,
    colors: { bottom: 0xffb0a0, top: 0xc8402a }, glove: 0x2b2b3a, body: [1.1, 1.0],
    attack: { interval: 1.9, move: 'cutlass' },
    rage: { interval: 1.5, move: 'slam' },
    mechanics: MECHANICS,
  },
  {
    id: 'castleking', name: 'CASTLE KING', emoji: '🏰', headgear: 'castleCrown', outfit: 'cape', trunks: 0xf2e8ff,
    colors: { bottom: 0xf4d8ff, top: 0x8a3ad8 }, glove: 0xffc21a, body: [1.3, 1.12],
    attack: { interval: 2.4, move: 'decree' },
    rage: { interval: 1.8, move: 'bellySlam' },
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
 * simple jabs and at most one fight mechanic), the world boss on level 2 with all of them, `worldBossScale` bigger and with its own entrance banner. Level 3 is a
 * chest stage and has no fight; it still answers with the world boss so callers always get a valid boss.
 */
export function bossForLevel(level) {
  const info = levelInfo(level);
  const { world, kind } = info;
  const { miniScale, miniAttack, worldBossScale } = CONFIG.boss;
  if (kind !== 'mini') {
    const boss = bossById(world.boss);
    return {
      ...boss,
      mechanics: mechanicsFor(boss, info),
      size: worldBossScale,
      banner: { title: `CHEFÃO ${world.name}`, text: `VS ${boss.name}` },
    };
  }
  const base = bossById(world.mini);
  return {
    ...base,
    mechanics: mechanicsFor(base, info),
    name: `MINI ${base.name}`,
    size: 1,
    banner: { text: `VS MINI ${base.name}` },
    colors: world.tint,
    body: base.body.map((s) => s * miniScale),
    attack: miniAttack,
    rage: miniAttack, // an enraged mini boss only gets faster
  };
}
