// Procedural, seeded level generator. Output is plain data; rendering lives in levelView.js.
import { CONFIG, COLOR_NAMES } from './config.js';
import { createRng } from './rng.js';
import { bossDifficulty } from './rules.js';

function twoDistinctColors(rng) {
  const first = rng.pick(COLOR_NAMES);
  const second = rng.pick(COLOR_NAMES.filter((c) => c !== first));
  return [first, second];
}

function makeObstacle(rng, d, cfg) {
  const { lanes } = cfg.track;
  const ob = cfg.obstacle;
  if (rng.chance(0.5)) {
    return {
      kind: 'saw', d, radius: ob.sawRadius,
      amplitude: ob.sawAmplitude, speed: ob.sawSpeed, phase: rng.next() * Math.PI * 2,
    };
  }
  // A wall blocks two adjacent lanes and leaves the third one open.
  const start = rng.int(0, lanes.length - 2);
  const [a, b] = [lanes[start], lanes[start + 1]];
  return {
    kind: 'wall', d, x: (a + b) / 2,
    halfWidth: Math.abs(b - a) / 2 + ob.wallPadding, halfDepth: ob.wallDepth / 2,
  };
}

function makePickupRow(rng, d, colors, cfg) {
  const { lanes, laneJitter } = cfg.track;
  const { minMass, maxMass, rowFillChance } = cfg.pickup;
  return lanes
    .filter(() => rng.chance(rowFillChance))
    .map((laneX) => ({
      d,
      x: laneX + (rng.next() * 2 - 1) * laneJitter,
      color: rng.pick(colors),
      mass: rng.int(minMass, maxMass),
    }));
}

// Upper bound of what a player can gain in one segment: commit to one gate colour
// and take the heaviest pickup of that colour in every row.
function bestSegmentGain(rows, colors) {
  const gainFor = (color) => rows
    .map((row) => Math.max(0, ...row.filter((p) => p.color === color).map((p) => p.mass)))
    .reduce((sum, m) => sum + m, 0);
  return Math.max(...colors.map(gainFor));
}

export function generateLevel(level, cfg = CONFIG) {
  const rng = createRng(level * 9973 + 17);
  const { track } = cfg;
  const segments = 4 + Math.min(level, 6);
  const gates = [];
  const obstacles = [];
  const pickups = [];
  let bestMass = cfg.player.startMass;
  let d = track.introLength;

  for (let s = 0; s < segments; s++, d += track.segmentLength) {
    const [left, right] = twoDistinctColors(rng);
    gates.push({ d, left, right });

    const rowDistances = [];
    for (let rd = d + 6; rd < d + track.segmentLength - 4; rd += track.rowSpacing) rowDistances.push(rd);
    const obstacleRow = rng.int(1, rowDistances.length - 2);

    const rows = rowDistances.map((rd, i) => {
      if (i === obstacleRow) {
        obstacles.push(makeObstacle(rng, rd, cfg));
        return [];
      }
      return makePickupRow(rng, rd, [left, right], cfg);
    });
    pickups.push(...rows.flat());
    bestMass += bestSegmentGain(rows, [left, right]);
  }

  const bossMass = Math.max(cfg.player.startMass + 5, Math.round(bestMass * bossDifficulty(level, cfg.boss)));
  return {
    level,
    startColor: rng.pick(COLOR_NAMES),
    gates,
    obstacles,
    pickups: pickups.map((p, id) => ({ ...p, id })),
    boss: { d: d + track.bossGap, mass: bossMass },
    bestMass,
  };
}
