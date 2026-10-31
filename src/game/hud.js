// DOM HUD: dials, job panel, rotating minimap, full map, job board, toasts.
import { BIOME } from '../world/biome.js';

const MAP_RES = 6; // metres per map pixel
const BIOME_RGB = {
  [BIOME.FOREST]: [38, 66, 34], [BIOME.PLANTATION]: [62, 88, 44], [BIOME.TEA]: [104, 150, 58], [BIOME.PADDY]: [128, 168, 70],
  [BIOME.GRASS]: [140, 148, 92], [BIOME.TOWN]: [120, 112, 96], [BIOME.LOWLAND]: [74, 104, 50], [BIOME.WATER]: [60, 110, 160],
};
const $ = (id) => document.getElementById(id);
const rupees = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

export class HUD {
  constructor(world) {
    this.w = world;
    this.mini = $('minimap').getContext('2d');
    this.gauges = $('gauges').getContext('2d');
    this.big = $('bigmap');
    this.toastBox = $('toasts');
    this.lastText = 0;
    this.buildMapImage();
  }

  buildMapImage() {
    const { hf, biomeGrid, net, map } = this.w;
    const W = Math.ceil((hf.maxX - hf.minX) / MAP_RES), H = Math.ceil((hf.maxZ - hf.minZ) / MAP_RES);
    // base: biome colour + hillshade at DEM resolution
    const small = document.createElement('canvas');
    small.width = hf.cols; small.height = hf.rows;
    const sg = small.getContext('2d');
    const img = sg.createImageData(hf.cols, hf.rows);
    for (let r = 0; r < hf.rows; r++)
      for (let c = 0; c < hf.cols; c++) {
        const i = r * hf.cols + c;
        const dx = hf.at(c + 1, r) - hf.at(c - 1, r), dz = hf.at(c, r + 1) - hf.at(c, r - 1);
        const shade = Math.max(0.45, Math.min(1.35, 1 + (-dx * 0.7 - dz * 0.7) / 40));
        const col = BIOME_RGB[biomeGrid[i]] || [50, 70, 40];
        img.data[i * 4] = col[0] * shade; img.data[i * 4 + 1] = col[1] * shade; img.data[i * 4 + 2] = col[2] * shade; img.data[i * 4 + 3] = 255;
      }
    sg.putImageData(img, 0, 0);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, W, H);
    const P = (x, z) => [(x - hf.minX) / MAP_RES, (z - hf.minZ) / MAP_RES];
    g.fillStyle = 'rgba(70,64,56,0.9)';
    for (const b of map.buildings) {
      g.beginPath();
      b.pts.forEach((p, k) => { const [x, y] = P(p[0], p[1]); k ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.fill();
    }
    const styles = [
      ['residential', '#d8d0c0', 1.4], ['unclassified', '#d8d0c0', 1.6], ['tertiary', '#f0eadc', 2.2],
      ['secondary', '#ffffff', 2.8], ['primary', '#ffffff', 3.2], ['trunk', '#ffcc33', 4.2], ['pad', '#ffcc33', 3],
    ];
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [type, colour, width] of styles) {
      g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = width + 1.6;
      for (const pass of [0, 1]) {
        if (pass) { g.strokeStyle = colour; g.lineWidth = width; }
        g.beginPath();
        for (const e of net.edges) {
          if (e.type !== type) continue;
          for (let i = 0; i < e.n; i += 2) {
            const [x, y] = P(e.pts[i * 3], e.pts[i * 3 + 2]);
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          const [x, y] = P(e.pts[(e.n - 1) * 3], e.pts[(e.n - 1) * 3 + 2]);
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    this.mapCanvas = cv;
    this.P = P;
  }

  toast(text, kind = 'info', secs = 5) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    this.toastBox.appendChild(el);
    setTimeout(() => el.classList.add('out'), secs * 1000);
    setTimeout(() => el.remove(), secs * 1000 + 600);
  }

  prompt(text) {
    const el = $('prompt');
    if (el.textContent !== text) el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }

  update(dt, s) {
    this.drawGauges(s);
    this.drawMinimap(s);
    this.lastText -= dt;
    if (this.lastText > 0) return;
    this.lastText = 0.15;
    $('money').textContent = rupees(s.money);
    $('location').textContent = s.location;
    $('fuel').style.width = (s.fuel / s.tank) * 100 + '%';
    $('fuelText').textContent = s.fuel.toFixed(0) + ' L';
    $('brake').style.width = Math.min(100, (s.brakeTemp / 600) * 100) + '%';
    $('brake').style.background = s.brakeTemp > 450 ? '#ff3b30' : s.brakeTemp > 250 ? '#ff9f0a' : '#34c759';
    $('brakeText').textContent = s.brakeTemp.toFixed(0) + '°C' + (s.brakeTemp > 250 ? ' FADE' : '');
    $('health').style.width = s.health + '%';
    $('modes').innerHTML =
      `<span class="${s.auto ? 'on' : ''}">${s.auto ? 'AUTO' : 'MANUAL'}</span>` +
      `<span class="${s.exhaust ? 'on warn' : ''}">EXH BRAKE</span>` +
      `<span class="${s.lights ? 'on' : ''}">LIGHTS</span>` +
      `<span class="${s.rain ? 'on' : ''}">MONSOON</span>`;
    const job = s.job;
    const jp = $('job');
    if (!job) {
      jp.innerHTML = `<div class="jt">No active delivery</div><div class="js">Drive to a depot <b>▼</b> and press <kbd>E</kbd> for jobs</div>`;
    } else {
      const left = Math.max(0, job.timeLimit - job.elapsed);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60).toString().padStart(2, '0');
      jp.innerHTML = `<div class="jt">${job.cargo.name} <span class="ml">${job.cargo.ml}</span></div>
        <div class="js">${job.from.town} → <b>${job.to.name}</b></div>
        <div class="js">${s.jobState === 'loading' ? 'Loading…' : s.jobState === 'unloading' ? 'Unloading…' : (s.remaining / 1000).toFixed(1) + ' km to go'} • ${(job.cargo.mass / 1000).toFixed(1)} t • ${rupees(job.pay)}</div>
        <div class="js ${left < 120 ? 'warn' : ''}">Time left ${mm}:${ss}${s.offRoute ? ' • <span class="warn">off route</span>' : ''}</div>
        <div class="bar"><i style="width:${s.cargoHealth}%;background:${s.cargoHealth > 70 ? '#34c759' : s.cargoHealth > 40 ? '#ff9f0a' : '#ff3b30'}"></i></div>
        <div class="js small">Cargo condition ${s.cargoHealth.toFixed(0)}%</div>`;
    }
  }

  drawGauges(s) {
    const g = this.gauges;
    const W = g.canvas.width, H = g.canvas.height;
    g.clearRect(0, 0, W, H);
    const dial = (cx, cy, r, value, max, label, ticks, red, unit) => {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = 'rgba(10,14,18,0.72)';
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      if (red) {
        g.strokeStyle = '#ff3b30'; g.lineWidth = 5;
        g.beginPath(); g.arc(0, 0, r - 8, a0 + (a1 - a0) * (red / max), a1); g.stroke();
      }
      g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.font = '11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= ticks; i++) {
        const a = a0 + ((a1 - a0) * i) / ticks;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12)); g.lineTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); g.stroke();
        g.fillText(String(Math.round((max * i) / ticks / (unit || 1))), Math.cos(a) * (r - 24), Math.sin(a) * (r - 24));
      }
      const a = a0 + (a1 - a0) * Math.min(1.02, Math.max(0, value / max));
      g.strokeStyle = '#ff9f0a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10)); g.stroke();
      g.fillStyle = '#ff9f0a'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '10px system-ui'; g.fillText(label, 0, r * 0.45);
      g.restore();
    };
    dial(80, 80, 72, s.rpm, 3000, 'RPM ×100', 6, 2600, 100);
    dial(240, 80, 72, Math.abs(s.kmh), 100, 'km/h', 10, 0, 1);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = 'bold 28px system-ui'; g.fillText(Math.round(Math.abs(s.kmh)), 240, 112);
    g.font = 'bold 30px system-ui'; g.fillStyle = s.gear === 'R' ? '#ff3b30' : '#ffd60a';
    g.fillText(s.gear, 80, 114);
  }

  drawMinimap(s) {
    const g = this.mini, W = g.canvas.width, H = g.canvas.height;
    g.save();
    g.clearRect(0, 0, W, H);
    g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1d2a18'; g.fillRect(0, 0, W, H);
    const [px, py] = this.P(s.x, s.z);
    const theta = -Math.PI / 2 - Math.atan2(s.fz, s.fx);
    const zoom = 1.9 - Math.min(0.9, Math.abs(s.kmh) / 80);
    g.translate(W / 2, H / 2 + 30);
    g.rotate(theta);
    g.scale(zoom, zoom);
    g.translate(-px, -py);
    g.drawImage(this.mapCanvas, 0, 0);
    this.drawOverlays(g, s, 1 / zoom);
    g.restore();
    this.drawPlaceLabels(g, s, px, py, theta, zoom, W, H);
    // player arrow
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2, H / 2 + 20); g.lineTo(W / 2 - 8, H / 2 + 40); g.lineTo(W / 2 + 8, H / 2 + 40); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.stroke();
  }

  /** Upright place names on the rotating minimap. */
  drawPlaceLabels(g, s, px, py, theta, zoom, W, H) {
    if (!this.labels) {
      const rank = { town: 0, village: 1, suburb: 2, hamlet: 3, neighbourhood: 4 };
      this.labels = this.w.map.pois
        .filter((p) => p.kind === 'place' && p.name && rank[p.sub] !== undefined && !/colony/i.test(p.name))
        .map((p) => ({ name: p.name, x: p.p[0], z: p.p[1], rank: rank[p.sub] }));
      for (const h of this.w.hairpins || []) this.labels.push({ name: `Hairpin ${this.w.hairpins.indexOf(h) + 1}`, x: h.x, z: h.z, rank: 5 });
    }
    const cx = W / 2, cy = H / 2 + 30, c = Math.cos(theta), sn = Math.sin(theta);
    const R = W / 2 - 14;
    g.save();
    g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const l of this.labels) {
      const [lx, ly] = this.P(l.x, l.z);
      const dx = (lx - px) * zoom, dy = (ly - py) * zoom;
      const sx = cx + dx * c - dy * sn, sy = cy + dx * sn + dy * c;
      if (Math.hypot(sx - W / 2, sy - H / 2) > R) continue;
      if (l.rank >= 4 && zoom < 1.3) continue;
      g.font = l.rank === 0 ? 'bold 14px system-ui' : l.rank === 1 ? 'bold 12px system-ui' : l.rank === 5 ? '600 10px system-ui' : '11px system-ui';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(l.name, sx, sy);
      g.fillStyle = l.rank === 5 ? '#ffcc33' : l.rank <= 1 ? '#ffffff' : '#d8e0d0';
      g.fillText(l.name, sx, sy);
    }
    g.restore();
  }

  drawOverlays(g, s, k) {
    if (s.route && s.route.length) {
      g.strokeStyle = 'rgba(0,170,255,0.95)'; g.lineWidth = 5 * k; g.lineCap = 'round';
      g.beginPath();
      for (let i = s.routeIndex || 0; i < s.route.length; i += 3) {
        const [x, y] = this.P(s.route[i].x, s.route[i].z);
        i === (s.routeIndex || 0) ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    const icon = (x, z, col, txt) => {
      const [X, Y] = this.P(x, z);
      g.save(); g.translate(X, Y); g.scale(k, k);
      g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#111'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 1);
      g.restore();
    };
    for (const d of this.w.places.depots) icon(d.x, d.z, s.job && s.job.to === d ? '#00aaff' : '#ffcc33', 'D');
    for (const f of this.w.places.fuel) icon(f.x, f.z, '#34c759', 'F');
  }

  showBigMap(s) {
    const c = this.big;
    c.width = innerWidth; c.height = innerHeight;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,12,10,0.92)'; g.fillRect(0, 0, c.width, c.height);
    const mc = this.mapCanvas;
    const k = Math.min((c.width - 80) / mc.width, (c.height - 80) / mc.height);
    g.save();
    g.translate((c.width - mc.width * k) / 2, (c.height - mc.height * k) / 2);
    g.scale(k, k);
    g.drawImage(mc, 0, 0);
    this.drawOverlays(g, s, 1 / k);
    // labels
    g.font = `bold ${13 / k}px system-ui`; g.textAlign = 'center';
    for (const p of this.w.map.pois) {
      if (p.kind !== 'place' || !['town', 'village'].includes(p.sub)) continue;
      const [x, y] = this.P(p.p[0], p.p[1]);
      g.lineWidth = 3 / k; g.strokeStyle = '#000'; g.strokeText(p.name, x, y - 12 / k);
      g.fillStyle = '#fff'; g.fillText(p.name, x, y - 12 / k);
    }
    for (const d of this.w.places.depots) {
      const [x, y] = this.P(d.x, d.z);
      g.fillStyle = '#ffcc33'; g.font = `${11 / k}px system-ui`;
      g.strokeText(d.name, x, y + 22 / k); g.fillText(d.name, x, y + 22 / k);
    }
    const [px, py] = this.P(s.x, s.z);
    g.translate(px, py); g.rotate(Math.atan2(s.fz, s.fx) + Math.PI / 2); g.scale(1 / k, 1 / k);
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(-9, 10); g.lineTo(9, 10); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#fff'; g.font = '14px system-ui'; g.textAlign = 'left';
    g.fillText('Wayanad — Adivaram to Kalpetta • NH766 in yellow • D depots • F fuel • press M to close', 20, 28);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '11px system-ui';
    g.fillText('Map data © OpenStreetMap contributors • Elevation: SRTM via AWS Terrain Tiles', 20, c.height - 16);
    c.style.display = 'block';
  }

  hideBigMap() {
    this.big.style.display = 'none';
  }

  showJobBoard(depot, offers, onPick, onClose) {
    const el = $('jobboard');
    el.innerHTML = `<h2>${depot.name} <span class="ml">${depot.ml}</span></h2>
      <p class="sub">Choose a load. Heavier and fragile loads pay more — the Thamarassery churam will test your brakes.</p>
      <div class="offers">${offers.map((o, i) => `
        <button class="offer" data-i="${i}">
          <div class="k">${i + 1}</div>
          <div class="c"><b>${o.cargo.name}</b> <span class="ml">${o.cargo.ml}</span><br>
          <span>${(o.cargo.mass / 1000).toFixed(1)} t • to <b>${o.to.name}</b> • ${o.km.toFixed(1)} km • ${Math.round(o.timeLimit / 60)} min</span><br>
          <span class="frag">Fragility ${'●'.repeat(Math.max(1, Math.round(o.cargo.fragility * 5)))}${'○'.repeat(5 - Math.max(1, Math.round(o.cargo.fragility * 5)))}</span></div>
          <div class="p">${rupees(o.pay)}</div>
        </button>`).join('')}</div>
      <p class="sub">Press <kbd>1</kbd>–<kbd>${offers.length}</kbd> or click • <kbd>Esc</kbd> to close</p>`;
    el.style.display = 'block';
    el.querySelectorAll('.offer').forEach((b) => (b.onclick = () => onPick(offers[+b.dataset.i])));
    this.jobBoardOpen = { offers, onPick, onClose };
  }

  hideJobBoard() {
    $('jobboard').style.display = 'none';
    this.jobBoardOpen = null;
  }
}
