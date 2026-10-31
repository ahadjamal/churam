// Wayanad flora: evergreen rainforest trees, jack/anjili, silver oak with pepper
// vines, areca and coconut palms, banana, bamboo, coffee bushes and grass.
// Streamed in 80 m cells; near = full geometry, far = baked impostor cards.
import * as THREE from 'three';
import { foliageAtlas, atlasUV } from '../util/textures.js';
import { mulberry32, hashInt, perlin2 } from '../util/noise.js';
import { BIOME, biomeAt } from './biome.js';

const CELL = 80;
const NEAR_R = 240;
const FAR_R = 1050;

// ------------------------------------------------------------------ geometry builder
class GB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  vtx(x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(col.r, col.g, col.b);
    return this.p.length / 3 - 1;
  }
  /** quad from 4 corners (bl, br, tr, tl) with an atlas rect; normals bent outward from `centre`. */
  quad(bl, br, tr, tl, uv, col, centre = null, flipU = false) {
    const [u0, v0, u1, v1] = uv;
    const us = flipU ? [u1, u0] : [u0, u1];
    const nrm = (p) => {
      if (!centre) return [0, 1, 0];
      const d = new THREE.Vector3(p[0] - centre.x, p[1] - centre.y, p[2] - centre.z).normalize();
      d.y = d.y * 0.6 + 0.55;
      d.normalize();
      return [d.x, d.y, d.z];
    };
    const a = this.vtx(...bl, ...nrm(bl), us[0], v0, col);
    const b = this.vtx(...br, ...nrm(br), us[1], v0, col);
    const c = this.vtx(...tr, ...nrm(tr), us[1], v1, col);
    const d = this.vtx(...tl, ...nrm(tl), us[0], v1, col);
    this.i.push(a, b, c, a, c, d);
  }
  /** Billboard-ish card centred at (cx,cy,cz), size w x h, yaw ry, tilt about its horizontal axis. */
  card(cx, cy, cz, w, h, ry, tilt, uv, col, centre) {
    const ax = Math.cos(ry), az = -Math.sin(ry); // horizontal axis
    const bx = Math.sin(ry), bz = Math.cos(ry); // facing
    const up = [Math.sin(tilt) * bx, Math.cos(tilt), Math.sin(tilt) * bz];
    const P = (sx, sy) => [cx + ax * sx * w / 2 + up[0] * sy * h / 2, cy + up[1] * sy * h / 2, cz + az * sx * w / 2 + up[2] * sy * h / 2];
    this.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), uv, col, centre);
  }
  /** Tapered, optionally curved cylinder (trunks, culms, pseudo-stems). */
  tube(x, z, y0, y1, r0, r1, segs, rings, uv, col, bend = null) {
    const [u0, v0, u1, v1] = uv;
    const base = this.p.length / 3;
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      const y = y0 + (y1 - y0) * t;
      const r = r0 + (r1 - r0) * t;
      const [ox, oz] = bend ? bend(t) : [0, 0];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const nx = Math.cos(a), nz = Math.sin(a);
        this.vtx(x + ox + nx * r, y, z + oz + nz * r, nx, 0, nz, u0 + (u1 - u0) * (s / segs), v0 + (v1 - v0) * t, col);
      }
    }
    for (let k = 0; k < rings; k++)
      for (let s = 0; s < segs; s++) {
        const a = base + k * (segs + 1) + s, b = a + segs + 1;
        this.i.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  /** Drooping frond strip (palm / banana leaf). */
  frond(x, y, z, yaw, pitch, len, wid, droop, uv, col, segs = 4) {
    const [u0, v0, u1, v1] = uv;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const sx = -dz, sz = dx;
    const base = this.p.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const h = len * t;
      const px = x + dx * h * Math.cos(pitch);
      const pz = z + dz * h * Math.cos(pitch);
      const py = y + h * Math.sin(pitch) - droop * t * t * len;
      const w = wid * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)));
      const u = u0 + (u1 - u0) * t;
      this.vtx(px + sx * w / 2, py, pz + sz * w / 2, 0, 1, 0, u, v1, col);
      this.vtx(px - sx * w / 2, py, pz - sz * w / 2, 0, 1, 0, u, v0, col);
    }
    for (let k = 0; k < segs; k++) {
      const a = base + k * 2;
      this.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

const C = (hex) => new THREE.Color(hex);
const UV = {
  leaf: atlasUV('broadleaf'), frond: atlasUV('frond'), banana: atlasUV('banana'), fine: atlasUV('fine'),
  bark: atlasUV('bark'), shrub: atlasUV('shrub'), grass: atlasUV('grass'),
};

// ------------------------------------------------------------------ species
const SPECIES = {
  rainforest: {
    w: 18, h: 26, shadow: true,
    build(r) {
      const g = new GB();
      const H = 15 + r() * 4;
      g.tube(0, 0, -0.5, H, 0.55, 0.28, 8, 4, UV.bark, C(0xd8d0c4), (t) => [Math.sin(t * 2) * 0.4, 0]);
      // a few branches
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + r();
        g.tube(0, 0, H * 0.75, H + 2.5, 0.16, 0.08, 5, 1, UV.bark, C(0xc8c0b0), (t) => [Math.cos(a) * t * 3.5, Math.sin(a) * t * 3.5]);
      }
      const centre = new THREE.Vector3(0, H + 2, 0);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + r() * 0.6;
        const rad = k === 0 ? 0 : 2.5 + r() * 2.5;
        const s = 6.5 + r() * 3;
        g.card(Math.cos(a) * rad, H + 1 + r() * 3.5, Math.sin(a) * rad, s, s * 0.85, a + Math.PI / 2, 1.0 + r() * 0.4, UV.leaf, C(0xffffff).multiplyScalar(0.85 + r() * 0.3), centre);
      }
      for (let k = 0; k < 3; k++) g.card(0, H + 1.5, 0, 11, 8, (k / 3) * Math.PI, 0, UV.leaf, C(0xe0e0e0), centre);
      return g.build();
    },
  },
  jack: {
    w: 10, h: 13, shadow: true,
    build(r) {
      const g = new GB();
      const H = 5 + r() * 2;
      g.tube(0, 0, -0.3, H + 2, 0.32, 0.18, 7, 3, UV.bark, C(0xb8a898));
      const centre = new THREE.Vector3(0, H + 3, 0);
      for (let k = 0; k < 10; k++) {
        const a = r() * Math.PI * 2, rad = r() * 2.4, y = H + r() * 5;
        g.card(Math.cos(a) * rad, y, Math.sin(a) * rad, 4.5 + r() * 2, 4 + r() * 2, r() * Math.PI, (r() - 0.5) * 1.2, UV.leaf, C(0xd8e8c8).multiplyScalar(0.8 + r() * 0.3), centre);
      }
      return g.build();
    },
  },
  silveroak: {
    w: 7, h: 22, shadow: true,
    build(r) {
      const g = new GB();
      const H = 17 + r() * 4;
      g.tube(0, 0, -0.3, H, 0.26, 0.1, 7, 4, UV.bark, C(0x9a9088));
      // black-pepper vine climbing the lower trunk
      g.tube(0, 0, 0.3, 5.5, 0.55, 0.42, 7, 2, UV.shrub, C(0x8fbf70));
      for (let k = 0; k < 3; k++) g.card(0, 3, 0, 1.4, 5.2, (k / 3) * Math.PI, 0, UV.shrub, C(0x9ad080), new THREE.Vector3(0, 3, 0));
      const centre = new THREE.Vector3(0, H * 0.7, 0);
      for (let k = 0; k < 11; k++) {
        const t = k / 10;
        const y = H * 0.38 + t * H * 0.6;
        const a = r() * Math.PI * 2;
        const s = 3.8 * (1 - t * 0.45);
        g.card(Math.cos(a) * 0.6, y, Math.sin(a) * 0.6, s, s * 1.1, a, (r() - 0.5) * 0.6, UV.fine, C(0xe8e0c8).multiplyScalar(0.85 + r() * 0.25), centre);
      }
      return g.build();
    },
  },
  areca: {
    w: 6, h: 17, shadow: true,
    build(r) {
      const g = new GB();
      const H = 12 + r() * 4;
      const lean = (r() - 0.5) * 0.6;
      g.tube(0, 0, -0.3, H, 0.13, 0.1, 6, 6, UV.bark, C(0xe8e4d8), (t) => [lean * t * t, 0]);
      // green crown shaft
      g.tube(lean, 0, H, H + 1.3, 0.13, 0.11, 6, 1, UV.bark, C(0x6a9a40));
      for (let k = 0; k < 9; k++) {
        const yaw = (k / 9) * Math.PI * 2 + r() * 0.4;
        g.frond(lean, H + 1.2, 0, yaw, 0.5 + r() * 0.5, 2.6 + r() * 0.6, 0.9, 0.55, UV.frond, C(0xd8e8b0));
      }
      return g.build();
    },
  },
  coconut: {
    w: 9, h: 15, shadow: true,
    build(r) {
      const g = new GB();
      const H = 10 + r() * 4;
      const bend = 1.2 + r() * 1.6, dir = r() * Math.PI * 2;
      const off = (t) => [Math.cos(dir) * bend * t * t, Math.sin(dir) * bend * t * t];
      g.tube(0, 0, -0.3, H, 0.22, 0.15, 7, 6, UV.bark, C(0xc8b8a0), off);
      const [tx, tz] = off(1);
      for (let k = 0; k < 15; k++) {
        const yaw = (k / 15) * Math.PI * 2 + r() * 0.3;
        g.frond(tx, H + 0.2, tz, yaw, 0.15 + r() * 0.75, 4.2 + r() * 0.8, 1.3, 0.75, UV.frond, C(0xf0f0c0));
      }
      // nuts
      for (let k = 0; k < 6; k++) {
        const a = r() * Math.PI * 2;
        g.tube(tx + Math.cos(a) * 0.3, tz + Math.sin(a) * 0.3, H - 0.6, H - 0.15, 0.13, 0.11, 5, 1, UV.shrub, C(0x9a9a40));
      }
      return g.build();
    },
  },
  banana: {
    w: 5, h: 5, shadow: true,
    build(r) {
      const g = new GB();
      const H = 2.2 + r() * 0.8;
      g.tube(0, 0, -0.1, H, 0.14, 0.1, 6, 2, UV.bark, C(0x8a9a58));
      for (let k = 0; k < 8; k++) {
        const yaw = (k / 8) * Math.PI * 2 + r() * 0.5;
        g.frond(0, H, 0, yaw, 0.7 + r() * 0.5, 2.1 + r() * 0.5, 0.75, 0.75, UV.banana, C(0xe8f0d0), 5);
      }
      return g.build();
    },
  },
  bamboo: {
    w: 12, h: 15, shadow: true,
    build(r) {
      const g = new GB();
      for (let k = 0; k < 16; k++) {
        const a = r() * Math.PI * 2, lean = 0.12 + r() * 0.3, H = 9 + r() * 6;
        const bx = Math.cos(a) * r() * 0.9, bz = Math.sin(a) * r() * 0.9;
        const off = (t) => [Math.cos(a) * lean * H * t * t, Math.sin(a) * lean * H * t * t];
        g.tube(bx, bz, -0.2, H, 0.06, 0.035, 4, 4, UV.bark, C(0xa8b060), off);
        for (let j = 0; j < 4; j++) {
          const t = 0.45 + j * 0.15;
          const [ox, oz] = off(t);
          g.card(bx + ox, H * t, bz + oz, 2.6, 2.4, a + r(), (r() - 0.5), UV.fine, C(0xe0f0b0), new THREE.Vector3(0, H * 0.6, 0));
        }
      }
      return g.build();
    },
  },
  coffee: {
    w: 3, h: 2.4, near: true, shadow: false,
    build(r) {
      const g = new GB();
      const centre = new THREE.Vector3(0, 1.1, 0);
      for (let k = 0; k < 4; k++) g.card(0, 1.15, 0, 2.3, 2.1, (k / 4) * Math.PI + r() * 0.3, 0, UV.shrub, C(0xffffff), centre);
      g.card(0, 1.9, 0, 2.0, 2.0, r() * 3, Math.PI / 2 - 0.3, UV.shrub, C(0xffffff), centre);
      return g.build();
    },
  },
  bush: {
    w: 3, h: 2, near: true, shadow: false,
    build(r) {
      const g = new GB();
      const centre = new THREE.Vector3(0, 0.6, 0);
      for (let k = 0; k < 3; k++) g.card(0, 0.75, 0, 2.2, 1.6, (k / 3) * Math.PI, 0, UV.leaf, C(0xd0e8b0), centre);
      return g.build();
    },
  },
  tea: {
    // clipped tea hedge, bright new flush on top
    w: 1.6, h: 1.1, near: true, nearR: 150, cap: 42000, shadow: false,
    build() {
      const g = new GB();
      const centre = new THREE.Vector3(0, 0.2, 0);
      const side = new THREE.Color(1.25, 1.9, 0.7), top = new THREE.Color(1.9, 2.6, 0.75);
      for (let k = 0; k < 3; k++) g.card(0, 0.5, 0, 1.45, 0.95, (k / 3) * Math.PI, 0, UV.shrub, side, centre);
      g.card(0, 0.98, 0, 1.4, 1.2, 0.4, Math.PI / 2 - 0.12, UV.shrub, top, centre);
      g.card(0, 0.96, 0, 1.3, 1.1, 1.9, Math.PI / 2 - 0.2, UV.shrub, top, centre);
      return g.build();
    },
  },
  grass: {
    w: 1.4, h: 1, near: true, shadow: false,
    build() {
      const g = new GB();
      for (let k = 0; k < 3; k++) g.card(0, 0.45, 0, 1.3, 0.95, (k / 3) * Math.PI, 0, UV.grass, C(0xffffff), new THREE.Vector3(0, -1, 0));
      return g.build();
    },
  },
};
const SPECIES_NAMES = Object.keys(SPECIES);

// biome -> [density per 6 m candidate, [species, weight]...]
const TREE_TABLE = {
  [BIOME.FOREST]: [0.66, [['rainforest', 0.42], ['jack', 0.3], ['bamboo', 0.08], ['bush', 0.2]]],
  [BIOME.PLANTATION]: [0.46, [['silveroak', 0.42], ['areca', 0.26], ['jack', 0.1], ['coconut', 0.05], ['banana', 0.12], ['bush', 0.05]]],
  [BIOME.TEA]: [0.035, [['silveroak', 1]]],
  [BIOME.PADDY]: [0.012, [['areca', 0.6], ['coconut', 0.4]]],
  [BIOME.GRASS]: [0.06, [['bush', 0.7], ['jack', 0.3]]],
  [BIOME.TOWN]: [0.07, [['coconut', 0.4], ['areca', 0.25], ['banana', 0.15], ['jack', 0.2]]],
  [BIOME.LOWLAND]: [0.5, [['coconut', 0.38], ['areca', 0.25], ['jack', 0.22], ['banana', 0.15]]],
  [BIOME.WATER]: [0, []],
};
const CLEARANCE = { rainforest: 3.2, jack: 2.6, silveroak: 2.2, areca: 1.6, coconut: 2.2, banana: 1.6, bamboo: 3.5, coffee: 1.2, bush: 1.0, grass: 0.35 };
const TRUNK_R = { rainforest: 0.55, jack: 0.32, silveroak: 0.26, areca: 0.13, coconut: 0.22, banana: 0.14, bamboo: 0.9 };

export class Vegetation {
  constructor(scene, renderer, hf, rs, biomeGrid, colliders, buildings) {
    Object.assign(this, { scene, renderer, hf, rs, biomeGrid, colliders, buildings });
    this.atlas = foliageAtlas();
    this.cells = new Map();
    this.lastBuild = null;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
    });
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
          float hgt = max(0.0, position.y - 1.5);
          transformed.x += sin(uTime * 1.3 + ph) * 0.012 * hgt * uWind;
          transformed.z += cos(uTime * 1.1 + ph) * 0.009 * hgt * uWind;
          #endif`
        );
    };
    this.depthMat = new THREE.MeshDepthMaterial({ map: this.atlas, alphaTest: 0.45, depthPacking: THREE.RGBADepthPacking });

    this.geos = {};
    this.near = {};
    this.far = {};
    const rnd = mulberry32(2024);
    SPECIES_NAMES.forEach((name) => {
      const sp = SPECIES[name];
      this.geos[name] = sp.build(rnd);
      const cap = sp.cap || (sp.near ? 26000 : 9000);
      const im = new THREE.InstancedMesh(this.geos[name], this.material, cap);
      im.count = 0;
      im.castShadow = sp.shadow;
      im.receiveShadow = true;
      im.customDepthMaterial = this.depthMat;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      scene.add(im);
      this.near[name] = im;
    });
    this.buildImpostors();
  }

  /** Render each tree species into a 4x4 atlas and build crossed-card far meshes. */
  buildImpostors() {
    const R = this.renderer;
    const rt = new THREE.WebGLRenderTarget(1024, 1024, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404030, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(0.4, 1, 1);
    scene.add(dl);
    const mat = new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide });
    const prevTarget = R.getRenderTarget();
    const prevClear = R.getClearColor(new THREE.Color()), prevAlpha = R.getClearAlpha();
    R.setRenderTarget(rt);
    R.setClearColor(0x2a4020, 0);
    R.clear();
    this.farMat = new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: 0.35, side: THREE.DoubleSide, color: 0xffffff });
    this.slots = {};
    let slot = 0;
    for (const name of SPECIES_NAMES) {
      const sp = SPECIES[name];
      if (sp.near) continue;
      const mesh = new THREE.Mesh(this.geos[name], mat);
      scene.add(mesh);
      const cam = new THREE.OrthographicCamera(-sp.w / 2, sp.w / 2, sp.h, 0, 0.1, 200);
      cam.position.set(0, 0, 60);
      cam.lookAt(0, 0, 0);
      cam.position.y = 0;
      cam.updateProjectionMatrix();
      const sx = (slot % 4) * 256, sy = Math.floor(slot / 4) * 256;
      rt.viewport.set(sx, sy, 256, 256);
      rt.scissor.set(sx, sy, 256, 256);
      rt.scissorTest = true;
      R.setRenderTarget(rt);
      R.render(scene, cam);
      scene.remove(mesh);
      // far card geometry
      const g = new GB();
      const u0 = sx / 1024, v0 = sy / 1024, u1 = (sx + 256) / 1024, v1 = (sy + 256) / 1024;
      for (let k = 0; k < 2; k++) {
        const a = k * Math.PI / 2;
        const ax = Math.cos(a) * sp.w / 2, az = -Math.sin(a) * sp.w / 2;
        g.quad([-ax, 0, -az], [ax, 0, az], [ax, sp.h, az], [-ax, sp.h, -az], [u0, v0, u1, v1], C(0xffffff));
      }
      const geo = g.build();
      const im = new THREE.InstancedMesh(geo, this.farMat, 30000);
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(30000 * 3), 3);
      this.scene.add(im);
      this.far[name] = im;
      slot++;
    }
    rt.scissorTest = false;
    R.setRenderTarget(prevTarget);
    R.setClearColor(prevClear, prevAlpha);
    this.rt = rt;
  }

  setLight(level) {
    this.farMat.color.setScalar(level);
  }

  // ------------------------------------------------------------------ placement
  generateCell(cx, cz) {
    const rnd = mulberry32(hashInt(cx, cz, 17));
    const data = {};
    const add = (name, x, y, z, s, yaw, tint) => {
      const d = data[name] || (data[name] = { m: [], c: [] });
      d.m.push(x, y, z, s, yaw);
      d.c.push(tint[0], tint[1], tint[2]);
    };
    const coll = [];
    const x0 = cx * CELL, z0 = cz * CELL;
    const { hf, rs, biomeGrid } = this;

    const pick = (table) => {
      let t = rnd(), acc = 0;
      for (const [n, w] of table) { acc += w; if (t <= acc) return n; }
      return table[table.length - 1][0];
    };
    const ok = (x, z, name) => {
      if (!hf.inside(x, z, 40)) return false;
      const q = rs.nearest(x, z, 10);
      if (q && q.e < CLEARANCE[name]) return false;
      if (this.buildings && this.buildings.occupied(x, z)) return false;
      return true;
    };

    // trees on a jittered 6 m grid
    const S = 6;
    for (let gz = 0; gz < CELL; gz += S)
      for (let gx = 0; gx < CELL; gx += S) {
        const x = x0 + gx + rnd() * S, z = z0 + gz + rnd() * S;
        const b = biomeAt(hf, biomeGrid, x, z);
        const [dens, table] = TREE_TABLE[b];
        const clump = 0.75 + perlin2(x / 60, z / 60, 3) * 0.9;
        if (rnd() > dens * clump || !table.length) { rnd(); rnd(); rnd(); continue; }
        const name = pick(table);
        if (!ok(x, z, name)) { rnd(); rnd(); continue; }
        if (hf.slope(x, z, 4) > 1.4) { rnd(); rnd(); continue; }
        const y = rs.height(x, z);
        const s = 0.8 + rnd() * 0.5;
        const tint = 0.82 + rnd() * 0.3;
        add(name, x, y - 0.1, z, s, rnd() * 6.283, [tint, tint * (0.95 + rnd() * 0.1), tint * 0.9]);
        const q = rs.nearest(x, z, 14);
        if (q && TRUNK_R[name]) coll.push({ x, z, r: TRUNK_R[name] * s, y0: y - 1, y1: y + 6, kind: 'tree' });
      }

    // understory: coffee in plantations, grass on verges
    for (let gz = 0; gz < CELL; gz += 3.4)
      for (let gx = 0; gx < CELL; gx += 3.4) {
        const x = x0 + gx + rnd() * 2.4, z = z0 + gz + rnd() * 2.4;
        const b = biomeAt(hf, biomeGrid, x, z);
        const r = rnd();
        if (b === BIOME.PLANTATION && r < 0.8) {
          if (!ok(x, z, 'coffee')) continue;
          const t = 0.8 + rnd() * 0.35;
          add('coffee', x, rs.height(x, z) - 0.05, z, 0.75 + rnd() * 0.4, rnd() * 6.283, [t, t, t]);
        } else if (b === BIOME.FOREST && r < 0.18) {
          if (!ok(x, z, 'bush')) continue;
          const t = 0.75 + rnd() * 0.3;
          add('bush', x, rs.height(x, z) - 0.05, z, 0.8 + rnd() * 0.6, rnd() * 6.283, [t, t, t]);
        }
      }
    for (let gz = 0; gz < CELL; gz += 1.7)
      for (let gx = 0; gx < CELL; gx += 1.7) {
        const x = x0 + gx + rnd() * 1.7, z = z0 + gz + rnd() * 1.7;
        const q = rs.nearest(x, z, 9);
        const b = biomeAt(hf, biomeGrid, x, z);
        const want = q ? q.e > 0.5 && q.e < 9 : b === BIOME.GRASS && rnd() < 0.25;
        if (!want || rnd() > 0.55) continue;
        if (b === BIOME.WATER || b === BIOME.PADDY) continue;
        if (this.buildings && this.buildings.occupied(x, z)) continue;
        const t = 0.75 + rnd() * 0.4;
        add('grass', x, rs.height(x, z) - 0.03, z, 0.7 + rnd() * 0.7, rnd() * 6.283, [t, t * 1.02, t * 0.85]);
      }

    const cell = { data, cx, cz, teaDone: false };
    for (const k in data) {
      data[k].m = new Float32Array(data[k].m);
      data[k].c = new Float32Array(data[k].c);
    }
    this.colliders.setDynamic('veg' + cx + ',' + cz, x0 + CELL / 2, z0 + CELL / 2, coll);
    return cell;
  }

  /** Tea hedges follow the contour rows that the terrain shader paints. Generated lazily, near only. */
  generateTea(cell) {
    cell.teaDone = true;
    const { hf, rs, biomeGrid } = this;
    const rnd = mulberry32(hashInt(cell.cx, cell.cz, 91));
    const m = [], c = [];
    const x0 = cell.cx * CELL, z0 = cell.cz * CELL;
    for (let gz = 0; gz < CELL; gz += 1.25)
      for (let gx = 0; gx < CELL; gx += 1.25) {
        const x = x0 + gx + (rnd() - 0.5) * 0.3, z = z0 + gz + (rnd() - 0.5) * 0.3;
        if (biomeAt(hf, biomeGrid, x, z) !== BIOME.TEA) continue;
        const h = rs.height(x, z);
        const f = (h * 0.85) % 1;
        if (Math.abs(f - 0.5) < 0.3) continue; // the picking path between rows
        if (hf.slope(x, z, 3) > 0.9) continue;
        const q = rs.nearest(x, z, 4);
        if (q && q.e < 1.6) continue;
        if (this.buildings && this.buildings.occupied(x, z)) continue;
        const t = 0.85 + rnd() * 0.25;
        m.push(x, h - 0.15, z, 0.85 + rnd() * 0.3, rnd() * 6.283);
        c.push(t, t, t * 0.9);
      }
    if (m.length) cell.data.tea = { m: new Float32Array(m), c: new Float32Array(c) };
  }

  /** Synchronously fill everything around a point (used during loading). */
  prime(px, pz) {
    this.ensureCells(px, pz, Infinity);
    this.rebuild(px, pz);
  }

  ensureCells(px, pz, budgetMs) {
    const t0 = performance.now();
    const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
    const R = Math.ceil(FAR_R / CELL);
    let created = 0, missing = 0;
    const order = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz) * CELL;
        if (d > FAR_R + CELL) continue;
        const key = (pcx + dx) + ',' + (pcz + dz);
        if (!this.cells.has(key)) order.push([d, key, pcx + dx, pcz + dz]);
      }
    order.sort((a, b) => a[0] - b[0]);
    for (const [, key, cx, cz] of order) {
      if (performance.now() - t0 > budgetMs) { missing++; continue; }
      this.cells.set(key, this.generateCell(cx, cz));
      created++;
    }
    // evict far cells
    if (this.cells.size > 900) {
      for (const [key, c] of this.cells) {
        if (Math.hypot(c.cx - pcx, c.cz - pcz) * CELL > FAR_R + 400) {
          this.cells.delete(key);
          this.colliders.clearDynamic('veg' + key, c.cx * CELL + CELL / 2, c.cz * CELL + CELL / 2);
        }
      }
    }
    return created;
  }

  rebuild(px, pz) {
    const counts = {};
    const nearMax = {}, farMax = {};
    for (const n of SPECIES_NAMES) { counts[n] = [0, 0]; nearMax[n] = this.near[n].instanceMatrix.count; if (this.far[n]) farMax[n] = this.far[n].instanceMatrix.count; }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const cell of this.cells.values()) {
      const ccx = (cell.cx + 0.5) * CELL - px, ccz = (cell.cz + 0.5) * CELL - pz;
      const d = Math.hypot(ccx, ccz);
      if (d > FAR_R) continue;
      const isNear = d < NEAR_R;
      if (d < SPECIES.tea.nearR + CELL && !cell.teaDone) this.generateTea(cell);
      for (const name in cell.data) {
        const sp = SPECIES[name];
        if (!isNear && sp.near) continue;
        if (sp.nearR && d > sp.nearR) continue;
        if (!isNear && d > FAR_R * 0.6 && (name === 'banana')) continue;
        const target = isNear ? this.near[name] : this.far[name];
        if (!target) continue;
        const { m: arr, c: col } = cell.data[name];
        const slot = isNear ? 0 : 1;
        const max = isNear ? nearMax[name] : farMax[name];
        const im = target.instanceMatrix.array, ic = target.instanceColor.array;
        for (let i = 0; i < arr.length / 5; i++) {
          const k = counts[name][slot];
          if (k >= max) break;
          p.set(arr[i * 5], arr[i * 5 + 1], arr[i * 5 + 2]);
          s.setScalar(arr[i * 5 + 3]);
          q.setFromAxisAngle(up, arr[i * 5 + 4]);
          m.compose(p, q, s);
          m.toArray(im, k * 16);
          ic[k * 3] = col[i * 3]; ic[k * 3 + 1] = col[i * 3 + 1]; ic[k * 3 + 2] = col[i * 3 + 2];
          counts[name][slot]++;
        }
      }
    }
    for (const n of SPECIES_NAMES) {
      const a = this.near[n];
      a.count = counts[n][0];
      a.instanceMatrix.needsUpdate = true;
      a.instanceColor.needsUpdate = true;
      if (this.far[n]) {
        const b = this.far[n];
        b.count = counts[n][1];
        b.instanceMatrix.needsUpdate = true;
        b.instanceColor.needsUpdate = true;
      }
    }
    this.lastBuild = [px, pz];
  }

  update(dt, px, pz) {
    this.uniforms.uTime.value += dt;
    if (!Number.isFinite(px + pz)) return;
    const created = this.ensureCells(px, pz, 5);
    const moved = !this.lastBuild || Math.hypot(px - this.lastBuild[0], pz - this.lastBuild[1]) > 30;
    if (moved || (created > 0 && (this.sinceBuild = (this.sinceBuild || 0) + dt) > 0.4)) {
      this.sinceBuild = 0;
      this.rebuild(px, pz);
    }
  }
}
