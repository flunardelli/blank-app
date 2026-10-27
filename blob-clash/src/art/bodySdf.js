// Continuous jelly bodies from simple parts, independent of three.js so they can be unit tested.
//
// A body is a list of parts (capsules and ellipsoids), each owned by a bone. Their distance fields are
// blended with an exponential smooth-minimum, so shoulders, hips and drips melt into one surface with
// no seams. `polygonize` turns that field into a triangle mesh (surface nets) and `skinWeights` weights
// every vertex to the bones whose parts are close to it, which is what lets an elbow bend like gelatin.

// ---- Distance fields (negative inside) --------------------------------------------
function capsuleDistance({ a, b, r }, x, y, z) {
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;
  const [dx, dy, dz] = [bx - ax, by - ay, bz - az];
  const [px, py, pz] = [x - ax, y - ay, z - az];
  const t = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1)));
  const [ex, ey, ez] = [px - dx * t, py - dy * t, pz - dz * t];
  return Math.sqrt(ex * ex + ey * ey + ez * ez) - r;
}

// Ellipsoid distance estimate (exact on the surface, a good bound near it).
function ellipsoidDistance({ c, radii }, x, y, z) {
  const [rx, ry, rz] = radii;
  const [qx, qy, qz] = [(x - c[0]) / rx, (y - c[1]) / ry, (z - c[2]) / rz];
  const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  const k1 = Math.sqrt((qx / rx) ** 2 + (qy / ry) ** 2 + (qz / rz) ** 2);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

export function partDistance(part, x, y, z) {
  return part.type === 'capsule' ? capsuleDistance(part, x, y, z) : ellipsoidDistance(part, x, y, z);
}

/** Smooth union of all parts: `blend` is how far (rig units) neighbouring parts melt into each other. */
export function bodyField(parts, blend) {
  const distances = new Float64Array(parts.length);
  // Beyond this reach from every part the blend cannot dip below zero, so those points skip the maths.
  const reach = blend * Math.log(parts.length) + 0.01;
  const boxes = parts.map((part) => partBounds([part], reach));
  return (x, y, z) => {
    let near = false;
    for (const { min, max } of boxes) {
      if (x > min[0] && x < max[0] && y > min[1] && y < max[1] && z > min[2] && z < max[2]) { near = true; break; }
    }
    if (!near) return reach;
    let nearest = Infinity;
    for (let i = 0; i < parts.length; i++) {
      distances[i] = partDistance(parts[i], x, y, z);
      if (distances[i] < nearest) nearest = distances[i];
    }
    let sum = 0;
    for (let i = 0; i < parts.length; i++) sum += Math.exp(-(distances[i] - nearest) / blend);
    return nearest - blend * Math.log(sum);
  };
}

export function partBounds(parts, margin = 0) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (point, reach) => point.forEach((v, i) => {
    min[i] = Math.min(min[i], v - reach[i] - margin);
    max[i] = Math.max(max[i], v + reach[i] + margin);
  });
  for (const part of parts) {
    if (part.type === 'capsule') {
      grow(part.a, [part.r, part.r, part.r]);
      grow(part.b, [part.r, part.r, part.r]);
    } else {
      grow(part.c, part.radii);
    }
  }
  return { min, max };
}

// ---- Surface nets ------------------------------------------------------------------
// Cell corners and the 12 edges between them, as pairs of corner indices.
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Triangulates the zero level of `field` inside `bounds` with square cells of side `cell`.
 * Returns smooth normals taken from the field's gradient. Triangles face outwards.
 */
export function polygonize(field, { min, max }, cell) {
  const dims = min.map((lo, i) => Math.ceil((max[i] - lo) / cell) + 1);
  const [nx, ny, nz] = dims;
  const at = (i, j, k) => i + nx * (j + ny * k);
  const values = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        values[at(i, j, k)] = field(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
      }
    }
  }

  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellAt = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions = [];
  const corner = new Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          corner[c] = values[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
          if (corner[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        // The vertex sits at the mean of the points where the surface crosses the cell's edges.
        let [sx, sy, sz, n] = [0, 0, 0, 0];
        for (const [e0, e1] of EDGES) {
          const [v0, v1] = [corner[e0], corner[e1]];
          if ((v0 < 0) === (v1 < 0)) continue;
          const t = v0 / (v0 - v1);
          sx += CORNERS[e0][0] + (CORNERS[e1][0] - CORNERS[e0][0]) * t;
          sy += CORNERS[e0][1] + (CORNERS[e1][1] - CORNERS[e0][1]) * t;
          sz += CORNERS[e0][2] + (CORNERS[e1][2] - CORNERS[e0][2]) * t;
          n++;
        }
        cellVertex[cellAt(i, j, k)] = positions.length / 3;
        positions.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }
    }
  }

  // Every grid edge the surface crosses becomes a quad through the four cells around it.
  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    indices.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const here = values[at(i, j, k)] < 0;
        if (values[at(i + 1, j, k)] < 0 !== here) {
          quad(cellVertex[cellAt(i, j - 1, k - 1)], cellVertex[cellAt(i, j, k - 1)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j - 1, k)], !here);
        }
        if (values[at(i, j + 1, k)] < 0 !== here) {
          quad(cellVertex[cellAt(i - 1, j, k - 1)], cellVertex[cellAt(i - 1, j, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j, k - 1)], !here);
        }
        if (values[at(i, j, k + 1)] < 0 !== here) {
          quad(cellVertex[cellAt(i - 1, j - 1, k)], cellVertex[cellAt(i, j - 1, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i - 1, j, k)], !here);
        }
      }
    }
  }

  const normals = new Float32Array(positions.length);
  const h = cell * 0.5;
  for (let v = 0; v < positions.length; v += 3) {
    const [x, y, z] = [positions[v], positions[v + 1], positions[v + 2]];
    const gx = field(x + h, y, z) - field(x - h, y, z);
    const gy = field(x, y + h, z) - field(x, y - h, z);
    const gz = field(x, y, z + h) - field(x, y, z - h);
    const length = Math.hypot(gx, gy, gz) || 1;
    normals.set([gx / length, gy / length, gz / length], v);
  }
  return { positions: new Float32Array(positions), normals, indices: new Uint32Array(indices) };
}

// ---- Skin weights ------------------------------------------------------------------
/**
 * For every point, weights on the bones whose parts are nearest to it. A point on a bone's own part
 * has weight 1 for that bone; `softness` (rig units) is how far the influence of a neighbouring bone
 * reaches, i.e. how wide the gelatin bend around a joint is. Returns `influences` bones per point.
 */
export function skinWeights(parts, boneNames, positions, { softness, influences = 4 }) {
  const count = positions.length / 3;
  const indices = new Uint16Array(count * influences);
  const weights = new Float32Array(count * influences);
  const owners = boneNames.map((name) => parts.filter((part) => part.bone === name));
  const nearest = new Float64Array(boneNames.length);
  for (let v = 0; v < count; v++) {
    const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    let closest = Infinity;
    owners.forEach((own, b) => {
      nearest[b] = Infinity;
      for (const part of own) nearest[b] = Math.min(nearest[b], partDistance(part, x, y, z));
      closest = Math.min(closest, nearest[b]);
    });
    const ranked = [...nearest.keys()]
      .map((b) => ({ b, w: Number.isFinite(nearest[b]) ? Math.exp(-(nearest[b] - closest) / softness) : 0 }))
      .sort((p, q) => q.w - p.w)
      .slice(0, influences);
    const total = ranked.reduce((sum, { w }) => sum + w, 0);
    ranked.forEach(({ b, w }, slot) => {
      indices[v * influences + slot] = b;
      weights[v * influences + slot] = w / total;
    });
  }
  return { indices, weights };
}
