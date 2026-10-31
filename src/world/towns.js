// Fills Kerala junction towns that OpenStreetMap maps only sparsely (Adivaram,
// Lakkidi, Chundale, Pozhuthana...) with what they really look like: a strip of
// 1-3 storey concrete shop rows set close to the road, sloped tin awnings,
// bright Malayalam/English signboards, goods stacked out front, a tea stall with
// a bench, parked autos and bikes, people, KSEB posts and a blue place-name board.
import * as THREE from 'three';
import { Parts, paint, buildTraffic } from '../vehicles/models.js';
import { canvas } from '../util/textures.js';
import { mulberry32, hashInt } from '../util/noise.js';

const ML = '"Nirmala UI", "Noto Sans Malayalam", sans-serif';
const SIGNS = [
  ['ഹോട്ടൽ', 'HOTEL', '#c8231c', '#fff'], ['ടീ സ്റ്റാൾ', 'TEA STALL', '#1d6a2e', '#ffd21a'], ['സ്റ്റോഴ്സ്', 'GENERAL STORES', '#1e4fa0', '#fff'],
  ['ബേക്കറി', 'BAKERY', '#f2c418', '#7a1010'], ['മെഡിക്കൽസ്', 'MEDICALS', '#ffffff', '#1d7a3a'], ['ടെക്സ്റ്റൈൽസ്', 'TEXTILES', '#7a1d6a', '#fff'],
  ['ഹാർഡ്‌വെയേഴ്സ്', 'HARDWARES', '#2a2a2a', '#ffd21a'], ['സ്പൈസസ്', 'SPICES', '#8a3a12', '#ffe680'], ['മൊബൈൽസ്', 'MOBILES', '#e05a1a', '#fff'],
  ['കൂൾബാർ', 'COOL BAR', '#2a9ad8', '#fff'], ['ഫ്രൂട്ട്സ്', 'FRUITS & VEG', '#3aa64a', '#fff'], ['ബാർബർ', 'BARBER SHOP', '#ffffff', '#c8231c'],
  ['വർക്ക്ഷോപ്പ്', 'AUTO WORKS', '#444', '#ffcf1a'], ['ഫാൻസി', 'FANCY STORE', '#d84a8a', '#fff'], ['റേഷൻ കട', 'RATION SHOP', '#f5f0e0', '#1e4fa0'],
  ['ചിക്കൻ', 'CHICKEN STALL', '#b3141c', '#ffd21a'],
];

function signAtlas() {
  const [c, g] = canvas(1024, 1024);
  SIGNS.forEach(([ml, en, bg, fg], i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 128;
    g.fillStyle = bg; g.fillRect(x, y, 256, 128);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 5, y + 5, 246, 118);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = `bold 40px ${ML}`; g.fillText(ml, x + 128, y + 58);
    g.font = 'bold 26px Arial'; g.fillText(en, x + 128, y + 102);
  });
  // banners / hoardings in the lower half
  const bannerCols = [['#ffd21a', '#c8231c'], ['#1e4fa0', '#ffffff'], ['#1d6a2e', '#ffe680'], ['#e05a1a', '#fff']];
  const banners = [['ഓണം സെയിൽ', 'GRAND SALE 50% OFF'], ['വയനാട് ടൂറിസം', 'VISIT WAYANAD'], ['കാപ്പി • കുരുമുളക്', 'WE BUY COFFEE & PEPPER'], ['മൺസൂൺ ഓഫർ', 'MONSOON OFFER']];
  banners.forEach(([ml, en], i) => {
    const x = (i % 2) * 512, y = 512 + Math.floor(i / 2) * 256;
    const [bg, fg] = bannerCols[i];
    const grd = g.createLinearGradient(x, y, x + 512, y + 256);
    grd.addColorStop(0, bg); grd.addColorStop(1, '#ffffff');
    g.fillStyle = grd; g.fillRect(x, y, 512, 256);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = `bold 64px ${ML}`; g.fillText(ml, x + 256, y + 110);
    g.font = 'bold 40px Arial'; g.fillText(en, x + 256, y + 190);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const signUV = (i) => {
  const x = (i % 4) * 256, y = Math.floor(i / 4) * 128;
  return [x / 1024, 1 - (y + 128) / 1024, (x + 256) / 1024, 1 - y / 1024];
};
const bannerUV = (i) => {
  const x = (i % 2) * 512, y = 512 + Math.floor(i / 2) * 256;
  return [x / 1024, 1 - (y + 256) / 1024, (x + 512) / 1024, 1 - y / 1024];
};

function placeBoard(ml, en) {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#1b4fa8'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = `bold 66px ${ML}`; g.fillText(ml, 256, 112);
  g.font = 'bold 58px Arial'; g.fillText(en.toUpperCase(), 256, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
}

const ML_NAMES = {
  Adivaram: 'അടിവാരം', Lakkidi: 'ലക്കിടി', Vythiri: 'വൈത്തിരി', Chundale: 'ചുണ്ടേൽ', Pozhuthana: 'പൊഴുതന', Kalpetta: 'കൽപ്പറ്റ',
  Pookode: 'പൂക്കോട്', Vengappally: 'വെങ്ങപ്പള്ളി', 'Old Vythiri': 'പഴയ വൈത്തിരി', Melmury: 'മേൽമുറി', Pinangode: 'പിണങ്ങോട്',
};

/** Plane with explicit atlas UVs. */
function uvPlane(w, h, uv) {
  const g = new THREE.PlaneGeometry(w, h);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) ? uv[2] : uv[0], a.getY(i) ? uv[3] : uv[1]);
  return g;
}

export class Towns {
  constructor(scene, { map, net, rs, hf, buildings, colliders }) {
    Object.assign(this, { scene, map, net, rs, hf, buildings, colliders });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.atlas = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.55, side: THREE.DoubleSide });
    this.shops = [];
    this.centres = map.pois
      .filter((p) => p.kind === 'place' && p.name && ['town', 'village', 'suburb'].includes(p.sub))
      .map((p) => ({ name: p.name, x: p.p[0], z: p.p[1], r: p.sub === 'town' ? 420 : p.sub === 'village' ? 260 : 200 }))
      .filter((c) => hf.inside(c.x, c.z, 100));
  }

  /** Add procedural shop rows through Buildings.add (so walls, roofs and collisions are shared). */
  fill() {
    for (const town of this.centres) {
      const rnd = mulberry32(hashInt(Math.round(town.x), Math.round(town.z), 7));
      for (const e of this.net.edges) {
        if (e.cls > 3 || e.type === 'pad') continue;
        // only edges that pass through the town core
        let near = false;
        for (let i = 0; i < e.n; i += 4) if (Math.hypot(e.pts[i * 3] - town.x, e.pts[i * 3 + 2] - town.z) < town.r) { near = true; break; }
        if (!near) continue;
        for (const side of [1, -1]) {
          let s = 6 + rnd() * 6;
          while (s < e.len - 6) {
            const width = 5 + rnd() * 4;
            const c = this.net.sample(e, s, {});
            const d = Math.hypot(c.x - town.x, c.z - town.z);
            // density falls off from the junction; some gaps for lanes and plots
            const p = d < town.r * 0.5 ? 0.92 : d < town.r ? 0.6 : 0;
            if (rnd() < p) this.tryShop(town, e, c, side, width, d < town.r * 0.5, rnd);
            s += width + 0.6 + (rnd() < 0.15 ? 6 + rnd() * 8 : 0);
          }
        }
      }
    }
  }

  tryShop(town, e, c, side, width, core, rnd) {
    const { rs, buildings } = this;
    const lx = c.dz * side, lz = -c.dx * side; // outward normal
    const setback = e.hw + 1.4 + 2.6 + rnd() * 1.2;
    const depth = 7 + rnd() * 4;
    const fx = c.x + lx * setback, fz = c.z + lz * setback;
    const corners = [
      [fx - c.dx * width / 2, fz - c.dz * width / 2], [fx + c.dx * width / 2, fz + c.dz * width / 2],
      [fx + c.dx * width / 2 + lx * depth, fz + c.dz * width / 2 + lz * depth], [fx - c.dx * width / 2 + lx * depth, fz - c.dz * width / 2 + lz * depth],
    ];
    for (const [x, z] of [...corners, [fx + lx * depth / 2, fz + lz * depth / 2]]) {
      const q = rs.nearest(x, z, 8);
      if (q && q.e < 1.2) return;
      if (buildings.occupied(x, z)) return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of corners) { const h = rs.height(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo > 2.6) return;
    const roadH = c.y;
    if (Math.abs(rs.height(fx, fz) - roadH) > 2.2) return;
    const levels = core ? 1 + Math.floor(rnd() * 2.6) : 1 + (rnd() < 0.3 ? 1 : 0);
    // footprint must be counter-clockwise for Buildings (positive area)
    let pts = corners.map(([x, z]) => [x, z]);
    let A = 0;
    for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; A += p[0] * q[1] - q[0] * p[1]; }
    if (A < 0) pts.reverse();
    const ok = buildings.add({ b: 'retail', l: levels, pts, forceShop: true, flatRoof: rnd() < 0.75 });
    if (ok === false) return;
    this.shops.push({ fx, fz, dx: c.dx, dz: c.dz, lx, lz, width, depth, levels, y: rs.height(fx, fz), roadH, town: town.name, core });
  }

  /** Street furniture and life in front of the shops. */
  details() {
    const p = new Parts();
    const atlasParts = new Parts();
    const tin = new THREE.MeshStandardMaterial({ color: 0x7e8a92, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
    const blueSheet = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, roughness: 0.5, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const pole = paint(0x3a3a3a, 0.6);
    const plinth = paint(0xa8a49a, 0.9);
    const tiles = paint(0x9a5a3a, 0.8);
    const sack = paint(0xc2a878, 0.95), crate = paint(0x2a6ac0, 0.7), basket = paint(0x9a7a44, 0.9), banana = paint(0x7aa83a, 0.8);
    const skin = paint(0x8a5a3a, 0.7), hair = paint(0x111111, 0.8), mundu = paint(0xf2efe6, 0.9);
    const shirts = [0xe8e8e0, 0x3a6ab0, 0xb03a3a, 0x3a8a4a, 0xd8b030, 0x7a4ab0].map((c) => paint(c, 0.9));
    const saris = [0xc8231c, 0x1d7a3a, 0xd84a8a, 0xe8b020].map((c) => paint(c, 0.85));
    const rnd = mulberry32(99);
    const person = (x, y, z, yaw, female) => {
      const shirt = shirts[Math.floor(rnd() * shirts.length)];
      p.cyl(0.17, 0.2, 0.85, female ? saris[Math.floor(rnd() * saris.length)] : mundu, x, y + 0.43, z, 0, yaw, 0, 8);
      p.box(0.4, 0.55, 0.24, female ? saris[Math.floor(rnd() * saris.length)] : shirt, x, y + 1.13, z, 0, yaw, 0);
      p.add(new THREE.SphereGeometry(0.12, 8, 6), skin, x, y + 1.55, z);
      p.add(new THREE.SphereGeometry(0.125, 8, 6, 0, Math.PI * 2, 0, 1.2), hair, x, y + 1.58, z);
    };
    const parked = { auto: buildTraffic('auto', 1), bike: buildTraffic('bike', 2), bike2: buildTraffic('bike', 5), jeep: buildTraffic('jeep', 3) };

    for (const s of this.shops) {
      const { fx, fz, dx, dz, lx, lz, width } = s;
      const yaw = Math.atan2(-lx, -lz); // facing the road
      const along = Math.atan2(dx, dz);
      const y = s.y;
      // raised tiled verandah/plinth in front of the shutters
      p.box(width, 0.3, 1.8, plinth, fx - lx * 0.9, y + 0.12, fz - lz * 0.9, 0, along + Math.PI / 2, 0);
      p.box(width, 0.02, 1.7, tiles, fx - lx * 0.9, y + 0.28, fz - lz * 0.9, 0, along + Math.PI / 2, 0);
      // sloped tin / fibre-sheet awning on two poles, dipping towards the road
      const aw = rnd() < 0.7 ? tin : blueSheet;
      const Z = new THREE.Vector3(-lx, 0, -lz), Y = new THREE.Vector3(0, 1, 0);
      const X = new THREE.Vector3().crossVectors(Y, Z);
      const ag = new THREE.BoxGeometry(width + 0.3, 0.04, 2.1).rotateX(0.2);
      ag.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z)).translate(fx - lx * 1.0, y + 2.85, fz - lz * 1.0);
      p.add(ag, aw);
      for (const t of [-0.5, 0.5]) p.box(0.06, 2.6, 0.06, pole, fx - lx * 1.95 + dx * t * width * 0.95, y + 1.4, fz - lz * 1.95 + dz * t * width * 0.95);
      // signboard over the awning, on the facade
      const idx = Math.floor(rnd() * SIGNS.length);
      atlasParts.add(uvPlane(Math.min(width - 0.4, 4.6), 1.0, signUV(idx)), this.atlas, fx - lx * 0.04, y + 3.65, fz - lz * 0.04, 0, yaw, 0);
      const name = SIGNS[idx][1];
      // goods out front
      if (/STORES|SPICES|RATION|FRUITS/.test(name)) {
        for (let k = 0; k < 4; k++) {
          const t = (k / 3 - 0.5) * (width - 1.5);
          const m = name === 'FRUITS & VEG' ? (k % 2 ? banana : basket) : k % 2 ? sack : basket;
          p.rbox(0.6, 0.45, 0.5, 0.12, m, fx - lx * 0.8 + dx * t, y + 0.5, fz - lz * 0.8 + dz * t, 0, along, 0);
        }
      } else if (/TEA|HOTEL|COOL/.test(name)) {
        // tea stall: bench out front, banana bunch hanging, a couple of people
        p.box(2.2, 0.08, 0.4, paint(0x6a4428, 0.8), fx - lx * 1.4, y + 0.55, fz - lz * 1.4, 0, along + Math.PI / 2, 0);
        for (const t of [-0.9, 0.9]) p.box(0.08, 0.5, 0.35, paint(0x6a4428, 0.8), fx - lx * 1.4 + dx * t, y + 0.3, fz - lz * 1.4 + dz * t);
        p.add(new THREE.SphereGeometry(0.22, 8, 6).scale(1, 1.6, 1), banana, fx - lx * 1.7 + dx * 0.4, y + 2.3, fz - lz * 1.7 + dz * 0.4);
        person(fx - lx * 2.2 + dx * 0.3, y + 0.28 - 0.25, fz - lz * 2.2 + dz * 0.3, yaw + Math.PI, false);
        if (rnd() < 0.6) person(fx - lx * 2.4 - dx * 0.8, y + 0.0, fz - lz * 2.4 - dz * 0.8, yaw + 0.5, false);
      } else if (/CRATE|COOL|MOBILES|TEXTILES/.test(name) && rnd() < 0.5) {
        p.box(0.6, 0.6, 0.5, crate, fx - lx * 0.8, y + 0.6, fz - lz * 0.8, 0, along, 0);
      }
      if (rnd() < 0.35) person(fx - lx * (2.4 + rnd()), y, fz - lz * (2.4 + rnd()), yaw + (rnd() - 0.5) * 2, rnd() < 0.4);
      // parked vehicles in front of some shops
      const pr = rnd();
      if (pr < 0.32) {
        const kind = pr < 0.12 ? 'auto' : pr < 0.22 ? 'bike' : pr < 0.28 ? 'bike2' : 'jeep';
        const v = parked[kind].group.clone();
        const off = kind === 'jeep' ? 3.6 : 2.6;
        v.position.set(fx - lx * off + dx * (rnd() - 0.5) * width * 0.5, 0, fz - lz * off + dz * (rnd() - 0.5) * width * 0.5);
        v.position.y = this.rs.height(v.position.x, v.position.z);
        v.rotation.y = kind === 'auto' || kind === 'jeep' ? along + (rnd() < 0.5 ? 0 : Math.PI) : yaw + Math.PI + 0.3;
        if (kind.startsWith('bike')) v.rotation.z = 0.12; // on its side stand
        // bake into the merged town geometry (one draw call per material, not per vehicle)
        v.updateMatrixWorld(true);
        v.traverse((o) => { if (o.isMesh) p.add(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material); });
        this.colliders.addCircle(v.position.x, v.position.z, kind === 'jeep' ? 1.3 : 0.8, v.position.y - 1, v.position.y + 2, 'parked');
      }
    }

    // hoardings and the blue place-name boards at each town entrance on main roads
    for (const town of this.centres) {
      const shops = this.shops.filter((s) => s.town === town.name);
      if (!shops.length) continue;
      const q = this.rs.nearest(town.x, town.z, 500);
      if (q && q.cls <= 2) {
        const seg = this.rs.seg, o = q.seg * 8;
        for (const dir of [-1, 1]) {
          // walk out along the road to the edge of town
          const cx = seg[o] + q.dx * dir * town.r * 0.75, cz = seg[o + 1] + q.dz * dir * town.r * 0.75;
          const q2 = this.rs.nearest(cx, cz, 60);
          if (!q2) continue;
          const lx = q2.dz * -dir, lz = -q2.dx * -dir;
          const bx = cx + lx * (q2.hw + 2.2), bz = cz + lz * (q2.hw + 2.2);
          if (this.rs.nearest(bx, bz, 5)?.e < 0.5) continue;
          const by = this.rs.height(bx, bz);
          const mat = placeBoard(ML_NAMES[town.name] || town.name, town.name);
          const yaw = Math.atan2(q2.dx * dir, q2.dz * dir);
          p.box(0.08, 2.6, 0.08, pole, bx + Math.cos(yaw) * 0.9, by + 1.3, bz - Math.sin(yaw) * 0.9);
          p.box(0.08, 2.6, 0.08, pole, bx - Math.cos(yaw) * 0.9, by + 1.3, bz + Math.sin(yaw) * 0.9);
          p.plane(2.2, 1.1, mat, bx, by + 2.5, bz, 0, yaw, 0);
          p.plane(2.2, 1.1, paint(0x1b4fa8), bx - Math.sin(yaw) * 0.01, by + 2.5, bz - Math.cos(yaw) * 0.01, 0, yaw + Math.PI, 0);
        }
      }
      // a couple of flex hoardings on the roofs/poles
      for (let k = 0; k < Math.min(2, shops.length); k++) {
        const s = shops[Math.floor(rnd() * shops.length)];
        const top = s.y + s.levels * 3 + 0.9;
        const yaw = Math.atan2(-s.lx, -s.lz);
        atlasParts.add(uvPlane(5, 2.5, bannerUV(Math.floor(rnd() * 4))), this.atlas, s.fx + s.lx * 1.5, top + 1.5, s.fz + s.lz * 1.5, 0, yaw, 0);
        p.box(0.1, 2.6, 0.1, pole, s.fx + s.lx * 1.6 + s.dx * 2, top + 1.2, s.fz + s.lz * 1.6 + s.dz * 2);
        p.box(0.1, 2.6, 0.1, pole, s.fx + s.lx * 1.6 - s.dx * 2, top + 1.2, s.fz + s.lz * 1.6 - s.dz * 2);
      }
    }
    this.group.add(p.build());
    const signs = atlasParts.build(false);
    signs.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.group.add(signs);
  }
}
