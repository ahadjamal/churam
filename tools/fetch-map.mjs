// Downloads real-world data for the Wayanad play area and bakes it into
// compact files the game can load:
//   public/data/height.bin  - Int16 elevation grid (decimetres), row-major, north row first
//   public/data/map.json    - roads, water, landuse, buildings in local metres
//
// Sources: AWS Terrain Tiles (Terrarium encoding, SRTM-derived) and OpenStreetMap via Overpass.
// Usage: node tools/fetch-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public', 'data');
const CACHE = path.join(here, '.cache');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

// Adivaram (foot of Thamarassery Churam) up to Kalpetta town.
const BBOX = { south: 11.462, west: 75.982, north: 11.628, east: 76.108 };
const ZOOM = 13;
const CELL = 20; // metres per height sample in the baked grid

const LAT0 = (BBOX.south + BBOX.north) / 2;
const LON0 = (BBOX.west + BBOX.east) / 2;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

// Local frame: +x east, +z south (Three.js convention with north = -z)
const toLocal = (lat, lon) => [
  +((lon - LON0) * M_PER_DEG_LON).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT).toFixed(1),
];

const lon2tile = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2tile = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

async function fetchCached(url, file, opts) {
  const p = path.join(CACHE, file);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(p, buf);
      return buf;
    }
    console.warn(`  ${res.status} for ${file}, retrying...`);
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error('failed ' + url);
}

// ---------- Elevation ----------
// Copernicus GLO-30 (true 1 arc-second, ESA/Airbus) read straight from the public
// Cloud-Optimised GeoTIFFs on AWS; falls back to SRTM terrain tiles if unavailable.
async function copernicusSampler() {
  const { fromUrl } = await import('geotiff');
  const tiles = [];
  for (let lon = Math.floor(BBOX.west); lon <= Math.floor(BBOX.east); lon++) {
    const lat = Math.floor(BBOX.south);
    const name = `Copernicus_DSM_COG_10_N${String(lat).padStart(2, '0')}_00_E${String(lon).padStart(3, '0')}_00_DEM`;
    const cacheFile = path.join(CACHE, name + '.window.json');
    let win;
    if (fs.existsSync(cacheFile)) win = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    else {
      const tiff = await fromUrl(`https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`);
      const img = await tiff.getImage();
      const [x0, y0, x1, y1] = img.getBoundingBox(); // lon/lat
      const W = img.getWidth(), H = img.getHeight();
      const rx = (x1 - x0) / W, ry = (y1 - y0) / H;
      const m = 0.01;
      const c0 = Math.max(0, Math.floor((BBOX.west - m - x0) / rx)), c1 = Math.min(W, Math.ceil((BBOX.east + m - x0) / rx));
      const r0 = Math.max(0, Math.floor((y1 - (BBOX.north + m)) / ry)), r1 = Math.min(H, Math.ceil((y1 - (BBOX.south - m)) / ry));
      if (c1 <= c0 || r1 <= r0) continue;
      const [data] = await img.readRasters({ window: [c0, r0, c1, r1] });
      win = { lon0: x0 + c0 * rx, lat0: y1 - r0 * ry, rx, ry, w: c1 - c0, h: r1 - r0, data: Array.from(data, (v) => Math.round(v * 10) / 10) };
      fs.writeFileSync(cacheFile, JSON.stringify(win));
    }
    tiles.push(win);
    console.log(`copernicus ${name}: ${win.w}x${win.h}`);
  }
  return (lat, lon) => {
    for (const t of tiles) {
      // pixel centres sit half a pixel in from the window origin
      const fx = (lon - t.lon0) / t.rx - 0.5, fy = (t.lat0 - lat) / t.ry - 0.5;
      if (fx < 0 || fy < 0 || fx > t.w - 1 || fy > t.h - 1) continue;
      const x = Math.floor(fx), y = Math.floor(fy), ax = fx - x, ay = fy - y;
      const at = (i, j) => t.data[Math.min(t.h - 1, j) * t.w + Math.min(t.w - 1, i)];
      return (at(x, y) * (1 - ax) + at(x + 1, y) * ax) * (1 - ay) + (at(x, y + 1) * (1 - ax) + at(x + 1, y + 1) * ax) * ay;
    }
    return null;
  };
}

async function buildHeights() {
  let cop = null;
  try { cop = await copernicusSampler(); } catch (e) { console.warn('Copernicus DEM unavailable, using SRTM tiles:', e.message); }
  const tx0 = Math.floor(lon2tile(BBOX.west, ZOOM));
  const tx1 = Math.floor(lon2tile(BBOX.east, ZOOM));
  const ty0 = Math.floor(lat2tile(BBOX.north, ZOOM));
  const ty1 = Math.floor(lat2tile(BBOX.south, ZOOM));
  const tiles = new Map();
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
      const buf = await fetchCached(url, `t${ZOOM}_${tx}_${ty}.png`);
      tiles.set(`${tx},${ty}`, PNG.sync.read(buf));
    }
  console.log(`elevation: ${tiles.size} tiles`);

  const sample = (px, py) => {
    // px/py in global pixel coords at ZOOM
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const t = tiles.get(`${tx},${ty}`);
    const x = Math.min(255, Math.max(0, Math.floor(px - tx * 256)));
    const y = Math.min(255, Math.max(0, Math.floor(py - ty * 256)));
    const i = (y * 256 + x) * 4;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  const bilinear = (px, py) => {
    const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5);
    const fx = px - 0.5 - x0, fy = py - 0.5 - y0;
    const a = sample(x0, y0), b = sample(x0 + 1, y0), c = sample(x0, y0 + 1), d = sample(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };

  const [minX, maxZ] = toLocal(BBOX.south, BBOX.west);
  const [maxX, minZ] = toLocal(BBOX.north, BBOX.east);
  const cols = Math.floor((maxX - minX) / CELL) + 1;
  const rows = Math.floor((maxZ - minZ) / CELL) + 1;
  const data = new Int16Array(cols * rows);
  let hMin = Infinity, hMax = -Infinity;
  for (let r = 0; r < rows; r++) {
    const z = minZ + r * CELL;
    const lat = LAT0 - z / M_PER_DEG_LAT;
    for (let c = 0; c < cols; c++) {
      const x = minX + c * CELL;
      const lon = LON0 + x / M_PER_DEG_LON;
      const h = (cop && cop(lat, lon)) ?? bilinear(lon2tile(lon, ZOOM) * 256, lat2tile(lat, ZOOM) * 256);
      data[r * cols + c] = Math.round(h * 10);
      hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    }
  }
  fs.writeFileSync(path.join(OUT, 'height.bin'), Buffer.from(data.buffer));
  console.log(`height grid ${cols}x${rows} @${CELL}m, ${hMin.toFixed(0)}..${hMax.toFixed(0)} m`);
  return { cols, rows, cell: CELL, minX, minZ, hMin, hMax };
}

// ---------- OpenStreetMap ----------
async function buildOSM() {
  const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const q = `[out:json][timeout:180];
(
  way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|trunk_link|primary_link|secondary_link|tertiary_link)$"](${b});
  way["waterway"~"^(river|stream)$"](${b});
  way["natural"="water"](${b});
  relation["natural"="water"](${b});
  way["landuse"~"^(forest|farmland|orchard|residential|commercial|retail|meadow|plantation)$"](${b});
  way["natural"~"^(wood|scrub|grassland)$"](${b});
  way["building"](${b});
  node["amenity"~"^(fuel|place_of_worship|bus_station)$"](${b});
  node["tourism"="viewpoint"](${b});
  node["place"](${b});
);
out geom;`;
  const buf = await fetchCached(
    'https://overpass-api.de/api/interpreter',
    'osm.json',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WayanadTruckerDev/0.1' },
      body: 'data=' + encodeURIComponent(q),
    }
  );
  const osm = JSON.parse(buf.toString('utf8'));
  const out = { roads: [], water: [], rivers: [], landuse: [], buildings: [], pois: [] };
  const line = (geom) => geom.filter(Boolean).map((g) => toLocal(g.lat, g.lon));

  for (const e of osm.elements) {
    const t = e.tags || {};
    if (e.type === 'node') {
      const p = toLocal(e.lat, e.lon);
      out.pois.push({
        kind: t.place ? 'place' : t.tourism || t.amenity,
        sub: t.place || t.religion || undefined,
        name: t['name:en'] || t.name || '',
        p,
      });
      continue;
    }
    if (e.type === 'relation') {
      for (const m of e.members || [])
        if (m.role === 'outer' && m.geometry) out.water.push(line(m.geometry));
      continue;
    }
    if (!e.geometry) continue;
    const pts = line(e.geometry);
    if (t.highway) {
      out.roads.push({
        id: e.id,
        type: t.highway.replace('_link', ''),
        ref: t.ref || '',
        name: t['name:en'] || t.name || '',
        lanes: t.lanes ? +t.lanes : undefined,
        oneway: t.oneway === 'yes' ? 1 : undefined,
        pts,
      });
    } else if (t.waterway) out.rivers.push({ type: t.waterway, pts });
    else if (t.natural === 'water') out.water.push(pts);
    else if (t.building) {
      out.buildings.push({
        b: t.building,
        l: t['building:levels'] ? +t['building:levels'] : undefined,
        pts,
      });
    } else {
      out.landuse.push({ type: t.landuse || t.natural, crop: t.crop || t.trees || undefined, pts });
    }
  }
  console.log(
    `osm: ${out.roads.length} roads, ${out.buildings.length} buildings, ${out.landuse.length} landuse, ` +
      `${out.water.length} water, ${out.rivers.length} rivers, ${out.pois.length} pois`
  );
  return out;
}

const height = await buildHeights();
const osm = await buildOSM();
const meta = {
  source: 'Elevation: AWS Terrain Tiles (SRTM). Map data © OpenStreetMap contributors (ODbL).',
  bbox: BBOX,
  origin: { lat: LAT0, lon: LON0 },
  height,
};
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify({ meta, ...osm }));
console.log('wrote', path.join(OUT, 'map.json'));
