// Boss roster: one entry per level, cycling. Pure data, so adding a boss is adding a row.
//
// Attack fields (all bosses stay equally dangerous on average: see bossPunchDamage):
//   interval  seconds between attacks
//   windup    seconds of visible wind-up before an attack lands (the player's cue)
//   strikes   hits per attack (a combo splits the damage)
//   move      animation: 'jab' | 'heavy' | 'double' | 'slam' | 'flurry'
export const BOSSES = [
  {
    id: 'rookie', name: 'ROOKIE', headgear: 'football',
    colors: { bottom: 0xff8f8f, top: 0xd8283e }, glove: 0x2f56d6, body: [1, 1],
    attack: { interval: 1.2, windup: 0.35, strikes: 1, move: 'jab' },
  },
  {
    id: 'spartan', name: 'SPARTAN', headgear: 'spartan',
    colors: { bottom: 0xb6ff4a, top: 0x2fbf1a }, glove: 0x2f56d6, body: [0.95, 1.12],
    attack: { interval: 1.9, windup: 0.6, strikes: 1, move: 'heavy' },
  },
  {
    id: 'king', name: 'KING BLOB', headgear: 'crown',
    colors: { bottom: 0xd8a8ff, top: 0x7a3fe0 }, glove: 0xffc21a, body: [1.3, 0.95],
    attack: { interval: 1.6, windup: 0.45, strikes: 2, move: 'double' },
  },
  {
    id: 'viking', name: 'VIKING', headgear: 'viking',
    colors: { bottom: 0x9fd8ff, top: 0x2f7fd8 }, glove: 0xd8264a, body: [1.15, 1.05],
    attack: { interval: 2.2, windup: 0.7, strikes: 1, move: 'slam' },
  },
  {
    id: 'punk', name: 'PUNK', headgear: 'mohawk',
    colors: { bottom: 0xfff07a, top: 0xf0a800 }, glove: 0x2b2b3a, body: [0.9, 1.08],
    attack: { interval: 1.8, windup: 0.4, strikes: 3, move: 'flurry' },
  },
];

export const bossForLevel = (level) => BOSSES[(level - 1) % BOSSES.length];
