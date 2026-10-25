// Boss roster: one entry per level, cycling. Pure data, so adding a boss is adding a row.
//
// Attack fields (all bosses stay equally dangerous on average: see bossPunchDamage):
//   interval  seconds between attacks
//   move      a clip from BOSS_MOVES (moves.js): 'jab' | 'heavy' | 'double' | 'slam' | 'flurry'.
//             The clip decides the wind-up the player sees and how many strikes split the damage.
export const BOSSES = [
  {
    id: 'rookie', name: 'ROOKIE', headgear: 'football',
    colors: { bottom: 0xff8f8f, top: 0xd8283e }, glove: 0x2f56d6, body: [1, 1],
    attack: { interval: 1.2, move: 'jab' },
  },
  {
    id: 'spartan', name: 'SPARTAN', headgear: 'spartan',
    colors: { bottom: 0xb6ff4a, top: 0x2fbf1a }, glove: 0x2f56d6, body: [0.95, 1.12],
    attack: { interval: 1.9, move: 'heavy' },
  },
  {
    id: 'king', name: 'KING BLOB', headgear: 'crown',
    colors: { bottom: 0xd8a8ff, top: 0x7a3fe0 }, glove: 0xffc21a, body: [1.3, 0.95],
    attack: { interval: 1.6, move: 'double' },
  },
  {
    id: 'viking', name: 'VIKING', headgear: 'viking',
    colors: { bottom: 0x9fd8ff, top: 0x2f7fd8 }, glove: 0xd8264a, body: [1.15, 1.05],
    attack: { interval: 2.2, move: 'slam' },
  },
  {
    id: 'punk', name: 'PUNK', headgear: 'mohawk',
    colors: { bottom: 0xfff07a, top: 0xf0a800 }, glove: 0x2b2b3a, body: [0.9, 1.08],
    attack: { interval: 1.8, move: 'flurry' },
  },
];

export const bossForLevel = (level) => BOSSES[(level - 1) % BOSSES.length];
