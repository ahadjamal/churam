// Real OSM building footprints extruded as Kerala-style houses and shops:
// pastel plastered walls, clay-tile hip roofs or flat concrete roofs with
// parapets and black rooftop water tanks, shop fronts along the highway.
import * as THREE from 'three';
import { facadeTexture, roofTileTexture, concreteTexture } from '../util/textures.js';
import { hashInt, mulberry32 } from '../util/noise.js';

const TILE = 1000;
const FLOOR = 3.0;
const OCC = 5;
const HOUSE_COLS = ['#f4f1e8', '#efe6c8', '#e9dca0', '#cfe3c0', '#bfd9e6', '#f0cfc0', '#e8c39a', '#d9d2e8', '#f7f3b0', '#a8d4b0', '#ffffff', '#f1e3d3'];
const SHOP_COLS = ['#f2d24a', '#3a8fd0', '#e05a3a', '#4cae5a', '#f0f0f0', '#e88a2a', '#8fd0e8', '#d84a8a'];

class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  tri(a, b, c, ua, ub, uc, col) {
    const e1 = new THREE.Vector3().subVectors(b, a), e2 = new THREE.Vector3().subVectors(c, a);
    const n = e1.cross(e2).normalize();
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) {
      this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z); this.uv.push(u[0], u[1]); this.c.push(col.r, col.g, col.b);
    }
  }
  quad(a, b, c, d, ua, ub, uc, ud, col) {
    this.tri(a, b, c, ua, ub, uc, col);
    this.tri(a, c, d, ua, uc, ud, col);
  }
}

export class Buildings {
  constructor(scene, map, rs, colliders) {
    this.scene = scene;
    this.rs = rs;
    this.occ = new Set();
    this.colliders = colliders;
    this.mats = {
      house: new THREE.MeshStandardMaterial({ map: facadeTexture('house'), vertexColors: true, roughness: 0.92 }),
      shop: new THREE.MeshStandardMaterial({ map: facadeTexture('shop'), vertexColors: true, roughness: 0.85 }),
      tile: new THREE.MeshStandardMaterial({ map: roofTileTexture(), vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
      flat: new THREE.MeshStandardMaterial({ map: concreteTexture(), vertexColors: true, roughness: 0.95 }),
    };
    this.tiles = new Map();
    // building density per 120 m cell: isolated roadside huts stay small
    this.density = new Map();
    for (const b of map.buildings) {
      const k = Math.floor(b.pts[0][0] / 120) * 100003 + Math.floor(b.pts[0][1] / 120);
      this.density.set(k, (this.density.get(k) || 0) + 1);
    }
    for (const b of map.buildings) this.add(b);
    // flush() is called by the caller after procedural town buildings are added
  }

  occupied(x, z) {
    return this.occ.has(Math.floor(x / OCC) * 100003 + Math.floor(z / OCC));
  }

  buf(x, z, mat) {
    const key = `${mat}:${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let b = this.tiles.get(key);
    if (!b) this.tiles.set(key, (b = { mat, buf: new Buf() }));
    return b.buf;
  }

  add(b) {
    let pts = b.pts.slice();
    if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) return false;
    let A = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      A += p[0] * q[1] - q[0] * p[1];
    }
    A /= 2;
    if (Math.abs(A) < 14 || Math.abs(A) > 5000) return false;
    if (A < 0) pts.reverse();
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cz += p[1]; }
    cx /= pts.length; cz /= pts.length;
    const rs = this.rs;
    const q = rs.nearest(cx, cz, 30);
    if (q && q.e < 1.5) return false; // misaligned footprint sitting on a road
    for (const p of pts) {
      const qq = rs.nearest(p[0], p[1], 5);
      if (qq && qq.e < -0.5) return false;
    }

    const rnd = mulberry32(hashInt(Math.round(cx), Math.round(cz), 3));
    let gMin = Infinity, gMax = -Infinity;
    for (const p of pts) {
      const h = rs.height(p[0], p[1]);
      gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
    }
    if (gMax - gMin > 5) return false; // footprint straddles a steep slope or a road cutting
    const dense = (this.density.get(Math.floor(cx / 120) * 100003 + Math.floor(cz / 120)) || 0) >= 8;
    const nearMain = q && q.e < 18 && q.cls <= 2 && dense;
    const isShop = b.forceShop || nearMain && ['yes', 'commercial', 'retail'].includes(b.b) && Math.abs(A) < 900;
    // Kerala town main roads are lined with 2-4 storey concrete shop blocks
    let levels = b.l || (b.b === 'house' ? (rnd() < 0.6 ? 1 : 2) : nearMain ? 2 + Math.floor(rnd() * 2.4) : rnd() < 0.55 ? 1 : 2);
    if (['school', 'college', 'hospital', 'university'].includes(b.b)) levels = b.l || 2;
    levels = Math.min(levels, dense ? 6 : 2);
    const top = gMax + levels * FLOOR;
    const base = gMin - 0.6;
    const isRect = pts.length === 4 && rectangular(pts);
    const hip = !b.flatRoof && isRect && !isShop && rnd() < (b.b === 'house' ? 0.65 : 0.4) && levels <= 2;
    const parapet = hip ? 0 : 0.9;

    const wallCol = new THREE.Color(HOUSE_COLS[Math.floor(rnd() * HOUSE_COLS.length)]);
    const shopCol = new THREE.Color(SHOP_COLS[Math.floor(rnd() * SHOP_COLS.length)]);
    const house = this.buf(cx, cz, 'house');
    const shop = isShop ? this.buf(cx, cz, 'shop') : null;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    let along = rnd() * 4;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], n = pts[(i + 1) % pts.length];
      const L = Math.hypot(n[0] - p[0], n[1] - p[1]);
      const u0 = along / 4, u1 = (along + L) / 4;
      along += L;
      const wall = (buf, y0, y1, col) => {
        const v0 = (y0 - gMax) / FLOOR, v1 = (y1 - gMax) / FLOOR;
        buf.quad(V(n[0], y0, n[1]), V(p[0], y0, p[1]), V(p[0], y1, p[1]), V(n[0], y1, n[1]), [u1, v0], [u0, v0], [u0, v1], [u1, v1], col);
      };
      if (shop) {
        wall(shop, base, gMax + FLOOR, shopCol);
        if (top + parapet > gMax + FLOOR) wall(house, gMax + FLOOR, top + parapet, wallCol);
      } else wall(house, base, top + parapet, wallCol);
      if (parapet) {
        // inner face of the parapet
        const v0 = 0.9, v1 = 0.95;
        house.quad(V(p[0], top, p[1]), V(n[0], top, n[1]), V(n[0], top + parapet, n[1]), V(p[0], top + parapet, p[1]), [0, v0], [0.1, v0], [0.1, v1], [0, v1], wallCol);
      }
      this.colliders.addSegment(p[0], p[1], n[0], n[1], base - 1, top, 'building');
    }

    if (hip) this.hipRoof(pts, top, rnd);
    else this.flatRoof(pts, top, cx, cz, rnd);

    // occupancy for vegetation
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    for (let x = Math.floor((x0 - 1.5) / OCC); x <= Math.floor((x1 + 1.5) / OCC); x++)
      for (let z = Math.floor((z0 - 1.5) / OCC); z <= Math.floor((z1 + 1.5) / OCC); z++) this.occ.add(x * 100003 + z);
    return true;
  }

  flatRoof(pts, top, cx, cz, rnd) {
    const buf = this.buf(cx, cz, 'flat');
    const grey = new THREE.Color(0xffffff).multiplyScalar(0.75 + rnd() * 0.25);
    const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [a, b, c] of tris) {
      let A = new THREE.Vector3(pts[a][0], top + 0.05, pts[a][1]);
      let B = new THREE.Vector3(pts[b][0], top + 0.05, pts[b][1]);
      const Cc = new THREE.Vector3(pts[c][0], top + 0.05, pts[c][1]);
      const ny = (B.z - A.z) * (Cc.x - A.x) - (B.x - A.x) * (Cc.z - A.z);
      if (ny < 0) [A, B] = [B, A];
      buf.tri(A, B, Cc, [A.x / 3, A.z / 3], [B.x / 3, B.z / 3], [Cc.x / 3, Cc.z / 3], grey);
    }
    // black plastic water tank
    if (rnd() < 0.65) {
      const r = 0.55, h = 1.1, tx = cx + (rnd() - 0.5) * 2, tz = cz + (rnd() - 0.5) * 2;
      const dark = new THREE.Color(0x111111);
      const segs = 10;
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
        const p0 = [tx + Math.cos(a0) * r, tz + Math.sin(a0) * r], p1 = [tx + Math.cos(a1) * r, tz + Math.sin(a1) * r];
        buf.quad(
          new THREE.Vector3(p1[0], top, p1[1]), new THREE.Vector3(p0[0], top, p0[1]),
          new THREE.Vector3(p0[0], top + h, p0[1]), new THREE.Vector3(p1[0], top + h, p1[1]),
          [0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], dark
        );
        buf.tri(new THREE.Vector3(tx, top + h + 0.12, tz), new THREE.Vector3(p1[0], top + h, p1[1]), new THREE.Vector3(p0[0], top + h, p0[1]), [0, 0], [0, 0], [0, 0], dark);
      }
    }
  }

  hipRoof(pts, top, rnd) {
    const P = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const e0 = P[1].clone().sub(P[0]), e1 = P[2].clone().sub(P[1]);
    let [u, L, v, W] = e0.length() >= e1.length() ? [e0.clone().normalize(), e0.length(), e1.clone().normalize(), e1.length()] : [e1.clone().normalize(), e1.length(), e0.clone().normalize(), e0.length()];
    const c = P[0].clone().add(P[1]).add(P[2]).add(P[3]).multiplyScalar(0.25);
    const o = 0.55;
    L += 2 * o; W += 2 * o;
    const rh = W * (0.3 + rnd() * 0.08);
    const eave = top - 0.15;
    const corner = (su, sv) => {
      const q = c.clone().addScaledVector(u, (su * L) / 2).addScaledVector(v, (sv * W) / 2);
      return new THREE.Vector3(q.x, eave, q.y);
    };
    const rl = Math.max(0, L / 2 - W / 2);
    const r0 = c.clone().addScaledVector(u, -rl), r1 = c.clone().addScaledVector(u, rl);
    const R0 = new THREE.Vector3(r0.x, eave + rh, r0.y), R1 = new THREE.Vector3(r1.x, eave + rh, r1.y);
    const a = corner(-1, -1), b = corner(1, -1), cc = corner(1, 1), d = corner(-1, 1);
    const buf = this.buf(c.x, c.y, 'tile');
    const col = new THREE.Color(0xffffff).multiplyScalar(0.8 + rnd() * 0.3);
    const uvOf = (p) => [(p.x * u.x + p.z * u.y) / 2.5, (p.x * v.x + p.z * v.y + p.y) / 2.5];
    const up = (A, B, Cc) => {
      const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A));
      return n.y >= 0 ? [A, B, Cc] : [A, Cc, B];
    };
    const face = (...vs) => {
      for (let i = 1; i < vs.length - 1; i++) {
        const [A, B, Cc] = up(vs[0], vs[i], vs[i + 1]);
        buf.tri(A, B, Cc, uvOf(A), uvOf(B), uvOf(Cc), col);
      }
    };
    face(a, b, R1, R0);
    face(cc, d, R0, R1);
    face(b, cc, R1);
    face(d, a, R0);
    // dark underside of the eaves
    const under = new THREE.Color(0x3a2a20);
    for (const [A, B] of [[a, b], [b, cc], [cc, d], [d, a]]) {
      const lift = (p) => new THREE.Vector3(p.x, p.y, p.z);
      buf.tri(lift(A), lift(B), new THREE.Vector3(c.x, eave, c.y), [0, 0], [0, 0], [0, 0], under);
    }
  }

  flush() {
    const group = new THREE.Group();
    for (const { mat, buf } of this.tiles.values()) {
      if (!buf.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mats[mat]);
      m.castShadow = true;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
    }
    this.tiles.clear();
    this.scene.add(group);
    this.group = group;
  }
}

function rectangular(pts) {
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
    const cos = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz));
    if (Math.abs(cos) > 0.2) return false;
  }
  return true;
}
