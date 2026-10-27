import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyField, partBounds, partDistance, polygonize, skinWeights } from '../src/art/bodySdf.js';
import { BOSS_BODY, CHAMPION_BODY } from '../src/art/bodySpecs.js';
import { CONFIG } from '../src/config.js';

const sphere = { bone: 'A', type: 'ellipsoid', c: [0, 0, 0], radii: [1, 1, 1] };

function signedVolume({ positions: p, indices: ix }) {
  let volume = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const [a, b, c] = [ix[i] * 3, ix[i + 1] * 3, ix[i + 2] * 3];
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return volume;
}

// A closed surface uses every edge exactly twice, once in each direction.
function openEdges({ indices: ix }) {
  const uses = new Map();
  for (let i = 0; i < ix.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const [from, to] = [ix[i + k], ix[i + ((k + 1) % 3)]];
      uses.set(`${from}>${to}`, (uses.get(`${from}>${to}`) ?? 0) + 1);
    }
  }
  return [...uses].filter(([edge, n]) => n !== 1 || !uses.has(edge.split('>').reverse().join('>'))).length;
}

test('part distances are negative inside and zero on the surface', () => {
  const capsule = { type: 'capsule', a: [0, 0, 0], b: [0, 2, 0], r: 0.5 };
  assert.ok(Math.abs(partDistance(capsule, 0.5, 1, 0)) < 1e-9);
  assert.ok(partDistance(capsule, 0, 1, 0) < 0);
  assert.ok(Math.abs(partDistance(capsule, 0, 2.5, 0)) < 1e-9); // the rounded end
  assert.ok(Math.abs(partDistance(sphere, 0, 1, 0)) < 1e-9);
  assert.ok(Math.abs(partDistance({ ...sphere, radii: [2, 1, 1] }, 2, 0, 0)) < 1e-9);
  assert.ok(partDistance(sphere, 3, 0, 0) > 1.9);
});

test('a sphere polygonizes into a closed, outward-facing surface of the right volume', () => {
  const mesh = polygonize(bodyField([sphere], 0.05), partBounds([sphere], 0.2), 0.1);
  assert.equal(openEdges(mesh), 0);
  const volume = signedVolume(mesh);
  assert.ok(volume > 0, 'triangles wind outwards');
  assert.ok(Math.abs(volume / ((4 / 3) * Math.PI) - 1) < 0.04, `volume ${volume}`);
  for (let v = 0; v < mesh.positions.length; v += 3) {
    const [x, y, z] = [mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2]];
    const dot = x * mesh.normals[v] + y * mesh.normals[v + 1] + z * mesh.normals[v + 2];
    assert.ok(dot > 0.95 * Math.hypot(x, y, z), 'normals point away from the centre');
  }
});

test('the closed-surface check notices a hole', () => {
  const mesh = polygonize(bodyField([sphere], 0.05), partBounds([sphere], 0.2), 0.2);
  assert.equal(openEdges({ indices: mesh.indices.slice(3) }) > 0, true);
});

test('overlapping parts melt into one surface with no seam', () => {
  const parts = [sphere, { ...sphere, bone: 'B', c: [1.2, 0, 0] }];
  const field = bodyField(parts, 0.1);
  const joint = field(0.6, 0.85, 0); // the groove between the two spheres is filled in by the blend
  assert.ok(joint < Math.min(partDistance(parts[0], 0.6, 0.85, 0), partDistance(parts[1], 0.6, 0.85, 0)));
  const mesh = polygonize(field, partBounds(parts, 0.2), 0.1);
  assert.equal(openEdges(mesh), 0);
});

test('skin weights sum to one and follow the nearest bone', () => {
  const parts = [
    { bone: 'A', type: 'capsule', a: [0, 0, 0], b: [0, 1, 0], r: 0.2 },
    { bone: 'B', type: 'capsule', a: [0, 1, 0], b: [0, 2, 0], r: 0.2 },
  ];
  const points = Float32Array.from([0.2, 0.5, 0, 0.2, 1.5, 0, 0.2, 1.0, 0]);
  const { indices, weights } = skinWeights(parts, ['A', 'B'], points, { softness: 0.05, influences: 2 });
  for (let p = 0; p < 3; p++) assert.ok(Math.abs(weights[p * 2] + weights[p * 2 + 1] - 1) < 1e-6);
  assert.equal(indices[0], 0);
  assert.ok(weights[0] > 0.99, 'low on the first bone is all first bone');
  assert.equal(indices[2], 1);
  assert.ok(weights[2] > 0.99);
  assert.ok(Math.abs(weights[4] - 0.5) < 0.05, 'at the joint both bones share the vertex');
});

for (const spec of [BOSS_BODY, CHAMPION_BODY]) {
  test(`${spec.name} body: bones are well formed and named like the RobotExpressive skeleton`, () => {
    const names = spec.joints.map((joint) => joint.name);
    assert.equal(new Set(names).size, names.length);
    spec.joints.forEach((joint, i) => {
      if (joint.parent) assert.ok(names.indexOf(joint.parent) < i, `${joint.name} comes after its parent`);
    });
    for (const bone of ['Body', 'Hips', 'Abdomen', 'Torso', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR',
      'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR']) assert.ok(names.includes(bone), bone);
    for (const part of spec.parts) assert.ok(names.includes(part.bone), `part of ${part.bone}`);
    const at = (name) => spec.joints.find((joint) => joint.name === name).pos;
    assert.ok(at('UpperArmL')[0] > 0 && at('UpperArmR')[0] < 0, 'L is the +x side');
    assert.ok(at('HandL')[1] < at('LowerArmL')[1] && at('LowerArmL')[1] < at('UpperArmL')[1], 'arms hang down');
  });

  test(`${spec.name} body: one closed skinned surface, every vertex fully weighted`, () => {
    const { blend, cell, softness, influences } = CONFIG.character;
    const mesh = polygonize(bodyField(spec.parts, blend), partBounds(spec.parts, 0.05), cell);
    assert.ok(mesh.positions.length / 3 > 3000 && mesh.positions.length / 3 < 20000, 'light enough for phones');
    assert.equal(openEdges(mesh), 0, 'no holes or seams');
    assert.ok(signedVolume(mesh) > 0.2);
    const { weights, indices } = skinWeights(spec.parts, spec.boneNames, mesh.positions, { softness, influences });
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      let sum = 0;
      for (let k = 0; k < influences; k++) {
        sum += weights[v * influences + k];
        assert.ok(indices[v * influences + k] < spec.boneNames.length);
      }
      assert.ok(Math.abs(sum - 1) < 1e-5);
    }
    let minY = Infinity;
    for (let v = 1; v < mesh.positions.length; v += 3) minY = Math.min(minY, mesh.positions[v]);
    assert.ok(Math.abs(minY) < 0.08, `feet stand on the floor (lowest point ${minY})`);
  });
}
