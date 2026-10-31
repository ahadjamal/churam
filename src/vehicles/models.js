// Kerala traffic vehicles built from primitives + canvas-painted art.
// Convention: +z forward, +y up, driver sits on the right (-x), India drives on the left.
import * as THREE from 'three';
import { canvas } from '../util/textures.js';
import { mulberry32 } from '../util/noise.js';
import { M, mats, paint, texMat, ctex, Parts, makeWheel, plateTex, ML } from './kit.js';
import { buildLorry, buildCargo, LORRY_THEMES } from './lorry.js';
export { Parts, paint, setVehicleLights, setBrakeLights } from './kit.js';
export { buildLorry, buildCargo, LORRY_THEMES } from './lorry.js';

// ---------------------------------------------------------------- traffic
function busFront(dest, ml, bg = '#111') {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.textAlign = 'center';
  g.fillStyle = '#ffb21a';
  g.font = `bold 40px ${ML}`; g.fillText(ml, 256, 44);
  g.font = 'bold 30px Arial'; g.fillText(dest, 256, 84);
  return ctex(c);
}

function busSide(livery) {
  const [c, g] = canvas(1024, 256);
  const rnd = mulberry32(livery.seed);
  g.fillStyle = livery.body; g.fillRect(0, 0, 1024, 256);
  // window strip
  g.fillStyle = livery.band; g.fillRect(0, 50, 1024, 30);
  g.fillStyle = '#10161a'; g.fillRect(0, 80, 1024, 78);
  for (let x = 0; x < 1024; x += 78) { g.fillStyle = livery.body; g.fillRect(x, 80, 10, 78); }
  g.fillStyle = livery.band; g.fillRect(0, 158, 1024, 26);
  if (livery.swoosh) {
    g.fillStyle = livery.swoosh;
    g.beginPath(); g.moveTo(0, 256); g.bezierCurveTo(300, 170, 700, 250, 1024, 190); g.lineTo(1024, 256); g.fill();
  }
  g.fillStyle = livery.text;
  g.font = `bold 34px ${ML}`;
  g.textAlign = 'center';
  g.fillText(livery.title, 512, 228);
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(20,20,10,${rnd() * 0.1})`; g.fillRect(rnd() * 1024, rnd() * 256, 3, 3); }
  return ctex(c);
}

const BUS_LIVERIES = [
  { seed: 1, body: '#b5121b', band: '#f2c230', text: '#f2c230', title: 'കോഴിക്കോട് - കൽപ്പറ്റ', dest: 'KALPETTA', ml: 'കൽപ്പറ്റ', swoosh: null },
  { seed: 2, body: '#b5121b', band: '#f2c230', text: '#f2c230', title: 'സുൽത്താൻ ബത്തേരി', dest: 'KOZHIKODE', ml: 'കോഴിക്കോട്', swoosh: null },
  { seed: 3, body: '#f4f4f0', band: '#1d4fa0', text: '#1d4fa0', title: 'MALABAR TRAVELS', dest: 'VYTHIRI', ml: 'വൈത്തിരി', swoosh: '#2a8ad0' },
  { seed: 4, body: '#fafafa', band: '#d8231e', text: '#d8231e', title: 'SREE MURUGAN', dest: 'MEPPADI', ml: 'മേപ്പാടി', swoosh: '#f08a1a' },
];

function buildBus(i) {
  mats();
  const L = BUS_LIVERIES[i % BUS_LIVERIES.length];
  const p = new Parts();
  const body = paint(new THREE.Color(L.body).getHex());
  const side = texMat(busSide(L));
  p.rbox(2.5, 2.55, 11, 0.12, body, 0, 1.95, 0);
  for (const s of [1, -1]) p.plane(10.6, 2.0, side, s * 1.255, 1.85, 0, 0, (s * Math.PI) / 2, 0);
  p.rbox(2.4, 0.18, 10.8, 0.08, paint(0xf0f0f0), 0, 3.27, 0);
  p.box(2.3, 1.05, 0.06, M.glassDark, 0, 2.3, 5.5);
  p.plane(2.0, 0.38, texMat(busFront(L.dest, L.ml)), 0, 3.0, 5.53);
  p.box(2.5, 0.25, 0.2, M.black, 0, 0.75, 5.52);
  for (const s of [1, -1]) {
    p.cyl(0.12, 0.12, 0.06, M.headlight, s * 0.95, 1.05, 5.53, Math.PI / 2);
    p.box(0.25, 0.25, 0.05, M.tail, s * 1.0, 1.1, -5.53);
    p.box(0.04, 0.3, 0.2, M.black, s * 1.35, 2.5, 5.2);
  }
  p.box(2.3, 0.9, 0.05, M.glassDark, 0, 2.5, -5.52);
  p.plane(0.5, 0.13, texMat(plateTex('KL 12 ' + (1000 + i * 731) % 9999)), 0, 0.85, 5.63);
  const g = p.build();
  addWheels(g, [[1.05, 3.6], [-1.05, 3.6], [1.0, -2.6], [-1.0, -2.6]], 0.52, 0x222222);
  return { group: g, length: 11, width: 2.5, kind: 'bus' };
}

function addWheels(g, list, r, rim) {
  const wheels = [];
  for (const [x, z] of list) {
    const w = makeWheel(r, 0.24, rim);
    w.position.set(x, r, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.wheelR = r;
}

function buildAuto() {
  mats();
  const p = new Parts();
  const yellow = paint(0xf2c51a), black = paint(0x161616, 0.5);
  p.rbox(1.3, 0.55, 1.7, 0.12, black, 0, 0.6, -0.25);
  p.rbox(0.9, 0.85, 0.5, 0.15, yellow, 0, 0.95, 0.95);
  p.box(1.1, 0.5, 0.04, M.glass, 0, 1.45, 0.92, -0.25);
  p.add(new THREE.CylinderGeometry(0.75, 0.75, 1.9, 16, 1, true, -Math.PI / 2, Math.PI), M.canvasTop, 0, 1.3, -0.3, Math.PI / 2, 0, 0);
  p.box(1.42, 0.06, 1.9, M.canvasTop, 0, 2.03, -0.3);
  p.box(1.35, 0.5, 0.06, yellow, 0, 0.95, -1.1);
  p.box(1.0, 0.45, 0.6, M.seat, 0, 0.95, -0.75);
  p.cyl(0.09, 0.09, 0.05, M.headlight, 0, 1.2, 1.22, Math.PI / 2);
  p.plane(0.3, 0.08, texMat(plateTex('KL 12 E 77')), 0, 0.55, 1.215);
  p.box(0.5, 0.65, 0.4, M.shirt, -0.0, 1.25, 0.45);
  p.add(new THREE.SphereGeometry(0.13, 8, 8), M.skin, 0, 1.75, 0.45);
  const g = p.build();
  addWheels(g, [[0, 1.0], [0.6, -0.85], [-0.6, -0.85]], 0.24, 0x333333);
  return { group: g, length: 2.7, width: 1.4, kind: 'auto' };
}

function buildJeep(i) {
  mats();
  const cols = [0x4a5a3a, 0xf0f0ea, 0x8a1a1a, 0x1f3a6a];
  const p = new Parts();
  const body = paint(cols[i % cols.length]);
  p.rbox(1.7, 0.75, 3.9, 0.06, body, 0, 0.95, 0);
  p.rbox(1.55, 0.4, 1.2, 0.06, body, 0, 1.45, 1.25);
  p.box(1.5, 0.5, 0.05, M.glass, 0, 1.75, 0.6, -0.15);
  p.box(1.72, 0.8, 2.2, M.canvasTop, 0, 1.75, -0.75);
  p.box(1.0, 0.4, 0.06, M.black, 0, 1.15, 1.97);
  for (let k = -3; k <= 3; k++) p.box(0.05, 0.35, 0.07, M.chrome, k * 0.13, 1.15, 1.98);
  for (const s of [1, -1]) {
    p.cyl(0.11, 0.11, 0.06, M.headlight, s * 0.62, 1.2, 1.97, Math.PI / 2);
    p.box(0.15, 0.12, 0.04, M.tail, s * 0.7, 1.0, -1.96);
  }
  p.plane(0.4, 0.1, texMat(plateTex('KL 12 J 314', '#ffd400')), 0, 0.75, 2.0);
  const g = p.build();
  addWheels(g, [[0.78, 1.25], [-0.78, 1.25], [0.78, -1.25], [-0.78, -1.25]], 0.38, 0x777777);
  return { group: g, length: 4, width: 1.75, kind: 'jeep' };
}

function buildCar(i) {
  mats();
  const cols = [0xf2f2f2, 0xb8bcc0, 0x9a1a1a, 0x2a2a2e, 0x1f4a8a, 0xe8e8e0, 0x6a6a6a];
  const p = new Parts();
  const body = paint(cols[i % cols.length], 0.25);
  const suv = i % 3 === 0;
  const L = suv ? 4.6 : 3.8, H = suv ? 0.8 : 0.62;
  p.rbox(1.72, H, L, 0.18, body, 0, 0.35 + H / 2, 0);
  const cabL = suv ? 2.8 : 2.0;
  p.rbox(1.6, 0.62, cabL, 0.16, body, 0, 0.35 + H + 0.28, suv ? -0.35 : -0.2);
  p.box(1.5, 0.5, 0.05, M.glassDark, 0, 0.35 + H + 0.3, (suv ? -0.35 : -0.2) + cabL / 2 + 0.02, -0.5);
  p.box(1.5, 0.45, 0.05, M.glassDark, 0, 0.35 + H + 0.3, (suv ? -0.35 : -0.2) - cabL / 2 - 0.02, 0.5);
  for (const s of [1, -1]) {
    p.box(0.03, 0.42, cabL - 0.3, M.glassDark, s * 0.805, 0.35 + H + 0.3, suv ? -0.35 : -0.2);
    p.box(0.3, 0.12, 0.05, M.headlight, s * 0.6, 0.35 + H * 0.7, L / 2 + 0.01);
    p.box(0.3, 0.12, 0.05, M.tail, s * 0.6, 0.35 + H * 0.7, -L / 2 - 0.01);
  }
  p.plane(0.45, 0.11, texMat(plateTex('KL 12 ' + String.fromCharCode(65 + (i % 20)) + ' ' + (2000 + i * 97) % 9999, '#ffffff')), 0, 0.45, L / 2 + 0.02);
  const g = p.build();
  addWheels(g, [[0.75, L * 0.32], [-0.75, L * 0.32], [0.75, -L * 0.32], [-0.75, -L * 0.32]], 0.31, 0x9a9a9a);
  return { group: g, length: L, width: 1.75, kind: 'car' };
}

function buildPickup(i) {
  mats();
  const p = new Parts();
  const cab = paint(i % 2 ? 0xf0f0f0 : 0x2a6aa8);
  p.rbox(1.6, 1.25, 1.3, 0.1, cab, 0, 1.15, 1.35);
  p.box(1.45, 0.55, 0.05, M.glass, 0, 1.45, 2.01, -0.12);
  p.box(1.65, 0.1, 2.6, M.wood, 0, 0.7, -0.75);
  for (const s of [1, -1]) p.box(0.05, 0.4, 2.6, paint(0x6a6a6a), s * 0.8, 0.95, -0.75);
  p.box(1.65, 0.4, 0.05, paint(0x6a6a6a), 0, 0.95, -2.05);
  // load of coconuts / vegetable crates
  const load = paint(i % 2 ? 0x7a5a2a : 0x3a7a2a, 0.9);
  p.rbox(1.5, 0.55, 2.4, 0.2, load, 0, 1.05, -0.75);
  for (const s of [1, -1]) p.cyl(0.08, 0.08, 0.05, M.headlight, s * 0.6, 1.0, 2.01, Math.PI / 2);
  p.plane(0.4, 0.1, texMat(plateTex('KL 12 C 808')), 0, 0.6, 2.03);
  const g = p.build();
  addWheels(g, [[0.7, 1.3], [-0.7, 1.3], [0.7, -1.2], [-0.7, -1.2]], 0.3, 0x888888);
  return { group: g, length: 4.2, width: 1.65, kind: 'pickup' };
}

function buildBike(i) {
  mats();
  const p = new Parts();
  const cols = [0x1a1a1a, 0xa81a1a, 0x1a3a8a, 0x5a5a5a];
  const body = paint(cols[i % 4], 0.3);
  p.box(0.25, 0.3, 1.0, body, 0, 0.7, 0);
  p.box(0.3, 0.12, 0.6, M.seat, 0, 0.9, -0.2);
  p.box(0.6, 0.04, 0.04, M.chrome, 0, 1.1, 0.5);
  p.cyl(0.08, 0.08, 0.05, M.headlight, 0, 0.95, 0.62, Math.PI / 2);
  // rider in shirt + mundu, helmet
  p.box(0.42, 0.6, 0.28, i % 2 ? M.shirt : paint(0x3a6aa8, 0.9), 0, 1.35, -0.1, 0.2);
  p.box(0.36, 0.5, 0.3, paint(0xf5f2e8, 0.9), 0, 0.95, -0.05);
  p.add(new THREE.SphereGeometry(0.16, 10, 8), paint(i % 3 ? 0x111111 : 0xd0d0d0, 0.3), 0, 1.78, -0.05);
  const g = p.build();
  addWheels(g, [[0, 0.65], [0, -0.6]], 0.3, 0x333333);
  return { group: g, length: 1.9, width: 0.7, kind: 'bike' };
}

export function buildTraffic(kind, i) {
  switch (kind) {
    case 'bus': return buildBus(i);
    case 'auto': return buildAuto();
    case 'jeep': return buildJeep(i);
    case 'pickup': return buildPickup(i);
    case 'bike': return buildBike(i);
    case 'lorry': {
      const L = buildLorry(LORRY_THEMES[1 + (i % 3)], 'KL 11 ' + String.fromCharCode(65 + (i % 26)) + ' ' + (3000 + i * 17), false);
      const cargo = buildCargo(i % 3 === 0 ? 'logs' : 'sacks', L.bodyLength);
      cargo.position.copy(L.cargoAnchor);
      L.group.add(cargo);
      const ws = [L.wheels.fl, L.wheels.fr, L.wheels.rl, L.wheels.rr];
      [[0.98, 2.55], [-0.98, 2.55], [0.88, -2.05], [-0.88, -2.05]].forEach(([x, z], k) => ws[k].position.set(x, 0.52, z));
      L.group.userData.wheels = ws;
      L.group.userData.wheelR = 0.52;
      return { group: L.group, length: 8.4, width: 2.5, kind: 'lorry' };
    }
    default: return buildCar(i);
  }
}
