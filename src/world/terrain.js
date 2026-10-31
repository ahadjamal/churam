// Chunked, LOD'd terrain streamed around the player, plus one coarse far mesh
// for the horizon. Chunk vertex data comes from terrainWorker.js.
import * as THREE from 'three';

const CHUNK = 250;
const RING = 6;
const lodSegs = (ring) => (ring <= 1 ? 125 : ring <= 3 ? 50 : 25);

export class Terrain {
  constructor(scene, hf, detailTex) {
    this.scene = scene;
    this.hf = hf;
    this.chunks = new Map(); // key -> {mesh, ready}
    this.pending = new Set();
    this.desired = new Map();
    this.center = null;
    this.indexCache = new Map();
    this.bounds = new THREE.Vector4(1e9, 1e9, -1e9, -1e9);
    this.uniforms = {
      uDetail: { value: detailTex },
      uBounds: { value: this.bounds },
      uWet: { value: 0 },
    };
    this.material = this.makeMaterial(false);
    this.farMaterial = this.makeMaterial(true);
    this.workers = [];
    this.nextWorker = 0;
    this.reqId = 0;
    this.callbacks = new Map();
    this.ready = false;
  }

  makeMaterial(isFar) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    const u = this.uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.uniforms.uIsFar = { value: isFar ? 1 : 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 mask;\nvarying vec3 vMask;\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvMask = mask;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D uDetail; uniform vec4 uBounds; uniform float uIsFar; uniform float uWet;
varying vec3 vMask; varying vec3 vWPos;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
if (uIsFar > 0.5 && vWPos.x > uBounds.x && vWPos.x < uBounds.z && vWPos.z > uBounds.y && vWPos.z < uBounds.w) discard;
vec3 d1 = texture2D(uDetail, vWPos.xz * 0.07).rgb;
vec3 d2 = texture2D(uDetail, vWPos.xz * 0.0085).rgb;
vec3 d3 = texture2D(uDetail, vWPos.xz * 0.43).rgb;
float camDist = length(vWPos - cameraPosition);
float nearK = 1.0 - smoothstep(40.0, 500.0, camDist);
diffuseColor.rgb *= mix(1.0, (0.72 + 0.56 * d1.r) * (0.85 + 0.3 * d3.r), 0.35 + 0.65 * nearK) * (0.8 + 0.4 * d2.g);
if (vMask.x > 0.02) {
  float rc = vWPos.y * 0.85 + d1.g * 0.12;
  float fw = fwidth(rc);
  float row = abs(fract(rc) - 0.5) * 2.0;
  float bush = mix(smoothstep(0.12, 0.5, row), 0.72, clamp(fw * 1.5, 0.0, 1.0));
  vec3 teaCol = mix(vec3(0.02, 0.045, 0.012), vec3(0.17, 0.33, 0.045) * (0.8 + 0.4 * d3.r), bush);
  diffuseColor.rgb = mix(diffuseColor.rgb, teaCol, clamp(vMask.x, 0.0, 1.0));
}
if (vMask.y > 0.02) {
  vec2 pc = vWPos.xz / vec2(24.0, 17.0) + d2.rg * 0.9;
  vec2 f = abs(fract(pc) - 0.5);
  float fw2 = max(fwidth(pc.x), fwidth(pc.y));
  float bund = smoothstep(0.455 - fw2, 0.475 + fw2, max(f.x, f.y)) * (1.0 - clamp(fw2 * 6.0, 0.0, 1.0));
  vec3 field = vec3(0.13, 0.27, 0.035) * (0.85 + 0.3 * d1.r) * (0.9 + 0.2 * d2.b);
  vec3 bundCol = vec3(0.16, 0.2, 0.06);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(field, bundCol, bund), clamp(vMask.y, 0.0, 1.0));
}
if (vMask.z > 0.02) {
  // random-rubble masonry retaining wall (grey laterite/granite blocks, dark mortar, moss)
  vec2 sc = vec2((vWPos.x + vWPos.z) * 1.4, vWPos.y * 2.6);
  float row = floor(sc.y);
  sc.x += fract(sin(row * 12.9898) * 43758.5453) * 0.9;
  vec2 cell = floor(sc), f = fract(sc);
  float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float edge = min(min(f.x, 1.0 - f.x) * 1.6, min(f.y, 1.0 - f.y));
  float mortar = smoothstep(0.02, 0.1, edge);
  vec3 stone = vec3(0.34, 0.33, 0.31) * (0.65 + 0.55 * rnd) * (0.8 + 0.4 * d3.r);
  stone = mix(stone, vec3(0.16, 0.22, 0.1), smoothstep(0.55, 0.85, d1.g) * 0.7);
  stone = mix(vec3(0.09, 0.09, 0.08), stone, mortar);
  diffuseColor.rgb = mix(diffuseColor.rgb, stone, clamp(vMask.z, 0.0, 1.0));
}
diffuseColor.rgb *= mix(1.0, 0.72, uWet);`
        );
    };
    return m;
  }

  async init(meta, heights, seg, biome) {
    const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    const readies = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' });
      readies.push(new Promise((res) => {
        w.onmessage = (ev) => {
          if (ev.data.type === 'ready') return res();
          const cb = this.callbacks.get(ev.data.id);
          this.callbacks.delete(ev.data.id);
          cb && cb(ev.data);
        };
      }));
      w.postMessage({ type: 'init', meta, heights, seg, biome });
      this.workers.push(w);
    }
    await Promise.all(readies);
    const far = await this.request({ type: 'far', step: 40 });
    const geo = this.geometry(far, this.gridIndex(far.nx, far.nz, false));
    this.far = new THREE.Mesh(geo, this.farMaterial);
    this.far.matrixAutoUpdate = false;
    this.far.frustumCulled = false;
    this.scene.add(this.far);
  }

  request(msg) {
    return new Promise((res) => {
      msg.id = ++this.reqId;
      this.callbacks.set(msg.id, res);
      this.workers[this.nextWorker++ % this.workers.length].postMessage(msg);
    });
  }

  gridIndex(nx, nz, skirts) {
    const key = `${nx}x${nz}${skirts}`;
    if (this.indexCache.has(key)) return this.indexCache.get(key);
    const idx = [];
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + nx, c = a + 1, d = b + 1;
        idx.push(a, b, c, c, b, d);
      }
    if (skirts) {
      const base = nx * nz;
      const strip = (edgeIdx, skirtStart, count) => {
        for (let i = 0; i < count - 1; i++) {
          const a = edgeIdx(i), b = edgeIdx(i + 1), c = skirtStart + i, d = skirtStart + i + 1;
          idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
        }
      };
      strip((i) => i, base, nx);
      strip((i) => (nz - 1) * nx + i, base + nx, nx);
      strip((j) => j * nx, base + 2 * nx, nz);
      strip((j) => j * nx + nx - 1, base + 2 * nx + nz, nz);
    }
    const total = nx * nz + (skirts ? 2 * nx + 2 * nz : 0);
    const attr = new THREE.BufferAttribute(total > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    this.indexCache.set(key, attr);
    return attr;
  }

  geometry(d, index) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    g.setAttribute('mask', new THREE.BufferAttribute(d.mask, 3));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  }

  update(px, pz) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const centreKey = cx + ',' + cz;
    if (centreKey !== this.center) {
      this.center = centreKey;
      this.ready = false;
      this.desired.clear();
      const list = [];
      for (let dz = -RING; dz <= RING; dz++)
        for (let dx = -RING; dx <= RING; dx++) {
          const ring = Math.max(Math.abs(dx), Math.abs(dz));
          const segs = lodSegs(ring);
          const key = `${cx + dx},${cz + dz},${segs}`;
          this.desired.set(key, { x: cx + dx, z: cz + dz, segs, ring });
          if (!this.chunks.has(key) && !this.pending.has(key)) list.push([ring, key]);
        }
      list.sort((a, b) => a[0] - b[0]);
      for (const [ring, key] of list) this.requestChunk(key, this.desired.get(key));
      this.pendingBounds = [(cx - RING) * CHUNK, (cz - RING) * CHUNK, (cx + RING + 1) * CHUNK, (cz + RING + 1) * CHUNK];
    }
    // Commit when every desired chunk is ready: swap visibility atomically to avoid holes.
    if (this.pendingBounds) {
      for (const key of this.desired.keys()) if (!this.chunks.has(key)) return;
      for (const [key, c] of this.chunks) {
        if (this.desired.has(key)) {
          c.mesh.visible = true;
        } else {
          this.scene.remove(c.mesh);
          c.mesh.geometry.dispose();
          this.chunks.delete(key);
        }
      }
      this.bounds.set(...this.pendingBounds);
      this.pendingBounds = null;
      this.ready = true;
    }
  }

  requestChunk(key, d) {
    this.pending.add(key);
    this.request({ type: 'chunk', x0: d.x * CHUNK, z0: d.z * CHUNK, size: CHUNK, segs: d.segs }).then((data) => {
      this.pending.delete(key);
      const n = d.segs + 1;
      const mesh = new THREE.Mesh(this.geometry(data, this.gridIndex(n, n, true)), this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = d.ring <= 2;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      this.scene.add(mesh);
      if (this.chunks.has(key)) this.scene.remove(this.chunks.get(key).mesh);
      this.chunks.set(key, { mesh });
    });
  }
}
