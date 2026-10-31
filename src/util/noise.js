// Deterministic hashing, RNG and gradient noise used for terrain detail and object placement.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashInt(x, z, seed = 0) {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

export const hash01 = (x, z, seed = 0) => hashInt(x, z, seed) / 4294967296;

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(ix, iz, seed, dx, dz) {
  const a = (hashInt(ix, iz, seed) & 1023) * ((Math.PI * 2) / 1024);
  return Math.cos(a) * dx + Math.sin(a) * dz;
}

/** 2D Perlin noise, roughly in [-0.7, 0.7]. */
export function perlin2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fade(fx), v = fade(fz);
  const a = grad(ix, iz, seed, fx, fz);
  const b = grad(ix + 1, iz, seed, fx - 1, fz);
  const c = grad(ix, iz + 1, seed, fx, fz - 1);
  const d = grad(ix + 1, iz + 1, seed, fx - 1, fz - 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function fbm2(x, z, octaves = 4, seed = 0) {
  let sum = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += perlin2(x * f, z * f, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
