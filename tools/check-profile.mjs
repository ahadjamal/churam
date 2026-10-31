import fs from 'node:fs';
import { Heightfield } from '../src/world/heightfield.js';
import { RoadNetwork } from '../src/world/roads.js';
import { trunkRoute } from '../src/world/places.js';
const map = JSON.parse(fs.readFileSync('public/data/map.json','utf8'));
const buf = fs.readFileSync('public/data/height.bin');
const hf = new Heightfield(map.meta.height, new Int16Array(buf.buffer, buf.byteOffset, buf.length/2));
const net = new RoadNetwork(hf); net.build(map.roads);
const P = trunkRoute(net, [-3532, 6637], [4124, -7218]);
let worst=[]; let hist={};
for (const p of P){ const d=p.y-hf.base(p.x,p.z); const b=Math.round(d/5)*5; hist[b]=(hist[b]||0)+1; worst.push([Math.abs(d),d,p.s,p.x,p.z]); }
worst.sort((a,b)=>b[0]-a[0]);
console.log('hist (road-dem m):', hist);
console.log(worst.slice(0,8).map(w=>`${w[1].toFixed(1)}m at ${(w[2]/1000).toFixed(2)}km (${w[3].toFixed(0)},${w[4].toFixed(0)})`).join('\n'));
for (const km of [0,2,3,4,5,6,7,8,9,10,12,15,18,22,26,28]){ const p=P.find(q=>q.s>=km*1000)||P.at(-1); console.log(km+'km', p.y.toFixed(0), 'dem', hf.base(p.x,p.z).toFixed(0)); }
