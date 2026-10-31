// Real places on the Wayanad map: depots for jobs, fuel stations (from OSM),
// the NH766 ghat route with its numbered hairpin bends.
import { SPEC } from './roads.js';

export const DEPOTS = [
  { id: 'adivaram', name: 'Adivaram Goods Yard', ml: 'അടിവാരം ഗുഡ്സ് യാർഡ്', town: 'Adivaram', at: [-3532, 6637], types: ['trunk'] },
  { id: 'lakkidi', name: 'Lakkidi Spice Traders', ml: 'ലക്കിടി സ്പൈസസ്', town: 'Lakkidi', at: [-2688, 2701], types: ['trunk'] },
  { id: 'vythiri', name: 'Vythiri Market', ml: 'വൈത്തിരി മാർക്കറ്റ്', town: 'Vythiri', at: [-663, -1226], types: ['trunk'] },
  { id: 'chundale', name: 'Chundale Tea Factory', ml: 'ചുണ്ടേൽ ടീ ഫാക്ടറി', town: 'Chundale', at: [1542, -3210], types: ['trunk', 'primary', 'secondary'] },
  { id: 'pozhuthana', name: 'Pozhuthana Estate', ml: 'പൊഴുതന എസ്റ്റേറ്റ്', town: 'Pozhuthana', at: [-2882, -4721], types: ['primary', 'secondary', 'tertiary'] },
  { id: 'kalpetta', name: 'Kalpetta Coffee Works', ml: 'കൽപ്പറ്റ കോഫി വർക്സ്', town: 'Kalpetta', at: [4124, -7218], types: ['trunk', 'primary'] },
];

/** Shortest trunk route (NH766) between two points, as a dense polyline with arc length. */
export function trunkRoute(net, from, to) {
  const nearestNode = ([x, z]) => {
    let best = -1, bd = Infinity;
    for (const n of net.nodes) {
      if (!n.edges.some((id) => net.edges[id].type === 'trunk')) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  };
  const saved = {};
  for (const k of Object.keys(SPEC)) { saved[k] = SPEC[k].cost; if (k !== 'trunk') SPEC[k].cost = 50; }
  const path = net.shortestPath(nearestNode(from), nearestNode(to));
  for (const k of Object.keys(SPEC)) SPEC[k].cost = saved[k];
  return pathToPolyline(path);
}

export function pathToPolyline(path) {
  const P = [];
  if (!path) return P;
  let s = 0;
  for (const { edge: e, dir } of path) {
    for (let k = 0; k < e.n; k++) {
      const i = dir > 0 ? k : e.n - 1 - k;
      const x = e.pts[i * 3], y = e.pts[i * 3 + 1], z = e.pts[i * 3 + 2];
      if (P.length) {
        const q = P[P.length - 1];
        const d = Math.hypot(x - q.x, z - q.z);
        if (d < 0.01) continue;
        s += d;
      }
      P.push({ x, y, z, s, hw: e.hws ? e.hws[i] : e.hw });
    }
  }
  return P;
}

/** Find the n-th hairpins (heading reversal within ±35 m) on a polyline. */
export function findHairpins(P, maxH = 720) {
  const out = [];
  const head = (i) => Math.atan2(P[Math.min(P.length - 1, i + 1)].z - P[i].z, P[Math.min(P.length - 1, i + 1)].x - P[i].x);
  let j = 0, k = 0;
  for (let i = 0; i < P.length; i++) {
    while (P[j].s < P[i].s - 32) j++;
    while (k < P.length - 1 && P[k].s < P[i].s + 32) k++;
    let d = head(k) - head(j);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 2.5 && P[i].y < maxH) {
      const last = out[out.length - 1];
      if (last && P[i].s - last.s < 160) {
        if (Math.abs(d) > Math.abs(last.turn)) Object.assign(last, { i, s: P[i].s, x: P[i].x, z: P[i].z, y: P[i].y, turn: d });
      } else out.push({ i, s: P[i].s, x: P[i].x, z: P[i].z, y: P[i].y, turn: d });
    }
  }
  return out;
}

/**
 * Snap depots & fuel stations to the road network and add a flat loading bay
 * (pad) beside the road. Must run before the RoadSampler is built.
 */
export function buildPlaces(net, hf, pois) {
  const depots = [];
  for (const d of DEPOTS) {
    const spot = findSpot(net, hf, d.at, d.types, 600, 15);
    if (!spot) continue;
    depots.push({ ...d, ...spot, kind: 'depot' });
  }
  const fuel = [];
  for (const p of pois) {
    if (p.kind !== 'fuel') continue;
    const spot = findSpot(net, hf, p.p, ['trunk', 'primary'], 90, 12);
    if (!spot) continue;
    if (fuel.some((f) => Math.hypot(f.x - spot.x, f.z - spot.z) < 150)) continue;
    if (depots.some((f) => Math.hypot(f.x - spot.x, f.z - spot.z) < 60)) continue;
    fuel.push({ ...spot, kind: 'fuel', name: 'Fuel station' });
  }
  for (const p of [...depots, ...fuel]) {
    p.pad = net.addPad(p.p0[0], p.p0[1], p.h0, p.p1[0], p.p1[1], p.h1);
  }
  const viewpoints = pois.filter((p) => p.kind === 'viewpoint');
  return { depots, fuel, viewpoints };
}

function findSpot(net, hf, [tx, tz], types, radius, halfLen) {
  let best = null, bestScore = Infinity;
  for (const e of net.edges) {
    if (!types.includes(e.type) || e.len < halfLen * 2 + 30) continue;
    for (let i = 0; i < e.n; i += 2) {
      const x = e.pts[i * 3], z = e.pts[i * 3 + 2];
      const dist = Math.hypot(x - tx, z - tz);
      if (dist > radius) continue;
      const s = e.s[i];
      if (s < halfLen + 15 || s > e.len - halfLen - 15) continue;
      const a = net.sample(e, s - halfLen), b = net.sample(e, s + halfLen), c = net.sample(e, s);
      const straight = a.dx * b.dx + a.dz * b.dz;
      if (straight < 0.97) continue;
      for (const side of [1, -1]) {
        const lx = c.dz * side, lz = -c.dx * side; // side=1 -> left of edge direction
        const off = e.hw + 8.4;
        const px = c.x + lx * off, pz = c.z + lz * off;
        let diff = 0;
        for (const t of [-1, 0, 1]) for (const o of [0.5, 1]) {
          diff += Math.abs(hf.base(px + c.dx * halfLen * t + lx * 8 * (o - 0.5), pz + c.dz * halfLen * t + lz * 8 * (o - 0.5)) - c.y);
        }
        const score = diff / 6 + dist / 80 + (1 - straight) * 300 + (side < 0 ? 0.8 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = {
            x: px, z: pz, y: c.y, heading: Math.atan2(c.dx, c.dz), side, edge: e.id, s,
            roadX: c.x, roadZ: c.z, lx, lz, dx: c.dx, dz: c.dz, halfLen, halfWidth: 8,
            p0: [px - c.dx * halfLen, pz - c.dz * halfLen], p1: [px + c.dx * halfLen, pz + c.dz * halfLen],
            h0: a.y, h1: b.y,
            node: s < e.len / 2 ? e.a : e.b,
          };
        }
      }
    }
  }
  return best;
}

/** Is world point inside a pad's rectangle? */
export function inPad(p, x, z, margin = 0) {
  const rx = x - p.x, rz = z - p.z;
  const along = rx * p.dx + rz * p.dz;
  const across = rx * p.lx + rz * p.lz;
  return Math.abs(along) < p.halfLen + margin && Math.abs(across) < p.halfWidth + margin;
}
