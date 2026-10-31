// Rigid-body lorry with raycast suspension, slip-based tyres, diesel engine +
// 5-speed gearbox, engine/exhaust braking, brake heating & fade, body contacts
// (so it can roll over on a hairpin) and collisions with static obstacles.
import * as THREE from 'three';
import { buildLorry, buildCargo, LORRY_THEMES, setVehicleLights } from './models.js';

const G = 9.81;
const GEARS = [-6.6, 0, 7.03, 4.13, 2.44, 1.47, 1.0]; // R, N, 1..5
const GEAR_NAMES = ['R', 'N', '1', '2', '3', '4', '5'];
const FINAL = 5.86;
const IDLE = 650, REDLINE = 2700;
const DT = 1 / 120;
const EMPTY_MASS = 6200;
const TORQUE = [[500, 230], [800, 330], [1100, 410], [1400, 440], [1800, 440], [2200, 405], [2500, 360], [2800, 300], [3100, 200]];

function engineTorque(rpm) {
  if (rpm <= TORQUE[0][0]) return TORQUE[0][1];
  for (let i = 1; i < TORQUE.length; i++)
    if (rpm < TORQUE[i][0]) {
      const [r0, t0] = TORQUE[i - 1], [r1, t1] = TORQUE[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  return 0;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

export class Truck {
  constructor(scene, rs, colliders) {
    this.scene = scene;
    this.rs = rs;
    this.colliders = colliders;
    const model = buildLorry(LORRY_THEMES[0], 'KL 12 B 4521', true);
    this.model = model;
    this.group = model.group;
    scene.add(this.group);

    // wheel hierarchy: pivot (position + steer) > spinner (roll) > model
    const defs = [
      { key: 'fl', x: 0.98, z: 2.55, steer: true, drive: false },
      { key: 'fr', x: -0.98, z: 2.55, steer: true, drive: false },
      { key: 'rl', x: 0.88, z: -2.05, steer: false, drive: true, dual: true },
      { key: 'rr', x: -0.88, z: -2.05, steer: false, drive: true, dual: true },
    ];
    this.wheels = defs.map((d) => {
      const pivot = new THREE.Group();
      const spinner = new THREE.Group();
      const m = model.wheels[d.key];
      this.group.remove(m);
      if (d.dual) {
        // inner tyre of the pair must sit towards the chassis
        m.position.x = d.x > 0 ? 0.13 : -0.13;
        if (d.x > 0) m.rotation.y = Math.PI;
      }
      spinner.add(m);
      pivot.add(spinner);
      this.group.add(pivot);
      return {
        ...d, pivot, spinner, r: 0.52, restLen: 0.34, hpY: 0.52 + 0.34 - 0.11,
        k: 0, c: 0, comp: 0, compPrev: 0, spin: 0, contact: false, load: 0, slip: 0, onRoad: true, centreY: 0.5,
      };
    });

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.com = new THREE.Vector3();
    this.invI = new THREE.Vector3();

    this.steer = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.gear = 2;
    this.targetGear = 2;
    this.shiftTimer = 0;
    this.auto = true;
    this.rpm = IDLE;
    this.exhaustBrake = false;
    this.brakeTemp = 30;
    this.fuel = 140;
    this.tank = 180;
    this.cargoMass = 0;
    this.cargo = null;
    this.cargoHealth = 100;
    this.health = 100;
    this.odometer = 0;
    this.lastImpact = 0;
    this.lateralG = 0;
    this.wet = 0;
    this.engineOn = true;
    this.acc = 0;
    this.reverseHold = 0;
    this.events = [];
    this.surf = { h: 0, onRoad: false, e: 0, cls: 0 };

    // body contact points (model space) used when the truck tips or scrapes
    this.hull = [];
    for (const s of [1, -1]) {
      this.hull.push([s * 1.16, 2.8, 3.25], [s * 1.16, 2.8, 1.6], [s * 1.2, 3.75, 3.3], [s * 1.2, 3.7, 1.42], [s * 1.23, 2.45, -4.42],
        [s * 1.23, 2.45, -1.5], [s * 1.2, 0.62, 3.95], [s * 1.22, 1.2, -4.42], [s * 1.22, 1.25, -1.5], [s * 0.7, 1.6, 3.72],
        [s * 0.5, 0.45, 2.55], [s * 0.5, 0.45, -2.05], [s * 0.5, 0.6, 0.2]);
    }
    // collision circles along the length (model z)
    this.circles = [2.75, 0.95, -0.85, -2.65, -3.2].map((z) => ({ z, r: 1.24 }));

    this.setCargo(null);
    this.addLights();
  }

  addLights() {
    this.headlights = [];
    for (const s of [1, -1]) {
      const l = new THREE.SpotLight(0xfff1d6, 0, 120, 0.5, 0.45, 1.2);
      l.position.set(s * 0.95, 1.12, 4.1);
      l.target.position.set(s * 0.6, 0, 30);
      this.group.add(l, l.target);
      this.headlights.push(l);
    }
  }

  setHeadlights(on) {
    this.lightsOn = on;
    for (const l of this.headlights) l.intensity = on ? 60 : 0;
    setVehicleLights(on);
  }

  /** cargo: null or { kind, mass, fragility, visual } */
  setCargo(cargo) {
    if (this.cargoMesh) {
      this.group.remove(this.cargoMesh);
      this.cargoMesh = null;
    }
    this.cargo = cargo;
    this.cargoMass = cargo ? cargo.mass : 0;
    this.cargoHealth = 100;
    if (cargo) {
      this.cargoMesh = buildCargo(cargo.visual, this.model.bodyLength);
      this.cargoMesh.position.copy(this.model.cargoAnchor);
      this.group.add(this.cargoMesh);
    }
    this.updateMassProps();
  }

  updateMassProps() {
    const mE = EMPTY_MASS, mC = this.cargoMass;
    this.mass = mE + mC;
    // centre of mass: empty truck biased to the engine, cargo on the deck
    const comE = new THREE.Vector3(0, 1.05, 0.55);
    const comC = new THREE.Vector3(0, 1.41 + 0.6, -1.6);
    this.com.copy(comE).multiplyScalar(mE).addScaledVector(comC, mC).divideScalar(this.mass);
    const W = 2.4, H = 2.2, L = 8.4, m = this.mass;
    this.I = new THREE.Vector3((m / 12) * (H * H + L * L), (m / 12) * (W * W + L * L), (m / 12) * (W * W + H * H) * 1.1);
    this.invI.set(1 / this.I.x, 1 / this.I.y, 1 / this.I.z);
    // axle loads -> spring rates for ~11 cm static sag
    const zf = 2.55, zr = -2.05;
    const frontFrac = (this.com.z - zr) / (zf - zr);
    for (const w of this.wheels) {
      const load = (w.steer ? frontFrac : 1 - frontFrac) * this.mass * G / 2;
      w.k = load / 0.11;
      w.c = 2 * 0.32 * Math.sqrt(w.k * (load / G));
      w.staticLoad = load;
    }
    this.brakeMax = 0.72 * this.mass * G;
  }

  /** Place on the road at (x,z) facing heading (radians, 0 = +z). */
  place(x, z, heading) {
    const h = this.rs.height(x, z);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.pos.set(x, h, z).add(this.com.clone().applyQuaternion(this.q));
    this.pos.y += 0.05;
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
    for (const w of this.wheels) { w.comp = w.compPrev = 0.11; w.vf = 0; w.spinRate = 0; w.slip = 0; }
    this.steer = 0;
    this.rpm = IDLE;
    this.lateralG = 0;
    this.holding = true;
    this.saveGood();
    this.gear = this.targetGear = 2;
    this.shiftTimer = 0;
    this.sync(0);
  }

  get speed() {
    return this.vel.dot(_v.set(0, 0, 1).applyQuaternion(this.q));
  }
  get gearName() {
    return this.shiftTimer > 0 ? '-' : GEAR_NAMES[this.gear];
  }
  get brakeFade() {
    return this.brakeTemp <= 250 ? 1 : Math.max(0.28, 1 - (this.brakeTemp - 250) / 420);
  }

  shift(dir) {
    if (this.shiftTimer > 0) return;
    const t = Math.max(0, Math.min(GEARS.length - 1, this.targetGear + dir));
    if (t === this.targetGear) return;
    this.targetGear = t;
    this.shiftTimer = t <= 1 || this.gear <= 1 ? 0.25 : 0.55;
    this.events.push('shift');
  }

  worldPoint(local, out) {
    return out.copy(local).sub(this.com).applyQuaternion(this.q).add(this.pos);
  }

  applyImpulse(point, J) {
    this.vel.addScaledVector(J, 1 / this.mass);
    const r = _v3.subVectors(point, this.pos);
    const ang = r.cross(J);
    this.w.add(this.worldInvI(ang));
  }

  worldInvI(v) {
    // R * diag(invI) * R^T * v
    const qi = this.q.clone().invert();
    const l = v.clone().applyQuaternion(qi);
    l.set(l.x * this.invI.x, l.y * this.invI.y, l.z * this.invI.z);
    return l.applyQuaternion(this.q);
  }

  update(dt) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) {
      this.step(DT);
      this.acc -= DT;
      // numerical safety net: never let a bad step poison the simulation
      if (!Number.isFinite(this.pos.x + this.pos.y + this.vel.x + this.vel.y + this.w.x + this.w.y + this.q.w + this.rpm + this.steer)) {
        if (!this.nanReported) { console.warn('truck physics produced NaN; restoring last good state', this.debugLast); this.nanReported = true; }
        this.restoreGood();
      } else this.saveGood();
    }
    this.sync(dt);
  }

  saveGood() {
    this.good = { pos: this.pos.clone(), vel: this.vel.clone(), q: this.q.clone(), w: this.w.clone() };
  }

  restoreGood() {
    const g = this.good;
    this.pos.copy(g.pos); this.q.copy(g.q);
    this.vel.multiplyScalar(0); this.w.multiplyScalar(0);
    this.vel.copy(g.vel).multiplyScalar(0.5);
    this.rpm = IDLE; this.steer = 0;
    for (const w of this.wheels) { w.vf = 0; w.spinRate = 0; w.slip = 0; w.comp = w.compPrev = 0.11; }
  }

  step(dt) {
    const inp = this.input;
    const up = _v.set(0, 1, 0).applyQuaternion(this.q).clone();
    const fwdBody = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    const speed = this.vel.dot(fwdBody);
    const absV = Math.abs(speed);

    // ---- steering (heavy, speed sensitive)
    const maxSteer = 0.62 / (1 + absV / 11);
    const target = inp.steer * maxSteer;
    const rate = 1.4;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate * dt, rate * dt);

    // ---- gearbox
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) { this.gear = this.targetGear; this.shiftTimer = 0; }
    }
    let throttle = this.engineOn && this.fuel > 0 ? inp.throttle : 0;
    let brake = inp.brake;
    // hill-hold: an automatic lorry stays put when stopped with no pedal input
    if (throttle > 0.02 || inp.wantReverse || !this.auto) this.holding = false;
    else if (absV < 0.35 && brake < 0.02) this.holding = true;
    if (this.holding) brake = Math.max(brake, 0.7);
    let rearVf = 0, nr = 0;
    for (const w of this.wheels) if (w.drive) { rearVf += w.vf ?? speed; nr++; }
    rearVf /= nr;
    const rpmAt = (g) => ((rearVf / 0.5) * GEARS[g] * FINAL * 60) / (2 * Math.PI);
    if (this.auto && this.shiftTimer === 0) {
      if (this.gear >= 2) {
        const r = rpmAt(this.gear);
        const grade = -fwdBody.y; // >0 going downhill
        if (r > 2350 && this.gear < 6 && throttle > 0.05) this.shift(1);
        else if (r < 1000 && this.gear > 2) this.shift(-1);
        else if (throttle > 0.9 && r < 1300 && this.gear > 2 && rpmAt(this.gear - 1) < 2300) this.shift(-1);
        // engine-braking downshift on descents, like a ghat driver
        else if (brake > 0.2 && grade > 0.03 && r < 1700 && this.gear > 2 && rpmAt(this.gear - 1) < 2500) this.shift(-1);
        else if (this.gear > 3 && absV < 2) this.shift(-1);
      }
      // reverse handling: hold brake while stopped to engage R
      if (absV < 0.4 && inp.wantReverse) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.35 && this.gear !== 0) { this.targetGear = 0; this.gear = 0; this.events.push('shift'); }
      } else this.reverseHold = 0;
      if (this.gear === 0 && inp.wantForward && absV < 0.5) { this.gear = this.targetGear = 2; this.events.push('shift'); }
      if (this.gear === 1) { this.gear = this.targetGear = 2; }
    }

    // ---- engine
    const ratio = GEARS[this.gear] * FINAL;
    const engaged = this.gear !== 1 && this.shiftTimer === 0;
    const rpmWheels = rpmAt(this.gear);
    let torque = 0;
    if (!engaged) {
      // driver lifts off during the shift; revs fall towards the next gear's speed
      const next = this.targetGear >= 2 || this.targetGear === 0 ? Math.max(IDLE, rpmAt(this.targetGear)) : IDLE;
      this.rpm += (next - this.rpm) * Math.min(1, dt * 6);
    } else if (rpmWheels < IDLE + 120) {
      // clutch slipping (pulling away / crawling)
      const slipRpm = IDLE + throttle * 700;
      this.rpm += (Math.max(rpmWheels, slipRpm) - this.rpm) * Math.min(1, dt * 8);
      torque = throttle > 0.02 ? engineTorque(this.rpm) * throttle * 0.95 : 0;
    } else {
      this.rpm = rpmWheels;
      if (throttle > 0.02) torque = engineTorque(this.rpm) * throttle;
      else torque = -(28 + this.rpm * 0.028) * (this.exhaustBrake ? 3.2 : 1);
      if (this.rpm > REDLINE) torque = Math.min(torque, -40);
    }
    if (!this.engineOn) { torque = 0; this.rpm += (0 - this.rpm) * dt * 2; }
    const wheelForce = (torque * ratio * 0.88) / 0.5;
    const enginePower = Math.max(0, torque * (this.rpm * 2 * Math.PI) / 60);
    this.fuel = Math.max(0, this.fuel - ((enginePower / 1000) * 0.27 / 3600 + 1.3 / 3600) * dt);
    this.load = enginePower / 95000;

    // ---- forces
    const F = new THREE.Vector3(0, -this.mass * G, 0);
    const T = new THREE.Vector3();
    const mu0 = 0.85 - this.wet * 0.25;
    let brakePower = 0;
    const fade = this.brakeFade;
    const add = (f, at) => {
      F.add(f);
      T.add(_v2.subVectors(at, this.pos).cross(f));
    };

    for (const w of this.wheels) {
      const hp = this.worldPoint(_v3.set(w.x, w.hpY, w.z), new THREE.Vector3());
      const down = up.clone().negate();
      // two-pass ray vs heightfield
      let g = this.rs.surface(hp.x, hp.z, this.surf).h;
      let t = (hp.y - g) / Math.max(0.3, -down.y);
      const cp = hp.clone().addScaledVector(down, t);
      g = this.rs.surface(cp.x, cp.z, this.surf).h;
      t = (hp.y - g) / Math.max(0.3, -down.y);
      cp.copy(hp).addScaledVector(down, t);
      w.onRoad = this.surf.onRoad;
      const maxT = w.restLen + w.r;
      w.compPrev = w.comp;
      // t < 0 means the suspension mount itself is under the ground (truck tipped
      // over an edge or into a wall): the wheel can't push, the hull takes over.
      if (t >= maxT || t < 0.05) {
        w.contact = false; w.comp = 0; w.load = 0; w.centreLocal = w.hpY - w.restLen; w.vf = speed;
        continue;
      }
      w.contact = true;
      w.comp = maxT - t;
      w.centreLocal = w.hpY - (w.restLen - w.comp);
      // ground normal
      const e = 0.5;
      const hx = this.rs.height(cp.x + e, cp.z) - this.rs.height(cp.x - e, cp.z);
      const hz = this.rs.height(cp.x, cp.z + e) - this.rs.height(cp.x, cp.z - e);
      const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize();

      // spring + damper with a progressive bump stop; bounded so a sudden step in the
      // ground (kerb, rock cutting) can never inject more than a hard knock
      const travel = Math.min(w.comp, 0.42);
      const rate = THREE.MathUtils.clamp((w.comp - w.compPrev) / dt, -3, 3);
      let Fs = w.k * travel + w.c * rate;
      if (travel > 0.3) Fs += (travel - 0.3) * w.k * 8;
      Fs = THREE.MathUtils.clamp(Fs, 0, w.staticLoad * 7);
      const Fz = Fs * Math.max(0.2, n.dot(up));
      w.load = Fz;

      // tyre frame
      const st = w.steer ? this.steer : 0;
      const head = new THREE.Vector3(Math.sin(st), 0, Math.cos(st)).applyQuaternion(this.q);
      const fwd = head.addScaledVector(n, -head.dot(n)).normalize();
      const side = new THREE.Vector3().crossVectors(n, fwd);
      const r = _v2.subVectors(cp, this.pos);
      const vc = new THREE.Vector3().crossVectors(this.w, r).add(this.vel);
      const vf = vc.dot(fwd), vs = vc.dot(side);
      w.vf = vf;
      const mu = mu0 * (w.onRoad ? 1 : 0.78) * (w.dual ? 1.05 : 1);
      const mShare = this.mass / 4;

      // longitudinal
      let Fx = 0;
      if (w.drive) Fx += wheelForce / 2;
      let B = brake * this.brakeMax * fade * (w.steer ? 0.4 : 0.6) / 2;
      if (inp.handbrake && !w.steer) B = Math.max(B, mu * Fz * 1.1);
      if (B > 0) {
        const stop = -vf * mShare / dt * 0.5;
        const fb = Math.abs(vf) < 0.6 ? THREE.MathUtils.clamp(stop, -B, B) : -Math.sign(vf) * B;
        Fx += fb;
        if (!(inp.handbrake && !w.steer)) brakePower += Math.abs(fb * vf);
      }
      Fx += -THREE.MathUtils.clamp(vf * 4, -1, 1) * 0.008 * Fz;
      // lateral (simplified Pacejka)
      const alpha = Math.atan2(vs, Math.max(Math.abs(vf), 2.5));
      let Fy = -mu * Fz * Math.sin(1.35 * Math.atan(7.5 * alpha));
      if (Math.abs(vf) < 2.5) Fy += THREE.MathUtils.clamp(-vs * mShare / dt * 0.12, -mu * Fz, mu * Fz) * (1 - Math.abs(vf) / 2.5);
      // friction circle
      const Fmax = mu * Fz;
      const Fm = Math.hypot(Fx, Fy);
      w.slip = Fm > Fmax * 0.92 ? Math.min(1, (Fm - Fmax * 0.92) / (Fmax * 0.5) + Math.abs(alpha) * 0.5) : Math.max(0, Math.abs(alpha) - 0.12) * 2;
      if (Fm > Fmax) { Fx *= Fmax / Fm; Fy *= Fmax / Fm; }

      const f = new THREE.Vector3().addScaledVector(up, Fs).addScaledVector(fwd, Fx).addScaledVector(side, Fy);
      add(f, cp);
      w.spinRate = vf / w.r;
      if (inp.handbrake && !w.steer) w.spinRate = 0;
    }

    // hull contacts with the ground
    let scraping = 0;
    for (const h of this.hull) {
      const p = this.worldPoint(_v3.set(h[0], h[1], h[2]), new THREE.Vector3());
      const g = this.rs.height(p.x, p.z);
      if (p.y < g) {
        const depth = g - p.y;
        const r = _v2.subVectors(p, this.pos);
        const vp = new THREE.Vector3().crossVectors(this.w, r).add(this.vel);
        // push out along the real ground normal so walls push sideways, not skyward
        const e = 0.6;
        const n = new THREE.Vector3(
          this.rs.height(p.x - e, p.z) - this.rs.height(p.x + e, p.z), 2 * e,
          this.rs.height(p.x, p.z - e) - this.rs.height(p.x, p.z + e)
        ).normalize();
        const vn = vp.dot(n);
        // stiffness saturates with depth; deep overlaps are fixed by position correction
        const Fn = THREE.MathUtils.clamp(Math.min(depth, 0.35) * this.mass * 60 - vn * this.mass * 6, 0, this.mass * G * 3);
        if (depth > 0.25) this.pos.addScaledVector(n, Math.min(0.04, (depth - 0.25) * 0.3));
        const vt = vp.clone().addScaledVector(n, -vn);
        const vtLen = vt.length();
        const ft = vtLen > 1e-3 ? vt.multiplyScalar((-Fn * 0.6 * Math.min(1, vtLen / 0.4)) / vtLen) : new THREE.Vector3();
        add(n.multiplyScalar(Fn).add(ft), p);
        scraping += depth;
      }
    }
    this.scraping = scraping;

    // aero drag
    const v2 = this.vel.lengthSq();
    if (v2 > 0.01) F.addScaledVector(this.vel, -0.5 * 1.2 * 5.5 * Math.sqrt(v2));

    // integrate
    this.vel.addScaledVector(F, dt / this.mass);
    const qi = this.q.clone().invert();
    const wl = this.w.clone().applyQuaternion(qi);
    const Iw = new THREE.Vector3(wl.x * this.I.x, wl.y * this.I.y, wl.z * this.I.z);
    const gyro = new THREE.Vector3().crossVectors(wl, Iw);
    const Tl = T.clone().applyQuaternion(qi).sub(gyro);
    wl.x += Tl.x * this.invI.x * dt; wl.y += Tl.y * this.invI.y * dt; wl.z += Tl.z * this.invI.z * dt;
    this.w.copy(wl.applyQuaternion(this.q)).multiplyScalar(1 - 0.15 * dt);
    if (this.w.lengthSq() > 36) this.w.setLength(6);
    if (this.vel.lengthSq() > 3600) this.vel.setLength(60);
    this.pos.addScaledVector(this.vel, dt);
    const wq = new THREE.Quaternion(this.w.x * dt * 0.5, this.w.y * dt * 0.5, this.w.z * dt * 0.5, 0).multiply(this.q);
    this.q.x += wq.x; this.q.y += wq.y; this.q.z += wq.z; this.q.w += wq.w;
    this.q.normalize();

    this.collideStatic(dt);

    // brakes heat & cool
    this.brakeTemp += (brakePower / 52000) * dt;
    this.brakeTemp -= (this.brakeTemp - 30) * (0.0011 + 0.00028 * absV) * dt;

    // wellbeing
    const latAcc = Math.abs(F.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(this.q))) / this.mass;
    this.lateralG += (latAcc / G - this.lateralG) * Math.min(1, dt * 5);
    if (this.cargo && this.lateralG > 0.38) this.cargoHealth = Math.max(0, this.cargoHealth - (this.lateralG - 0.38) * 9 * this.cargo.fragility * dt);
    if (up.y < 0.35) {
      this.health = Math.max(0, this.health - 6 * dt);
      if (this.cargo) this.cargoHealth = Math.max(0, this.cargoHealth - 25 * this.cargo.fragility * dt);
      this.rolled = true;
    } else this.rolled = false;
    this.odometer += absV * dt;
  }

  collideStatic(dt) {
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    for (const c of this.circles) {
      const cw = this.worldPoint(_v3.set(0, 1.5, c.z), new THREE.Vector3());
      this.colliders.forEachNear(cw.x, cw.z, (b) => {
        const test = (ox, oz, rr, y0, y1, kind) => {
          if (cw.y + 1.2 < y0 || cw.y - 1.3 > y1) return;
          const dx = cw.x - ox, dz = cw.z - oz;
          const d = Math.hypot(dx, dz);
          const pen = c.r + rr - d;
          if (pen <= 0 || d < 1e-4) return;
          const n = new THREE.Vector3(dx / d, 0, dz / d);
          this.resolveContact(cw.clone().addScaledVector(n, -c.r), n, pen, 0.15, 0, kind);
        };
        for (const o of b.circles) test(o.x, o.z, o.r, o.y0, o.y1, o.kind);
        for (const owner of b.dyn.values()) for (const o of owner) test(o.x, o.z, o.r, o.y0, o.y1, o.kind);
        for (const s of b.segs) {
          const vx = s.x1 - s.x0, vz = s.z1 - s.z0;
          const L2 = vx * vx + vz * vz || 1e-6;
          const t = THREE.MathUtils.clamp(((cw.x - s.x0) * vx + (cw.z - s.z0) * vz) / L2, 0, 1);
          test(s.x0 + vx * t, s.z0 + vz * t, 0.05, s.y0, s.y1, s.kind);
        }
      });
    }
  }

  /** Impulse-based contact against an immovable (or heavy, if otherMass) obstacle. */
  resolveContact(point, n, pen, restitution, otherMass = 0, kind = 'wall', otherVel = null) {
    // positional correction (capped so deep overlaps don't teleport the truck)
    const invM = 1 / this.mass + (otherMass ? 1 / otherMass : 0);
    const share = (1 / this.mass) / invM;
    this.pos.addScaledVector(n, Math.min(0.15, pen * 0.8 * share));
    const r = new THREE.Vector3().subVectors(point, this.pos);
    const vp = new THREE.Vector3().crossVectors(this.w, r).add(this.vel);
    if (otherVel) vp.sub(otherVel);
    const vn = vp.dot(n);
    if (vn >= 0) return 0;
    const rn = new THREE.Vector3().crossVectors(r, n);
    const k = invM + n.dot(this.worldInvI(rn).cross(r));
    const j = (-(1 + restitution) * vn) / k;
    const J = n.clone().multiplyScalar(j);
    // friction along the contact
    const vt = vp.clone().addScaledVector(n, -vn);
    const vtLen = vt.length();
    if (vtLen > 1e-3) J.addScaledVector(vt.divideScalar(vtLen), -Math.min(j * 0.4, (vtLen * 0.5) / invM));
    this.applyImpulse(point, J);
    const dv = j / this.mass;
    if (dv > 0.8) {
      this.health = Math.max(0, this.health - (dv - 0.8) * 3.5);
      if (this.cargo) this.cargoHealth = Math.max(0, this.cargoHealth - (dv - 0.8) * 7 * this.cargo.fragility);
      this.lastImpact = Math.max(this.lastImpact, dv);
      this.events.push({ type: 'impact', dv, kind });
    }
    return j;
  }

  sync(dt) {
    const g = this.group;
    g.quaternion.copy(this.q);
    g.position.copy(this.com).negate().applyQuaternion(this.q).add(this.pos);
    for (const w of this.wheels) {
      w.pivot.position.set(w.x, w.centreLocal ?? 0.5, w.z);
      w.pivot.rotation.y = w.steer ? this.steer : 0;
      w.spin += (w.spinRate || 0) * dt;
      w.spinner.rotation.x = w.spin;
    }
    if (this.model.steeringWheel) this.model.steeringWheel.rotation.z = -this.steer * 9;
    const r = this.model.refs;
    if (r && r.speedNeedle) {
      // dial sweep: 0 at 135 deg, full scale at 405 deg (canvas angles, clockwise)
      const ang = (f) => -(Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1.05, Math.max(0, f))) - Math.PI / 2;
      r.speedNeedle.rotation.z = ang(Math.abs(this.speed * 3.6) / 100);
      r.rpmNeedle.rotation.z = ang(this.rpm / 3000);
      r.fan.rotation.z += dt * 25;
    }
  }

  /** Upright the truck on the nearest road (towing). */
  recover(net) {
    const q = this.rs.nearest(this.pos.x, this.pos.z, 300);
    if (!q) return;
    const seg = this.rs.seg, o = q.seg * 8;
    const x = seg[o] + (seg[o + 3] - seg[o]) * q.t, z = seg[o + 1] + (seg[o + 4] - seg[o + 1]) * q.t;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    let heading = Math.atan2(q.dx, q.dz);
    if (fwd.x * q.dx + fwd.z * q.dz < 0) heading += Math.PI;
    // keep left
    const lx = Math.cos(heading), lz = -Math.sin(heading);
    this.place(x + lx * q.hw * 0.45, z + lz * q.hw * 0.45, heading);
  }
}
