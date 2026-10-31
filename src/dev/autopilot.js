// Dev-only harness (load the game with ?dev): drives the lorry along the NH766
// polyline with a pure-pursuit controller, faster than real time, and logs
// speed / gear / brake temperature so physics changes can be checked quickly.
import * as THREE from 'three';

export function installAutopilot(W) {
  const impacts = [];
  /** Teleport to the road nearest (x,z); yaw offset in degrees. */
  window.tp = (x, z, headDeg = 0, cargo = 'sacks') => {
    const t = W.truck;
    t.setCargo(cargo ? { kind: 'coffee', mass: 8000, fragility: 0.25, visual: cargo } : null);
    const q = W.rs.nearest(x, z, 400);
    const seg = W.rs.seg, o = q.seg * 8;
    const rx = seg[o] + (seg[o + 3] - seg[o]) * q.t, rz = seg[o + 1] + (seg[o + 4] - seg[o + 1]) * q.t;
    t.place(rx + q.dz * q.hw * 0.45, rz - q.dx * q.hw * 0.45, Math.atan2(q.dx, q.dz) + (headDeg * Math.PI) / 180);
    W.waitTerrain = true;
    W.veg.prime(t.pos.x, t.pos.z);
    return [rx, rz];
  };
  window.autopilot = function ({ cargoT = 0, kmh = 40, seconds = 300, fromKm = 0, downhill = false, exhaust = false } = {}) {
    const t = W.truck;
    const pts = downhill ? W.route.slice().reverse().map((p, i, a) => ({ ...p, s: a[0].s - p.s })) : W.route;
    let idx = Math.max(0, pts.findIndex((p) => p.s >= fromKm * 1000));
    const a = pts[idx], b = pts[idx + 3];
    t.setCargo(cargoT ? { kind: 'coffee', mass: cargoT * 1000, fragility: 0.25, visual: 'sacks' } : null);
    const hx = b.x - a.x, hz = b.z - a.z, L = Math.hypot(hx, hz);
    t.place(a.x + (hz / L) * a.hw * 0.45, a.z - (hx / L) * a.hw * 0.45, Math.atan2(hx, hz));
    t.brakeTemp = 30;
    t.exhaustBrake = exhaust;
    t.health = 100;
    const log = [];
    const fwd = new THREE.Vector3(), left = new THREE.Vector3();
    const steps = seconds * 60;
    let maxBrake = 0;
    for (let i = 0; i < steps; i++) {
      for (let k = idx; k < Math.min(pts.length - 1, idx + 40); k++)
        if (Math.hypot(pts[k].x - t.pos.x, pts[k].z - t.pos.z) < Math.hypot(pts[idx].x - t.pos.x, pts[idx].z - t.pos.z)) idx = k;
      const look = Math.max(6, Math.abs(t.speed) * 1.2);
      let j = idx;
      while (j < pts.length - 1 && Math.hypot(pts[j].x - pts[idx].x, pts[j].z - pts[idx].z) < look) j++;
      const p = pts[j], q = pts[Math.min(pts.length - 1, j + 1)];
      const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      const gx = p.x + (tz / tl) * p.hw * 0.45 - t.pos.x, gz = p.z - (tx / tl) * p.hw * 0.45 - t.pos.z;
      fwd.set(0, 0, 1).applyQuaternion(t.q);
      left.set(1, 0, 0).applyQuaternion(t.q);
      const latE = gx * left.x + gz * left.z, fwdE = gx * fwd.x + gz * fwd.z;
      const steerAng = Math.atan2(2 * 4.6 * latE, fwdE * fwdE + latE * latE);
      t.input.steer = THREE.MathUtils.clamp(steerAng / (0.62 / (1 + Math.abs(t.speed) / 11)), -1, 1);
      const hd = (k) => {
        const A = pts[Math.min(pts.length - 1, k)], B = pts[Math.min(pts.length - 1, k + 8)];
        return Math.atan2(B.z - A.z, B.x - A.x);
      };
      let turn = 0;
      for (const off of [0, 4, 8, 12, 16]) {
        let h = hd(idx + off + 8) - hd(idx + off);
        h = Math.atan2(Math.sin(h), Math.cos(h));
        turn = Math.max(turn, Math.abs(h) / 20);
      }
      const vC = Math.min(kmh / 3.6, Math.sqrt(1.8 / Math.max(turn, 1e-4)));
      const err = vC - t.speed;
      t.input.throttle = err > 0.3 ? Math.min(1, err * 0.6) : 0;
      t.input.brake = err < -0.6 ? Math.min(1, -err * 0.25) : 0;
      t.input.handbrake = false;
      t.update(1 / 60);
      for (const ev of t.events) if (ev.type === 'impact') impacts.push({ t: i / 60, ...ev, at: [Math.round(t.pos.x), Math.round(t.pos.z)] });
      t.events.length = 0;
      maxBrake = Math.max(maxBrake, t.brakeTemp);
      if (i % 600 === 0)
        log.push(`${i / 60}s ${(pts[idx].s / 1000).toFixed(2)}km ${(t.speed * 3.6).toFixed(0)}kmh g${t.gearName} ${t.rpm.toFixed(0)}rpm ${t.brakeTemp.toFixed(0)}C ${t.pos.y.toFixed(0)}m cargo${t.cargoHealth.toFixed(0)} hp${t.health.toFixed(0)}`);
      if (idx >= pts.length - 5) break;
    }
    return { log, maxBrake: Math.round(maxBrake), impacts: impacts.splice(0) };
  };
}
