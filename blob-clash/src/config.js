// Central place for every tunable number and colour. Gameplay code never hard-codes these.
export const PALETTE = {
  player: { bottom: 0xffb52e, top: 0xff3a1c, bits: 0xff8a1a },
  enemy: { bottom: 0xe8506a, top: 0x9e1430, bits: 0xff6f9a },
  walker: { bottom: 0xe4e7f0, top: 0x8d93a6, bits: 0xb8bdcc },
  glove: 0x2f56d6,
  championGlove: 0xd8264a,
  button: 0x3ee05a,
  key: 0xffc21a,
  goodGlass: 0x6fd0ff,
  badGlass: 0xff7f8f,
  trackLight: '#fff5f9',
  trackDark: '#e8e2f8',
  rail: 0xf7f3ff,
  waterBase: '#3cc9f5',
  waterLine: '#d8f7ff',
  skyTop: '#62c6ff',
  skyHorizon: '#e3f8ff',
  post: 0x5244c2,
  rope: 0xffe14a,
  arch: 0x8c8cf0,
  mat: 0xa8687f,
  spikeBase: 0x4a2c9c,
  spike: 0xe8433f,
  saw: 0x7d5ce0,
  sawTeeth: 0xff7a3a,
  sawRail: 0x2e2466,
  ramp: 0xffc93a,
  bomb: 0x2a2440,
  bombPad: 0x5a3cb8,
  fuse: 0xffb02e,
  coin: 0xffc21a,
  ink: '#1d1a3a',
};

export const CONFIG = {
  track: {
    width: 10,
    lanes: [-3.3, 0, 3.3],
    segmentLength: 38,
    introLength: 16,
    minSegments: 6, // the first level; the last one has maxSegments (see levelInfo for the curve)
    maxSegments: 12,
  },
  crowd: {
    spacing: 0.55,
    unitRadius: 0.3,
    maxRadius: 3.2, // big crowds pack tighter instead of overflowing the track
    maxVisible: 90,
    forwardSpeed: 10,
    lateralSpeed: 14,
    dragSensitivity: 0.03, // world units per screen pixel
  },
  gates: {
    addMin: 4,
    addMax: 12,
    multipliers: [2, 2, 3],
    subMin: 2,
    subMax: 8,
    badChance: 0.45,
    maxCount: 999,
  },
  enemy: {
    minShare: 0.12, // enemy crowd size as a share of the best reachable count, on the first level
    maxShare: 0.26,
    pressureShare: 0.18, // added to both shares at full campaign pressure
    maxVisible: 60,
  },
  skirmish: { minRatePerSecond: 8, rateFraction: 1.2 },
  obstacle: {
    // Sliders (melon slices, spring boxing gloves) live at a track edge and slide in by up to
    // `sliderReach` units, then back out.
    sliderRadius: 1.5,
    sliderReach: 3.4,
    sliderSpeed: 1.8,
    // Trap: full-width spike field; stepping on its button (placed ahead of it) retracts it.
    trapHalfDepth: 1.4,
    trapButtonLead: 9,
    trapButtonRadius: 0.9,
    // Hazard pool: each kind unlocks at a level, and every level features its world's kind
    // (weight × featuredBoost), so neighbouring worlds feel different.
    weights: { slider: 0.4, spikes: 0.3, trap: 0.3, saw: 0.35, jump: 0.3, bombs: 0.35 },
    unlockLevel: { slider: 1, spikes: 1, trap: 1, saw: 2, jump: 2, bombs: 3 },
    featuredBoost: 3,
    spikeHalfDepth: 1.1,
    // Spike pads hug the track edges (like the reference): [centre x, half width] per pad.
    spikeLayouts: [
      [[-3.75, 1.25], [3.75, 1.25]], // both edges, 5-unit gap in the middle
      [[-2.9, 2.1]], // left half
      [[2.9, 2.1]], // right half
    ],
    minSpikeGap: 4.5,
    // Saw: a blade spinning on a rail across the track, sliding from side to side.
    sawRadius: 0.9,
    sawHalfDepth: 0.25,
    sawSpeed: 1.0,
    // Jump: a ramp launches the blobs that cross it over the saws placed right behind it.
    rampHalfWidth: 3.4,
    rampHalfDepth: 1.4,
    jumpLength: 9,
    jumpHeight: 2.6,
    airborneHeight: 0.6, // above this a blob clears ground hazards
    // Bombs: stepping into the trigger radius blows up every blob within the blast radius.
    bombRadius: 0.6,
    bombBlast: 1.5,
    bombRowGap: 6,
    // Each row packs its bombs on one side (mirrored for the other), so even the biggest crowd fits
    // through the free side; rows alternate sides for a slalom.
    bombSlots: [-4.2, -2.2],
  },
  // Gray walkers pacing across the track; each one takes `strength` blobs with it on contact.
  walkers: {
    fromLevel: 2,
    radius: 0.45,
    speed: 1.1,
    perGroupMin: 1,
    perGroupMax: 3, // reached gradually: one more walker per group every two phases
    bruteFromLevel: 4, // big walkers that take several blobs
    bruteChance: 0.35,
    bruteStrength: 5,
    bruteScale: 1.7,
  },
  coins: { perRow: 5, spacing: 1.6, value: 10 },
  hud: { bubbleRange: 42 }, // only label crowds this close, so the horizon stays clean
  boss: {
    // Boss HP as a share of the best reachable crowd, from the first level (minDifficulty) to the last
    // (maxDifficulty) along the campaign's pressure curve; kindFactor scales it per level kind.
    // Required taps/s = 3 × difficulty, so the cap stays well under a human's tapping speed.
    minDifficulty: 0.3,
    maxDifficulty: 1.4,
    kindFactor: { mini: 0.8, boss: 1, chest: 1 },
    miniScale: 0.8, // mini bosses are a smaller roster boss in the world's colour
    miniAttack: { interval: 1.4, move: 'jab' }, // and only throw simple jabs
    finishGap: 4, // straight run between the last segment and the finish line
    ringDepth: 11,
  },
  // Boss fight: the crowd merges into one champion; every tap is a punch.
  boxing: {
    punchPerBlob: 1 / 30, // champion punch damage per blob in the crowd
    bossKillSeconds: 10, // every boss knocks out any champion in this long: tap fast enough
    tapCooldown: 0.06,
    comboWindow: 0.6, // taps closer than this chain into a combo
    finisherEvery: 5, // every 5th chained tap is a flying jump punch
    jumpPunchMultiplier: 2.5,
    openingMultiplier: 2.5, // the fight opens with a free flying punch
  },
  bonus: { maxMultiplier: 5, step: 0.2, tileDepth: 2.6 },
  campaign: { starsAt: [2, 4] }, // x1–x2 = 1 star, up to x4 = 2, above = 3; level count lives in worlds.js
  // Dev-only shortcuts: each entry is a key sequence that jumps straight to the boss fight.
  dev: {
    skipCrowdShare: 0.7, // crowd handed to the player: at least this share of the level's best count
    cheatTimeout: 3, // seconds allowed between two keys of a sequence
    cheats: [['KeyB', 'KeyL', 'KeyO', 'KeyB'], ['KeyI', 'KeyD', 'KeyD', 'KeyQ', 'KeyD']],
  },
  keys: { perChest: 3, chestCoinsPerLevel: 60 },
  reward: { base: 50, perLevel: 10 },
  upgrades: { baseCost: 50, costGrowth: 1.6, damagePerLevel: 0.25, blobsPerLevel: 1 },
};
