// Builds a smooth, height-consistent road graph from OpenStreetMap ways.
// Pure logic (no three.js) so it can be tested in Node.
import { CLASSES, SEG_STRIDE } from './roadSampler.js';

// `cost` multiplies edge length for lorry routing: the NH is always preferred and
// smaller roads are only used to reach places the highway doesn't.
export const SPEC = {
  // carriageway widths as on Wayanad roads: NH766 ~7 m two-lane, estate roads single-lane
  trunk: { w: 7.0, spacing: 2.5, speed: 55, traffic: true, cost: 1.0, widen: 3.6 },
  primary: { w: 6.4, spacing: 2.5, speed: 50, traffic: true, cost: 3, widen: 2.5 },
  secondary: { w: 5.6, spacing: 3, speed: 45, traffic: true, cost: 4, widen: 1.8 },
  tertiary: { w: 4.6, spacing: 3, speed: 40, traffic: true, cost: 6, widen: 1.2 },
  unclassified: { w: 3.6, spacing: 4, speed: 30, traffic: false, cost: 12, widen: 0.6 },
  residential: { w: 3.3, spacing: 4, speed: 25, traffic: false, cost: 15, widen: 0.4 },
  pad: { w: 16, spacing: 4, speed: 10, traffic: false, cost: 3 },
};

const MAX_GRADE = { trunk: 0.1, primary: 0.11, secondary: 0.13, tertiary: 0.15 };

const key = (p) => p[0] + ',' + p[1];

export class RoadNetwork {
  constructor(hf) {
    this.hf = hf;
    this.nodes = [];
    this.edges = [];
  }

  build(ways) {
    const usage = new Map();
    for (const w of ways) {
      w.pts = w.pts.filter((p, i) => i === 0 || key(p) !== key(w.pts[i - 1]));
      for (const p of w.pts) usage.set(key(p), (usage.get(key(p)) || 0) + 1);
    }
    const nodeOf = new Map();
    const getNode = (p) => {
      const k = key(p);
      let n = nodeOf.get(k);
      if (n === undefined) {
        n = this.nodes.length;
        nodeOf.set(k, n);
        this.nodes.push({ id: n, x: p[0], z: p[1], h: 0, edges: [] });
      }
      return n;
    };
    for (const w of ways) {
      if (w.pts.length < 2) continue;
      let cur = [w.pts[0]];
      for (let i = 1; i < w.pts.length; i++) {
        cur.push(w.pts[i]);
        const last = i === w.pts.length - 1;
        if (last || usage.get(key(w.pts[i])) > 1) {
          this.addEdge(getNode(cur[0]), getNode(cur[cur.length - 1]), cur, w);
          cur = [w.pts[i]];
        }
      }
    }
    this.finish();
  }

  addEdge(a, b, ctrl, w) {
    const type = SPEC[w.type] ? w.type : 'residential';
    const e = {
      id: this.edges.length,
      a, b, ctrl, type,
      cls: CLASSES.indexOf(type),
      hw: SPEC[type].w / 2,
      wayId: w.id,
      ref: w.ref || '',
      name: w.name || '',
      oneway: !!w.oneway,
    };
    this.edges.push(e);
    this.nodes[a].edges.push(e.id);
    if (b !== a) this.nodes[b].edges.push(e.id);
    return e;
  }

  /** Adds a flat-ish loading bay as a short wide pad edge (not connected to the graph). */
  addPad(x0, z0, h0, x1, z1, h1) {
    const e = {
      id: this.edges.length, a: -1, b: -1, type: 'pad', cls: CLASSES.indexOf('pad'),
      hw: SPEC.pad.w / 2, ref: '', name: '', ctrl: [[x0, z0], [x1, z1]],
      pts: new Float32Array([x0, h0, z0, x1, h1, z1]), len: Math.hypot(x1 - x0, z1 - z0), n: 2,
    };
    e.s = new Float32Array([0, e.len]);
    this.edges.push(e);
    return e;
  }

  finish() {
    const hf = this.hf;
    // Node heights from a small 2D average of the DEM.
    for (const n of this.nodes) {
      let s = hf.base(n.x, n.z);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        s += hf.base(n.x + Math.cos(a) * 14, n.z + Math.sin(a) * 14);
      }
      n.h = s / 7;
    }
    for (const e of this.edges) if (e.type !== 'pad') this.densify(e);
    for (const e of this.edges) if (e.type !== 'pad') this.profile(e);
  }

  /** Neighbour control point beyond the node, continuing the same road, for smooth tangents. */
  phantom(e, atStart) {
    const nodeId = atStart ? e.a : e.b;
    const node = this.nodes[nodeId];
    if (!node) return null;
    const here = atStart ? e.ctrl[0] : e.ctrl[e.ctrl.length - 1];
    const inner = atStart ? e.ctrl[1] : e.ctrl[e.ctrl.length - 2];
    let best = null, bestScore = -Infinity;
    for (const id of node.edges) {
      if (id === e.id) continue;
      const o = this.edges[id];
      if (o.type !== e.type && !(o.ref && o.ref === e.ref)) continue;
      const nb = o.a === nodeId ? o.ctrl[1] : o.ctrl[o.ctrl.length - 2];
      // prefer straightest continuation
      const ax = here[0] - inner[0], az = here[1] - inner[1];
      const bx = nb[0] - here[0], bz = nb[1] - here[1];
      const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) + 1e-9);
      const score = cos + (o.wayId === e.wayId ? 0.5 : 0);
      if (cos > 0.2 && score > bestScore) { bestScore = score; best = nb; }
    }
    return best;
  }

  densify(e) {
    const spacing = SPEC[e.type].spacing;
    const c = e.ctrl;
    const P = [this.phantom(e, true) || reflect(c[0], c[1]), ...c, this.phantom(e, false) || reflect(c[c.length - 1], c[c.length - 2])];
    const out = [c[0][0], c[0][1]];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(1, Math.ceil(L / spacing));
      for (let k = 1; k <= steps; k++) {
        const [x, z] = centripetal(p0, p1, p2, p3, k / steps);
        out.push(x, z);
      }
    }
    const n = out.length / 2;
    e.n = n;
    e.pts = new Float32Array(n * 3);
    e.s = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) s += Math.hypot(out[i * 2] - out[i * 2 - 2], out[i * 2 + 1] - out[i * 2 - 1]);
      e.pts[i * 3] = out[i * 2];
      e.pts[i * 3 + 2] = out[i * 2 + 1];
      e.s[i] = s;
    }
    e.len = s;
    this.widenBends(e);
  }

  /**
   * Real hairpins are widened on the outside so lorries can swing round.
   * Shift the centreline outward by half the widening and grow the half-width,
   * keeping the inner edge where OSM puts it.
   */
  widenBends(e) {
    const { n, pts } = e;
    e.hws = new Float32Array(n).fill(e.hw);
    const extra = SPEC[e.type].widen;
    if (!extra || n < 5) return;
    const raw = new Float32Array(n), side = new Float32Array(n);
    const span = Math.max(2, Math.round(12 / SPEC[e.type].spacing));
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - span), b = Math.min(n - 1, i + span), c = Math.max(0, Math.min(n - 1, i));
      if (b - a < 2) continue;
      const h1 = Math.atan2(pts[c * 3 + 2] - pts[a * 3 + 2], pts[c * 3] - pts[a * 3]);
      const h2 = Math.atan2(pts[b * 3 + 2] - pts[c * 3 + 2], pts[b * 3] - pts[c * 3]);
      let d = h2 - h1;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const k = Math.abs(d) / Math.max(1, e.s[b] - e.s[a]);
      raw[i] = Math.min(1, Math.max(0, (k - 1 / 70) * 24)) * extra;
      side[i] = Math.sign(d);
    }
    // smooth the widening along the road
    const sm = new Float32Array(n), R = Math.max(2, Math.round(14 / SPEC[e.type].spacing));
    for (let i = 0; i < n; i++) {
      let acc = 0, w = 0;
      for (let k = -R; k <= R; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        const g = 1 - Math.abs(k) / (R + 1);
        acc += raw[j] * g; w += g;
      }
      sm[i] = acc / w;
    }
    const keep = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = pts[b * 3] - pts[a * 3], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
      const L = Math.hypot(tx, tz) || 1;
      tx /= L; tz /= L;
      // d>0 (heading rotating x->z) is a right turn, so the outside is the left normal
      const s = side[i] || 0;
      const ox = tz * s, oz = -tx * s;
      // never move the junction ends, they must meet other roads
      const fade = Math.min(1, Math.min(e.s[i], e.len - e.s[i]) / 12);
      keep.push([pts[i * 3] + ox * sm[i] * 0.5 * fade, pts[i * 3 + 2] + oz * sm[i] * 0.5 * fade]);
      e.hws[i] = e.hw + sm[i] * 0.5 * fade;
    }
    for (let i = 0; i < n; i++) { pts[i * 3] = keep[i][0]; pts[i * 3 + 2] = keep[i][1]; }
  }

  profile(e) {
    const { n, pts } = e;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = this.hf.base(pts[i * 3], pts[i * 3 + 2]);
    const spacing = n > 1 ? e.len / (n - 1) : 1;
    const sigma = Math.max(1, 32 / spacing);
    const R = Math.ceil(sigma * 2.5);
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0, wsum = 0;
      for (let k = -R; k <= R; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        const w = Math.exp((-k * k) / (2 * sigma * sigma));
        acc += raw[j] * w; wsum += w;
      }
      sm[i] = acc / wsum;
    }
    const ha = this.nodes[e.a].h, hb = this.nodes[e.b].h;
    const da = ha - sm[0], db = hb - sm[n - 1];
    for (let i = 0; i < n; i++) {
      const t = e.len > 0 ? e.s[i] / e.len : 0;
      sm[i] += da * (1 - t) + db * t;
    }
    // Limit gradient like a real engineered road: average of the upper and lower
    // g-Lipschitz envelopes, then round off the vertical curves.
    const g = MAX_GRADE[e.type] ?? 0.14;
    const up = sm.slice(), lo = sm.slice();
    for (let i = 1; i < n; i++) {
      const ds = e.s[i] - e.s[i - 1];
      up[i] = Math.min(up[i], up[i - 1] + g * ds);
      lo[i] = Math.max(lo[i], lo[i - 1] - g * ds);
    }
    for (let i = n - 2; i >= 0; i--) {
      const ds = e.s[i + 1] - e.s[i];
      up[i] = Math.min(up[i], up[i + 1] + g * ds);
      lo[i] = Math.max(lo[i], lo[i + 1] - g * ds);
    }
    for (let i = 0; i < n; i++) raw[i] = (up[i] + lo[i]) / 2;
    const s2 = Math.max(1, 12 / spacing), R2 = Math.ceil(s2 * 2.5);
    for (let i = 0; i < n; i++) {
      let acc = 0, wsum = 0;
      for (let k = -R2; k <= R2; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        const w = Math.exp((-k * k) / (2 * s2 * s2));
        acc += raw[j] * w; wsum += w;
      }
      sm[i] = acc / wsum;
    }
    const ea = ha - sm[0], eb = hb - sm[n - 1];
    for (let i = 0; i < n; i++) {
      const t = e.len > 0 ? e.s[i] / e.len : 0;
      pts[i * 3 + 1] = sm[i] + ea * (1 - t) + eb * t;
    }
  }

  /** Flat segment array for RoadSampler. Lower class first so higher classes win ties. */
  exportSegments() {
    let count = 0;
    for (const e of this.edges) count += e.n - 1;
    const seg = new Float32Array(count * SEG_STRIDE);
    this.segEdge = new Int32Array(count);
    this.segLocal = new Int32Array(count);
    let k = 0;
    for (const e of this.edges) {
      e.segStart = k;
      for (let i = 0; i < e.n - 1; i++) {
        const o = k * SEG_STRIDE, p = e.pts;
        seg[o] = p[i * 3]; seg[o + 1] = p[i * 3 + 2]; seg[o + 2] = p[i * 3 + 1];
        seg[o + 3] = p[i * 3 + 3]; seg[o + 4] = p[i * 3 + 5]; seg[o + 5] = p[i * 3 + 4];
        seg[o + 6] = e.hws ? Math.max(e.hws[i], e.hws[i + 1]) : e.hw; seg[o + 7] = e.cls;
        this.segEdge[k] = e.id; this.segLocal[k] = i;
        k++;
      }
    }
    return seg;
  }

  /** Point + tangent at arc length s on edge. */
  sample(e, s, out = {}) {
    s = Math.max(0, Math.min(e.len, s));
    let lo = 0, hi = e.n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (e.s[mid] <= s) lo = mid; else hi = mid;
    }
    const L = e.s[hi] - e.s[lo] || 1e-6;
    const t = (s - e.s[lo]) / L;
    const p = e.pts, a = lo * 3, b = hi * 3;
    out.x = p[a] + (p[b] - p[a]) * t;
    out.y = p[a + 1] + (p[b + 1] - p[a + 1]) * t;
    out.z = p[a + 2] + (p[b + 2] - p[a + 2]) * t;
    const dx = p[b] - p[a], dz = p[b + 2] - p[a + 2];
    const dl = Math.hypot(dx, dz) || 1;
    out.dx = dx / dl; out.dz = dz / dl;
    out.grade = (p[b + 1] - p[a + 1]) / dl;
    return out;
  }

  /** Signed curvature-limited speed (m/s) looking ahead along an edge. */
  curvatureAt(e, s, dir) {
    const a = this.sample(e, s, {}), b = this.sample(e, s + 8 * dir, {});
    const cross = a.dx * b.dz - a.dz * b.dx;
    const dot = a.dx * b.dx + a.dz * b.dz;
    return Math.abs(Math.atan2(cross, dot)) / 8; // rad per metre
  }

  // ---------- routing ----------
  shortestPath(fromNode, toNode) {
    const N = this.nodes.length;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = new MinHeap();
    dist[fromNode] = 0;
    heap.push(0, fromNode);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (u === toNode) break;
      if (d > dist[u]) continue;
      for (const id of this.nodes[u].edges) {
        const e = this.edges[id];
        const v = e.a === u ? e.b : e.a;
        const nd = d + e.len * SPEC[e.type].cost;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = id; heap.push(nd, v); }
      }
    }
    if (dist[toNode] === Infinity) return null;
    const path = [];
    let u = toNode;
    while (u !== fromNode) {
      const e = this.edges[prev[u]];
      const from = e.a === u ? e.b : e.a;
      path.unshift({ edge: e, dir: e.a === from ? 1 : -1 });
      u = from;
    }
    return path;
  }
}

function reflect(p, q) {
  return [2 * p[0] - q[0], 2 * p[1] - q[1]];
}

function centripetal(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const lerp2 = (a, b, ta, tb) => {
    const u = (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const A1 = lerp2(p0, p1, t0, t1), A2 = lerp2(p1, p2, t1, t2), A3 = lerp2(p2, p3, t2, t3);
  const B1 = lerp2(A1, A2, t0, t2), B2 = lerp2(A2, A3, t1, t3);
  return lerp2(B1, B2, t1, t2);
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
