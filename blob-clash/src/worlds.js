// The 30-level campaign: 10 worlds x 3 levels. Pure data plus the difficulty curve, no three.js.
//
// Every world ends its levels differently (see LEVEL_KINDS):
//   level 1  a mini boss    (a smaller roster boss in the world's colour)
//   level 2  the world boss
//   level 3  a coin chest   (no boss: the crowd hops into a giant chest, see chest.js)
//
// World fields:
//   name      shown on the map and in banners
//   featured  the hazard that stars in this world (see CONFIG.obstacle.weights)
//   boss      id of the world boss in BOSSES (bosses.js)
//   mini      id of the mini boss in BOSSES, always a different one from `boss`
//   tint      jelly colours of the mini boss; the world's accent colour
//   accent    css colour for the world's row on the map
// Theme fields for sky, water and track come with the visual theme of each world.
export const WORLDS = [
  { id: 'beach', name: 'PRAIA', featured: 'slider', boss: 'rookie', mini: 'punk', accent: '#ffd24a', tint: { bottom: 0xffe27a, top: 0xffa81a } },
  { id: 'jungle', name: 'FLORESTA', featured: 'saw', boss: 'spartan', mini: 'rookie', accent: '#4cd964', tint: { bottom: 0x9cf08a, top: 0x1fa84a } },
  { id: 'desert', name: 'DESERTO', featured: 'bombs', boss: 'viking', mini: 'spartan', accent: '#ffb35c', tint: { bottom: 0xffd9a0, top: 0xe0873a } },
  { id: 'candy', name: 'DOCES', featured: 'jump', boss: 'punk', mini: 'viking', accent: '#ff7ac8', tint: { bottom: 0xffc0e6, top: 0xe8409e } },
  { id: 'ice', name: 'GELO', featured: 'trap', boss: 'king', mini: 'rookie', accent: '#7fe0ff', tint: { bottom: 0xd6f6ff, top: 0x4aa8e8 } },
  { id: 'volcano', name: 'VULCÃO', featured: 'spikes', boss: 'spartan', mini: 'punk', accent: '#ff7a1a', tint: { bottom: 0xffd24a, top: 0xff5a14 } },
  { id: 'neon', name: 'NEON', featured: 'saw', boss: 'viking', mini: 'king', accent: '#b45cff', tint: { bottom: 0xe0a8ff, top: 0x6a2cf0 } },
  { id: 'factory', name: 'FÁBRICA', featured: 'bombs', boss: 'punk', mini: 'spartan', accent: '#9aa6c0', tint: { bottom: 0xdfe6f2, top: 0x6f7c99 } },
  { id: 'pirates', name: 'PIRATAS', featured: 'jump', boss: 'rookie', mini: 'viking', accent: '#3fd0c0', tint: { bottom: 0xa0f0e4, top: 0x1a9c8c } },
  { id: 'castle', name: 'CASTELO', featured: 'trap', boss: 'king', mini: 'punk', accent: '#d8a8ff', tint: { bottom: 0xf0d0ff, top: 0x9a4ae0 } },
];

export const LEVELS_PER_WORLD = 3;
export const LEVEL_COUNT = WORLDS.length * LEVELS_PER_WORLD;
export const LEVEL_KINDS = ['mini', 'boss', 'chest'];

// Pressure runs 0..1 over the campaign. Inside a world it climbs by RAMP worlds' worth, so the first
// level of the next world starts below the last one of the previous: a short breather every 3 levels.
const RAMP = 1.4;
const MAX_PRESSURE = WORLDS.length - 1 + RAMP;

/**
 * Where a level sits in the campaign. Levels past the last one reuse the final world at full pressure
 * (the layouts still differ, they are seeded by the level number).
 */
export function levelInfo(level) {
  const n = Math.min(Math.max(level, 1), LEVEL_COUNT);
  const worldIndex = Math.floor((n - 1) / LEVELS_PER_WORLD);
  const slot = (n - 1) % LEVELS_PER_WORLD;
  return {
    level: n,
    worldIndex,
    slot,
    world: WORLDS[worldIndex],
    kind: LEVEL_KINDS[slot],
    pressure: (worldIndex + (RAMP * slot) / (LEVELS_PER_WORLD - 1)) / MAX_PRESSURE,
  };
}

export const worldForLevel = (level) => levelInfo(level).world;
