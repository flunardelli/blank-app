// Central place for every tunable number and colour. Gameplay code never hard-codes these.
export const PALETTE = {
  player: { bottom: 0xffb52e, top: 0xff3a1c, splat: 0xff7a1a },
  enemy: { bottom: 0xe8506a, top: 0x9e1430, splat: 0x8f1d25 },
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
  coin: 0xffc21a,
  ink: '#1d1a3a',
};

export const CONFIG = {
  track: {
    width: 10,
    lanes: [-3.3, 0, 3.3],
    introLength: 16,
  },
  // Levels are a sequence of authored chunks. Each mechanic unlocks at a level, appears there
  // alone first (with a hint), and only later mixes with the others: teach, test, twist.
  chunks: {
    unlock: { gate: 1, enemy: 1, slider: 2, spikes: 3, trap: 4, wall: 6, gateRisk: 7, bridge: 8 },
    countBase: 5,
    countPerLevel: 1,
    countMax: 10,
    gloveSkinFrom: 5, // spring gloves are a later "twist" skin for sliders
  },
  bridge: { halfWidth: 1.9, introHalfWidth: 2.5, length: 22 },
  wall: { costMin: 0.3, costMax: 0.5, multiplier: 3 },
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
    multipliers: [2, 2, 2, 3],
    subMin: 2,
    subMax: 8,
    badChance: 0.45,
    maxCount: 999,
  },
  enemy: {
    minShare: 0.15, // enemy crowd size as a share of the best reachable count
    maxShare: 0.32,
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
    weights: { slider: 0.4, spikes: 0.3, trap: 0.3 },
    spikeHalfDepth: 1.1,
    // Spike pads hug the track edges (like the reference): [centre x, half width] per pad.
    spikeLayouts: [
      [[-3.75, 1.25], [3.75, 1.25]], // both edges, 5-unit gap in the middle
      [[-2.9, 2.1]], // left half
      [[2.9, 2.1]], // right half
    ],
    minSpikeGap: 4.5,
  },
  coins: { perRow: 5, spacing: 1.6, value: 5 },
  hud: { bubbleRange: 42 }, // only label crowds this close, so the horizon stays clean
  boss: {
    baseDifficulty: 0.35, // boss HP as a share of the best reachable crowd
    difficultyPerLevel: 0.035,
    maxDifficulty: 0.74, // + spike on big boss levels
    bossEvery: 5, // every 5th level is a big boss level...
    spike: 0.12,
    relief: 0.08, // ...and the next one is a breather
    finishGap: 4, // straight run between the last segment and the finish line
    ringDepth: 11,
  },
  // Boss fight: the crowd merges into one champion; every tap is a punch.
  boxing: {
    punchPerBlob: 1 / 55, // champion punch damage per blob in the crowd
    bossKillSeconds: 10, // unblocked, every boss knocks out any champion in this long
    firstAttackDelay: 1.6, // the boss swings soon: no free KO before it ever attacks
    blockFactor: 0.15, // damage taken when not tapping during the wind-up
    counterWindow: 0.45, // tap this soon after a block for a counter punch
    counterMultiplier: 3,
    tapCooldown: 0.06,
    comboWindow: 0.6, // taps closer than this chain into a combo
    finisherEvery: 5, // every 5th chained tap is a flying jump punch
    jumpPunchMultiplier: 2.5,
    openingMultiplier: 2.5, // the fight opens with a free flying punch
  },
  bonus: { maxMultiplier: 5, step: 0.2, tileDepth: 2.6 },
  keys: { perChest: 3, chestCoinsPerLevel: 60 },
  reward: { base: 40, perLevel: 8 },
  upgrades: { baseCost: 150, costGrowth: 1.45, damagePerLevel: 0.25, blobsPerLevel: 1 },
  // A typical player, used to size bosses for the upgrades they'll realistically own by a level.
  // Better (or luckier) players stay a little ahead of the curve; nobody breaks it.
  economy: { coinShare: 0.6, multiplier: 2.4 },
};
