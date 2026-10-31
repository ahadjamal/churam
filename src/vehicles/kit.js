// Shared vehicle kit: materials, part merger, wheels, plates.
// Convention: +z forward, +y up, driver sits on the right (-x), India drives on the left.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas } from '../util/textures.js';
import { mulberry32 } from '../util/noise.js';

export const ML = '"Nirmala UI", "Noto Sans Malayalam", "Kartika", sans-serif';

// ---------------------------------------------------------------- shared materials
export const M = {};
export function mats() {
  if (M.black) return M;
  M.black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.18, metalness: 1 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.6, metalness: 0.6 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x8aa4b4, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.22, depthWrite: false });
  M.glassDark = new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: 0.08, metalness: 0.3 });
  M.headlight = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff2cc, emissiveIntensity: 0.0, roughness: 0.1 });
  M.tail = new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xff1a0a, emissiveIntensity: 0.15, roughness: 0.3 });
  M.amber = new THREE.MeshStandardMaterial({ color: 0xd08a10, emissive: 0xff9a00, emissiveIntensity: 0.1, roughness: 0.3 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.85 });
  M.seat = new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 });
  M.dash = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.75 });
  M.tarp = new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.75, side: THREE.DoubleSide });
  M.skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.7 });
  M.shirt = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.9 });
  M.canvasTop = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, side: THREE.DoubleSide });
  return M;
}
export function setVehicleLights(on) {
  mats();
  M.headlight.emissiveIntensity = on ? 2.5 : 0;
  M.tail.emissiveIntensity = on ? 1.6 : 0.15;
  M.amber.emissiveIntensity = on ? 0.6 : 0.1;
}
export function setBrakeLights(mat, on) { mat.emissiveIntensity = on ? 2.2 : 0.15; }
export const paint = (hex, rough = 0.38) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.15 });
export const texMat = (t, opts = {}) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, ...opts });

export function ctex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- part collector
export class Parts {
  constructor() { this.byMat = new Map(); this.extra = []; }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const g = geo.clone().applyMatrix4(m);
    if (!g.index) { /* ok */ }
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return g;
  }
  box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
  }
  rbox(w, h, d, r, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, rx, ry, rz);
  }
  cyl(rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 16) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz);
  }
  /** Plane facing +z (or rotated). */
  plane(w, h, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, rz);
  }
  build(castShadow = true) {
    const group = new THREE.Group();
    for (const [mat, geos] of this.byMat) {
      const norm = geos.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
        return n;
      });
      const merged = mergeGeometries(norm, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

// ---------------------------------------------------------------- wheels
export function makeWheel(r, w, rimColor, dual = false) {
  mats();
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22), M.rubber);
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  g.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 14), paint(rimColor, 0.4));
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.25, w + 0.08, 8), M.chrome);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  // tread blocks so rotation is visible
  const tread = new THREE.BoxGeometry(w * 0.98, 0.04, 0.07);
  const tm = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    tm.push(tread.clone().applyMatrix4(new THREE.Matrix4().makeRotationX(a).multiply(new THREE.Matrix4().makeTranslation(0, r, 0))));
  }
  const tr = new THREE.Mesh(mergeGeometries(tm), M.rubber);
  g.add(tr);
  if (dual) {
    const inner = g.clone();
    inner.position.x = w + 0.04;
    const wrap = new THREE.Group();
    wrap.add(g, inner);
    wrap.userData.dualOffset = (w + 0.04) / 2;
    g.position.x = 0;
    return wrap;
  }
  return g;
}


export function plateTex(text, bg = '#ffd400') {
  const [c, g] = canvas(256, 64);
  g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
  g.fillStyle = '#111'; g.font = 'bold 38px Arial'; g.textAlign = 'center';
  g.fillText(text, 128, 46);
  return ctex(c);
}

