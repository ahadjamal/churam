import * as THREE from 'three';
import { Heightfield } from './world/heightfield.js';
import { RoadNetwork } from './world/roads.js';
import { RoadSampler } from './world/roadSampler.js';
import { buildBiomeGrid } from './world/biome.js';
import { Terrain } from './world/terrain.js';
import { buildRoadMeshes } from './world/roadMesh.js';
import { Environment } from './world/sky.js';
import { Vegetation } from './world/vegetation.js';
import { Buildings } from './world/buildings.js';
import { Towns } from './world/towns.js';
import { Colliders } from './world/colliders.js';
import { Props } from './world/props.js';
import { buildPlaces, trunkRoute, findHairpins, inPad } from './world/places.js';
import { detailTexture } from './util/textures.js';
import { Truck } from './vehicles/truck.js';
import { Traffic } from './vehicles/traffic.js';
import { Jobs } from './game/jobs.js';
import { HUD } from './game/hud.js';
import { Audio } from './game/audio.js';
import { hasSave, readSave, saveGame, applySave } from './game/save.js';

const $ = (id) => document.getElementById(id);
const setLoad = async (frac, text) => {
  $('loadbar').style.width = frac * 100 + '%';
  $('loadtext').textContent = text;
  await new Promise((r) => setTimeout(r, 0));
};

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 16000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const W = { renderer, scene, camera }; // world context
const audio = new Audio();

async function load() {
  await setLoad(0.02, 'Fetching Wayanad elevation & OpenStreetMap data…');
  const [map, hbuf] = await Promise.all([
    fetch('/data/map.json').then((r) => r.json()),
    fetch('/data/height.bin').then((r) => r.arrayBuffer()),
  ]);
  const heights = new Int16Array(hbuf);
  const hf = new Heightfield(map.meta.height, heights);
  await setLoad(0.12, 'Building roads — NH766, state highways and estate roads…');
  const net = new RoadNetwork(hf);
  net.build(map.roads);
  const route = trunkRoute(net, [-3532, 6637], [4124, -7218]);
  const hairpins = findHairpins(route);
  const places = buildPlaces(net, hf, map.pois);
  const seg = net.exportSegments();
  const rs = new RoadSampler(hf, seg);
  await setLoad(0.25, 'Classifying land: forest, coffee, tea estates, paddy…');
  const biomeGrid = buildBiomeGrid(hf, map);
  Object.assign(W, { map, hf, net, rs, route, hairpins, places, biomeGrid });

  await setLoad(0.32, 'Sculpting the Western Ghats…');
  const terrain = new Terrain(scene, hf, detailTexture());
  await terrain.init(map.meta.height, heights, seg, biomeGrid);
  W.terrain = terrain;
  const roads = buildRoadMeshes(scene, net);
  W.roads = roads;

  await setLoad(0.5, 'Raising houses, shops and tea stalls…');
  const colliders = new Colliders();
  const buildings = new Buildings(scene, map, rs, colliders);
  W.colliders = colliders;
  W.buildings = buildings;
  await setLoad(0.54, 'Filling the junction towns with shops and tea stalls…');
  const towns = new Towns(scene, { map, net, rs, hf, buildings, colliders });
  towns.fill();
  buildings.flush();
  towns.details();
  W.towns = towns;

  await setLoad(0.58, 'Sky and mist…');
  const env = new Environment(scene, renderer, hf);
  W.env = env;

  await setLoad(0.62, 'Planting coffee, pepper, areca and silver oak…');
  const veg = new Vegetation(scene, renderer, hf, rs, biomeGrid, colliders, buildings);
  W.veg = veg;
  const props = new Props(scene, { net, rs, hf, biome: biomeGrid, colliders, route, hairpins, places, veg, buildings });
  W.props = props;

  await setLoad(0.75, 'Painting the lorry…');
  const truck = new Truck(scene, rs, colliders);
  W.truck = truck;
  const start = places.depots.find((d) => d.id === 'adivaram') || places.depots[0];
  truck.place(start.x - start.dx * 6, start.z - start.dz * 6, Math.atan2(start.dx, start.dz));
  const traffic = new Traffic(scene, net, rs, truck);
  W.traffic = traffic;
  const jobs = new Jobs(net, places);
  W.jobs = jobs;

  await setLoad(0.82, 'Growing the forest around Adivaram…');
  veg.prime(truck.pos.x, truck.pos.z);
  await setLoad(0.9, 'Streaming terrain…');
  terrain.update(truck.pos.x, truck.pos.z);
  while (!terrain.ready) {
    await new Promise((r) => setTimeout(r, 50));
    terrain.update(truck.pos.x, truck.pos.z);
  }
  W.hud = new HUD(W);
  await setLoad(1, 'Ready. Wayanad awaits.');
  $('loading').classList.add('hidden');
  $('options').classList.remove('hidden');
  $('optStart').innerHTML = places.depots.map((d) => `<option value="${d.id}">${d.town} — ${d.name}</option>`).join('');
  if (hasSave()) $('continue').classList.remove('hidden');
  // render one frame behind the title
  updateCamera(0.016, true);
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ input
const keys = new Set();
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  audio.resume();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const down = (...c) => c.some((k) => keys.has(k));
const hit = (c) => pressed.has(c);

const cam = { mode: 0, yawOff: 0, pitch: 0.2, dist: 15, yaw: 0, look: new THREE.Vector3(), headYaw: 0, headPitch: -0.06, drag: false, idle: 0, cine: 0 };
W.cam = cam;
const canvasEl = $('game');
canvasEl.addEventListener('mousedown', (e) => { cam.drag = true; cam.lx = e.clientX; cam.ly = e.clientY; });
addEventListener('mouseup', () => (cam.drag = false));
addEventListener('mousemove', (e) => {
  if (!cam.drag) return;
  const dx = e.clientX - cam.lx, dy = e.clientY - cam.ly;
  cam.lx = e.clientX; cam.ly = e.clientY;
  if (cam.mode === 1) {
    cam.headYaw = THREE.MathUtils.clamp(cam.headYaw - dx * 0.004, -2.2, 2.2);
    cam.headPitch = THREE.MathUtils.clamp(cam.headPitch - dy * 0.003, -0.8, 0.6);
  } else {
    cam.yawOff -= dx * 0.005;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.003, -0.05, 1.2);
  }
  cam.idle = 0;
});
addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 7, 45); });

let steerIn = 0;
function readInput(dt) {
  const t = W.truck;
  let left = down('KeyA', 'ArrowLeft') ? 1 : 0, right = down('KeyD', 'ArrowRight') ? 1 : 0;
  let fwd = down('KeyW', 'ArrowUp') ? 1 : 0, back = down('KeyS', 'ArrowDown') ? 1 : 0;
  let analogSteer = null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    if (Math.abs(p.axes[0]) > 0.08) analogSteer = -p.axes[0];
    fwd = Math.max(fwd, p.buttons[7]?.value || 0);
    back = Math.max(back, p.buttons[6]?.value || 0);
    if (p.buttons[0]?.pressed) t.input.handbrake = true;
  }
  const target = analogSteer ?? left - right;
  const rate = target === 0 ? 3.2 : Math.sign(target) !== Math.sign(steerIn) ? 4 : 1.8;
  steerIn += THREE.MathUtils.clamp(target - steerIn, -rate * dt, rate * dt);
  const inp = t.input;
  inp.steer = steerIn;
  inp.handbrake = down('Space');
  if (t.auto && t.gear === 0) {
    inp.throttle = back; inp.brake = fwd;
    inp.wantForward = fwd > 0; inp.wantReverse = false;
  } else {
    inp.throttle = fwd; inp.brake = back;
    inp.wantReverse = back > 0 && t.auto; inp.wantForward = false;
  }
  if (W.jobs.state === 'loading' || W.jobs.state === 'unloading') { inp.throttle = 0; inp.brake = 1; }
}

// ------------------------------------------------------------------ camera
const helper = new THREE.Object3D();
function updateCamera(dt, snap = false) {
  const t = W.truck;
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(t.q);
  if (cam.mode === 1) {
    camera.near = 0.08;
    const p = t.worldPoint(t.model.eye, new THREE.Vector3());
    camera.position.copy(p);
    helper.quaternion.copy(t.q);
    helper.rotateY(Math.PI + cam.headYaw);
    helper.rotateX(cam.headPitch);
    camera.quaternion.copy(helper.quaternion);
  } else {
    camera.near = 0.5;
    const target = t.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    if (camera.position.distanceTo(target) > 120) snap = true; // after a tow / teleport
    let yawT = Math.atan2(fwd.x, fwd.z) + cam.yawOff;
    if (cam.mode === 2) {
      cam.cine += dt * 0.12;
      yawT = cam.cine;
    }
    let d = yawT - cam.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += snap ? d : d * Math.min(1, dt * 2.6);
    if (!cam.drag) {
      cam.idle += dt;
      if (cam.idle > 2.5 && cam.mode === 0) cam.yawOff *= 1 - Math.min(1, dt * 0.8);
    }
    const dist = cam.mode === 2 ? 26 : cam.dist;
    const pitch = cam.mode === 2 ? 0.28 : cam.pitch;
    const desired = new THREE.Vector3(
      target.x - Math.sin(cam.yaw) * dist * Math.cos(pitch),
      target.y + 2.2 + dist * Math.sin(pitch),
      target.z - Math.cos(cam.yaw) * dist * Math.cos(pitch)
    );
    const g = W.rs.height(desired.x, desired.z) + 1.4;
    if (desired.y < g) desired.y = g;
    if (snap) camera.position.copy(desired);
    else camera.position.lerp(desired, Math.min(1, dt * 6));
    const lookT = target.clone().addScaledVector(fwd, 3);
    if (snap) cam.look.copy(lookT); else cam.look.lerp(lookT, Math.min(1, dt * 8));
    camera.lookAt(cam.look);
  }
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ game state
let running = false, paused = false, mapOpen = false, hornOn = false, sinceSave = 0, lastJobState = 'free';
let lastT = performance.now();
const notify = (text, kind, secs) => W.hud.toast(text, kind, secs);

function placeName() {
  const t = W.truck;
  for (let i = 0; i < W.hairpins.length; i++) {
    const h = W.hairpins[i];
    if (Math.hypot(h.x - t.pos.x, h.z - t.pos.z) < 70) return `Thamarassery Churam — Hairpin ${i + 1}`;
  }
  if (W.hairpins.length) {
    const first = W.hairpins[0], last = W.hairpins[W.hairpins.length - 1];
    const q = W.rs.nearest(t.pos.x, t.pos.z, 30);
    if (q && q.cls === 0) {
      const minZ = Math.min(first.z, last.z) - 300, maxZ = Math.max(first.z, last.z) + 300;
      if (t.pos.z > minZ && t.pos.z < maxZ && t.pos.y < 700) return 'Thamarassery Churam (NH766)';
    }
  }
  let best = null, bd = 1e9;
  for (const p of W.map.pois) {
    if (p.kind !== 'place' || !p.name || !['town', 'village', 'suburb', 'hamlet'].includes(p.sub)) continue;
    const d = Math.hypot(p.p[0] - t.pos.x, p.p[1] - t.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return 'Wayanad';
  return (bd < 900 ? best.name : 'Near ' + best.name) + ', Wayanad';
}

function handleKeys() {
  const t = W.truck, env = W.env, jobs = W.jobs, hud = W.hud;
  if (hud.jobBoardOpen) {
    const { offers, onPick, onClose } = hud.jobBoardOpen;
    for (let i = 0; i < offers.length; i++) if (hit('Digit' + (i + 1))) onPick(offers[i]);
    if (hit('Escape') || hit('KeyE')) onClose();
    return;
  }
  if (hit('KeyP') || hit('Escape')) setPaused(!paused);
  if (hit('KeyK')) doSave();
  if (hit('F1')) $('help').classList.toggle('hidden');
  if (hit('KeyM')) { mapOpen = !mapOpen; if (!mapOpen) hud.hideBigMap(); }
  if (hit('KeyC')) { cam.mode = (cam.mode + 1) % 3; cam.headYaw = 0; notify(['Chase camera', 'Cab view', 'Cinematic'][cam.mode], 'info', 1.5); }
  if (hit('KeyG')) { t.auto = !t.auto; notify(t.auto ? 'Automatic gearbox' : 'Manual gearbox — Shift up, Z down', 'info', 2.5); }
  if (hit('ShiftLeft') || hit('ShiftRight')) { if (!t.auto) t.shift(1); }
  if (hit('KeyZ') || hit('KeyQ')) { if (!t.auto) t.shift(-1); }
  if (hit('KeyB')) { t.exhaustBrake = !t.exhaustBrake; notify(t.exhaustBrake ? 'Exhaust brake ON' : 'Exhaust brake off', 'info', 1.5); }
  if (hit('KeyL')) t.setHeadlights(!t.lightsOn);
  if (hit('KeyT')) {
    const name = env.cycleTime();
    t.setHeadlights(env.isNight);
    W.props.setNight(env.isNight);
    W.veg.setLight(env.isNight ? 0.12 : env.time > 17 ? 0.75 : 0.95);
    notify(name, 'info', 2);
  }
  if (hit('KeyN')) {
    const on = env.toggleRain();
    notify(on ? 'Monsoon rain — roads are slippery' : 'Rain clearing', on ? 'warn' : 'info', 3);
  }
  if (hit('KeyR')) {
    t.recover();
    jobs.money -= 750;
    notify('Tow truck recovered your lorry (−₹750)', 'warn', 3);
    W.waitTerrain = true;
    W.veg.prime(t.pos.x, t.pos.z);
  }
  const atDepot = jobs.depotAt(t.pos.x, t.pos.z);
  const atFuel = jobs.fuelAt(t.pos.x, t.pos.z);
  const stopped = Math.abs(t.speed) < 0.6;
  let prompt = '';
  if (jobs.canDeliver(t)) {
    prompt = stopped ? 'Press E to unload' : 'Stop in the bay to unload';
    if (stopped && hit('KeyE')) { jobs.startUnload(); audio.hiss(); }
  } else if (atDepot && jobs.state === 'free') {
    prompt = stopped ? `Press E for jobs at ${atDepot.name}` : `Stop to see jobs at ${atDepot.name}`;
    if (stopped && hit('KeyE')) {
      const close = () => W.hud.hideJobBoard();
      W.hud.showJobBoard(atDepot, jobs.offers.get(atDepot.id), (o) => {
        if (jobs.money < 0) { notify('Clear your debts first!', 'bad'); return; }
        jobs.accept(o, t);
        close();
        audio.hiss();
        notify(`Accepted: ${o.cargo.name} to ${o.to.name} — loading…`, 'good', 4);
      }, close);
    }
  } else if (atFuel) {
    const need = t.tank - t.fuel;
    prompt = need < 1 ? 'Tank is full' : stopped ? `Press F to fill ${need.toFixed(0)} L diesel (₹${Math.round(need * 95.8).toLocaleString('en-IN')})` : 'Stop at the pump to refuel';
    if (stopped && hit('KeyF') && need >= 1) {
      jobs.money -= Math.round(need * 95.8);
      t.fuel = t.tank;
      notify(`Refuelled ${need.toFixed(0)} L`, 'good', 2.5);
    }
  } else if (jobs.state === 'loading') prompt = 'Loading cargo… (coolies at work)';
  else if (jobs.state === 'unloading') prompt = 'Unloading…';
  else if (t.rolled) prompt = 'Lorry overturned! Press R to call a tow';
  else if (t.fuel <= 0) prompt = 'Out of diesel! Press R for a tow to the road';
  hud.prompt(prompt);
  const h = down('KeyH');
  if (h !== hornOn) { hornOn = h; audio.horn(h); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!running) return;
  handleKeys();
  pressed.clear();
  const t = W.truck, hud = W.hud;
  if (W.waitTerrain && W.terrain.ready) W.waitTerrain = false;
  if (W.waitTerrain) hud.prompt('Towing… loading the area');
  if (!paused && !W.waitTerrain) {
    readInput(dt);
    t.wet = W.env.rain;
    t.update(dt);
    W.traffic.update(dt, t.pos.x, t.pos.z, t);
    W.jobs.update(dt, t, notify);
  }
  for (const ev of t.events) {
    if (ev === 'shift') audio.clunk();
    else if (ev.type === 'impact') {
      audio.impact(ev.dv);
      if (ev.dv > 2) notify(ev.kind === 'vehicle' ? 'Collision! Kerala Police are not amused (−₹500)' : 'Crash! Check your cargo', 'bad', 3);
      if (ev.dv > 2 && ev.kind === 'vehicle') W.jobs.money -= 500;
    }
  }
  t.events.length = 0;
  for (const ev of W.traffic.events) {
    if (ev.type === 'horn') audio.otherHorn(ev.kind, Math.hypot(ev.x - t.pos.x, ev.z - t.pos.z));
  }
  W.traffic.events.length = 0;
  // autosave every two minutes and right after each delivery
  sinceSave += paused ? 0 : dt;
  if (lastJobState === 'unloading' && W.jobs.state === 'free') doSave(true);
  lastJobState = W.jobs.state;
  if (sinceSave > 120 && !W.waitTerrain) doSave(true);
  W.terrain.update(t.pos.x, t.pos.z);
  W.veg.update(dt, t.pos.x, t.pos.z);
  W.terrain.uniforms.uWet.value = W.env.rain;
  for (const m of Object.values(W.roads.mats)) m.roughness = 0.92 - W.env.rain * 0.6;
  W.props.update(now / 1000);
  updateCamera(dt);
  W.env.update(dt, camera, t.pos);

  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(t.q);
  const prog = W.jobs.progress(t);
  const kmh = t.speed * 3.6;
  const st = {
    money: W.jobs.money, rpm: t.rpm, kmh, gear: t.gearName, fuel: t.fuel, tank: t.tank, brakeTemp: t.brakeTemp,
    health: t.health, auto: t.auto, exhaust: t.exhaustBrake, lights: t.lightsOn, rain: W.env.rainTarget > 0,
    x: t.pos.x, z: t.pos.z, fx: fwd.x, fz: fwd.z,
    job: W.jobs.active, jobState: W.jobs.state, remaining: prog ? prog.remaining : 0, offRoute: prog?.offRoute,
    route: W.jobs.active ? W.jobs.active.line : null, routeIndex: prog ? prog.index : 0,
    cargoHealth: t.cargoHealth,
    location: placeName() + ` · ${Math.round(t.pos.y - t.com.y)} m`,
  };
  if (!W.jobs.active) {
    // guide to the nearest depot when idle
    st.route = null;
  }
  W.hud.update(dt, st);
  if (mapOpen) W.hud.showBigMap(st);
  const slip = Math.max(...t.wheels.map((w) => (w.contact ? w.slip : 0)));
  audio.update(dt, {
    rpm: t.rpm, throttle: t.input.throttle, load: t.load || 0, engineOn: t.engineOn && t.fuel > 0, slip, speed: Math.abs(t.speed),
    rain: W.env.rain, night: W.env.isNight, inside: cam.mode === 1 ? 1.25 : 1,
  });
  renderer.render(scene, camera);
}

function applyLighting() {
  W.truck.setHeadlights(W.env.isNight);
  W.props.setNight(W.env.isNight);
  W.veg.setLight(W.env.isNight ? 0.12 : W.env.time > 17 ? 0.75 : 0.95);
}

function beginDriving() {
  audio.start();
  audio.resume();
  applyLighting();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  running = true;
  lastT = performance.now();
}

/** Move the lorry to a depot bay and stream the area in. */
function spawnAt(depot) {
  const t = W.truck;
  t.place(depot.x - depot.dx * 6, depot.z - depot.dz * 6, Math.atan2(depot.dx, depot.dz));
  W.veg.prime(t.pos.x, t.pos.z);
  W.waitTerrain = true;
}

$('start').addEventListener('click', () => {
  const depot = W.places.depots.find((d) => d.id === $('optStart').value) || W.places.depots[0];
  if (depot.id !== 'adivaram') spawnAt(depot);
  const ti = +$('optTime').value;
  for (let i = 0; i < ti; i++) W.env.cycleTime();
  if (ti === 0) W.env.setTime(7.0);
  if (+$('optRain').value) W.env.toggleRain();
  W.truck.auto = $('optGear').value === '1';
  beginDriving();
  notify(`Welcome to ${depot.town}, Wayanad. Press E at ${depot.name} for your first load.`, 'info', 7);
  notify('Tip: on the way down the churam, use a low gear and the exhaust brake (B) — brakes fade above 250°C.', 'warn', 9);
});

$('continue').addEventListener('click', () => {
  const s = readSave();
  if (!s) return;
  applySave(W, s);
  W.veg.prime(W.truck.pos.x, W.truck.pos.z);
  W.waitTerrain = true;
  beginDriving();
  notify(`Career loaded — ${new Date(s.at).toLocaleString()}`, 'good', 4);
});

function doSave(silent = false) {
  if (W.jobs.state === 'loading' || W.jobs.state === 'unloading') { if (!silent) notify('Wait for loading to finish before saving', 'warn', 2.5); return; }
  const ok = saveGame(W);
  if (!silent) notify(ok ? 'Career saved' : 'Could not save (browser storage blocked)', ok ? 'good' : 'bad', 2.5);
  sinceSave = 0;
}

function setPaused(on) {
  paused = on;
  $('pause').classList.toggle('hidden', !on);
  const s = readSave();
  $('saveInfo').textContent = s ? `Last save: ${new Date(s.at).toLocaleString()} • ₹${Math.round(s.money).toLocaleString('en-IN')}` : 'No save yet';
}

$('pause').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  if (!act) return;
  if (act === 'resume') setPaused(false);
  if (act === 'save') { doSave(); setPaused(true); }
  if (act === 'load') {
    const s = readSave();
    if (s) { applySave(W, s); W.veg.prime(W.truck.pos.x, W.truck.pos.z); W.waitTerrain = true; applyLighting(); notify('Save loaded', 'good', 2); }
    setPaused(false);
  }
  if (act === 'title') location.reload();
});

requestAnimationFrame(frame);
load().catch((e) => {
  console.error(e);
  $('loadtext').textContent = 'Failed to load: ' + e.message;
});
// expose for debugging in the console
window.W = W;
if (location.search.includes('dev')) import('./dev/autopilot.js').then((m) => m.installAutopilot(W));
