// Pure-JS spatial index over road centreline segments. Shared by the main
// thread (physics / placement queries) and the terrain worker (mesh carving),
// so both produce exactly the same ground.

export const CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'pad'];
// Max embankment / cutting width beyond the shoulder, per class.
export const WMAX = [34, 28, 22, 16, 12, 10, 14];
// Flat graded shoulder beyond the asphalt edge, per class.
export const SHOULDER = [1.3, 1.2, 1.0, 0.9, 0.6, 0.5, 0.6];
export const SEG_STRIDE = 8; // x0 z0 h0 x1 z1 h1 halfWidth class
const CELL = 24;

export function carveHeight(natural, e, hRoad, cls) {
  const sh = SHOULDER[cls];
  if (e <= sh) return hRoad;
  const diff = natural - hRoad;
  // highways get near-vertical masonry retaining walls on the valley side and
  // steep rock cuttings on the hill side; small roads get soft earth banks
  const W = cls <= 1
    ? Math.min(WMAX[cls], diff < 0 ? -diff * 0.32 + 1.2 : diff * 0.6 + 2)
    : Math.min(WMAX[cls], Math.abs(diff) * 0.95 + 3);
  const u = (e - sh) / W;
  if (u >= 1) return natural;
  return hRoad + diff * (u * u * (3 - 2 * u));
}

export class RoadSampler {
  constructor(hf, seg) {
    this.hf = hf;
    this.seg = seg;
    this.n = seg.length / SEG_STRIDE;
    this.x0 = hf.minX - 100;
    this.z0 = hf.minZ - 100;
    this.cols = Math.ceil((hf.maxX - hf.minX + 200) / CELL);
    this.rows = Math.ceil((hf.maxZ - hf.minZ + 200) / CELL);
    const counts = new Int32Array(this.cols * this.rows + 1);
    const visit = (fn) => {
      for (let i = 0; i < this.n; i++) {
        const o = i * SEG_STRIDE;
        const hw = seg[o + 6];
        const c0 = this.cx(Math.min(seg[o], seg[o + 3]) - hw), c1 = this.cx(Math.max(seg[o], seg[o + 3]) + hw);
        const r0 = this.cz(Math.min(seg[o + 1], seg[o + 4]) - hw), r1 = this.cz(Math.max(seg[o + 1], seg[o + 4]) + hw);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * this.cols + c, i);
      }
    };
    visit((cell) => counts[cell + 1]++);
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    this.start = counts;
    this.items = new Int32Array(counts[counts.length - 1]);
    const fill = counts.slice();
    visit((cell, i) => (this.items[fill[cell]++] = i));
    // scratch result for nearest()
    this.q = { e: Infinity, d: 0, h: 0, hw: 0, cls: 0, seg: -1, t: 0, dx: 0, dz: 0 };
  }

  cx(x) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.x0) / CELL)));
  }
  cz(z) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.z0) / CELL)));
  }

  /** Nearest road (by distance beyond its half-width) within radius r. Returns this.q or null. */
  nearest(x, z, r = 40) {
    const s = this.seg, q = this.q;
    q.e = Infinity; q.seg = -1;
    const c0 = this.cx(x - r), c1 = this.cx(x + r), r0 = this.cz(z - r), r1 = this.cz(z + r);
    for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++) {
        const cell = rr * this.cols + cc;
        for (let k = this.start[cell], end = this.start[cell + 1]; k < end; k++) {
          const i = this.items[k], o = i * SEG_STRIDE;
          const ax = s[o], az = s[o + 1], bx = s[o + 3], bz = s[o + 4];
          const vx = bx - ax, vz = bz - az;
          const L2 = vx * vx + vz * vz || 1e-9;
          let t = ((x - ax) * vx + (z - az) * vz) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + vx * t - x, pz = az + vz * t - z;
          const d = Math.sqrt(px * px + pz * pz);
          const e = d - s[o + 6];
          if (e < q.e) {
            q.e = e; q.d = d; q.seg = i; q.t = t;
            q.h = s[o + 2] + (s[o + 5] - s[o + 2]) * t;
            q.hw = s[o + 6]; q.cls = s[o + 7];
            const L = Math.sqrt(L2);
            q.dx = vx / L; q.dz = vz / L;
          }
        }
      }
    return q.seg >= 0 && q.e < r ? q : null;
  }

  /** Final ground height (terrain carved around roads). On asphalt returns exact road height. */
  height(x, z) {
    const n = this.hf.natural(x, z);
    const q = this.nearest(x, z, 36);
    if (!q) return n;
    return carveHeight(n, q.e, q.h, q.cls);
  }

  /** Height + surface info for wheels. */
  surface(x, z, out) {
    const n = this.hf.natural(x, z);
    const q = this.nearest(x, z, 36);
    if (!q) {
      out.h = n; out.onRoad = false; out.e = 99; out.cls = -1;
      return out;
    }
    out.h = carveHeight(n, q.e, q.h, q.cls);
    out.onRoad = q.e <= 0.15;
    out.e = q.e;
    out.cls = q.cls;
    return out;
  }
}
