// Kerala goods lorry modelled on the ubiquitous semi-forward-control medium
// truck (Tata SE / 1210 style): yellow cab with a big mesh grille, round lamps in
// the fender pods with painted "eyes", a striped under-run guard, an arched crown
// board with the owner's name in fat gold letters over a fan of painted feathers,
// floral door art, a wooden plank body with rope hooks, and red wheels.
// The cab interior is right-hand drive with leather-wrapped wheel, engine hump,
// long gear stick, quilted seat covers, marigold garland, framed picture and a
// little dashboard fan.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvas } from '../util/textures.js';
import { mulberry32 } from '../util/noise.js';
import { M, mats, paint, texMat, ctex, Parts, makeWheel, ML } from './kit.js';

export const LORRY_THEMES = [
  { seed: 1, cab: 0xf2c418, fender: 0x1a1a1a, bumper: 0x1e4fa0, crownBg: ['#0d3f8f', '#1b67c9'], letters: ['#ffe680', '#f2a400'], name: 'WAYANAD', plank: '#8a3a22', rail: '#1e4fa0', ml: 'വയനാട്' },
  { seed: 2, cab: 0xf5c21b, fender: 0xc8231c, bumper: 0xc8231c, crownBg: ['#b3141c', '#e2412a'], letters: ['#fff2a8', '#f5b700'], name: 'K.P. SONS', plank: '#6a4a2c', rail: '#c8231c', ml: 'കെ.പി. സൺസ്' },
  { seed: 3, cab: 0x1d4fb0, fender: 0x111111, bumper: 0xdedede, crownBg: ['#151515', '#3a3a3a'], letters: ['#ffffff', '#9fd2ff'], name: 'MALABAR', plank: '#2f3e66', rail: '#e8e8e8', ml: 'മലബാർ' },
  { seed: 4, cab: 0xf0b414, fender: 0xd23a1a, bumper: 0xd23a1a, crownBg: ['#1f6b34', '#2f9a4c'], letters: ['#fff7b0', '#ffcf2a'], name: 'CHURAM', plank: '#7a3820', rail: '#2f9a4c', ml: 'ചുരം' },
];

// ------------------------------------------------------------------ painted art
function crownArt(t) {
  const [c, g] = canvas(1024, 384);
  const grd = g.createLinearGradient(0, 0, 0, 384);
  grd.addColorStop(0, t.crownBg[1]); grd.addColorStop(1, t.crownBg[0]);
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 384);
  // gold piping + rivets around the edge
  g.strokeStyle = '#f2c84a'; g.lineWidth = 16; g.strokeRect(10, 10, 1004, 364);
  g.strokeStyle = '#7a4a10'; g.lineWidth = 4; g.strokeRect(22, 22, 980, 340);
  g.fillStyle = '#ffe9a0';
  for (let x = 40; x < 1000; x += 48) { g.beginPath(); g.arc(x, 16, 5, 0, 7); g.fill(); g.beginPath(); g.arc(x, 368, 5, 0, 7); g.fill(); }
  // fat 3D gold letters, the signature of Kerala lorry art
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 230;
  g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  while (g.measureText(t.name).width > 900 && size > 80) { size -= 8; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
  for (let d = 14; d > 0; d--) { g.fillStyle = d > 3 ? '#3a1f05' : '#000'; g.fillText(t.name, 512 + d * 0.8, 200 + d); }
  const lg = g.createLinearGradient(0, 200 - size / 2, 0, 200 + size / 2);
  lg.addColorStop(0, t.letters[0]); lg.addColorStop(0.55, t.letters[1]); lg.addColorStop(1, '#b06a00');
  g.fillStyle = lg; g.fillText(t.name, 512, 200);
  g.lineWidth = 6; g.strokeStyle = '#2a1500'; g.strokeText(t.name, 512, 200);
  // gloss band
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 110, 1024, 40); g.restore();
  return ctex(c);
}

function featherArt(seed) {
  const [c, g] = canvas(1024, 256);
  const rnd = mulberry32(seed + 70);
  g.clearRect(0, 0, 1024, 256);
  const cols = [['#ff5aa8', '#ffd1e8'], ['#2f7de0', '#bfe0ff'], ['#ffcf2a', '#fff6c0'], ['#e8361d', '#ffc3a8'], ['#22a35a', '#c8f2d2'], ['#9b4ad6', '#e8ccff']];
  // feathers fanning out from the centre flower
  for (let side of [-1, 1]) {
    for (let k = 0; k < 13; k++) {
      const a = (side < 0 ? Math.PI : 0) + side * (-0.06 + k * 0.034);
      const L = 500 - k * 14;
      const [c1, c2] = cols[(k + (side > 0 ? 3 : 0)) % cols.length];
      g.save();
      g.translate(512, 46); g.rotate(a);
      const lg = g.createLinearGradient(0, 0, L, 0);
      lg.addColorStop(0, c2); lg.addColorStop(0.5, c1); lg.addColorStop(1, c2);
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(30, 0);
      g.bezierCurveTo(L * 0.4, -30, L * 0.85, -24, L, 0);
      g.bezierCurveTo(L * 0.85, 24, L * 0.4, 30, 30, 0);
      g.fill();
      g.strokeStyle = 'rgba(40,20,10,0.55)'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, 0); g.lineTo(L - 10, 0); g.stroke();
      g.restore();
    }
  }
  // centre lotus
  g.save(); g.translate(512, 52);
  for (let i = 0; i < 10; i++) {
    g.rotate((Math.PI * 2) / 10);
    g.fillStyle = i % 2 ? '#ff6fb4' : '#ffd0e6';
    g.beginPath(); g.ellipse(0, -34, 16, 36, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#ffd400'; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.fill();
  g.restore();
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.5})`; g.beginPath(); g.arc(rnd() * 1024, rnd() * 200, 3, 0, 7); g.fill(); }
  return ctex(c);
}

function panelArt(seed, w = 512, h = 512, base = '#d8261e') {
  const [c, g] = canvas(w, h);
  const rnd = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const pal = ['#ffd21a', '#23a64f', '#1f6fd6', '#ff5aa8', '#ffffff', '#8a2be2', '#ff8a00'];
  // borders
  g.strokeStyle = '#ffd21a'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
  g.strokeStyle = '#1f6fd6'; g.lineWidth = 8; g.strokeRect(26, 26, w - 52, h - 52);
  // dotted inner border
  g.fillStyle = '#fff';
  for (let x = 40; x < w - 30; x += 18) { g.beginPath(); g.arc(x, 40, 3.5, 0, 7); g.fill(); g.beginPath(); g.arc(x, h - 40, 3.5, 0, 7); g.fill(); }
  // big mandala flower
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32;
  for (let ring = 0; ring < 3; ring++) {
    const n = 8 + ring * 4, r = R * (1 - ring * 0.3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.2;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.fillStyle = pal[(i + ring * 2) % pal.length];
      g.beginPath(); g.ellipse(0, -r * 0.6, r * 0.18, r * 0.45, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.stroke();
      g.restore();
    }
  }
  g.fillStyle = '#ffd21a'; g.beginPath(); g.arc(cx, cy, R * 0.18, 0, 7); g.fill();
  // leafy vines in the corners
  for (let k = 0; k < 4; k++) {
    const x = k % 2 ? w - 70 : 70, y = k < 2 ? 70 : h - 70;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#23a64f' : '#7ed957';
      g.beginPath(); g.ellipse(x + Math.cos(i) * 20, y + Math.sin(i) * 20, 14, 6, i, 0, 7); g.fill();
    }
    g.fillStyle = pal[k]; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill();
  }
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(30,15,5,${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
  return ctex(c);
}

function plankArt(t, rear = false, plate = '') {
  const [c, g] = canvas(1024, 256);
  const rnd = mulberry32(t.seed + (rear ? 9 : 0));
  // horizontal planks
  for (let i = 0; i < 5; i++) {
    const y = i * 46 + 8;
    g.fillStyle = t.plank; g.fillRect(0, y, 1024, 44);
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(rnd() * 1024, y + rnd() * 44, 30 + rnd() * 80, 2); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + 42, 1024, 3);
  }
  g.fillStyle = t.rail; g.fillRect(0, 0, 1024, 10);
  // painted bottom rail with dots
  g.fillStyle = t.rail; g.fillRect(0, 222, 1024, 34);
  g.fillStyle = '#ffd21a'; for (let x = 12; x < 1024; x += 24) { g.beginPath(); g.arc(x, 239, 5, 0, 7); g.fill(); }
  // vertical iron straps
  g.fillStyle = '#1a1a1a'; for (let x = 0; x <= 1024; x += 1024 / 6) g.fillRect(x - 6, 0, 12, 222);
  if (rear) {
    g.textAlign = 'center';
    g.fillStyle = '#ffd21a'; g.fillRect(250, 30, 524, 120);
    g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(250, 30, 524, 120);
    g.fillStyle = '#c0141c'; g.font = 'bold 62px Impact, "Arial Black", sans-serif'; g.fillText('HORN PLEASE', 512, 94);
    g.fillStyle = '#111'; g.font = 'bold 22px Arial'; g.fillText('USE DIPPER AT NIGHT', 512, 132);
    g.fillStyle = '#ffd400'; g.fillRect(400, 160, 224, 56);
    g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(400, 160, 224, 56);
    g.fillStyle = '#111'; g.font = 'bold 40px Arial'; g.fillText(plate, 512, 202);
    g.font = `bold 34px ${ML}`; g.fillStyle = '#fff'; g.fillText('ശുഭയാത്ര', 140, 120); g.fillText(t.ml, 884, 120);
  }
  return ctex(c);
}

function grilleArt(colour) {
  const [c, g] = canvas(256, 160);
  g.fillStyle = colour; g.fillRect(0, 0, 256, 160);
  g.fillStyle = 'rgba(20,14,4,0.85)';
  for (let y = 8; y < 152; y += 9) for (let x = 6 + ((y / 9) % 2) * 4; x < 250; x += 8) g.fillRect(x, y, 5, 5);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 156);
  return ctex(c);
}

function eyeArt() {
  const [c, g] = canvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(8, 34); g.quadraticCurveTo(64, -6, 120, 34); g.quadraticCurveTo(64, 62, 8, 34); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(64, 33, 15, 0, 7); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(4, 30); g.quadraticCurveTo(64, -14, 124, 30); g.stroke();
  return ctex(c);
}

function stripeArt() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = '#ffcf1a'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#d8231c';
  for (let x = -64; x < 576; x += 64) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 32, 64); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.fill(); }
  return ctex(c);
}

function plate2(text1, text2) {
  const [c, g] = canvas(256, 160);
  g.fillStyle = '#ffd400'; g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 154);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 64px Arial';
  g.fillText(text1, 128, 70); g.fillText(text2, 128, 140);
  return ctex(c);
}

// ------------------------------------------------------------------ interior art
function gaugeArt() {
  const [c, g] = canvas(512, 192);
  g.fillStyle = '#121212'; g.fillRect(0, 0, 512, 192);
  const dial = (x, y, r, max, label, red) => {
    g.fillStyle = '#050505'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = '#bbb'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#eee'; g.font = `${Math.round(r * 0.22)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (Math.PI * 1.5 * i) / 10;
      g.strokeStyle = red && i >= 9 ? '#e33' : '#ddd'; g.lineWidth = i % 2 ? 1.5 : 3;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke();
      if (i % 2 === 0) g.fillText(String(Math.round((max * i) / 10)), x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    }
    g.fillStyle = '#9ad'; g.font = `${Math.round(r * 0.16)}px Arial`; g.fillText(label, x, y + r * 0.45);
  };
  dial(130, 96, 82, 100, 'km/h');
  dial(382, 96, 82, 30, 'rpm x100', true);
  dial(256, 60, 34, 10, 'AIR', false);
  dial(256, 140, 34, 1, 'FUEL', false);
  // warning lamps
  [['#e33', 230], ['#3c3', 256], ['#fb0', 282]].forEach(([col, x]) => { g.fillStyle = col; g.beginPath(); g.arc(x, 182, 4, 0, 7); g.fill(); });
  return ctex(c);
}

function quiltArt(base = '#1b1b1b', line = '#5a5a5a') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 2;
  for (let i = -256; i < 512; i += 24) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke();
  }
  const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return t;
}

function fringeArt() {
  const [c, g] = canvas(512, 64);
  g.clearRect(0, 0, 512, 64);
  g.fillStyle = '#b3141c'; g.fillRect(0, 0, 512, 22);
  g.fillStyle = '#f2c84a'; g.fillRect(0, 20, 512, 5);
  for (let x = 0; x < 512; x += 32) {
    g.fillStyle = '#b3141c'; g.beginPath(); g.arc(x + 16, 25, 16, 0, Math.PI); g.fill();
    g.fillStyle = '#f2c84a'; g.beginPath(); g.arc(x + 16, 46, 4, 0, 7); g.fill();
    g.strokeStyle = '#f2c84a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 16, 40); g.lineTo(x + 16, 58); g.stroke();
  }
  return ctex(c);
}

function pictureArt() {
  const [c, g] = canvas(256, 320);
  const grd = g.createRadialGradient(128, 140, 10, 128, 140, 170);
  grd.addColorStop(0, '#ffe9b0'); grd.addColorStop(0.5, '#ff9a3a'); grd.addColorStop(1, '#6a1a40');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 320);
  // a lotus in a glowing halo (generic devotional-style picture)
  g.fillStyle = 'rgba(255,255,220,0.6)'; g.beginPath(); g.arc(128, 140, 80, 0, 7); g.fill();
  for (let i = 0; i < 12; i++) {
    g.save(); g.translate(128, 190); g.rotate(-Math.PI / 2 + (i - 5.5) * 0.22);
    g.fillStyle = i % 2 ? '#ff6fb4' : '#ffc1dd';
    g.beginPath(); g.ellipse(0, -50, 16, 52, 0, 0, 7); g.fill(); g.restore();
  }
  g.fillStyle = '#2f8a3a'; g.fillRect(0, 250, 256, 70);
  g.fillStyle = '#ffd400'; g.font = `bold 28px ${ML}`; g.textAlign = 'center'; g.fillText('ശുഭയാത്ര', 128, 295);
  return ctex(c);
}

function leatherTex() {
  const [c, g] = canvas(128, 32);
  g.fillStyle = '#6b3a22'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#d8b48a'; g.lineWidth = 1.5;
  for (let x = 0; x < 128; x += 6) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x + 3, 18); g.stroke(); }
  const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1);
  return t;
}

/** Arched board geometry (front face +z) with 0..1 UVs over its outline. */
function archGeometry(w, hSide, hMid, depth) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, hSide);
  s.quadraticCurveTo(0, hMid + (hMid - hSide), -w / 2, hSide); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 20 });
  g.translate(0, 0, -depth);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, p.getY(i) / hMid);
  return g;
}

/** Fender arch: half tube around a wheel. */
function archShell(r, width) {
  const g = new THREE.CylinderGeometry(r, r, width, 20, 1, true, -Math.PI / 2 - 0.2, Math.PI + 0.4);
  g.rotateZ(Math.PI / 2);
  return g;
}

// ------------------------------------------------------------------ the lorry
export function buildLorry(theme = LORRY_THEMES[0], plate = 'KL 12 B 4521', withInterior = true) {
  mats();
  const p = new Parts();
  const t = theme;
  const cab = paint(t.cab, 0.32);
  const fender = paint(t.fender, 0.45);
  const bumper = paint(t.bumper, 0.4);
  const crownMat = texMat(crownArt(t), { roughness: 0.35 });
  const featherMat = texMat(featherArt(t.seed), { transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  const doorArt = texMat(panelArt(t.seed, 512, 512, new THREE.Color(t.cab).getHexString() === 'f2c418' ? '#d8261e' : '#c8231c'));
  const sideArt = texMat(panelArt(t.seed + 5, 512, 512, '#1e4fa0'));
  const planks = texMat(plankArt(t), { roughness: 0.75 });
  const plate1 = plate.split(' ');
  const rearMat = texMat(plankArt(t, true, plate), { roughness: 0.75 });
  const grille = texMat(grilleArt('#' + new THREE.Color(t.cab).getHexString()), { roughness: 0.4 });
  const eye = texMat(eyeArt(), { transparent: true, alphaTest: 0.3 });
  const stripes = texMat(stripeArt(), { roughness: 0.5 });
  const wood = paint(0x6a4428, 0.85);

  // ---- chassis
  p.box(0.12, 0.25, 8.0, M.black, 0.46, 0.82, -0.3);
  p.box(0.12, 0.25, 8.0, M.black, -0.46, 0.82, -0.3);
  for (const z of [-3.9, -2.4, -0.8, 0.8, 2.2, 3.4]) p.box(1.0, 0.12, 0.12, M.black, 0, 0.82, z);

  // ---- front: bumper, under-run guard, plate
  p.rbox(2.44, 0.3, 0.24, 0.05, bumper, 0, 0.66, 3.84);
  p.box(2.3, 0.035, 0.02, M.chrome, 0, 0.73, 3.965);
  p.box(2.3, 0.035, 0.02, M.chrome, 0, 0.6, 3.965);
  p.box(2.3, 0.17, 0.06, stripes, 0, 0.34, 3.86);
  for (const s of [1, -1]) p.box(0.08, 0.3, 0.08, M.black, s * 0.6, 0.47, 3.83);
  p.plane(0.34, 0.21, texMat(plate2(plate1[0] + plate1[1], plate1.slice(2).join(''))), 0, 0.66, 3.963);

  // ---- cab front fascia with mesh grille and fender pods
  p.rbox(2.32, 0.92, 0.52, 0.07, cab, 0, 1.27, 3.47);
  p.plane(1.12, 0.66, grille, 0, 1.24, 3.735);
  p.box(1.18, 0.05, 0.03, M.chrome, 0, 1.585, 3.735);
  p.box(1.18, 0.05, 0.03, M.chrome, 0, 0.895, 3.735);
  p.add(new THREE.TorusGeometry(0.1, 0.018, 8, 28), M.chrome, 0, 1.48, 3.75);
  p.add(new THREE.TorusGeometry(0.06, 0.012, 6, 20), M.chrome, 0, 1.48, 3.75);
  for (const s of [1, -1]) {
    // headlamp in a chrome bezel, painted eye above, indicator at the corner
    p.rbox(0.36, 0.26, 0.06, 0.04, M.chrome, s * 0.86, 1.02, 3.73);
    p.rbox(0.3, 0.2, 0.06, 0.04, M.headlight, s * 0.86, 1.02, 3.745);
    p.plane(0.3, 0.15, eye, s * 0.86, 1.28, 3.736);
    p.box(0.12, 0.08, 0.05, M.amber, s * 1.08, 1.58, 3.73);
    // fender arch over the front wheel
    p.add(archShell(0.64, 0.4), fender, s * 0.98, 0.52, 2.55);
    p.box(0.42, 0.06, 0.7, fender, s * 0.98, 1.17, 2.95);
    // step plates
    p.box(0.32, 0.04, 0.42, M.steel, s * 1.08, 0.86, 1.95);
    p.box(0.32, 0.04, 0.42, M.steel, s * 1.08, 0.58, 1.95);
  }
  // short sloping bonnet up to the windscreen
  p.rbox(2.24, 0.12, 0.62, 0.05, cab, 0, 1.78, 3.42, -0.42, 0, 0);

  // ---- cab shell (panels so the cab view looks out through real openings)
  const cabZ0 = 1.56, cabZ1 = 3.25, cabMid = (cabZ0 + cabZ1) / 2, cabL = cabZ1 - cabZ0;
  p.box(2.3, 0.95, 0.07, cab, 0, 1.6, cabZ0); // back wall lower
  p.box(2.3, 0.7, 0.07, cab, 0, 2.38, cabZ0);
  p.box(2.3, 0.07, cabL, M.dash, 0, 1.15, cabMid); // floor
  p.rbox(2.36, 0.1, cabL + 0.08, 0.04, cab, 0, 2.77, cabMid); // roof
  p.box(2.3, 0.25, 0.07, cab, 0, 1.92, cabZ1); // under windscreen
  for (const s of [1, -1]) {
    p.box(0.07, 0.95, cabL, cab, s * 1.13, 1.6, cabMid); // door lower
    p.box(0.09, 0.7, 0.09, cab, s * 1.12, 2.4, cabZ1 - 0.02, -0.1); // A pillar
    p.box(0.07, 0.7, 0.42, cab, s * 1.13, 2.4, cabZ0 + 0.2); // rear quarter
    // painted door + quarter panel
    p.plane(1.05, 0.8, doorArt, s * 1.168, 1.6, cabMid + 0.25, 0, (s * Math.PI) / 2, 0);
    p.plane(0.42, 0.62, sideArt, s * 1.168, 2.4, cabZ0 + 0.2, 0, (s * Math.PI) / 2, 0);
    p.box(0.02, 0.05, 0.2, M.chrome, s * 1.172, 1.95, cabMid + 0.55);
    // mirrors on long rods
    p.box(0.42, 0.03, 0.03, M.chrome, s * 1.32, 2.55, cabZ1 + 0.03);
    p.box(0.03, 0.55, 0.03, M.chrome, s * 1.52, 2.3, cabZ1 + 0.03);
    p.rbox(0.07, 0.42, 0.24, 0.02, M.black, s * 1.55, 2.25, cabZ1 + 0.05);
    p.box(0.01, 0.38, 0.2, M.chrome, s * 1.515, 2.25, cabZ1 + 0.05);
  }
  // windscreen and side glass
  p.box(2.12, 0.66, 0.025, M.glass, 0, 2.39, cabZ1 - 0.02, -0.1);
  for (const s of [1, -1]) {
    p.box(0.025, 0.62, cabL - 0.5, M.glass, s * 1.135, 2.4, cabMid + 0.2);
    p.box(0.5, 0.015, 0.015, M.black, s * 0.45, 2.1, cabZ1 + 0.02, 0, 0, s * 0.35); // wipers
  }

  // ---- over-cab crown: arched name board above a fan of painted feathers
  const crownZ = cabZ1 + 0.1;
  p.box(2.4, 0.06, crownZ - 1.42, paint(0x2a2a2a), 0, 2.86, (crownZ + 1.42) / 2);
  p.add(archGeometry(2.42, 0.78, 1.0, 0.08), M.black, 0, 2.88, crownZ - 0.01);
  p.add(archGeometry(2.36, 0.74, 0.96, 0.02), crownMat, 0, 2.9, crownZ + 0.01);
  p.plane(2.5, 0.62, featherMat, 0, 2.66, crownZ + 0.12, -0.75, 0, 0);
  for (const s of [1, -1]) {
    // crown side cheeks with art
    const L = crownZ - 1.42;
    p.plane(L, 0.8, sideArt, s * 1.205, 3.29, (crownZ + 1.42) / 2, 0, (s * Math.PI) / 2, 0);
    p.box(0.04, 0.9, L, M.black, s * 1.18, 3.33, (crownZ + 1.42) / 2);
  }
  // marker lights along the crown top
  for (let i = -4; i <= 4; i++) p.box(0.05, 0.05, 0.05, i % 2 ? M.amber : M.tail, i * 0.26, 3.86 - Math.abs(i) * 0.02, crownZ);

  // ---- wooden goods body
  const bodyZ0 = 1.42, bodyZ1 = -4.42, bodyL = bodyZ0 - bodyZ1, bodyC = (bodyZ0 + bodyZ1) / 2;
  const sideH = 1.05, deckY = 1.32;
  p.box(2.46, 0.12, bodyL, wood, 0, deckY, bodyC);
  p.box(2.5, 0.14, bodyL, paint(new THREE.Color(t.rail).getHex(), 0.5), 0, deckY - 0.1, bodyC);
  for (const s of [1, -1]) {
    p.plane(bodyL, sideH, planks, s * 1.24, deckY + 0.06 + sideH / 2, bodyC, 0, (s * Math.PI) / 2, 0);
    p.box(0.04, sideH, bodyL, wood, s * 1.215, deckY + 0.06 + sideH / 2, bodyC);
    p.box(0.08, 0.07, bodyL + 0.04, M.black, s * 1.245, deckY + 0.06 + sideH, bodyC);
    // rope hooks under the side rail
    for (let z = bodyZ1 + 0.3; z < bodyZ0 - 0.2; z += 0.55) {
      p.box(0.03, 0.12, 0.03, M.chrome, s * 1.27, deckY - 0.2, z);
      p.box(0.06, 0.03, 0.03, M.chrome, s * 1.29, deckY - 0.27, z);
    }
  }
  // tall front wall behind the cab with art panels, plus side ladder
  p.box(2.46, 2.5, 0.08, wood, 0, deckY + 1.25, bodyZ0);
  for (const s of [1, -1]) p.plane(0.95, 1.4, sideArt, s * 0.62, deckY + 0.85, bodyZ0 - 0.045, 0, Math.PI, 0);
  for (let k = 0; k < 7; k++) p.box(0.04, 0.03, 0.34, M.chrome, -1.3, deckY - 0.2 + k * 0.32, bodyZ0 - 0.2);
  for (const z of [bodyZ0 - 0.05, bodyZ0 - 0.36]) p.box(0.04, 2.3, 0.04, M.chrome, -1.3, deckY + 0.75, z);
  // tail gate
  p.box(2.46, sideH, 0.07, wood, 0, deckY + 0.06 + sideH / 2, bodyZ1);
  p.plane(2.44, sideH, rearMat, 0, deckY + 0.06 + sideH / 2, bodyZ1 - 0.04, 0, Math.PI, 0);
  // underbody: red fuel tank, tool box, spare, mudguards, lamps, mudflaps
  p.cyl(0.27, 0.27, 1.0, paint(0xb8201a, 0.4), -0.85, 0.78, 0.65, 0, 0, Math.PI / 2, 16);
  p.box(0.55, 0.42, 0.8, M.black, 0.86, 0.85, 0.6);
  p.cyl(0.5, 0.5, 0.28, M.rubber, 0, 0.8, -3.55, 0, 0, Math.PI / 2, 20);
  for (const s of [1, -1]) {
    p.add(archShell(0.66, 0.66), M.black, s * 0.9, 0.52, -2.05);
    p.box(0.66, 0.5, 0.02, M.black, s * 0.9, 0.42, -2.75);
    p.box(0.14, 0.09, 0.03, M.tail, s * 0.9, 0.58, -2.765);
    p.box(0.24, 0.12, 0.05, M.tail, s * 0.95, 1.08, bodyZ1 - 0.07);
    p.box(0.1, 0.12, 0.05, M.amber, s * 1.14, 1.08, bodyZ1 - 0.07);
  }
  p.box(2.3, 0.16, 0.12, stripes, 0, 0.72, bodyZ1 + 0.02);

  // ---- interior (right-hand drive)
  const refs = {};
  if (withInterior) buildInterior(p, refs, cabZ0, cabZ1);
  const group = p.build();

  if (withInterior) {
    // dynamic interior bits: steering wheel, gauge needles, fan blades
    const sw = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ map: leatherTex(), roughness: 0.55 });
    sw.add(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 10, 36), leather));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.07, 18), M.black);
    hub.rotation.x = Math.PI / 2;
    sw.add(hub);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.015), M.black);
      sp.position.y = 0.13;
      pivot.add(sp);
      sw.add(pivot);
    }
    const holder = new THREE.Group();
    holder.position.set(-0.55, 1.98, cabZ1 - 0.62);
    holder.rotation.x = -0.75;
    holder.add(sw);
    group.add(holder);
    refs.steeringWheel = sw;

    const needleMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
    const mkNeedle = (x, y, len) => {
      const pv = new THREE.Group();
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.005, len, 0.003), needleMat);
      n.position.y = len / 2;
      pv.add(n);
      pv.position.set(x, y, 0.004);
      refs.gaugePanel.add(pv);
      return pv;
    };
    refs.speedNeedle = mkNeedle(-0.128, 0, 0.065);
    refs.rpmNeedle = mkNeedle(0.128, 0, 0.065);
    group.add(refs.gaugePanel);

    const blades = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2a8ae0, roughness: 0.4, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10, 0, 0.9), bladeMat);
      b.rotation.z = (i / 3) * Math.PI * 2;
      blades.add(b);
    }
    blades.position.copy(refs.fanPos);
    blades.rotation.y = Math.PI + 0.5;
    group.add(blades);
    refs.fan = blades;
  }

  const wheelR = 0.52;
  const wheels = {
    fl: makeWheel(wheelR, 0.29, 0xc8201a), fr: makeWheel(wheelR, 0.29, 0xc8201a),
    rl: makeWheel(wheelR, 0.27, 0xc8201a, true), rr: makeWheel(wheelR, 0.27, 0xc8201a, true),
  };
  for (const w of Object.values(wheels)) group.add(w);

  return {
    group, wheels, steeringWheel: refs.steeringWheel, refs,
    cargoAnchor: new THREE.Vector3(0, deckY + 0.06, bodyC), bodyLength: bodyL,
    eye: new THREE.Vector3(-0.55, 2.4, cabZ0 + 0.55),
  };
}

function buildInterior(p, refs, cabZ0, cabZ1) {
  const plastic = paint(0x8a857c, 0.75);
  const plasticDark = paint(0x2e2d2b, 0.7);
  const lining = paint(0xc9c0ae, 0.9);
  const seatMat = new THREE.MeshStandardMaterial({ map: quiltArt(), roughness: 0.8 });
  const seat2 = new THREE.MeshStandardMaterial({ map: quiltArt('#6a1f2a', '#c9a07a'), roughness: 0.8 });
  const mat = paint(0x1a1a1a, 0.95);
  const dz = cabZ1 - 0.28; // dashboard face

  // dashboard, binnacle, radio, glovebox
  p.box(2.2, 0.36, 0.38, plastic, 0, 1.74, dz + 0.08);
  p.box(2.22, 0.05, 0.5, plasticDark, 0, 1.94, dz + 0.12, 0.08, 0, 0);
  p.rbox(0.62, 0.24, 0.2, 0.04, plasticDark, -0.55, 2.0, dz - 0.04);
  const gp = new THREE.Group();
  gp.position.set(-0.55, 1.99, dz - 0.145);
  gp.rotation.y = Math.PI;
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.195), new THREE.MeshBasicMaterial({ map: gaugeArt() }));
  gp.add(gauge);
  refs.gaugePanel = gp;
  p.box(0.22, 0.08, 0.04, M.black, 0.02, 1.78, dz - 0.11);
  p.box(0.12, 0.03, 0.01, new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x30ff60, emissiveIntensity: 0.6 }), 0.02, 1.79, dz - 0.132);
  p.box(0.45, 0.2, 0.02, plasticDark, 0.6, 1.72, dz - 0.115);
  for (let i = 0; i < 6; i++) p.box(0.025, 0.035, 0.02, M.black, -0.95 + i * 0.05, 1.83, dz - 0.115);
  // steering column
  p.cyl(0.04, 0.05, 0.42, plasticDark, -0.55, 1.88, cabZ1 - 0.45, Math.PI / 2 + 0.6);
  // pedals
  for (const x of [-0.78, -0.58, -0.36]) p.box(0.09, 0.14, 0.03, M.steel, x, 1.32, dz - 0.05, -0.5);
  // engine hump between the seats with rubber mat
  p.rbox(0.62, 0.42, 1.0, 0.08, mat, 0.04, 1.36, cabZ0 + 0.95);
  // long gear stick with rubber boot, handbrake
  const gx = -0.08, gz = cabZ0 + 1.15, gy = 1.58;
  for (let k = 0; k < 4; k++) p.add(new THREE.TorusGeometry(0.07 - k * 0.012, 0.022, 8, 16), M.rubber, gx, gy + k * 0.035, gz, Math.PI / 2, 0, 0);
  p.cyl(0.013, 0.016, 0.55, M.chrome, gx, gy + 0.3, gz - 0.04, -0.15);
  p.add(new THREE.SphereGeometry(0.04, 12, 10), M.black, gx, gy + 0.58, gz - 0.08);
  p.cyl(0.012, 0.012, 0.35, M.black, 0.2, 1.65, cabZ0 + 0.75, -0.6);
  // seats with quilted covers
  p.rbox(0.56, 0.16, 0.52, 0.05, seatMat, -0.58, 1.62, cabZ0 + 0.55);
  p.rbox(0.56, 0.7, 0.14, 0.05, seatMat, -0.58, 2.02, cabZ0 + 0.22, -0.12);
  p.rbox(0.3, 0.18, 0.1, 0.04, seatMat, -0.58, 2.47, cabZ0 + 0.17);
  p.rbox(0.68, 0.16, 0.5, 0.05, seat2, 0.68, 1.6, cabZ0 + 0.55);
  p.rbox(0.68, 0.68, 0.14, 0.05, seat2, 0.68, 2.0, cabZ0 + 0.22, -0.12);
  p.box(0.4, 0.4, 0.4, plasticDark, -0.58, 1.33, cabZ0 + 0.55);
  // door cards, roof lining, overhead shelf, visors, mirror
  for (const s of [1, -1]) {
    p.box(0.02, 0.6, cabZ1 - cabZ0 - 0.2, plastic, s * 1.085, 1.6, (cabZ0 + cabZ1) / 2);
    p.box(0.04, 0.03, 0.18, M.chrome, s * 1.07, 1.78, cabZ1 - 0.6);
    p.box(0.42, 0.02, 0.2, lining, s * 0.55, 2.62, cabZ1 - 0.2, 0.25);
  }
  p.box(2.2, 0.02, cabZ1 - cabZ0, lining, 0, 2.71, (cabZ0 + cabZ1) / 2);
  p.box(2.0, 0.12, 0.28, plastic, 0, 2.63, cabZ1 - 0.35);
  p.box(0.22, 0.07, 0.02, M.chrome, 0, 2.5, cabZ1 - 0.12);
  // curtain fringe across the windscreen top
  p.plane(2.05, 0.12, texMat(fringeArt(), { transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), 0, 2.68, cabZ1 - 0.06);
  // marigold garland
  const orange = paint(0xff8a00, 0.6), yellow = paint(0xffcf1a, 0.6);
  const flower = new THREE.SphereGeometry(0.018, 7, 6);
  const bud = new THREE.SphereGeometry(0.012, 6, 5);
  for (let i = 0; i <= 44; i++) {
    const u = i / 44;
    const x = -0.95 + u * 1.9, y = 2.63 - Math.sin(Math.PI * u) * 0.07;
    p.add(flower, i % 2 ? orange : yellow, x, y, cabZ1 - 0.08);
  }
  // framed picture with its own small garland and LED glow, on the dash
  const fx = 0.12, fy = 2.03, fz = dz - 0.02;
  p.box(0.14, 0.18, 0.02, paint(0xc8a040, 0.3), fx, fy, fz);
  p.plane(0.115, 0.15, new THREE.MeshStandardMaterial({ map: pictureArt(), emissive: 0xffffff, emissiveMap: pictureArt(), emissiveIntensity: 0.25 }), fx, fy, fz - 0.012, 0, Math.PI, 0);
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    p.add(bud, i % 2 ? orange : yellow, fx + Math.cos(a) * 0.075, fy - 0.05 - Math.sin(a) * 0.06, fz - 0.025);
  }
  p.add(new THREE.TorusGeometry(0.09, 0.004, 6, 32), new THREE.MeshStandardMaterial({ color: 0xff3a9a, emissive: 0xff3a9a, emissiveIntensity: 1.2 }), fx, fy, fz - 0.016);
  // little dashboard fan (blades are animated separately)
  const fanX = 0.78, fanY = 2.06, fanZ = dz - 0.06;
  p.cyl(0.035, 0.05, 0.05, paint(0x2a8ae0, 0.4), fanX, 1.96, fanZ);
  p.cyl(0.012, 0.012, 0.08, M.chrome, fanX, 2.0, fanZ);
  p.add(new THREE.TorusGeometry(0.06, 0.004, 6, 24), M.chrome, fanX, fanY, fanZ, 0, Math.PI + 0.5, 0);
  refs.fanPos = new THREE.Vector3(fanX, fanY, fanZ);
}

// ------------------------------------------------------------------ cargo visuals
export function buildCargo(kind, bodyLength) {
  mats();
  const p = new Parts();
  const L = bodyLength - 0.25, W = 2.32;
  const rnd = mulberry32(kind.length * 7 + 3);
  if (kind === 'logs') {
    const bark = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.95 });
    const endM = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.9 });
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 6 - row; i++) {
        const r = 0.18 + rnd() * 0.05, x = -W / 2 + 0.25 + i * 0.37 + row * 0.18, y = 0.2 + row * 0.36;
        p.cyl(r, r, L + 0.6, bark, x, y, 0.3, Math.PI / 2, 0, 0, 10);
        p.cyl(r * 0.92, r * 0.92, 0.02, endM, x, y, 0.3 - (L + 0.6) / 2 - 0.005, Math.PI / 2, 0, 0, 10);
      }
  } else if (kind === 'bananas') {
    const green = new THREE.MeshStandardMaterial({ color: 0x5a8a2a, roughness: 0.7 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3a6a20, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 40; i++) {
      p.add(new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.5, 1), green, -W / 2 + 0.35 + (i % 4) * 0.55, 0.5 + Math.floor(i / 20) * 0.55, -L / 2 + 0.4 + (Math.floor(i / 4) % 5) * (L / 5.2));
    }
    p.plane(W, L, leaf, 0, 0.12, 0, -Math.PI / 2);
  } else if (kind === 'lpg') {
    // red domestic LPG cylinders standing upright, three layers
    const red = paint(0xc4151c, 0.35), cap = M.steel;
    for (let layer = 0; layer < 2; layer++)
      for (let ix = 0; ix < 6; ix++)
        for (let iz = 0; iz < 17; iz++) {
          const x = -W / 2 + 0.2 + ix * 0.38, z = -L / 2 + 0.2 + iz * 0.33, y = layer * 0.78;
          p.cyl(0.155, 0.155, 0.6, red, x, y + 0.34, z, 0, 0, 0, 10);
          p.cyl(0.05, 0.05, 0.12, cap, x, y + 0.7, z, 0, 0, 0, 6);
        }
  } else if (kind === 'tea' || kind === 'crates') {
    const ply = paint(kind === 'tea' ? 0xb48a58 : 0x2a6ac0, 0.8);
    for (let layer = 0; layer < 3; layer++)
      for (let ix = 0; ix < 4; ix++)
        for (let iz = 0; iz < 9; iz++)
          p.box(0.54, 0.5, 0.58, ply, -W / 2 + 0.3 + ix * 0.57, 0.26 + layer * 0.52, -L / 2 + 0.32 + iz * 0.62);
  } else {
    // jute / paper sacks piled high, the way Kerala lorries carry rice and coffee
    const jute = kind === 'cement' ? [0xd8d4c8, 0xc8c2b4, 0xe2ded4] : [0xc2a878, 0xb09468, 0xcdb48a];
    const mats3 = jute.map((c) => paint(c, 0.95));
    const sack = new RoundedBoxGeometry(0.62, 0.3, 0.9, 2, 0.12);
    const layers = kind === 'cement' ? 4 : 6;
    for (let layer = 0; layer < layers; layer++) {
      const inset = Math.max(0, layer - 3) * 0.3;
      const nx = 3, nz = Math.floor((L - inset * 2) / 0.95);
      for (let ix = 0; ix < nx; ix++)
        for (let iz = 0; iz < nz; iz++) {
          const x = -W / 2 + 0.38 + ix * 0.78 + (rnd() - 0.5) * 0.06;
          const z = -L / 2 + inset + 0.48 + iz * 0.95 + (rnd() - 0.5) * 0.08;
          p.add(sack, mats3[Math.floor(rnd() * 3)], x, 0.17 + layer * 0.29, z, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.08);
        }
    }
    if (kind === 'sacks-tarp') p.rbox(W, 1.6, L, 0.3, M.tarp, 0, 0.8, 0);
  }
  return p.build();
}
