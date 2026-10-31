// Classifies every 20 m height cell into a Wayanad land-cover type using OSM
// landuse where it exists, otherwise elevation/slope/valley-shape rules:
// ghat slopes = evergreen forest, plateau = coffee/areca/pepper plantations
// with tea estates and paddy (vayal) in the flat valley floors.
import { fbm2 } from '../util/noise.js';

export const BIOME = { FOREST: 0, PLANTATION: 1, TEA: 2, PADDY: 3, GRASS: 4, TOWN: 5, LOWLAND: 6, WATER: 7 };

// Known tea-estate belts (local metres): Chundale, Pozhuthana, Achoor, Vythiri east, Meppadi road.
const TEA_CENTRES = [
  [1500, -3300, 2200], [-2900, -4700, 2400], [-3700, -6100, 1800], [400, -1800, 1400], [3800, -3200, 2000],
  // estate on the hill above the last hairpins, seen from the ghat
  [-3150, 3250, 650],
];

export function buildBiomeGrid(hf, map) {
  const { cols, rows, cell, minX, minZ } = hf;
  const N = cols * rows;
  const grid = new Uint8Array(N).fill(255);

  // Local mean height (r = 8 cells) via summed-area table, for valley detection.
  const sat = new Float64Array((cols + 1) * (rows + 1));
  for (let r = 0; r < rows; r++) {
    let rowSum = 0;
    for (let c = 0; c < cols; c++) {
      rowSum += hf.h[r * cols + c];
      sat[(r + 1) * (cols + 1) + c + 1] = sat[r * (cols + 1) + c + 1] + rowSum;
    }
  }
  const mean = (c, r, k) => {
    const c0 = Math.max(0, c - k), c1 = Math.min(cols, c + k + 1);
    const r0 = Math.max(0, r - k), r1 = Math.min(rows, r + k + 1);
    const s = sat[r1 * (cols + 1) + c1] - sat[r0 * (cols + 1) + c1] - sat[r1 * (cols + 1) + c0] + sat[r0 * (cols + 1) + c0];
    return s / ((c1 - c0) * (r1 - r0));
  };

  // Rasterise OSM polygons (scanline, even-odd).
  const fillPoly = (pts, value, onlyEmpty) => {
    if (pts.length < 3) return;
    let zMin = Infinity, zMax = -Infinity;
    for (const p of pts) { zMin = Math.min(zMin, p[1]); zMax = Math.max(zMax, p[1]); }
    const r0 = Math.max(0, Math.ceil((zMin - minZ) / cell)), r1 = Math.min(rows - 1, Math.floor((zMax - minZ) / cell));
    for (let r = r0; r <= r1; r++) {
      const z = minZ + r * cell;
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - minX) / cell)), c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - minX) / cell));
        for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          if (!onlyEmpty || grid[i] === 255) grid[i] = value;
        }
      }
    }
  };

  for (const lu of map.landuse) {
    const crop = lu.crop || '';
    let v = null;
    if (lu.type === 'forest' || lu.type === 'wood') v = crop.includes('tea') ? BIOME.TEA : BIOME.FOREST;
    else if (crop.includes('tea')) v = BIOME.TEA;
    else if (lu.type === 'orchard' || lu.type === 'plantation') v = BIOME.PLANTATION;
    else if (lu.type === 'grassland' || lu.type === 'meadow') v = BIOME.GRASS;
    else if (lu.type === 'residential' || lu.type === 'commercial' || lu.type === 'retail') v = BIOME.TOWN;
    if (v !== null) fillPoly(lu.pts, v, false);
  }
  for (const w of map.water) fillPoly(w, BIOME.WATER, false);

  // Building density -> town.
  const dens = new Uint16Array(N);
  for (const b of map.buildings) {
    const p = b.pts[0];
    const c = Math.round((p[0] - minX) / cell), r = Math.round((p[1] - minZ) / cell);
    for (let dr = -3; dr <= 3; dr++)
      for (let dc = -3; dc <= 3; dc++) {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) dens[rr * cols + cc]++;
      }
  }

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = minX + c * cell, z = minZ + r * cell;
      const h = hf.h[i];
      const slope = hf.slope(x, z, 20);
      const relief = h - mean(c, r, 8);
      const set = grid[i];
      // OSM farmland in a flat valley is paddy, on slopes plantation
      if (set === BIOME.PLANTATION && slope < 0.06 && relief < -3) { grid[i] = BIOME.PADDY; continue; }
      if (set !== 255) continue;
      if (dens[i] >= 10 && slope < 0.3) { grid[i] = BIOME.TOWN; continue; }
      if (h < 240) { grid[i] = slope > 0.35 ? BIOME.FOREST : BIOME.LOWLAND; continue; }
      if (h < 690) { grid[i] = slope < 0.1 && h > 560 ? BIOME.PLANTATION : BIOME.FOREST; continue; }
      if (h > 1180) {
        grid[i] = relief < -6 || fbm2(x / 400, z / 400, 2, 3) > 0.25 ? BIOME.FOREST : BIOME.GRASS;
        continue;
      }
      if (slope < 0.055 && relief < -4) { grid[i] = BIOME.PADDY; continue; }
      let tea = fbm2(x / 1300, z / 1300, 3, 11);
      for (const [tx, tz, rad] of TEA_CENTRES) {
        const d = Math.hypot(x - tx, z - tz);
        tea += 0.45 * Math.exp(-(d * d) / (rad * rad));
      }
      if (tea > 0.42 && slope < 0.5) { grid[i] = BIOME.TEA; continue; }
      const forest = fbm2(x / 700, z / 700, 3, 21) + (slope > 0.45 ? 0.3 : 0);
      grid[i] = forest > 0.33 ? BIOME.FOREST : BIOME.PLANTATION;
    }
  return grid;
}

export function biomeAt(hf, grid, x, z) {
  const c = Math.round((x - hf.minX) / hf.cell), r = Math.round((z - hf.minZ) / hf.cell);
  if (c < 0 || r < 0 || c >= hf.cols || r >= hf.rows) return BIOME.FOREST;
  return grid[r * hf.cols + c];
}
