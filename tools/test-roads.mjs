import fs from 'node:fs';
import { Heightfield } from '../src/world/heightfield.js';
import { RoadNetwork } from '../src/world/roads.js';
import { RoadSampler } from '../src/world/roadSampler.js';
const map = JSON.parse(fs.readFileSync('public/data/map.json','utf8'));
const buf = fs.readFileSync('public/data/height.bin');
const hf = new Heightfield(map.meta.height, new Int16Array(buf.buffer, buf.byteOffset, buf.length/2));
let t0=performance.now();
const net = new RoadNetwork(hf); net.build(map.roads);
console.log('build ms', (performance.now()-t0).toFixed(0), 'nodes', net.nodes.length, 'edges', net.edges.length);
t0=performance.now();
const seg = net.exportSegments(); const rs = new RoadSampler(hf, seg);
console.log('sampler ms', (performance.now()-t0).toFixed(0), 'segs', rs.n, 'items', rs.items.length);
let len={}; for(const e of net.edges) len[e.type]=(len[e.type]||0)+e.len; console.log(Object.fromEntries(Object.entries(len).map(([k,v])=>[k,(v/1000).toFixed(1)+'km'])));
const near = (x,z,types)=>{let b=-1,bd=1e9;for(const n of net.nodes){if(!n.edges.some(id=>types.includes(net.edges[id].type)))continue;const d=Math.hypot(n.x-x,n.z-z);if(d<bd){bd=d;b=n.id}}return b};
const A = near(-3532,6637,['trunk']), B = near(4124,-7218,['trunk']);
const path = net.shortestPath(A,B);
let L=0, maxG=0, rise=0; const hs=[]; 
for (const {edge:e,dir} of path){ L+=e.len; for(let i=1;i<e.n;i++){const g=Math.abs(e.pts[i*3+1]-e.pts[i*3-2])/Math.max(0.1,e.s[i]-e.s[i-1]); if(e.s[i]-e.s[i-1]>1) maxG=Math.max(maxG,g);} }
console.log('route edges',path.length,'len km',(L/1000).toFixed(2),'types',[...new Set(path.map(p=>p.edge.type+':'+p.edge.ref))].join(' '),'maxGrade',maxG.toFixed(3));
console.log('heights A',net.nodes[A].h.toFixed(0),'B',net.nodes[B].h.toFixed(0));
// hairpins along route: walk points in order
const P=[]; for(const {edge:e,dir} of path){ const idx=[...Array(e.n).keys()]; if(dir<0) idx.reverse(); for(const i of idx) P.push([e.pts[i*3],e.pts[i*3+2],e.pts[i*3+1]]); }
let s=0; const S=[0]; for(let i=1;i<P.length;i++){s+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);S.push(s)}
const head=i=>Math.atan2(P[Math.min(P.length-1,i+1)][1]-P[i][1],P[Math.min(P.length-1,i+1)][0]-P[i][0]);
const pins=[]; let j=0;
for(let i=0;i<P.length;i++){ while(S[j]<S[i]-35) j++; let k=i; while(k<P.length-1&&S[k]<S[i]+35) k++; let d=head(k)-head(j); d=Math.atan2(Math.sin(d),Math.cos(d)); if(Math.abs(d)>2.4){ if(!pins.length||S[i]-pins.at(-1).s>120) pins.push({s:S[i],x:P[i][0],z:P[i][1],h:P[i][2],turn:d}); } }
console.log('hairpins',pins.length, pins.map(p=>`${(p.s/1000).toFixed(2)}km h${p.h.toFixed(0)} (${p.x.toFixed(0)},${p.z.toFixed(0)})`).join('\n'));
t0=performance.now(); let acc=0; for(let i=0;i<100000;i++){acc+=rs.height(-3000+Math.random()*6000,-3000+Math.random()*6000)} console.log('100k height queries ms',(performance.now()-t0).toFixed(0));
// trunk-only connectivity
const SP = (await import('../src/world/roads.js')).SPEC;
for (const k of Object.keys(SP)) if (k!=='trunk') SP[k].cost=1000;
const p2 = net.shortestPath(A,B); let L2=0,bad=0; const types={}; for(const {edge:e} of p2){L2+=e.len; types[e.type]=(types[e.type]||0)+e.len}
console.log('trunk-pref route km',(L2/1000).toFixed(2), types);
for (const {edge:e} of p2) if(e.type!=='trunk') console.log('  nontrunk',e.type,e.name,e.len.toFixed(0), net.nodes[e.a].x, net.nodes[e.a].z);
let mg=0,where=null; for(const {edge:e} of p2){ for(let i=4;i<e.n;i+=4){const g=Math.abs(e.pts[i*3+1]-e.pts[(i-4)*3+1])/(e.s[i]-e.s[i-4]); if(g>mg){mg=g;where=[e.pts[i*3],e.pts[i*3+2],e.type]}}}
console.log('max 10m-grade', mg.toFixed(3), where);
// grade histogram
const hist=[0,0,0,0,0,0]; for(const {edge:e} of p2){ for(let i=4;i<e.n;i+=4){const g=Math.abs(e.pts[i*3+1]-e.pts[(i-4)*3+1])/(e.s[i]-e.s[i-4]); hist[Math.min(5,Math.floor(g*20))]++}} console.log('grade hist (5% bins)',hist);
