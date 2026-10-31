// Generates terrain chunk vertex data off the main thread.
import { Heightfield } from './heightfield.js';
import { RoadSampler, carveHeight, WMAX, SHOULDER } from './roadSampler.js';
import { fbm2, perlin2 } from '../util/noise.js';

let hf, rs, biome;

const lin = (hex) => {
  const f = (v) => Math.pow(v / 255, 2.2);
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
};
// FOREST, PLANTATION, TEA, PADDY, GRASS, TOWN, LOWLAND, WATER
const BC = [0x2c4520, 0x3f5a25, 0x739c34, 0x7fa83a, 0x8d9650, 0x5d6a3a, 0x4b6828, 0x3c4a34].map(lin);
const LATERITE = lin(0x9a4c2c);
const DIRT = lin(0x86593b);
const ROCK = lin(0x605a50);
const VERGE = lin(0x55782c);
const MOSS = lin(0x3d5a26);

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'init') {
    hf = new Heightfield(m.meta, m.heights);
    rs = new RoadSampler(hf, m.seg);
    biome = m.biome;
    self.postMessage({ type: 'ready' });
    return;
  }
  if (m.type === 'chunk') {
    const out = buildGrid(m.x0, m.z0, m.size / m.segs, m.segs + 1, m.segs + 1, true);
    out.id = m.id;
    out.type = 'chunk';
    self.postMessage(out, [out.pos.buffer, out.nor.buffer, out.col.buffer, out.mask.buffer]);
  }
  if (m.type === 'far') {
    const step = m.step;
    const nx = Math.floor((hf.maxX - hf.minX) / step) + 1;
    const nz = Math.floor((hf.maxZ - hf.minZ) / step) + 1;
    const out = buildGrid(hf.minX, hf.minZ, step, nx, nz, false);
    out.id = m.id; out.type = 'far'; out.nx = nx; out.nz = nz;
    self.postMessage(out, [out.pos.buffer, out.nor.buffer, out.col.buffer, out.mask.buffer]);
  }
};

function sampleGround(x, z) {
  const n = hf.natural(x, z);
  const q = rs.nearest(x, z, 40);
  if (!q) return [n, 99, -1, n];
  return [carveHeight(n, q.e, q.h, q.cls), q.e, q.cls, n];
}

function buildGrid(x0, z0, step, nx, nz, skirts) {
  // Heights with a one-vertex border for normals.
  const W = nx + 2, H = nz + 2;
  const hts = new Float32Array(W * H);
  const roadE = new Float32Array(nx * nz);
  const roadC = new Int8Array(nx * nz);
  const nat = new Float32Array(nx * nz);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = x0 + (i - 1) * step, z = z0 + (j - 1) * step;
      const inner = i > 0 && j > 0 && i <= nx && j <= nz;
      if (inner) {
        const [h, e, cls, n] = sampleGround(x, z);
        hts[j * W + i] = h;
        const k = (j - 1) * nx + (i - 1);
        roadE[k] = e; roadC[k] = cls; nat[k] = n;
      } else hts[j * W + i] = rs.height(x, z);
    }

  const skirtCount = skirts ? 2 * nx + 2 * nz : 0;
  const total = nx * nz + skirtCount;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const mask = new Float32Array(total * 3);

  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * step, z = z0 + j * step;
      const hc = hts[(j + 1) * W + i + 1];
      const hl = hts[(j + 1) * W + i], hr = hts[(j + 1) * W + i + 2];
      const hu = hts[j * W + i + 1], hd = hts[(j + 2) * W + i + 1];
      let nxv = (hl - hr) / (2 * step), nzv = (hu - hd) / (2 * step);
      const inv = 1 / Math.sqrt(nxv * nxv + 1 + nzv * nzv);
      nor[k * 3] = nxv * inv; nor[k * 3 + 1] = inv; nor[k * 3 + 2] = nzv * inv;
      const slope = Math.sqrt(nxv * nxv + nzv * nzv);

      const e = roadE[k], cls = roadC[k];
      let y = hc;
      // biome weights (bilinear over the 20 m grid)
      let wb = biomeWeights(x, z);
      if (wb.water > 0) y -= 2.5 * wb.water;
      if (cls >= 0 && e <= 0.05) y -= 0.22; // tuck under asphalt ribbon
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;

      const c = colourAt(x, z, hc, slope, e, cls, nat[k], wb);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      const nearRoad = cls >= 0 ? Math.min(1, Math.max(0, (e - 3) / 6)) : 1;
      mask[k * 3] = wb.tea * nearRoad * Math.max(0, 1 - slope * 1.2);
      mask[k * 3 + 1] = wb.paddy * nearRoad;
      // stone retaining wall where a highway sits on fill above the natural ground
      if (cls >= 0 && cls <= 1 && e > SHOULDER[cls] - 0.2 && nat[k] < hc - 1.2 && e < SHOULDER[cls] + 14) {
        mask[k * 3 + 2] = Math.min(1, Math.max(0, (slope - 0.7) * 2.5));
      }
    }

  if (skirts) {
    let k = nx * nz;
    const nm = nx * nz;
    const drop = step * 2 + 2;
    const edge = (i, j) => {
      const s = j * nx + i;
      pos[k * 3] = pos[s * 3]; pos[k * 3 + 1] = pos[s * 3 + 1] - drop; pos[k * 3 + 2] = pos[s * 3 + 2];
      for (let t = 0; t < 3; t++) { nor[k * 3 + t] = nor[s * 3 + t]; col[k * 3 + t] = col[s * 3 + t]; mask[k * 3 + t] = mask[s * 3 + t]; }
      k++;
    };
    for (let i = 0; i < nx; i++) edge(i, 0);
    for (let i = 0; i < nx; i++) edge(i, nz - 1);
    for (let j = 0; j < nz; j++) edge(0, j);
    for (let j = 0; j < nz; j++) edge(nx - 1, j);
  }
  return { pos, nor, col, mask };
}

const WB = { w: new Float32Array(8), tea: 0, paddy: 0, water: 0 };
function biomeWeights(x, z) {
  const gx = (x - hf.minX) / hf.cell, gz = (z - hf.minZ) / hf.cell;
  const c = Math.floor(gx), r = Math.floor(gz);
  const fx = gx - c, fz = gz - r;
  WB.w.fill(0);
  const add = (cc, rr, w) => {
    cc = Math.max(0, Math.min(hf.cols - 1, cc));
    rr = Math.max(0, Math.min(hf.rows - 1, rr));
    WB.w[biome[rr * hf.cols + cc]] += w;
  };
  add(c, r, (1 - fx) * (1 - fz)); add(c + 1, r, fx * (1 - fz));
  add(c, r + 1, (1 - fx) * fz); add(c + 1, r + 1, fx * fz);
  WB.tea = WB.w[2]; WB.paddy = WB.w[3]; WB.water = WB.w[7];
  return WB;
}

function colourAt(x, z, h, slope, e, cls, natural, wb) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < 8; i++) {
    const w = wb.w[i];
    if (!w) continue;
    r += BC[i][0] * w; g += BC[i][1] * w; b += BC[i][2] * w;
  }
  // large-scale variation
  const v = fbm2(x / 90, z / 90, 3, 31);
  const v2 = perlin2(x / 23, z / 23, 41);
  const k = 0.82 + v * 0.45 + v2 * 0.12;
  r *= k; g *= k * (1 + v * 0.08); b *= k;

  // exposed rock on cliffs away from roads
  if (slope > 0.85) {
    const t = Math.min(1, (slope - 0.85) * 1.6) * (0.55 + 0.45 * perlin2(x / 15, z / 15, 7));
    r = mix(r, ROCK[0], t); g = mix(g, ROCK[1], t); b = mix(b, ROCK[2], t);
  }

  if (cls >= 0) {
    const sh = SHOULDER[cls];
    if (e < sh + 0.5) {
      const t = 0.75 + 0.25 * perlin2(x / 3, z / 3, 3);
      r = DIRT[0] * t; g = DIRT[1] * t; b = DIRT[2] * t;
    } else {
      const diff = Math.abs(natural - h);
      const Wd = Math.min(WMAX[cls], diff * 0.95 + 3);
      if (cls <= 1 && natural > h + 5 && e < sh + Wd && slope > 0.9) {
        // tall cutting in the ghat: dark weathered rock streaked with moss
        const moss = Math.max(0, perlin2(x / 5, z / 5, 17) * 1.4);
        const t = Math.min(1, (slope - 0.9) * 2);
        const rk = 0.7 + 0.3 * perlin2(x / 2, h / 2, 23);
        r = mix(r, mix(ROCK[0] * rk, MOSS[0], moss * 0.6), t);
        g = mix(g, mix(ROCK[1] * rk, MOSS[1], moss * 0.6), t);
        b = mix(b, mix(ROCK[2] * rk, MOSS[2], moss * 0.6), t);
      } else if (e < sh + Wd && slope > 0.45 && diff > 1.2) {
        // road cutting in red laterite near the road, overgrown by moss and ferns higher up
        const up = Math.min(1, Math.max(0, (e - sh - 4) / 8));
        const moss = Math.min(1, Math.max(0, perlin2(x / 6, z / 6, 13) + 0.1) + up);
        const t = Math.min(1, (slope - 0.45) * 2.2);
        r = mix(r, mix(LATERITE[0], MOSS[0], moss), t);
        g = mix(g, mix(LATERITE[1], MOSS[1], moss), t);
        b = mix(b, mix(LATERITE[2], MOSS[2], moss), t);
      } else if (e < sh + 5) {
        const t = 1 - (e - sh - 0.5) / 4.5;
        r = mix(r, VERGE[0], t * 0.6); g = mix(g, VERGE[1], t * 0.6); b = mix(b, VERGE[2], t * 0.6);
      }
    }
  }
  return [r, g, b];
}

const mix = (a, b, t) => a + (b - a) * t;
