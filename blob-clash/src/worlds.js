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
//   theme     the look of the world (see THEME_KEYS): sky gradient, fog, sea, track, rails, light and clouds
export const WORLDS = [
  { id: 'beach', name: 'PRAIA', featured: 'slider', boss: 'rookie', mini: 'punk', accent: '#ffd24a', tint: { bottom: 0xffe27a, top: 0xffa81a }, theme: { sky: ['#62c6ff', '#e3f8ff'], sea: ['#3cc9f5', '#d8f7ff'], track: ['#fff5f9', '#e8e2f8'], side: 0xd9d2f2, rail: 0xf7f3ff, sun: 0xffffff, hemi: [0xffffff, 0x9fb6d6], cloud: 0xffffff } },
  { id: 'jungle', name: 'FLORESTA', featured: 'saw', boss: 'spartan', mini: 'rookie', accent: '#4cd964', tint: { bottom: 0x9cf08a, top: 0x1fa84a }, theme: { sky: ['#3fae7a', '#d8f5c8'], sea: ['#1f8f6a', '#9ce8b0'], track: ['#f2ead2', '#d9cba4'], side: 0xb8a577, rail: 0x7a5a34, sun: 0xfff3c4, hemi: [0xeaffd8, 0x4a7a4a], cloud: 0xe6ffd8 } },
  { id: 'desert', name: 'DESERTO', featured: 'bombs', boss: 'viking', mini: 'spartan', accent: '#ffb35c', tint: { bottom: 0xffd9a0, top: 0xe0873a }, theme: { sky: ['#ff9a5c', '#ffe8b8'], sea: ['#e8b25a', '#fff0c4'], track: ['#fff0d2', '#f0d4a0'], side: 0xd9b06a, rail: 0xc98a45, sun: 0xffe0a0, hemi: [0xfff0d0, 0xb88a50], cloud: 0xffe9cc } },
  { id: 'candy', name: 'DOCES', featured: 'jump', boss: 'punk', mini: 'viking', accent: '#ff7ac8', tint: { bottom: 0xffc0e6, top: 0xe8409e }, theme: { sky: ['#ff8fd0', '#ffe6f6'], sea: ['#ff7ac8', '#ffe0f2'], track: ['#ffffff', '#ffd6ec'], side: 0xffb8dc, rail: 0xff7ac8, sun: 0xfff0f8, hemi: [0xffe6f6, 0xd890c0], cloud: 0xfff0fa } },
  { id: 'ice', name: 'GELO', featured: 'trap', boss: 'king', mini: 'rookie', accent: '#7fe0ff', tint: { bottom: 0xd6f6ff, top: 0x4aa8e8 }, theme: { sky: ['#8ad8ff', '#f2fcff'], sea: ['#6fc4ee', '#f0fcff'], track: ['#f4fcff', '#cfe8f6'], side: 0xb4dcf0, rail: 0xdff6ff, sun: 0xeaf6ff, hemi: [0xf0fbff, 0x8ab4d8], cloud: 0xffffff } },
  { id: 'volcano', name: 'VULCÃO', featured: 'spikes', boss: 'spartan', mini: 'punk', accent: '#ff7a1a', tint: { bottom: 0xffd24a, top: 0xff5a14 }, theme: { sky: ['#3a1424', '#ff7a3a'], sea: ['#ff8a1a', '#ffe45a'], track: ['#5a4a4a', '#3e3434'], side: 0x2e2626, rail: 0xff7a1a, sun: 0xffb070, hemi: [0xffb08a, 0x4a2418], cloud: 0x7a4a4a } },
  { id: 'neon', name: 'NEON', featured: 'saw', boss: 'viking', mini: 'king', accent: '#b45cff', tint: { bottom: 0xe0a8ff, top: 0x6a2cf0 }, theme: { sky: ['#14083a', '#7a2cf0'], sea: ['#2a1470', '#ff4ad8'], track: ['#2a2058', '#1a1440'], side: 0x120c34, rail: 0x3affea, sun: 0xc8a8ff, hemi: [0xb8a0ff, 0x30206a], cloud: 0x8a5cf0 } },
  { id: 'factory', name: 'FÁBRICA', featured: 'bombs', boss: 'punk', mini: 'spartan', accent: '#9aa6c0', tint: { bottom: 0xdfe6f2, top: 0x6f7c99 }, theme: { sky: ['#7a8398', '#dfe6f2'], sea: ['#4a5a78', '#aab8d0'], track: ['#d0d6e2', '#aab2c4'], side: 0x7c869e, rail: 0xffc21a, sun: 0xf2f6ff, hemi: [0xe8eef8, 0x5a6478], cloud: 0xc4ccdc } },
  { id: 'pirates', name: 'PIRATAS', featured: 'jump', boss: 'rookie', mini: 'viking', accent: '#3fd0c0', tint: { bottom: 0xa0f0e4, top: 0x1a9c8c }, theme: { sky: ['#2a9ab0', '#ffe2b0'], sea: ['#1a9c8c', '#a0f0e4'], track: ['#d8b27a', '#b88a52'], side: 0x8a5a30, rail: 0x6a4020, sun: 0xffe8b8, hemi: [0xfff0d4, 0x6a8aa0], cloud: 0xfff0dc } },
  { id: 'castle', name: 'CASTELO', featured: 'trap', boss: 'king', mini: 'punk', accent: '#d8a8ff', tint: { bottom: 0xf0d0ff, top: 0x9a4ae0 }, theme: { sky: ['#4a2a8a', '#f0d0ff'], sea: ['#6a3ab8', '#e8c8ff'], track: ['#e8e0f2', '#c4b8d8'], side: 0x9a8ab4, rail: 0xd8a8ff, sun: 0xf4e4ff, hemi: [0xf0e0ff, 0x7a64a8], cloud: 0xf0e0ff } },
];

// Theme shape: sky = [top, horizon] (also the fog colour), sea = [base, line] of the scrolling water,
// track = [light, dark] stripes, side = deck sides, rail = rails, sun = sun light, hemi = [sky, ground] light,
// cloud = cloud tint.
export const THEME_KEYS = ['sky', 'sea', 'track', 'side', 'rail', 'sun', 'hemi', 'cloud'];

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
