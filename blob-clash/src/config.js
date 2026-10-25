// Central place for every tunable number. Gameplay code should never hard-code these.
export const COLORS = {
  red: 0xff4d6d,
  blue: 0x4dabf7,
  green: 0x51cf66,
  yellow: 0xffd43b,
};

export const COLOR_NAMES = Object.keys(COLORS);

export const CONFIG = {
  track: {
    width: 10,
    lanes: [-3.3, 0, 3.3],
    laneJitter: 0.4,
    segmentLength: 44,
    rowSpacing: 4.5,
    introLength: 20,
    bossGap: 26,
  },
  player: {
    startMass: 10,
    forwardSpeed: 13,
    lateralSpeed: 14,
    dragSensitivity: 0.025, // world units per screen pixel
    invulnerableSeconds: 0.8,
  },
  blob: {
    radiusPerCbrtMass: 0.5, // radius = k * cbrt(mass): mass scales with volume
    maxRadius: 2.4,
    // Blobs are gooey: against obstacles only a squeezed core collides, so a
    // big blob can still slip through a one-lane gap.
    squeezeFactor: 0.45,
  },
  obstacle: {
    damageFraction: 0.3, // share of mass lost on hit
    minDamage: 3,
    sawAmplitude: 3,
    sawSpeed: 1.6,
    sawRadius: 1.0,
    wallPadding: 0.9, // how far a wall reaches beyond its lane centres
    wallDepth: 0.8,
  },
  pickup: {
    minMass: 1,
    maxMass: 4,
    rowFillChance: 0.75,
  },
  boss: {
    baseDifficulty: 0.5, // share of the best possible mass the boss gets
    difficultyPerLevel: 0.05,
    maxDifficulty: 0.85,
  },
  clash: {
    minRatePerSecond: 6,
    rateFraction: 0.7, // share of the smaller mass drained per second
  },
};
