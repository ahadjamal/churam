// Procedural Web Audio: 6-cylinder diesel, air horn, air-brake hiss, tyre
// squeal, impacts, monsoon rain and Western Ghats forest ambience.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // --- engine: looped pulse-train buffer resampled by rpm
    const sr = ctx.sampleRate;
    const baseHz = 32.5; // firing rate at 650 rpm for an inline six (rpm/60*3)
    const cycles = 60;
    const len = Math.round((sr / baseHz) * cycles);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const per = len / cycles;
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let c = 0; c < cycles; c++) {
      const amp = 0.75 + rnd() * 0.5;
      const start = Math.floor(c * per);
      for (let i = 0; i < per; i++) {
        const t = i / per;
        const env = Math.exp(-t * 7) * amp;
        d[start + i] += (Math.sin(t * Math.PI * 2 * 1.0) * 0.6 + Math.sin(t * Math.PI * 2 * 3.1) * 0.25 + (rnd() * 2 - 1) * 0.35) * env;
      }
    }
    this.engine = ctx.createBufferSource();
    this.engine.buffer = buf;
    this.engine.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.35;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engine.start();

    // turbo whistle
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sine';
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.master);
    this.turbo.start();

    // noise sources
    this.noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const loopNoise = (type, f, q) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl).connect(g).connect(this.master);
      s.start();
      return { g, fl };
    };
    this.squeal = loopNoise('bandpass', 1400, 8);
    this.road = loopNoise('lowpass', 400, 0.7);
    this.rain = loopNoise('highpass', 1200, 0.5);
    this.wind = loopNoise('lowpass', 300, 0.5);
    this.birdsTimer = 1;
    this.hornNode = null;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rate = Math.max(0.35, s.rpm / 650);
    this.engine.playbackRate.setTargetAtTime(rate, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(350 + s.throttle * 1600 + s.rpm * 0.25, t, 0.08);
    this.engineGain.gain.setTargetAtTime((s.engineOn ? 0.22 + s.throttle * 0.35 + s.load * 0.1 : 0) * s.inside, t, 0.08);
    this.turbo.frequency.setTargetAtTime(1800 + s.rpm * 1.6, t, 0.1);
    this.turboGain.gain.setTargetAtTime(s.engineOn ? s.throttle * Math.max(0, s.rpm - 1200) / 1500 * 0.025 : 0, t, 0.2);
    this.squeal.g.gain.setTargetAtTime(Math.min(0.25, s.slip * 0.3) * (s.speed > 3 ? 1 : 0), t, 0.05);
    this.road.g.gain.setTargetAtTime(Math.min(0.25, s.speed / 80), t, 0.1);
    this.rain.g.gain.setTargetAtTime(s.rain * 0.18, t, 0.5);
    this.wind.g.gain.setTargetAtTime(Math.min(0.15, s.speed / 160) + 0.02, t, 0.3);
    // ambience: birds by day, crickets at night
    this.birdsTimer -= dt;
    if (this.birdsTimer < 0) {
      this.birdsTimer = 1.5 + Math.random() * 4;
      if (s.rain < 0.5) s.night ? this.cricket() : this.bird();
    }
  }

  horn(on, pitch = 1, vol = 0.32) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.hornNode) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(vol, ctx.currentTime, 0.02);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const oscs = [311, 392, 466].map((hz) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz * pitch; o.connect(f); o.start(); return o;
      });
      f.connect(g).connect(this.master);
      this.hornNode = { g, oscs };
    } else if (!on && this.hornNode) {
      const { g, oscs } = this.hornNode;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      oscs.forEach((o) => o.stop(ctx.currentTime + 0.3));
      this.hornNode = null;
    }
  }

  /** Short horn from another vehicle at a distance. */
  otherHorn(kind, dist) {
    if (!this.ctx || dist > 200) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = 0.18 * Math.max(0, 1 - dist / 200);
    const g = ctx.createGain(); g.gain.value = 0;
    const pattern = kind === 'bus' ? [[0, 0.25], [0.35, 0.6]] : kind === 'auto' || kind === 'bike' ? [[0, 0.15], [0.22, 0.37]] : [[0, 0.4]];
    for (const [a, b] of pattern) { g.gain.setValueAtTime(vol, t + a); g.gain.setValueAtTime(0, t + b); }
    const base = kind === 'auto' || kind === 'bike' ? 520 : kind === 'bus' || kind === 'lorry' ? 330 : 420;
    for (const m of [1, 1.26]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = base * m;
      o.connect(g); o.start(t); o.stop(t + 1);
    }
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    g.connect(f).connect(this.master);
  }

  hiss() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 0.8);
  }

  impact(strength) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + strength * 200;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(0.9, 0.2 + strength * 0.15), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 0.6);
  }

  clunk() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.15);
  }

  bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2000 + Math.random() * 2500;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 2 - 1;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const t0 = t + i * 0.16;
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.8), t0 + 0.1);
      const og = ctx.createGain(); og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(0.03, t0 + 0.02); og.gain.linearRampToValueAtTime(0, t0 + 0.12);
      o.connect(og).connect(pan || this.master);
      o.start(t0); o.stop(t0 + 0.13);
    }
    if (pan) pan.connect(this.master);
  }

  cricket() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 4400;
    const g = ctx.createGain(); g.gain.value = 0;
    for (let i = 0; i < 12; i++) { g.gain.setValueAtTime(0.012, t + i * 0.06); g.gain.setValueAtTime(0, t + i * 0.06 + 0.03); }
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.8);
  }
}
