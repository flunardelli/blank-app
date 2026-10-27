// Fight choreography: every punch is a keyframed clip with anticipation, impact and recovery.
// Pure data (plus anim.js helpers), shared by the champion and every boss rig.
//
// Pose channels (radians unless noted; the rig faces +z, `l` is the arm/leg on +x):
//   y, squash         hips height offset (rig units) and squash & stretch (-0.2 = squashed)
//   lean, twist, head torso pitch forward, torso yaw, head tilt back (+)
//   lRaise, rRaise    shoulder swing forward/up (0 = hanging, PI/2 = straight ahead, PI = overhead)
//   lSpread, rSpread  shoulder swing outwards
//   lElbow, rElbow    elbow bend (0 = straight arm)
//   lLeg, rLeg        hip swing forward
//   dash, lift        whole-body travel towards the opponent and up, in world units
//
// Clip fields: keys (see anim.js), hits = seconds at which a punch lands, weight = how hard
// each hit reads (effects, shake), retarget = optional name of a clip from the RobotExpressive model
// (CONFIG.character.clips) that stands in for the keyframes once loaded. Every clip starts and ends in GUARD, so moves chain cleanly.
import { mirrorClip } from './anim.js';

export const GUARD = {
  y: 0, squash: 0, lean: 0.1, twist: 0, head: 0,
  lRaise: 0.4, lSpread: 0.3, lElbow: 1.95,
  rRaise: 0.4, rSpread: 0.3, rElbow: 1.95,
  lLeg: 0.25, rLeg: -0.2,
  dash: 0, lift: 0,
};

/** Boxer's bounce on the spot while nobody is punching. `energy` 0 = calm, 1 = fight. */
export function idlePose(time, energy = 1, phase = 0) {
  const t = time * (3 + 5 * energy) + phase;
  const bob = Math.sin(t);
  return {
    ...GUARD,
    y: Math.abs(bob) * 0.04 * energy,
    squash: -Math.abs(bob) * 0.05 * energy + Math.sin(time * 2) * 0.015,
    twist: Math.sin(t * 0.5) * 0.08 * energy,
    lRaise: GUARD.lRaise + Math.sin(t) * 0.08 * energy,
    rRaise: GUARD.rRaise - Math.sin(t) * 0.08 * energy,
    head: Math.sin(t * 0.5 + 1) * 0.05,
  };
}

// ---- Building blocks -----------------------------------------------------------
// Straight right hand, fully extended. Mirror it for the left.
const RIGHT_EXTENDED = { twist: 0.45, lean: 0.25, squash: 0.1, rRaise: 1.55, rSpread: 0.05, rElbow: 0.05, lRaise: 0.55, lElbow: 2.1 };
const RIGHT_COCKED = { twist: -0.3, lean: 0, squash: -0.05, rRaise: 0.15, rElbow: 2.3 };

const jabRight = (at, { cock = 0.2, recover = 0.3 } = {}) => [
  [at - cock, RIGHT_COCKED, 'inOutSine'],
  [at, RIGHT_EXTENDED, 'inQuad'],
  [at + 0.07, { ...RIGHT_EXTENDED, twist: 0.5, lean: 0.3 }, 'outQuad'],
  [at + 0.07 + recover, {}, 'inOutSine'],
];
const jabLeft = (at, options) => mirrorClip({ keys: jabRight(at, options) }).keys;

// ---- Boss moves (bosses.js picks one per boss) ------------------------------------
export const BOSS_MOVES = {
  // Quick straight right: small shoulder cock, snap, recoil. Once loaded, the animators' Punch clip plays
  // instead (`retarget`), sped up or slowed down so its impact frame lands on `hits`.
  jab: { weight: 1, hits: [0.32], retarget: 'Punch', keys: [[0, {}], ...jabRight(0.32, { cock: 0.24 })] },

  // Haymaker: leans way back with the arm wide, steps in and swings through, overshoots.
  heavy: {
    weight: 1.6,
    hits: [0.62],
    keys: [
      [0, {}],
      [0.42, { twist: -0.75, lean: -0.3, squash: -0.1, y: -0.04, head: 0.15, rRaise: 0.6, rSpread: 1.1, rElbow: 1.4, lRaise: 0.7, lLeg: 0.1 }, 'outCubic'],
      [0.52, { twist: -0.8, lean: -0.32, squash: -0.12, y: -0.05, head: 0.15, rRaise: 0.7, rSpread: 1.2, rElbow: 1.3, lRaise: 0.7, lLeg: 0.1 }, 'linear'],
      [0.62, { twist: 0.85, lean: 0.45, squash: 0.08, dash: 0.9, rRaise: 1.5, rSpread: 0.5, rElbow: 0.25, lRaise: 0.3, lElbow: 2.2, lLeg: 0.65, rLeg: -0.45 }, 'inCubic'],
      [0.8, { twist: 1.05, lean: 0.55, dash: 1, rRaise: 1.35, rSpread: 0.2, rElbow: 0.35, lRaise: 0.3, lElbow: 2.2, lLeg: 0.65, rLeg: -0.45 }, 'outQuad'],
      [1.35, {}, 'inOutSine'],
    ],
  },

  // One-two: left jab then right cross.
  double: {
    weight: 1,
    hits: [0.3, 0.52],
    keys: [[0, {}], ...jabLeft(0.3, { cock: 0.22, recover: 0.08 }).slice(0, 3), ...jabRight(0.52, { cock: 0.07, recover: 0.35 })],
  },

  // Viking: crouch, leap with both fists overhead and hammer the ring.
  slam: {
    weight: 1.4,
    impact: 'shockwave',
    hits: [0.78],
    keys: [
      [0, {}],
      [0.3, { y: -0.12, squash: -0.22, lean: 0.25, lRaise: 0.2, rRaise: 0.2, lElbow: 1.2, rElbow: 1.2, lSpread: 0.6, rSpread: 0.6 }, 'inOutSine'],
      [0.55, { lift: 2.6, dash: 0.6, squash: 0.18, lean: -0.15, head: 0.2, lRaise: 2.9, rRaise: 2.9, lElbow: 0.5, rElbow: 0.5, lSpread: 0.15, rSpread: 0.15, lLeg: 0.5, rLeg: 0.4 }, 'outCubic'],
      [0.78, { lift: 0, dash: 0.9, y: -0.1, squash: -0.3, lean: 0.6, lRaise: 1.2, rRaise: 1.2, lElbow: 0.2, rElbow: 0.2, lSpread: 0.15, rSpread: 0.15, lLeg: 0.6, rLeg: -0.5 }, 'inQuad'],
      [1.05, { y: -0.08, squash: -0.18, dash: 0.9, lean: 0.55, lRaise: 1.1, rRaise: 1.1, lElbow: 0.3, rElbow: 0.3, lLeg: 0.6, rLeg: -0.5 }, 'outQuad'],
      [1.6, {}, 'inOutSine'],
    ],
  },

  // The telegraphed big punch (after CHARGE): an overhead smash that lands exactly `bigSwing` seconds in.
  smash: {
    weight: 2,
    impact: 'shockwave',
    hits: [0.45],
    keys: [
      [0, {}],
      [0.2, { lift: 0.5, lean: -0.3, squash: 0.12, lRaise: 2.9, rRaise: 2.9, lElbow: 0.4, rElbow: 0.4, lSpread: 0.2, rSpread: 0.2 }, 'outQuad'],
      [0.45, { lift: 0, dash: 1, y: -0.1, squash: -0.25, lean: 0.65, lRaise: 1.1, rRaise: 1.1, lElbow: 0.2, rElbow: 0.2, lSpread: 0.15, rSpread: 0.15, lLeg: 0.6, rLeg: -0.5 }, 'inCubic'],
      [0.8, { y: -0.08, squash: -0.15, dash: 1, lean: 0.55, lRaise: 1.1, rRaise: 1.1, lElbow: 0.3, rElbow: 0.3 }, 'outQuad'],
      [1.3, {}, 'inOutSine'],
    ],
  },

  // Punk: three fast alternating jabs while bobbing forward.
  flurry: {
    weight: 1,
    hits: [0.28, 0.43, 0.58],
    keys: [
      [0, {}],
      ...jabRight(0.28, { cock: 0.2, recover: 0.04 }).slice(0, 3),
      ...jabLeft(0.43, { cock: 0.06, recover: 0.04 }).slice(0, 3),
      ...jabRight(0.58, { cock: 0.06, recover: 0.35 }),
    ],
  },
};

// ---- Boss stances (played with `hold`, then released with RELAX) ---------------------
// The warning before the big punch: leans back with both fists high, shaking with effort.
export const CHARGE = {
  keys: [
    [0, {}],
    [0.3, { lean: -0.35, squash: 0.1, y: -0.05, head: 0.2, lRaise: 2.6, rRaise: 2.6, lElbow: 0.9, rElbow: 0.9, lSpread: 0.35, rSpread: 0.35, lLeg: 0.3, rLeg: -0.3 }, 'outCubic'],
  ],
};

// High guard: gloves in front of the face, chin tucked.
export const GUARD_UP = {
  keys: [
    [0, {}],
    [0.12, { lean: 0.2, head: -0.1, lRaise: 1.45, rRaise: 1.45, lElbow: 2.5, rElbow: 2.5, lSpread: 0.1, rSpread: 0.1 }, 'outQuad'],
  ],
};

// Dazed after swinging at nothing: doubled over, arms dangling.
export const STAGGERED = {
  keys: [
    [0, {}],
    [0.15, { lean: 0.7, head: -0.3, squash: -0.15, y: -0.06, lRaise: 0.1, rRaise: 0.1, lElbow: 0.3, rElbow: 0.3, lSpread: 0.35, rSpread: 0.35, lLeg: 0.1, rLeg: -0.1 }, 'outBack'],
  ],
};

export const RELAX = { keys: [[0, {}], [0.2, {}]] };

// ---- Champion moves ---------------------------------------------------------------
const championJab = { weight: 0.7, hits: [0.06], keys: [[0, {}], [0.06, RIGHT_EXTENDED, 'outQuad'], [0.26, {}, 'inOutSine']] };

export const CHAMPION_MOVES = {
  jab: [championJab, mirrorClip(championJab)],

  // Flying "superman" punch: crouch, launch with both fists forward, bounce off, land squashed.
  jumpPunch: {
    weight: 1.6,
    hits: [0.4],
    keys: [
      [0, {}],
      [0.14, { y: -0.12, squash: -0.28, lean: 0.35, lRaise: 0, rRaise: 0, lElbow: 1.4, rElbow: 1.4, lSpread: 0.5, rSpread: 0.5 }, 'outQuad'],
      [0.4, { lift: 2.4, dash: 2.7, squash: 0.25, lean: 1.4, lRaise: 2.95, rRaise: 2.95, lElbow: 0, rElbow: 0, lSpread: 0.12, rSpread: 0.12, lLeg: -0.5, rLeg: -0.3 }, 'outCubic'],
      [0.55, { lift: 2.6, dash: 1.9, squash: 0.05, lean: -0.5, head: 0.3, lRaise: 2.2, rRaise: 2.2, lElbow: 0.5, rElbow: 0.5, lSpread: 0.9, rSpread: 0.9, lLeg: 0.6, rLeg: 0.3 }, 'outQuad'],
      [0.78, { y: -0.1, squash: -0.3, lean: 0.25, lRaise: 0.6, rRaise: 0.6, lSpread: 0.8, rSpread: 0.8, lElbow: 1.2, rElbow: 1.2, lLeg: 0.5, rLeg: -0.4 }, 'inQuad'],
      [1, {}, 'outBack'],
    ],
  },

  // Sidestep out of the big punch: dip and lean away, then bounce back.
  dodge: {
    keys: [
      [0, {}],
      [0.12, { y: -0.1, squash: -0.2, lean: 0.35, twist: 0.5, lRaise: 0.9, rRaise: 0.2, lSpread: 0.9 }, 'outQuad'],
      [0.5, { y: -0.08, squash: -0.12, lean: 0.3, twist: 0.4 }, 'linear'],
      [0.8, {}, 'outBack'],
    ],
  },

  cheer: {
    keys: [
      [0, {}],
      [0.25, { lift: 1, squash: 0.2, lRaise: 2.9, rRaise: 2.9, lSpread: 0.5, rSpread: 0.5, lElbow: 0.3, rElbow: 0.3, lLeg: 0.2, rLeg: 0.2 }, 'outCubic'],
      [0.5, { squash: -0.15, lRaise: 2.8, rRaise: 2.8, lSpread: 0.6, rSpread: 0.6, lElbow: 0.4, rElbow: 0.4, lLeg: 0, rLeg: 0 }, 'inQuad'],
      [0.75, { lRaise: 2.9, rRaise: 2.9, lSpread: 0.5, rSpread: 0.5, lElbow: 0.3, rElbow: 0.3, lLeg: 0, rLeg: 0 }, 'outBack'],
    ],
  },
};

// ---- Victory dances (looped by the winner, 2-3 s; each ends where it starts) ------------
// A beat is 0.3 s. `hop` bounces the whole body on the beat with a squash on landing and a stretch on the way up.
const hop = (stretch = 0.12) => ({ lift: 0.35, squash: stretch });
const land = { lift: 0, squash: -0.14, y: -0.05 };

// Boogie: fists pumping alternately over a bouncing step (the fallback of the animators' Dance clip).
export const BOOGIE = {
  keys: [
    [0, {}],
    [0.15, { ...hop(), lRaise: 2.5, lElbow: 0.4, lSpread: 0.5, rRaise: 0.3, rElbow: 2, twist: 0.25, head: -0.1 }, 'outQuad'],
    [0.3, { ...land, lRaise: 2.2, lSpread: 0.4, rRaise: 0.6, twist: 0.1, lLeg: 0.4, rLeg: -0.4 }, 'inQuad'],
    [0.45, { ...hop(), rRaise: 2.5, rElbow: 0.4, rSpread: 0.5, lRaise: 0.3, lElbow: 2, twist: -0.25, head: 0.1 }, 'outQuad'],
    [0.6, { ...land, rRaise: 2.2, rSpread: 0.4, lRaise: 0.6, twist: -0.1, lLeg: -0.4, rLeg: 0.4 }, 'inQuad'],
    [0.8, {}, 'outBack'],
  ],
};

// VIKING: both fists pound the chest, then a roar with the arms thrown wide.
export const CHEST_BEAT = {
  keys: [
    [0, {}],
    [0.12, { lean: -0.2, head: 0.3, squash: 0.08, lRaise: 0.9, rRaise: 0.9, lElbow: 2.5, rElbow: 2.5, lSpread: -0.45, rSpread: -0.45 }, 'outQuad'],
    [0.2, { lean: 0.15, head: -0.1, squash: -0.14, lRaise: 0.75, rRaise: 0.75, lElbow: 2.5, rElbow: 2.5, lSpread: -0.55, rSpread: -0.55 }, 'inQuad'],
    [0.32, { lean: -0.2, head: 0.3, squash: 0.08, lRaise: 0.9, rRaise: 0.9, lElbow: 2.5, rElbow: 2.5, lSpread: -0.45, rSpread: -0.45 }, 'outQuad'],
    [0.4, { lean: 0.15, head: -0.1, squash: -0.14, lRaise: 0.75, rRaise: 0.75, lElbow: 2.5, rElbow: 2.5, lSpread: -0.55, rSpread: -0.55 }, 'inQuad'],
    [0.6, { lean: -0.5, head: 0.7, squash: 0.15, lift: 0.3, lRaise: 1.6, rRaise: 1.6, lElbow: 0.3, rElbow: 0.3, lSpread: 1.3, rSpread: 1.3, lLeg: 0.4, rLeg: -0.4 }, 'outCubic'],
    [0.8, { lean: -0.4, head: 0.6, squash: 0.1, lRaise: 1.5, rRaise: 1.5, lElbow: 0.4, rElbow: 0.4, lSpread: 1.2, rSpread: 1.2 }, 'linear'],
    [1.05, {}, 'outBack'],
  ],
};

// PUNK: air guitar. The left arm holds the neck out front, the right strums, the head bangs.
const GUITAR = { lean: -0.3, lRaise: 1.35, lElbow: 0.35, lSpread: 0.25, rSpread: 0.15, lLeg: 0.5, rLeg: -0.5 };
export const AIR_GUITAR = {
  keys: [
    [0, {}],
    [0.15, { ...GUITAR, rRaise: 0.9, rElbow: 1.9, head: -0.35, twist: 0.2 }, 'outQuad'],
    [0.3, { ...GUITAR, rRaise: 0.3, rElbow: 1.5, head: 0.2, squash: -0.08, twist: 0.1 }, 'inOutSine'],
    [0.45, { ...GUITAR, rRaise: 0.9, rElbow: 1.9, head: -0.35, twist: 0.2 }, 'inOutSine'],
    [0.6, { ...GUITAR, rRaise: 0.3, rElbow: 1.5, head: 0.2, squash: -0.08, twist: 0.1 }, 'inOutSine'],
    [0.8, { ...GUITAR, lean: -0.55, head: 0.5, lift: 0.35, squash: 0.15, rRaise: 2.7, rElbow: 0.4, twist: 0.3 }, 'outCubic'], // the solo ends with a windmill
    [1, { ...GUITAR, lean: -0.1, squash: -0.15, y: -0.05, rRaise: 0.6, rElbow: 1.6 }, 'inQuad'],
    [1.2, {}, 'outBack'],
  ],
};

// KING BLOB: waves the crown-hand over its head, the other hand on the hip, swaying.
export const CROWN_WAVE = {
  keys: [
    [0, {}],
    [0.2, { rRaise: 2.7, rElbow: 0.5, rSpread: 0.5, lRaise: 0.2, lElbow: 2.3, lSpread: 0.7, twist: 0.2, lean: -0.1, head: 0.2, lift: 0.2, squash: 0.08 }, 'outCubic'],
    [0.5, { rRaise: 2.7, rElbow: 0.9, rSpread: 0.9, lRaise: 0.2, lElbow: 2.3, lSpread: 0.7, twist: -0.2, lean: -0.1, head: -0.2, squash: -0.08, y: -0.04 }, 'inOutSine'],
    [0.8, { rRaise: 2.7, rElbow: 0.5, rSpread: 0.5, lRaise: 0.2, lElbow: 2.3, lSpread: 0.7, twist: 0.2, lean: -0.1, head: 0.2, squash: 0.05 }, 'inOutSine'],
    [1.1, { rRaise: 2.7, rElbow: 0.9, rSpread: 0.9, lRaise: 0.2, lElbow: 2.3, lSpread: 0.7, twist: -0.2, lean: -0.1, head: -0.2, squash: -0.08, y: -0.04 }, 'inOutSine'],
    [1.4, {}, 'outBack'],
  ],
};

/** The dance a winner plays: `clip` from the animators' library (if any) over `move`, the keyframed version. */
export const DANCES = {
  champion: { clip: 'Dance', move: BOOGIE },
  viking: { clip: null, move: CHEST_BEAT },
  punk: { clip: null, move: AIR_GUITAR },
  king: { clip: 'Wave', move: CROWN_WAVE },
};
export const danceFor = (bossId) => DANCES[bossId] ?? { clip: 'Dance', move: BOOGIE };

// ---- Reactions (played additively on top of whatever is running) -----------------
export const REACTIONS = {
  hurt: {
    keys: [
      [0, {}],
      [0.05, { lean: -0.4, twist: 0.2, head: 0.5, squash: -0.12, dash: -0.25, lSpread: 0.6, rSpread: 0.4 }, 'outQuad'],
      [0.4, {}, 'outBack'],
    ],
  },
  // Heavy landing: squashes flat, springs back taller, settles.
  land: {
    keys: [
      [0, {}],
      [0.08, { squash: -0.28, y: -0.08, lean: 0.15 }, 'outQuad'],
      [0.3, { squash: 0.1 }, 'outBack'],
      [0.5, {}, 'inOutSine'],
    ],
  },
  hurtBig: {
    keys: [
      [0, {}],
      [0.06, { lean: -0.7, twist: -0.3, head: 0.8, squash: -0.2, dash: -0.6, lift: 0.3, lSpread: 1, rSpread: 0.8, lRaise: -0.3, rRaise: -0.3 }, 'outQuad'],
      [0.6, {}, 'outBack'],
    ],
  },
};

// Knocked out: limbs flung wide while the boss flies down the bonus ladder.
export const KNOCKED_OUT = {
  keys: [
    [0, {}],
    [0.3, { lean: -0.5, head: 0.9, squash: 0.1, lRaise: 2.6, rRaise: 2.2, lSpread: 1.4, rSpread: 1.3, lElbow: 0.3, rElbow: 0.6, lLeg: 0.9, rLeg: -0.6 }, 'outCubic'],
  ],
};

/** Attack numbers the fight rules need, derived from the move's clip. */
export function attackStats({ interval, move }) {
  const { hits, weight } = BOSS_MOVES[move];
  return { interval, strikes: hits.length, windup: hits[0], weight };
}
