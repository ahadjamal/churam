// Kerala traffic: KSRTC & private buses, autorickshaws, jeeps, cars, bikes,
// pickups and other lorries driving on the LEFT along the real road graph.
import * as THREE from 'three';
import { buildTraffic } from './models.js';
import { SPEC } from '../world/roads.js';

const MIX = [['bus', 0.12], ['auto', 0.15], ['car', 0.25], ['jeep', 0.1], ['bike', 0.16], ['pickup', 0.08], ['lorry', 0.14]];
const SPEED_K = { bus: 1.05, auto: 0.7, car: 1.1, jeep: 1.0, bike: 0.95, pickup: 0.9, lorry: 0.75 };
const MASS = { bus: 11000, auto: 450, car: 1150, jeep: 1700, bike: 220, pickup: 2200, lorry: 12000 };
const ACC = { bus: 1.1, auto: 1.0, car: 2.2, jeep: 1.8, bike: 2.5, pickup: 1.4, lorry: 0.8 };

export class Traffic {
  constructor(scene, net, rs, truck) {
    Object.assign(this, { scene, net, rs, truck });
    this.vehicles = [];
    this.pool = {};
    this.max = 26;
    this.counter = 0;
    this.edges = net.edges.filter((e) => e.type !== 'pad' && SPEC[e.type].traffic && e.len > 25);
    this.totalLen = this.edges.reduce((a, e) => a + e.len, 0);
    this.events = [];
    this.tmp = {};
  }

  pickKind() {
    let r = Math.random(), acc = 0;
    for (const [k, w] of MIX) { acc += w; if (r <= acc) return k; }
    return 'car';
  }

  obtain(kind) {
    const list = this.pool[kind] || (this.pool[kind] = []);
    if (list.length) return list.pop();
    const m = buildTraffic(kind, this.counter++);
    m.group.traverse((o) => { if (o.isMesh) { o.castShadow = kind === 'bus' || kind === 'lorry'; } });
    return m;
  }

  spawn(px, pz) {
    for (let tries = 0; tries < 25; tries++) {
      let r = Math.random() * this.totalLen, e = null;
      for (const ed of this.edges) { r -= ed.len; if (r <= 0) { e = ed; break; } }
      if (!e) continue;
      const s = 5 + Math.random() * (e.len - 10);
      const c = this.net.sample(e, s, this.tmp);
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < 260 || d > 950) continue;
      if (this.vehicles.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < 30)) continue;
      const kind = this.pickKind();
      const m = this.obtain(kind);
      const dir = e.oneway ? 1 : Math.random() < 0.5 ? 1 : -1;
      const v = {
        kind, m, e, s, dir, speed: 6, x: c.x, y: c.y, z: c.z, yaw: 0,
        vmax: (SPEC[e.type].speed / 3.6) * SPEED_K[kind] * (0.85 + Math.random() * 0.3),
        len: m.length, width: m.width, mass: MASS[kind], stop: 0, hornCd: 5 + Math.random() * 10, blocked: 0,
        laneK: kind === 'bike' ? 0.72 : 0.5,
        vel: new THREE.Vector3(),
      };
      this.scene.add(m.group);
      this.vehicles.push(v);
      this.place(v);
      return;
    }
  }

  release(v) {
    this.scene.remove(v.m.group);
    (this.pool[v.kind] || (this.pool[v.kind] = [])).push(v.m);
  }

  nextEdge(v) {
    const node = this.net.nodes[v.dir > 0 ? v.e.b : v.e.a];
    if (!node) return false;
    const here = this.net.sample(v.e, v.dir > 0 ? v.e.len : 0, {});
    const hx = here.dx * v.dir, hz = here.dz * v.dir;
    const cands = [];
    for (const id of node.edges) {
      if (id === v.e.id) continue;
      const e = this.net.edges[id];
      if (e.type === 'pad' || !SPEC[e.type].traffic) continue;
      const dir = e.a === node.id ? 1 : -1;
      if (e.oneway && dir < 0) continue;
      const st = this.net.sample(e, dir > 0 ? 0 : e.len, {});
      const straight = st.dx * dir * hx + st.dz * dir * hz;
      const w = Math.max(0.05, straight + 1) * (e.type === v.e.type ? 2 : 1) * (e.ref && e.ref === v.e.ref ? 3 : 1);
      cands.push([w, e, dir]);
    }
    if (!cands.length) return false;
    let tot = cands.reduce((a, c) => a + c[0], 0), r = Math.random() * tot;
    for (const [w, e, dir] of cands) {
      r -= w;
      if (r <= 0) {
        const over = v.dir > 0 ? v.s - v.e.len : -v.s;
        v.e = e; v.dir = dir;
        v.s = dir > 0 ? over : e.len - over;
        v.vmax = (SPEC[e.type].speed / 3.6) * SPEED_K[v.kind] * (0.85 + Math.random() * 0.3);
        return true;
      }
    }
    return false;
  }

  place(v) {
    const c = this.net.sample(v.e, v.s, this.tmp);
    const tx = c.dx * v.dir, tz = c.dz * v.dir;
    const lx = tz, lz = -tx;
    const off = v.e.oneway ? 0 : v.e.hw * v.laneK;
    const nx = c.x + lx * off, nz = c.z + lz * off;
    if (v.x !== undefined) v.vel.set(nx - v.x, 0, nz - v.z);
    v.x = nx; v.z = nz; v.y = c.y;
    const yaw = Math.atan2(tx, tz);
    let dy = yaw - v.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.yaw += dy * 0.35;
    v.fx = Math.sin(v.yaw); v.fz = Math.cos(v.yaw);
    const g = v.m.group;
    g.position.set(v.x, v.y + 0.02, v.z);
    g.rotation.set(-Math.atan(c.grade * v.dir), v.yaw, 0, 'YXZ');
  }

  update(dt, px, pz, truck) {
    // population
    if (this.vehicles.length < this.max && Math.random() < dt * 4) this.spawn(px, pz);
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (Math.hypot(v.x - px, v.z - pz) > 1250) {
        this.release(v);
        this.vehicles.splice(i, 1);
      }
    }
    const tp = truck.pos;
    const tfwd = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.q);
    for (const v of this.vehicles) {
      // target speed: limit, curvature, leader
      let target = v.vmax;
      for (const look of [8, 22, 40]) {
        const k = this.net.curvatureAt(v.e, v.s + v.dir * look, v.dir);
        target = Math.min(target, Math.sqrt(2.3 / Math.max(k, 1e-4)) + look * 0.12);
      }
      let gapMin = Infinity, leaderIsPlayer = false;
      const consider = (ox, oz, ofx, ofz, olen, isPlayer) => {
        const rx = ox - v.x, rz = oz - v.z;
        const ahead = rx * v.fx + rz * v.fz;
        if (ahead <= 0 || ahead > 50) return;
        const lat = rx * v.fz - rz * v.fx;
        if (Math.abs(lat) > (isPlayer ? 2.6 : 2.0)) return;
        if (!isPlayer && ofx * v.fx + ofz * v.fz < 0.2) return;
        const gap = ahead - (olen + v.len) / 2;
        if (gap < gapMin) { gapMin = gap; leaderIsPlayer = isPlayer; }
      };
      for (const o of this.vehicles) if (o !== v) consider(o.x, o.z, o.fx, o.fz, o.len, false);
      consider(tp.x, tp.z, tfwd.x, tfwd.z, 8.4, true);
      if (gapMin < Infinity) {
        const safe = 3 + v.speed * 1.1;
        if (gapMin < safe) target = Math.min(target, Math.max(0, (gapMin - 2.5) * 0.7));
      }
      if (v.stop > 0) { v.stop -= dt; target = 0; }
      // horn when the player blocks the lane
      v.hornCd -= dt;
      if (leaderIsPlayer && gapMin < 10 && v.speed < 1.5) v.blocked += dt; else v.blocked = 0;
      if (v.blocked > 2.5 && v.hornCd < 0) {
        this.events.push({ type: 'horn', kind: v.kind, x: v.x, z: v.z });
        v.hornCd = 4 + Math.random() * 5;
      }
      const a = ACC[v.kind];
      v.speed += THREE.MathUtils.clamp(target - v.speed, -7 * dt, a * dt);
      v.speed = Math.max(0, v.speed);
      v.s += v.dir * v.speed * dt;
      if (v.s > v.e.len || v.s < 0) {
        if (!this.nextEdge(v)) { v.dir *= -1; v.s = THREE.MathUtils.clamp(v.s, 0, v.e.len); }
      }
      this.place(v);
      if (dt > 0) v.vel.divideScalar(dt);
      const wr = v.m.group.userData.wheelR || 0.3;
      for (const w of v.m.group.userData.wheels || []) w.rotation.x += (v.speed / wr) * dt;
      this.collide(v, truck);
    }
  }

  collide(v, truck) {
    const dx = v.x - truck.pos.x, dz = v.z - truck.pos.z;
    if (dx * dx + dz * dz > 18 * 18) return;
    const rV = v.width / 2;
    const nV = Math.max(1, Math.round(v.len / (v.width * 1.1)));
    for (const c of truck.circles) {
      const cw = truck.worldPoint(new THREE.Vector3(0, 1.5, c.z), new THREE.Vector3());
      if (Math.abs(cw.y - v.y - 1.0) > 2.5) continue;
      for (let k = 0; k < nV; k++) {
        const t = nV === 1 ? 0 : (k / (nV - 1) - 0.5) * (v.len - v.width);
        const ox = v.x + v.fx * t, oz = v.z + v.fz * t;
        const ddx = cw.x - ox, ddz = cw.z - oz;
        const d = Math.hypot(ddx, ddz);
        const pen = c.r + rV - d;
        if (pen <= 0 || d < 1e-4) continue;
        const n = new THREE.Vector3(ddx / d, 0, ddz / d);
        const ov = new THREE.Vector3(v.fx * v.speed, 0, v.fz * v.speed);
        const j = truck.resolveContact(cw.clone().addScaledVector(n, -c.r), n, pen, 0.2, v.mass, 'vehicle', ov);
        if (j > 0) {
          v.speed = Math.max(0, v.speed - j / v.mass);
          v.stop = 4;
          v.hornCd = 0;
          v.blocked = 3;
          this.events.push({ type: 'crash', kind: v.kind, j });
        }
        // push the light vehicle sideways a bit
        const push = (pen * truck.mass) / (truck.mass + v.mass);
        v.x -= n.x * push; v.z -= n.z * push;
      }
    }
  }

  clear() {
    for (const v of this.vehicles) this.release(v);
    this.vehicles.length = 0;
  }
}
