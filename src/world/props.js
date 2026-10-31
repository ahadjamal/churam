// Roadside furniture that makes the NH766 ghat read as Kerala: striped parapets
// on the valley side, chevrons, numbered hairpin boards, yellow-topped NH
// milestones, KSEB concrete electric posts with sagging wires, streetlights,
// bus shelters, depots, fuel stations, the Lakkidi viewpoint tea stall and
// the famous Chain Tree.
import * as THREE from 'three';
import { Parts, paint } from '../vehicles/models.js';
import { canvas, textTexture } from '../util/textures.js';
import { mulberry32 } from '../util/noise.js';
import { BIOME, biomeAt } from './biome.js';

const ML = '"Nirmala UI", "Noto Sans Malayalam", sans-serif';

function stripeTexture(a, b, n = 4) {
  const [c, g] = canvas(256, 64);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 256) / n, 0, 256 / n + 1, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 200; i++) g.fillRect(Math.random() * 256, Math.random() * 64, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const tex = (opts) => new THREE.MeshStandardMaterial({ map: textTexture(opts), roughness: 0.6 });

export class Props {
  constructor(scene, ctx) {
    this.scene = scene;
    Object.assign(this, ctx); // net, rs, hf, biome, colliders, route, hairpins, places, veg
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xffd890, emissiveIntensity: 0 });
    this.barriers();
    this.chevronsAndHairpins();
    this.milestones();
    this.poles();
    this.depots();
    this.fuelStations();
    this.viewpoint();
    this.chainTree();
    this.busStops();
  }

  setNight(on) {
    this.lampMat.emissiveIntensity = on ? 3 : 0;
  }

  // ------------------------------------------------------------ parapets
  barriers() {
    const { route: P, hf, rs } = this;
    const mat = new THREE.MeshStandardMaterial({ map: stripeTexture('#f2f2ea', '#151515', 4), roughness: 0.8 });
    const geo = new THREE.BoxGeometry(2.0, 0.7, 0.3);
    const list = [];
    for (const side of [1, -1]) {
      let i = 0;
      for (let s = 0; s < P[P.length - 1].s; s += 2.5) {
        while (i < P.length - 2 && P[i + 1].s < s) i++;
        const a = P[i], b = P[i + 1];
        const t = (s - a.s) / Math.max(0.01, b.s - a.s);
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
        const lx = tz * side, lz = -tx * side;
        const off = a.hw + 1.0;
        const n1 = hf.natural(x + lx * (a.hw + 4), z + lz * (a.hw + 4));
        const n2 = hf.natural(x + lx * (a.hw + 9), z + lz * (a.hw + 9));
        if (y - Math.min(n1, n2) < 2.5) continue;
        const px = x + lx * off, pz = z + lz * off;
        const q = rs.nearest(px, pz, 6);
        if (q && q.e < 0.2) continue; // would sit on another road (junction / hairpin inner leg)
        const grade = (b.y - a.y) / L;
        list.push([px, y + 0.33, pz, Math.atan2(tx, tz) + Math.PI / 2, grade]);
        this.colliders.addSegment(px - tx * 1.1, pz - tz * 1.1, px + tx * 1.1, pz + tz * 1.1, y - 0.6, y + 0.75, 'barrier');
      }
    }
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), e = new THREE.Euler();
    list.forEach(([x, y, z, yaw, grade], k) => {
      e.set(0, yaw, Math.atan(grade) * (Math.cos(yaw) > 0 ? 1 : 1), 'YXZ');
      m.makeRotationFromEuler(new THREE.Euler(0, yaw, 0)).setPosition(x, y, z);
      im.setMatrixAt(k, m);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    this.group.add(im);
  }

  // ------------------------------------------------------------ chevrons & hairpin boards
  chevronsAndHairpins() {
    const { route: P, hairpins } = this;
    const chevMat = tex({ w: 128, h: 160, bg: '#f5c400', fg: '#111', lines: [{ text: '›', font: 'bold 170px Arial' }] });
    const post = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.7 });
    const p = new Parts();
    const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
    let lastChev = -1e9;
    for (let i = 5; i < P.length - 5; i++) {
      const a = at(i - 5), b = at(i), c = at(i + 5);
      const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x);
      let d = h2 - h1;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const len = c.s - a.s;
      const k = d / Math.max(1, len);
      if (Math.abs(k) < 1 / 55 || b.s - lastChev < 14) continue;
      lastChev = b.s;
      const tx = (c.x - a.x) / Math.hypot(c.x - a.x, c.z - a.z), tz = (c.z - a.z) / Math.hypot(c.x - a.x, c.z - a.z);
      // outer side of the bend: opposite to the turn direction
      const side = d > 0 ? 1 : -1;
      const lx = tz * side, lz = -tx * side;
      const off = b.hw + 1.6;
      const x = b.x + lx * off, z = b.z + lz * off;
      if (this.rs.nearest(x, z, 4)?.e < 0.3) continue;
      const y = this.rs.height(x, z);
      const yaw = Math.atan2(-lx, -lz);
      p.box(0.07, 1.2, 0.07, post, x, y + 0.6, z);
      p.plane(0.55, 0.7, chevMat, x - lx * 0.05, y + 1.45, z - lz * 0.05, 0, yaw, 0);
    }
    // numbered hairpin boards (Indian yellow informatory board + Malayalam)
    hairpins.forEach((hp, n) => {
      const num = n + 1;
      const board = tex({
        w: 512, h: 320, bg: '#f5c400', fg: '#111', border: '#111', borderW: 14,
        lines: [{ text: `HAIRPIN BEND ${num}`, font: 'bold 64px Arial' }, { text: `ഹെയർപിൻ ${num}`, font: `bold 58px ${ML}` }, { text: 'DRIVE SLOW', font: 'bold 44px Arial', color: '#b00' }],
      });
      const a = at(hp.i - 6), c = at(hp.i + 6);
      const tx = c.x - a.x, tz = c.z - a.z, L = Math.hypot(tx, tz) || 1;
      // place on the outside of the apex
      const cx = (a.x + c.x) / 2, cz = (a.z + c.z) / 2;
      let ox = hp.x - cx, oz = hp.z - cz;
      const ol = Math.hypot(ox, oz) || 1;
      ox /= ol; oz /= ol;
      const x = hp.x + ox * (P[hp.i].hw + 3.5), z = hp.z + oz * (P[hp.i].hw + 3.5);
      const y = this.rs.height(x, z);
      const yaw = Math.atan2(-ox, -oz);
      const sp = new Parts();
      sp.box(0.08, 2.2, 0.08, post, x + Math.cos(yaw) * 0.8, y + 1.1, z - Math.sin(yaw) * 0.8);
      sp.box(0.08, 2.2, 0.08, post, x - Math.cos(yaw) * 0.8, y + 1.1, z + Math.sin(yaw) * 0.8);
      sp.plane(2.0, 1.25, board, x, y + 2.1, z, 0, yaw, 0);
      sp.plane(2.0, 1.25, board, x - ox * 0.02, y + 2.1, z - oz * 0.02, 0, yaw + Math.PI, 0);
      const g = sp.build();
      this.group.add(g);
      // warning triangles ~70 m before on each approach
      for (const dir of [-1, 1]) {
        const w = at(hp.i + dir * 28);
        const w2 = at(hp.i + dir * 27);
        const ttx = w.x - w2.x, ttz = w.z - w2.z, tl = Math.hypot(ttx, ttz) || 1;
        const lx = (ttz / tl), lz = -(ttx / tl);
        const sx = w.x + lx * (w.hw + 1.5), sz = w.z + lz * (w.hw + 1.5);
        if (this.rs.nearest(sx, sz, 4)?.e < 0.3) continue;
        const sy = this.rs.height(sx, sz);
        this.warningSign(p, sx, sy, sz, Math.atan2(ttx / tl, ttz / tl), post);
      }
    });
    this.group.add(p.build());
  }

  warningSign(p, x, y, z, yaw, post) {
    if (!this.triMat) {
      const [c, g] = canvas(256, 256);
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(128, 12); g.lineTo(246, 230); g.lineTo(10, 230); g.closePath(); g.fill();
      g.strokeStyle = '#d0101a'; g.lineWidth = 22; g.lineJoin = 'round'; g.stroke();
      g.strokeStyle = '#111'; g.lineWidth = 14;
      g.beginPath(); g.moveTo(100, 200); g.lineTo(100, 120); g.arc(128, 120, 28, Math.PI, 0); g.lineTo(156, 200); g.stroke();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.triMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    }
    p.box(0.07, 2.0, 0.07, post, x, y + 1.0, z);
    p.plane(0.9, 0.9, this.triMat, x, y + 2.2, z, 0, yaw + Math.PI, 0);
  }

  // ------------------------------------------------------------ milestones
  milestones() {
    const { route: P } = this;
    const total = P[P.length - 1].s;
    const p = new Parts();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.8 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.7 });
    let i = 0;
    for (let km = 1; km < total / 1000; km++) {
      const s = total - km * 1000; // km to Kalpetta
      while (i < P.length - 2 && P[i + 1].s < s) i++;
      const a = P[i], b = P[i + 1];
      const tx = b.x - a.x, tz = b.z - a.z, L = Math.hypot(tx, tz) || 1;
      const lx = tz / L, lz = -tx / L; // left for northbound (climbing) traffic
      const x = a.x + lx * (a.hw + 1.3), z = a.z + lz * (a.hw + 1.3);
      if (this.rs.nearest(x, z, 4)?.e < 0.3) continue;
      const y = this.rs.height(x, z);
      const yaw = Math.atan2(tx / L, tz / L) + Math.PI; // face oncoming climbing traffic
      const face = new THREE.MeshStandardMaterial({
        map: textTexture({ w: 128, h: 160, bg: '#f2f2ea', fg: '#111', lines: [{ text: 'NH 766', font: 'bold 22px Arial' }, { text: 'KALPETTA', font: 'bold 22px Arial' }, { text: String(km), font: 'bold 48px Arial' }] }),
        roughness: 0.8,
      });
      p.box(0.46, 0.62, 0.2, white, x, y + 0.31, z, 0, yaw, 0);
      p.plane(0.44, 0.6, face, x - Math.sin(yaw) * 0.105, y + 0.32, z - Math.cos(yaw) * 0.105, 0, yaw + Math.PI, 0);
      p.cyl(0.23, 0.23, 0.2, yellow, x, y + 0.62, z, Math.PI / 2, yaw, 0, 12);
    }
    this.group.add(p.build());
  }

  // ------------------------------------------------------------ KSEB posts, wires, streetlights
  poles() {
    const { net, rs, hf } = this;
    const p = new Parts();
    const concrete = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x5b5f60, roughness: 0.6, metalness: 0.5 });
    const wires = [];
    const lights = new Parts();
    for (const e of net.edges) {
      if (!['trunk', 'primary', 'secondary'].includes(e.type) || e.len < 60) continue;
      let prev = null;
      for (let s = 15; s < e.len - 10; s += 38) {
        const c = net.sample(e, s);
        const lx = c.dz, lz = -c.dx; // left side
        const off = e.hw + 2.3;
        const x = c.x + lx * off, z = c.z + lz * off;
        const q = rs.nearest(x, z, 5);
        if (q && q.e < 1.0) { prev = null; continue; }
        if (this.buildings && this.buildings.occupied(x, z)) { prev = null; continue; }
        const y = rs.height(x, z);
        if (Math.abs(y - c.y) > 4) { prev = null; continue; }
        p.add(new THREE.CylinderGeometry(0.09, 0.15, 8.5, 6), concrete, x, y + 4.0, z);
        const yaw = Math.atan2(c.dx, c.dz);
        p.box(1.3, 0.1, 0.1, steel, x, y + 7.6, z, 0, yaw + Math.PI / 2, 0);
        this.colliders.addCircle(x, z, 0.2, y - 1, y + 8, 'pole');
        const arm = [[-0.6, 7.75], [0, 8.05], [0.6, 7.75]].map(([o, h]) => [x + Math.cos(yaw) * o * 0 + lx * o, y + h, z + lz * o]);
        if (prev) {
          for (let k = 0; k < 3; k++) {
            const A = prev[k], B = arm[k];
            const N = 6;
            for (let j = 0; j < N; j++) {
              const t0 = j / N, t1 = (j + 1) / N;
              const sag = (t) => -Math.sin(Math.PI * t) * 0.7;
              wires.push(A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0 + sag(t0), A[2] + (B[2] - A[2]) * t0,
                A[0] + (B[0] - A[0]) * t1, A[1] + (B[1] - A[1]) * t1 + sag(t1), A[2] + (B[2] - A[2]) * t1);
            }
          }
        }
        prev = arm;
        // streetlight arm in towns
        if (biomeAt(hf, this.biome, x, z) === BIOME.TOWN) {
          lights.box(0.06, 0.06, 2.2, steel, x - lx * 1.1, y + 7.0, z - lz * 1.1, 0, yaw + Math.PI / 2, 0);
          lights.box(0.5, 0.12, 0.25, this.lampMat, x - lx * 2.1, y + 6.9, z - lz * 2.1, 0, yaw, 0);
        }
      }
    }
    this.group.add(p.build());
    this.group.add(lights.build(false));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  }

  // ------------------------------------------------------------ depots & fuel
  depots() {
    for (const d of this.places.depots) {
      const p = new Parts();
      const steel = new THREE.MeshStandardMaterial({ color: 0x6c7276, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
      const wall = paint(0xd8d0b8, 0.9);
      const yaw = Math.atan2(d.dx, d.dz);
      // shed on the far side of the pad
      const fx = d.x + d.lx * 9.5, fz = d.z + d.lz * 9.5;
      const y = this.rs.height(fx, fz);
      const L = d.halfLen * 1.4;
      // keep trees and grass out of the yard and shed
      if (this.buildings) {
        for (let a = -L / 2 - 4; a <= L / 2 + 4; a += 4)
          for (let o = -10; o <= 8; o += 4) {
            const x = fx + d.dx * a + d.lx * o, z = fz + d.dz * a + d.lz * o;
            this.buildings.occ.add(Math.floor(x / 5) * 100003 + Math.floor(z / 5));
          }
      }
      p.box(L, 0.2, 8, paint(0x9a9a92), fx + d.lx * 2, y + 0.1, fz + d.lz * 2, 0, yaw + Math.PI / 2, 0);
      for (const t of [-1, -0.33, 0.33, 1])
        for (const o of [-1.5, 5.5]) p.box(0.2, 5.2, 0.2, steel, fx + d.dx * t * L / 2 + d.lx * o, y + 2.6, fz + d.dz * t * L / 2 + d.lz * o);
      p.box(L + 1, 0.08, 9.5, steel, fx + d.lx * 2, y + 5.3, fz + d.lz * 2, 0.08 * (d.side > 0 ? 1 : -1), yaw + Math.PI / 2, 0);
      p.box(L, 3.0, 0.25, wall, fx + d.lx * 5.8, y + 1.5, fz + d.lz * 5.8, 0, yaw + Math.PI / 2, 0);
      // sack stacks
      const sack = paint(0xc8b48a, 0.95);
      const rnd = mulberry32(d.id.length * 13);
      for (let k = 0; k < 6; k++) {
        const t = (k / 5 - 0.5) * L * 0.8;
        p.rbox(1.6, 0.4 + rnd() * 1.2, 1.2, 0.15, sack, fx + d.dx * t + d.lx * 3, y + 0.6, fz + d.dz * t + d.lz * 3, 0, yaw, 0);
      }
      // name board
      const board = tex({
        w: 768, h: 256, bg: '#0d4a8a', fg: '#ffffff', border: '#f2c230', borderW: 12,
        lines: [{ text: d.name.toUpperCase(), font: 'bold 56px Arial' }, { text: d.ml, font: `bold 52px ${ML}`, color: '#f2c230' }],
      });
      const bx = d.x - d.dx * (d.halfLen + 1) + d.lx * 3, bz = d.z - d.dz * (d.halfLen + 1) + d.lz * 3;
      const by = this.rs.height(bx, bz);
      p.box(0.12, 3.2, 0.12, steel, bx + d.dx * 0.1 - d.lx * 1.6, by + 1.6, bz + d.dz * 0.1 - d.lz * 1.6);
      p.box(0.12, 3.2, 0.12, steel, bx + d.dx * 0.1 + d.lx * 1.6, by + 1.6, bz + d.dz * 0.1 + d.lz * 1.6);
      p.plane(3.6, 1.2, board, bx, by + 3.0, bz, 0, yaw + Math.PI, 0);
      p.plane(3.6, 1.2, board, bx + d.dx * 0.02, by + 3.0, bz + d.dz * 0.02, 0, yaw, 0);
      this.group.add(p.build());
      this.colliders.addSegment(fx + d.lx * 5.8 - d.dx * L / 2, fz + d.lz * 5.8 - d.dz * L / 2, fx + d.lx * 5.8 + d.dx * L / 2, fz + d.lz * 5.8 + d.dz * L / 2, y - 1, y + 4, 'building');
      // big floating marker (visible from afar)
      d.marker = this.marker(d.x, this.rs.height(d.x, d.z) + 9, d.z, 0xf2c230);
    }
  }

  fuelStations() {
    for (const f of this.places.fuel) {
      const p = new Parts();
      const yaw = Math.atan2(f.dx, f.dz);
      const y = this.rs.height(f.x, f.z);
      const white = paint(0xf2f2f2, 0.5), green = paint(0x1d7a3a, 0.5), steel = paint(0xb0b4b8, 0.4);
      p.box(18, 0.5, 9, white, f.x, y + 5.6, f.z, 0, yaw + Math.PI / 2, 0);
      p.box(18.1, 0.6, 9.1, green, f.x, y + 5.1, f.z, 0, yaw + Math.PI / 2, 0);
      for (const t of [-1, 1]) {
        p.box(0.5, 5, 0.5, steel, f.x + f.dx * t * 5, y + 2.5, f.z + f.dz * t * 5);
        p.box(0.7, 1.7, 1.0, white, f.x + f.dx * t * 5 + f.lx * 2.5, y + 0.85, f.z + f.dz * t * 5 + f.lz * 2.5, 0, yaw, 0);
        p.box(0.72, 0.4, 1.02, green, f.x + f.dx * t * 5 + f.lx * 2.5, y + 1.5, f.z + f.dz * t * 5 + f.lz * 2.5, 0, yaw, 0);
        this.colliders.addCircle(f.x + f.dx * t * 5, f.z + f.dz * t * 5, 0.4, y - 1, y + 5, 'pole');
      }
      const sign = tex({ w: 256, h: 384, bg: '#1d7a3a', fg: '#fff', lines: [{ text: 'FUEL', font: 'bold 58px Arial' }, { text: 'ഇന്ധനം', font: `bold 44px ${ML}` }, { text: 'DIESEL', font: 'bold 36px Arial', color: '#ffd400' }, { text: '₹ 95.80', font: 'bold 48px Arial', color: '#ffd400' }] });
      const sx = f.x - f.dx * (f.halfLen + 1) - f.lx * 3.5, sz = f.z - f.dz * (f.halfLen + 1) - f.lz * 3.5;
      const sy = this.rs.height(sx, sz);
      p.box(0.25, 4, 0.25, steel, sx, sy + 2, sz);
      p.plane(1.6, 2.4, sign, sx, sy + 4.5, sz, 0, yaw + Math.PI, 0);
      p.plane(1.6, 2.4, sign, sx, sy + 4.5, sz, 0, yaw, 0);
      this.group.add(p.build());
      f.marker = this.marker(f.x, y + 8, f.z, 0x2ecc71, 0.6);
    }
  }

  marker(x, y, z, color, scale = 1) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1.2 * scale, 2.4 * scale, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, fog: false }));
    m.rotation.x = Math.PI;
    m.position.set(x, y, z);
    this.group.add(m);
    return m;
  }

  // ------------------------------------------------------------ Lakkidi viewpoint & chain tree
  viewpoint() {
    for (const v of this.places.viewpoints) {
      const q = this.rs.nearest(v.p[0], v.p[1], 120);
      if (!q || q.cls !== 0) continue;
      const seg = this.rs.seg, o = q.seg * 8;
      const rx = seg[o] + (seg[o + 3] - seg[o]) * q.t, rz = seg[o + 1] + (seg[o + 4] - seg[o + 1]) * q.t;
      // valley side = lower natural ground
      let best = null;
      for (const side of [1, -1]) {
        const lx = q.dz * side, lz = -q.dx * side;
        const n = this.hf.natural(rx + lx * 15, rz + lz * 15);
        if (!best || n < best.n) best = { lx, lz, n, side };
      }
      const { lx, lz } = best;
      const p = new Parts();
      const rail = paint(0xf2f2ea, 0.7), dark = paint(0x2a2a2a, 0.7);
      const yaw = Math.atan2(q.dx, q.dz);
      for (let t = -12; t <= 12; t += 2) {
        const x = rx + q.dx * t + lx * (q.hw + 2.2), z = rz + q.dz * t + lz * (q.hw + 2.2);
        const y = this.rs.height(x, z);
        p.box(0.12, 1.0, 0.12, (t / 2) % 2 ? rail : dark, x, y + 0.5, z);
      }
      for (const h of [0.55, 0.95]) p.box(0.06, 0.06, 24, rail, rx + lx * (q.hw + 2.2), q.h + h, rz + lz * (q.hw + 2.2), 0, yaw, 0);
      // tea stall on the hill side
      const sx = rx - lx * (q.hw + 4) + q.dx * 18, sz = rz - lz * (q.hw + 4) + q.dz * 18;
      const sy = this.rs.height(sx, sz);
      const tin = new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
      p.box(3.4, 2.4, 2.6, paint(0x3f7fbf, 0.8), sx, sy + 1.2, sz, 0, yaw, 0);
      p.box(4.6, 0.06, 4.2, tin, sx - lx * 0.6, sy + 2.7, sz - lz * 0.6, 0.12, yaw, 0);
      p.box(3.0, 0.9, 0.5, paint(0x7a5232), sx + lx * 1.5, sy + 0.45, sz + lz * 1.5, 0, yaw, 0);
      p.box(2.2, 0.08, 0.5, paint(0x7a5232), sx + lx * 2.6 + q.dx * 2, sy + 0.45, sz + lz * 2.6 + q.dz * 2, 0, yaw, 0);
      for (let k = 0; k < 5; k++) p.cyl(0.1, 0.1, 0.3, M_glass(), sx + lx * 1.5 + q.dx * (k - 2) * 0.4, sy + 1.05, sz + lz * 1.5 + q.dz * (k - 2) * 0.4);
      const board = tex({ w: 512, h: 128, bg: '#c0141c', fg: '#fff', lines: [{ text: 'ചായ • TEA • SNACKS', font: `bold 50px ${ML}` }] });
      p.plane(3.2, 0.8, board, sx + lx * 1.32, sy + 2.25, sz + lz * 1.32, 0, Math.atan2(lx, lz), 0);
      const vboard = tex({ w: 512, h: 256, bg: '#7a3b12', fg: '#fff', border: '#f2c230', lines: [{ text: /lakkidi/i.test(v.name) ? 'LAKKIDI VIEW POINT' : 'CHURAM VIEW POINT', font: 'bold 46px Arial' }, { text: /lakkidi/i.test(v.name) ? 'ലക്കിടി വ്യൂ പോയിന്റ്' : 'ചുരം വ്യൂ പോയിന്റ്', font: `bold 42px ${ML}` }] });
      const bx = rx + lx * (q.hw + 3) - q.dx * 14, bz = rz + lz * (q.hw + 3) - q.dz * 14;
      const by = this.rs.height(bx, bz);
      p.box(0.1, 2.4, 0.1, rail, bx, by + 1.2, bz);
      p.plane(2.4, 1.2, vboard, bx, by + 2.6, bz, 0, Math.atan2(-lx, -lz), 0);
      this.group.add(p.build());
    }
  }

  chainTree() {
    // Lakkidi chain tree stands beside NH766 just north of the ghat top
    const P = this.route;
    let best = null;
    for (const pt of P) {
      const d = Math.hypot(pt.x - -2700, pt.z - 2550);
      if (!best || d < best.d) best = { d, pt };
    }
    if (!best) return;
    const i = P.indexOf(best.pt);
    const a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)];
    const tx = b.x - a.x, tz = b.z - a.z, L = Math.hypot(tx, tz) || 1;
    const lx = tz / L, lz = -tx / L;
    const x = best.pt.x + lx * (best.pt.hw + 6), z = best.pt.z + lz * (best.pt.hw + 6);
    const y = this.rs.height(x, z);
    const tree = new THREE.Mesh(this.veg.geos.rainforest, this.veg.material);
    tree.position.set(x, y - 0.3, z);
    tree.scale.setScalar(1.25);
    tree.castShadow = true;
    this.group.add(tree);
    const p = new Parts();
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.6, metalness: 0.8 });
    for (let k = 0; k < 14; k++) p.add(new THREE.TorusGeometry(0.09, 0.025, 6, 10), iron, x + 0.7, y + 9.5 - k * 0.16, z + 0.2, 0, k % 2 ? Math.PI / 2 : 0, 0);
    p.box(0.8, 0.05, 0.05, iron, x + 0.4, y + 9.6, z + 0.2);
    const fence = paint(0xf2f2ea, 0.7);
    for (let k = 0; k < 12; k++) {
      const a2 = (k / 12) * Math.PI * 2;
      p.box(0.1, 0.8, 0.1, fence, x + Math.cos(a2) * 2.2, y + 0.4, z + Math.sin(a2) * 2.2);
    }
    const sign = tex({ w: 512, h: 256, bg: '#1e4e2a', fg: '#fff', border: '#f2c230', lines: [{ text: 'CHAIN TREE', font: 'bold 60px Arial' }, { text: 'ചങ്ങല മരം', font: `bold 54px ${ML}` }] });
    p.box(0.1, 1.6, 0.1, fence, x - lx * 3, y + 0.8, z - lz * 3);
    p.plane(1.6, 0.8, sign, x - lx * 3, y + 1.8, z - lz * 3, 0, Math.atan2(-lx, -lz), 0);
    this.group.add(p.build());
    this.colliders.addCircle(x, z, 0.8, y - 1, y + 10, 'tree');
  }

  busStops() {
    const towns = [[-663, -1226], [-2688, 2701], [1542, -3210], [4124, -7218], [-3532, 6637]];
    const roof = paint(0xc8c4b8, 0.9), pillar = paint(0x2f6fb0, 0.6), bench = paint(0x7a5232, 0.8);
    const sign = tex({ w: 512, h: 128, bg: '#2f6fb0', fg: '#fff', lines: [{ text: 'ബസ് സ്റ്റോപ്പ് • BUS STOP', font: `bold 44px ${ML}` }] });
    for (const [tx, tz] of towns) {
      const q = this.rs.nearest(tx, tz, 400);
      if (!q || q.cls > 1) continue;
      const seg = this.rs.seg, o = q.seg * 8;
      const rx = seg[o] + (seg[o + 3] - seg[o]) * q.t, rz = seg[o + 1] + (seg[o + 4] - seg[o + 1]) * q.t;
      const lx = q.dz, lz = -q.dx;
      const x = rx + lx * (q.hw + 3.2), z = rz + lz * (q.hw + 3.2);
      if (this.rs.nearest(x, z, 4)?.e < 0.5) continue;
      const y = this.rs.height(x, z);
      const yaw = Math.atan2(q.dx, q.dz);
      const p = new Parts();
      p.box(5, 0.18, 2.6, roof, x, y + 2.8, z, 0, yaw + Math.PI / 2, 0);
      for (const t of [-2.2, 2.2]) p.box(0.25, 2.8, 2.2, pillar, x + q.dx * t, y + 1.4, z + q.dz * t, 0, yaw, 0);
      p.box(4, 0.1, 0.5, bench, x + lx * 0.5, y + 0.5, z + lz * 0.5, 0, yaw + Math.PI / 2, 0);
      p.box(5, 0.3, 0.05, pillar, x - lx * 1.3, y + 2.5, z - lz * 1.3, 0, yaw + Math.PI / 2, 0);
      p.plane(3.2, 0.8, sign, x - lx * 1.32, y + 2.4, z - lz * 1.32, 0, Math.atan2(-lx, -lz), 0);
      this.group.add(p.build());
    }
  }

  update(t) {
    for (const d of [...this.places.depots, ...this.places.fuel]) {
      if (!d.marker) continue;
      d.marker.rotation.y = t * 1.2;
      d.marker.position.y = d.markerBase ??= d.marker.position.y;
      d.marker.position.y = d.markerBase + Math.sin(t * 2) * 0.4;
    }
  }
}

let glassMat;
function M_glass() {
  return (glassMat ??= new THREE.MeshStandardMaterial({ color: 0xd8c890, roughness: 0.1, transparent: true, opacity: 0.7 }));
}
