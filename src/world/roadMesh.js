// Asphalt ribbons for every road edge, merged per 1 km tile and road kind.
import * as THREE from 'three';
import { roadTexture } from '../util/textures.js';

const TILE = 1000;
const KIND = { trunk: 'nh', primary: 'major', secondary: 'major', tertiary: 'minor', unclassified: 'minor', residential: 'minor', pad: 'pad' };
const TEXLEN = { nh: 7.5, major: 7.5, minor: 9, pad: 12 };
const ORDER = { pad: 0, minor: 1, major: 2, nh: 3 };

export function buildRoadMeshes(scene, net) {
  const mats = {};
  for (const k of Object.keys(TEXLEN)) {
    mats[k] = new THREE.MeshStandardMaterial({
      map: roadTexture(k),
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1 - ORDER[k],
      polygonOffsetUnits: -2 - ORDER[k] * 2,
    });
  }
  const buckets = new Map();
  for (const e of net.edges) {
    const kind = KIND[e.type];
    const p = e.pts;
    const tx = Math.floor(p[0] / TILE), tz = Math.floor(p[2] / TILE);
    const key = `${kind}:${tx},${tz}`;
    if (!buckets.has(key)) buckets.set(key, { kind, pos: [], uv: [], idx: [] });
    ribbon(buckets.get(key), e, kind);
  }
  const group = new THREE.Group();
  for (const b of buckets.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats[b.kind]);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.renderOrder = 1;
    group.add(m);
  }
  scene.add(group);
  return { group, mats };
}

function ribbon(b, e, kind) {
  const p = e.pts, n = e.n;
  const base = b.pos.length / 3;
  const lift = 0.03 + ORDER[kind] * 0.004;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = p[i1 * 3] - p[i0 * 3], tz = p[i1 * 3 + 2] - p[i0 * 3 + 2];
    const L = Math.hypot(tx, tz) || 1;
    tx /= L; tz /= L;
    const lx = tz, lz = -tx; // left normal
    const x = p[i * 3], y = p[i * 3 + 1] + lift, z = p[i * 3 + 2];
    const hw = e.hws ? e.hws[i] : e.hw;
    b.pos.push(x + lx * hw, y, z + lz * hw, x - lx * hw, y, z - lz * hw);
    const v = e.s[i] / TEXLEN[kind];
    b.uv.push(0, v, 1, v);
    if (i > 0) {
      const a = base + (i - 1) * 2;
      b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
}
