// Delivery jobs between real Wayanad places with Kerala cargo.
import { inPad, pathToPolyline } from '../world/places.js';

export const CARGO = [
  { id: 'coffee', name: 'Coffee beans (Robusta)', ml: 'കാപ്പിക്കുരു', mass: 8000, fragility: 0.25, rate: 1.0, visual: 'sacks', from: ['kalpetta', 'vythiri', 'chundale', 'lakkidi'] },
  { id: 'pepper', name: 'Black pepper', ml: 'കുരുമുളക്', mass: 6000, fragility: 0.25, rate: 1.5, visual: 'sacks', from: ['kalpetta', 'pozhuthana', 'lakkidi'] },
  { id: 'tea', name: 'Tea chests', ml: 'തേയില', mass: 5500, fragility: 0.45, rate: 1.2, visual: 'tea', from: ['chundale', 'pozhuthana'] },
  { id: 'banana', name: 'Nendran bananas', ml: 'നേന്ത്രക്കായ', mass: 6500, fragility: 0.9, rate: 1.35, visual: 'bananas', from: ['kalpetta', 'vythiri', 'chundale'] },
  { id: 'logs', name: 'Silver oak timber', ml: 'സിൽവർ ഓക്ക് തടി', mass: 9500, fragility: 0.06, rate: 0.95, visual: 'logs', from: ['vythiri', 'chundale', 'pozhuthana', 'lakkidi'] },
  { id: 'cement', name: 'Cement bags', ml: 'സിമന്റ്', mass: 9000, fragility: 0.15, rate: 0.85, visual: 'cement', from: ['adivaram'] },
  { id: 'rice', name: 'Rice sacks', ml: 'അരി', mass: 8500, fragility: 0.15, rate: 0.85, visual: 'sacks', from: ['adivaram', 'kalpetta'] },
  { id: 'lpg', name: 'LPG cylinders', ml: 'ഗ്യാസ് സിലിണ്ടർ', mass: 5000, fragility: 0.7, rate: 1.6, visual: 'lpg', from: ['adivaram'] },
  { id: 'water', name: 'Bottled water', ml: 'കുടിവെള്ളം', mass: 7000, fragility: 0.5, rate: 1.0, visual: 'crates', from: ['adivaram', 'kalpetta'] },
];

export class Jobs {
  constructor(net, places) {
    this.net = net;
    this.depots = places.depots;
    this.fuel = places.fuel;
    this.money = 5000;
    this.active = null;
    this.state = 'free'; // free | loading | enroute | unloading
    this.timer = 0;
    this.offers = new Map();
    this.completed = 0;
    this.routeCache = new Map();
    for (const d of this.depots) this.offers.set(d.id, this.makeOffers(d));
  }

  route(a, b) {
    const key = a.id + '>' + b.id;
    if (!this.routeCache.has(key)) {
      const path = this.net.shortestPath(a.node, b.node);
      this.routeCache.set(key, pathToPolyline(path));
    }
    return this.routeCache.get(key);
  }

  makeOffers(from) {
    const list = [];
    const cargos = CARGO.filter((c) => c.from.includes(from.id));
    const targets = this.depots.filter((d) => d !== from);
    for (let k = 0; k < 4 && cargos.length; k++) {
      const cargo = cargos[Math.floor(Math.random() * cargos.length)];
      const to = targets[Math.floor(Math.random() * targets.length)];
      const pl = this.route(from, to);
      if (!pl.length) continue;
      const km = pl[pl.length - 1].s / 1000;
      const mass = Math.round((cargo.mass * (0.75 + Math.random() * 0.4)) / 100) * 100;
      const pay = Math.round(((350 + km * 95) * cargo.rate * (1 + mass / 22000)) / 50) * 50;
      list.push({ cargo: { ...cargo, mass }, from, to, km, pay, timeLimit: (km / 22) * 3600 + 300 });
    }
    return list;
  }

  depotAt(x, z) {
    return this.depots.find((d) => inPad(d, x, z, 2));
  }
  fuelAt(x, z) {
    return this.fuel.find((d) => inPad(d, x, z, 3));
  }

  accept(offer, truck) {
    this.active = { ...offer, elapsed: 0, line: this.route(offer.from, offer.to) };
    this.state = 'loading';
    this.timer = 6;
    this.pendingCargo = offer.cargo;
    this.offers.set(offer.from.id, this.makeOffers(offer.from));
  }

  update(dt, truck, notify) {
    if (this.state === 'loading') {
      this.timer -= dt;
      if (this.timer <= 0) {
        truck.setCargo(this.pendingCargo);
        this.state = 'enroute';
        notify(`Loaded ${this.active.cargo.name} (${(this.active.cargo.mass / 1000).toFixed(1)} t). Deliver to ${this.active.to.name}.`, 'good');
      }
    } else if (this.state === 'enroute') {
      this.active.elapsed += dt;
    } else if (this.state === 'unloading') {
      this.timer -= dt;
      if (this.timer <= 0) this.finish(truck, notify);
    }
  }

  canDeliver(truck) {
    return this.state === 'enroute' && inPad(this.active.to, truck.pos.x, truck.pos.z, 2);
  }

  startUnload() {
    this.state = 'unloading';
    this.timer = 5;
  }

  finish(truck, notify) {
    const j = this.active;
    const dmg = 100 - truck.cargoHealth;
    const late = j.elapsed > j.timeLimit;
    let pay = j.pay * Math.max(0, 1 - (dmg / 100) * 1.3);
    if (late) pay *= 0.75;
    pay = Math.round(pay / 10) * 10;
    const repair = Math.round((100 - truck.health) * 45);
    this.money += pay - repair;
    truck.health = 100;
    truck.setCargo(null);
    this.completed++;
    const lines = [`Delivered to ${j.to.name}`, `Base pay ₹${j.pay.toLocaleString('en-IN')}`];
    if (dmg > 0.5) lines.push(`Cargo damage ${dmg.toFixed(0)}%`);
    if (late) lines.push('Late delivery −25%');
    if (repair > 0) lines.push(`Truck repairs −₹${repair.toLocaleString('en-IN')}`);
    lines.push(`Earned ₹${(pay - repair).toLocaleString('en-IN')}`);
    notify(lines.join(' • '), 'good', 8);
    this.active = null;
    this.state = 'free';
  }

  /** Remaining distance along the route from the truck, plus route polyline for maps. */
  progress(truck) {
    if (!this.active || this.state !== 'enroute') return null;
    const L = this.active.line;
    let best = 0, bd = Infinity;
    const from = Math.max(0, (this.lastIdx || 0) - 400), to = Math.min(L.length, (this.lastIdx || 0) + 400);
    const scan = (a, b) => {
      for (let i = a; i < b; i += 1) {
        const d = (L[i].x - truck.pos.x) ** 2 + (L[i].z - truck.pos.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    };
    scan(from, to);
    if (bd > 80 * 80) scan(0, L.length);
    this.lastIdx = best;
    return { remaining: L[L.length - 1].s - L[best].s, offRoute: Math.sqrt(bd) > 60, index: best };
  }
}
