// Procedural canvas textures: asphalt with Indian NH markings, foliage atlas,
// Kerala building facades, clay roof tiles, signs, mist sprites.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function speckle(g, w, h, n, rnd, colours, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colours[Math.floor(rnd() * colours.length)];
    const s = size[0] + rnd() * (size[1] - size[0]);
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// ---------------- terrain detail ----------------
export function detailTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const rnd = mulberry32(7);
  // two channels of tileable value noise at different scales
  const layer = (cells) => {
    const v = [];
    for (let i = 0; i < cells * cells; i++) v.push(rnd());
    return (x, y) => {
      const fx = (x / S) * cells, fy = (y / S) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const at = (a, b) => v[((b % cells) * cells + (a % cells))];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    };
  };
  const a = layer(32), b = layer(64), c2 = layer(8), d = layer(16);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      img.data[i] = (a(x, y) * 0.5 + b(x, y) * 0.5) * 255;
      img.data[i + 1] = (c2(x, y) * 0.6 + d(x, y) * 0.4) * 255;
      img.data[i + 2] = rnd() * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, srgb: false });
}

// ---------------- roads ----------------
/** kind: 'nh' | 'major' | 'minor' | 'pad'. u across width, v along (texture covers `len` metres). */
export function roadTexture(kind) {
  const W = 256, H = 512;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(kind.length * 31 + 3);
  const base = kind === 'pad' ? '#77736a' : kind === 'minor' ? '#4e4b47' : '#3d3c3b';
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  speckle(g, W, H, 9000, rnd, ['#2e2d2c', '#4a4846', '#555250', '#353433', '#605d58'], [1, 2.5]);
  // repair patches + tyre polish
  for (let i = 0; i < 7; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(20,20,20,0.25)' : 'rgba(110,105,95,0.18)';
    g.fillRect(rnd() * W, rnd() * H, 20 + rnd() * 60, 20 + rnd() * 90);
  }
  if (kind !== 'pad') {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0.0, 'rgba(120,90,60,0.55)');
    grd.addColorStop(0.06, 'rgba(0,0,0,0)');
    grd.addColorStop(0.22, 'rgba(0,0,0,0.16)');
    grd.addColorStop(0.3, 'rgba(0,0,0,0)');
    grd.addColorStop(0.7, 'rgba(0,0,0,0)');
    grd.addColorStop(0.78, 'rgba(0,0,0,0.16)');
    grd.addColorStop(0.94, 'rgba(0,0,0,0)');
    grd.addColorStop(1.0, 'rgba(120,90,60,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }
  if (kind === 'nh' || kind === 'major') {
    g.fillStyle = kind === 'nh' ? 'rgba(235,235,225,0.9)' : 'rgba(225,225,215,0.6)';
    // edge lines
    g.fillRect(W * 0.045, 0, W * 0.022, H);
    g.fillRect(W * (1 - 0.067), 0, W * 0.022, H);
    if (kind === 'nh') {
      // ghat section of NH766: continuous yellow no-overtaking centre line
      g.fillStyle = 'rgba(236,190,40,0.92)';
      g.fillRect(W * 0.488, 0, W * 0.024, H);
    } else {
      // centre dash (3 m dash / 4.5 m gap on a 7.5 m tile => 40% of height)
      g.fillRect(W * 0.49, 0, W * 0.02, H * 0.4);
    }
    // wear on paint
    speckle(g, W, H, 900, rnd, [base, '#3a3938'], [1, 3]);
  }
  if (kind === 'pad') {
    g.fillStyle = 'rgba(240,190,30,0.9)';
    g.fillRect(4, 0, 8, H);
    g.fillRect(W - 12, 0, 8, H);
  }
  const t = tex(c, { repeat: true });
  return t;
}

// ---------------- foliage atlas ----------------
export const ATLAS = {
  broadleaf: [0, 0, 512, 512],
  frond: [512, 0, 1024, 256],
  banana: [512, 256, 1024, 512],
  fine: [0, 512, 512, 1024],
  bark: [512, 512, 768, 1024],
  shrub: [768, 512, 1024, 768],
  grass: [768, 768, 1024, 1024],
};
export function atlasUV(name) {
  const [x0, y0, x1, y1] = ATLAS[name];
  return [x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024];
}

export function foliageAtlas() {
  const [c, g] = canvas(1024, 1024);
  g.clearRect(0, 0, 1024, 1024);
  const rnd = mulberry32(42);
  const greens = ['#1f3a14', '#2a4a1a', '#355a20', '#3f6a26', '#4d7a2c', '#2e5219', '#5b8a34'];

  // broadleaf clump: overlapping leaf ellipses inside a lumpy disc
  const leaf = (x, y, len, wid, ang, colour) => {
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.fillStyle = colour;
    g.beginPath();
    g.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
    g.restore();
  };
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([256 + (rnd() - 0.5) * 260, 256 + (rnd() - 0.5) * 260, 70 + rnd() * 70]);
  for (let i = 0; i < 2600; i++) {
    const [bx, by, br] = blobs[i % blobs.length];
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * br;
    const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r;
    if (Math.hypot(x - 256, y - 256) > 240) continue;
    const shade = (y / 512) * 0.6 + rnd() * 0.4; // darker underneath
    leaf(x, y, 9 + rnd() * 8, 4 + rnd() * 3, rnd() * Math.PI, greens[Math.min(6, Math.floor((1 - shade) * 6 + rnd() * 1.5))]);
  }

  // palm frond: rachis left->right, leaflets hanging both sides
  {
    const [x0, y0, x1, y1] = ATLAS.frond;
    const cy = (y0 + y1) / 2;
    for (let i = 0; i < 160; i++) {
      const t = i / 160;
      const x = x0 + 10 + t * (x1 - x0 - 20);
      const L = (1 - Math.abs(t - 0.35) * 1.2) * 110 * (0.8 + rnd() * 0.3);
      g.strokeStyle = ['#4f7a26', '#5d8a2e', '#6c9632', '#3f6a1e'][i % 4];
      g.lineWidth = 3.2;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, cy);
        g.quadraticCurveTo(x + 20, cy + side * L * 0.5, x + 34, cy + side * L);
        g.stroke();
      }
    }
    g.strokeStyle = '#8a8a3a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(x0 + 6, cy); g.lineTo(x1 - 6, cy); g.stroke();
  }

  // banana leaf: broad, with midrib and wind tears
  {
    const [x0, y0, x1, y1] = ATLAS.banana;
    const cy = (y0 + y1) / 2;
    g.fillStyle = '#6fa035';
    g.beginPath();
    g.moveTo(x0 + 8, cy);
    g.bezierCurveTo(x0 + 150, y0 + 6, x1 - 120, y0 + 10, x1 - 6, cy);
    g.bezierCurveTo(x1 - 120, y1 - 10, x0 + 150, y1 - 6, x0 + 8, cy);
    g.fill();
    g.strokeStyle = 'rgba(40,70,20,0.5)';
    for (let i = 0; i < 70; i++) {
      const x = x0 + 30 + i * 6.5;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, cy); g.lineTo(x + 18, y0 + 14); g.moveTo(x, cy); g.lineTo(x + 18, y1 - 14); g.stroke();
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const x = x0 + 80 + rnd() * 380;
      g.lineWidth = 2 + rnd() * 2;
      g.beginPath(); g.moveTo(x, cy + 6); g.lineTo(x + 20, y1); g.stroke();
      g.beginPath(); g.moveTo(x + 30, cy - 6); g.lineTo(x + 50, y0); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#c8c870'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x0 + 8, cy); g.lineTo(x1 - 8, cy); g.stroke();
  }

  // fine foliage (silver oak / bamboo): many narrow leaves
  {
    const [x0, y0, x1, y1] = ATLAS.fine;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (let i = 0; i < 2600; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 225;
      const x = cx + Math.cos(a) * r * 0.85, y = cy + Math.sin(a) * r;
      g.strokeStyle = ['#2f4d1c', '#3e5f24', '#4f6f2c', '#5f7d36', '#6b7f45'][Math.floor(rnd() * 5)];
      g.lineWidth = 2;
      const ang = Math.PI / 2 + (rnd() - 0.5) * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * 14, y + Math.sin(ang) * 14); g.stroke();
    }
  }

  // bark
  {
    const [x0, y0, x1, y1] = ATLAS.bark;
    g.fillStyle = '#7a7166';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = ['#5d564d', '#8a8276', '#6b635a', '#9a9387', '#4b463f'][Math.floor(rnd() * 5)];
      g.fillRect(x0 + rnd() * 256, y0 + rnd() * 512, 2 + rnd() * 6, 20 + rnd() * 90);
    }
    // lichen
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(150,160,120,0.35)';
      g.beginPath(); g.arc(x0 + rnd() * 256, y0 + rnd() * 512, 4 + rnd() * 10, 0, 7); g.fill();
    }
  }

  // shrub (coffee): small glossy dark leaves, dense
  {
    const [x0, y0, x1, y1] = ATLAS.shrub;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 118;
      leaf(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95, 6 + rnd() * 3, 2.6 + rnd(), rnd() * 3.14,
        ['#16300f', '#1f3d14', '#28491a', '#335a20', '#3b6626'][Math.floor(rnd() * 5)]);
    }
    // a few red coffee cherries
    for (let i = 0; i < 25; i++) {
      g.fillStyle = rnd() < 0.5 ? '#a3241b' : '#c9452a';
      g.beginPath(); g.arc(cx + (rnd() - 0.5) * 180, cy + (rnd() - 0.5) * 180, 2.4, 0, 7); g.fill();
    }
  }

  // grass tuft
  {
    const [x0, y0, x1, y1] = ATLAS.grass;
    for (let i = 0; i < 140; i++) {
      const bx = x0 + 20 + rnd() * 216;
      const h = 90 + rnd() * 140;
      g.strokeStyle = ['#4f6d26', '#5f7d2e', '#6e8a36', '#7c8f40', '#40601e'][Math.floor(rnd() * 5)];
      g.lineWidth = 2 + rnd() * 2;
      g.beginPath(); g.moveTo(bx, y1); g.quadraticCurveTo(bx + (rnd() - 0.5) * 30, y1 - h * 0.6, bx + (rnd() - 0.5) * 70, y1 - h); g.stroke();
    }
  }
  const t = tex(c);
  t.generateMipmaps = true;
  return t;
}

// ---------------- buildings ----------------
/** 512x512 facade tile = one floor (3 m) x 4 m. White wall areas get tinted by vertex colours. */
export function facadeTexture(kind) {
  const [c, g] = canvas(512, 512);
  const rnd = mulberry32(kind === 'shop' ? 98 : 99);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 3000, rnd, ['#f0f0f0', '#e4e4e4', '#fafafa'], [1, 3]);
  if (kind === 'house') {
    const win = (x, y, w, h) => {
      g.fillStyle = '#5a3a22'; g.fillRect(x - 8, y - 8, w + 16, h + 16);
      g.fillStyle = '#1d2226'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(120,150,170,0.35)'; g.fillRect(x + 4, y + 4, w / 2 - 6, h - 8);
      g.strokeStyle = '#2b2b2b'; g.lineWidth = 3;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x + (w * i) / 5, y); g.lineTo(x + (w * i) / 5, y + h); g.stroke(); }
      // concrete sunshade (chajja)
      g.fillStyle = '#cfcfcf'; g.fillRect(x - 22, y - 32, w + 44, 14);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 22, y - 18, w + 44, 12);
    };
    win(70, 190, 150, 170);
    win(300, 190, 150, 170);
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 480, 512, 32);
  } else {
    g.fillStyle = '#3a3a3a'; g.fillRect(0, 150, 512, 362);
    g.fillStyle = '#9aa0a3';
    for (let y = 150; y < 290; y += 8) g.fillRect(14, y, 484, 6);
    g.fillStyle = '#20180f'; g.fillRect(14, 290, 484, 222);
    for (let i = 0; i < 45; i++) {
      g.fillStyle = ['#c43', '#e8b830', '#3a7', '#36c', '#eee', '#a52', '#d6d'][Math.floor(rnd() * 7)];
      g.fillRect(24 + rnd() * 450, 320 + rnd() * 170, 10 + rnd() * 26, 8 + rnd() * 24);
    }
    // sign band stays light so the vertex tint colours it
    g.fillStyle = '#ffffff'; g.fillRect(0, 18, 512, 112);
    g.fillStyle = 'rgba(0,0,0,0.78)';
    g.font = 'bold 46px "Nirmala UI", "Noto Sans Malayalam", sans-serif';
    const names = ['സ്റ്റോഴ്സ്  STORES', 'ബേക്കറി  BAKERY', 'ഹോട്ടൽ  HOTEL', 'ടെക്സ്റ്റൈൽസ്'];
    g.fillText(names[Math.floor(rnd() * names.length)], 24, 92);
  }
  // monsoon staining streaks
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 512;
    const grd = g.createLinearGradient(0, 0, 0, 260);
    grd.addColorStop(0, 'rgba(40,40,30,0.3)');
    grd.addColorStop(1, 'rgba(40,40,30,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 3 + rnd() * 14, 120 + rnd() * 160);
  }
  return tex(c, { repeat: true });
}

export function roofTileTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9c4a2e'; g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(5);
  for (let y = 0; y < 256; y += 16)
    for (let x = 0; x < 256; x += 20) {
      const off = (y / 16) % 2 ? 10 : 0;
      const grd = g.createLinearGradient(x + off, 0, x + off + 20, 0);
      const b = 0.75 + rnd() * 0.35;
      grd.addColorStop(0, `rgba(${110 * b},${45 * b},${28 * b},1)`);
      grd.addColorStop(0.5, `rgba(${185 * b},${85 * b},${55 * b},1)`);
      grd.addColorStop(1, `rgba(${100 * b},${40 * b},${25 * b},1)`);
      g.fillStyle = grd; g.fillRect(x + off, y, 19, 15);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + off, y + 13, 19, 3);
    }
  // black monsoon mould
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(25,25,20,0.18)';
    g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 8 + rnd() * 30, 0, 7); g.fill();
  }
  return tex(c, { repeat: true });
}

export function concreteTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#a7a39a'; g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(8);
  speckle(g, 256, 256, 4000, rnd, ['#9a968e', '#b3afa6', '#8d8981'], [1, 3]);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = 'rgba(30,30,25,0.18)';
    g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 26, 0, 7); g.fill();
  }
  return tex(c, { repeat: true });
}

// ---------------- signs & text ----------------
export function textTexture({ w = 512, h = 256, bg = '#fff', fg = '#000', lines = [], border = null, borderW = 12, font = 'bold 64px Arial' }) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = borderW; g.strokeRect(borderW / 2, borderW / 2, w - borderW, h - borderW); }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    const text = typeof ln === 'string' ? ln : ln.text;
    g.font = (typeof ln === 'object' && ln.font) || font;
    if (typeof ln === 'object' && ln.color) g.fillStyle = ln.color;
    g.fillText(text, w / 2, (h / (lines.length + 1)) * (i + 1));
    g.fillStyle = fg;
  });
  return tex(c);
}

export function cloudTexture() {
  const [c, g] = canvas(256, 256);
  const rnd = mulberry32(3);
  for (let i = 0; i < 40; i++) {
    const x = 128 + (rnd() - 0.5) * 120, y = 128 + (rnd() - 0.5) * 70, r = 30 + rnd() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  return tex(c);
}
