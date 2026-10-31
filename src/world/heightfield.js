import { fbm2, perlin2 } from '../util/noise.js';

/**
 * Real SRTM elevation grid (20 m cells) with bicubic sampling plus a little
 * procedural micro-relief so close-up ground doesn't look faceted.
 */
export class Heightfield {
  constructor(meta, int16) {
    const { cols, rows, cell, minX, minZ } = meta;
    Object.assign(this, { cols, rows, cell, minX, minZ });
    this.maxX = minX + (cols - 1) * cell;
    this.maxZ = minZ + (rows - 1) * cell;
    this.h = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) this.h[i] = int16[i] / 10;
  }

  at(c, r) {
    c = c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
    r = r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
    return this.h[r * this.cols + c];
  }

  /** Catmull-Rom bicubic interpolation of the raw DEM. */
  base(x, z) {
    const gx = (x - this.minX) / this.cell;
    const gz = (z - this.minZ) / this.cell;
    const c = Math.floor(gx), r = Math.floor(gz);
    const tx = gx - c, tz = gz - r;
    const col = (rr) => {
      const p0 = this.at(c - 1, rr), p1 = this.at(c, rr), p2 = this.at(c + 1, rr), p3 = this.at(c + 2, rr);
      return cubic(p0, p1, p2, p3, tx);
    };
    return cubic(col(r - 1), col(r), col(r + 1), col(r + 2), tz);
  }

  /** Natural ground: DEM + micro relief. */
  natural(x, z) {
    return this.base(x, z) + detail(x, z);
  }

  slope(x, z, d = 10) {
    const hx = this.base(x + d, z) - this.base(x - d, z);
    const hz = this.base(x, z + d) - this.base(x, z - d);
    return Math.sqrt(hx * hx + hz * hz) / (2 * d);
  }

  inside(x, z, margin = 0) {
    return x > this.minX + margin && x < this.maxX - margin && z > this.minZ + margin && z < this.maxZ - margin;
  }
}

function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

export function detail(x, z) {
  return fbm2(x / 110, z / 110, 3, 5) * 4.0 + perlin2(x / 13, z / 13, 9) * 0.35;
}
