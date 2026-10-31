// Save / load career progress in browser localStorage.
import * as THREE from 'three';

const KEY = 'churam-save-v1';

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(W) {
  const t = W.truck, j = W.jobs;
  const a = j.active;
  const data = {
    v: 1,
    at: Date.now(),
    money: j.money,
    completed: j.completed,
    truck: {
      pos: t.pos.toArray(), q: t.q.toArray(), fuel: t.fuel, health: t.health, cargoHealth: t.cargoHealth,
      brakeTemp: t.brakeTemp, auto: t.auto, exhaust: t.exhaustBrake, cargo: t.cargo,
    },
    job: a ? { from: a.from.id, to: a.to.id, cargo: a.cargo, km: a.km, pay: a.pay, timeLimit: a.timeLimit, elapsed: a.elapsed, state: j.state === 'unloading' ? 'enroute' : j.state } : null,
    env: { time: W.env.time, rain: W.env.rainTarget > 0 },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Apply a save to an already-loaded world. */
export function applySave(W, s) {
  const t = W.truck, j = W.jobs;
  j.money = s.money;
  j.completed = s.completed || 0;
  t.auto = s.truck.auto;
  t.exhaustBrake = !!s.truck.exhaust;
  t.setCargo(s.truck.cargo || null);
  const q = new THREE.Quaternion().fromArray(s.truck.q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const [x, , z] = s.truck.pos;
  t.place(x, z, Math.atan2(fwd.x, fwd.z));
  t.fuel = s.truck.fuel;
  t.health = s.truck.health;
  t.cargoHealth = s.truck.cargoHealth;
  t.brakeTemp = s.truck.brakeTemp;
  if (s.job) {
    const from = W.places.depots.find((d) => d.id === s.job.from);
    const to = W.places.depots.find((d) => d.id === s.job.to);
    if (from && to) {
      j.active = { cargo: s.job.cargo, from, to, km: s.job.km, pay: s.job.pay, timeLimit: s.job.timeLimit, elapsed: s.job.elapsed, line: j.route(from, to) };
      j.state = s.job.state === 'loading' ? 'loading' : 'enroute';
      if (j.state === 'loading') { j.timer = 3; j.pendingCargo = s.job.cargo; }
    }
  }
  W.env.setTime(s.env.time);
  if (s.env.rain && W.env.rainTarget === 0) W.env.toggleRain();
}
