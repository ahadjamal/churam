# Churam — Wayanad Lorry Simulator

A Three.js truck-driving game set on the real NH766 between **Adivaram** (the foot of the
Thamarassery churam) and **Kalpetta**, up the ghat's hairpins and across the Wayanad plateau.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Add `?dev` to the URL to get the debug helpers `tp(x, z)` and `autopilot({...})` in the console.

To re-download the map data (it's already baked into `public/data/`), run `npm run fetch-map`.

## What's real

| Layer | Source |
|---|---|
| Terrain | Copernicus GLO-30 DEM (ESA, 1 arc-second) read from the public AWS COGs, resampled to a 20 m grid (SRTM tiles as fallback) |
| Roads | OpenStreetMap: NH766, state highways, MDRs and estate roads, smoothed and grade-limited (about 10% on NH). Real carriageway widths (NH 7 m), hairpins widened on the outside, stone-masonry retaining walls on the valley side, rock and laterite cuttings, yellow centre line on the ghat |
| Buildings | OpenStreetMap footprints (2,300+), extruded as Kerala houses and shops. Junction towns that OSM maps sparsely (Adivaram, Lakkidi, Chundale, Pozhuthana, Vengappally…) are filled with procedural shop rows: tin awnings, Malayalam/English signboards, goods out front, tea stalls, parked autos and bikes, people, flex hoardings and blue place-name boards |
| Land cover | OSM landuse plus rules: evergreen forest on the ghat slopes, coffee/pepper/areca/silver oak plantations on the plateau, tea estates around Chundale, Pozhuthana and Achoor, paddy (vayal) in flat valley floors, shola grassland on the high hills |
| Places | Depots at Adivaram, Lakkidi, Vythiri, Chundale, Pozhuthana and Kalpetta; fuel stations at OSM fuel POIs; Lakkidi viewpoint; Chain Tree |

## Navigation

- Job routes always prefer NH766. State highways and estate roads are used only where the highway doesn't reach (for example Pozhuthana).
- The minimap shows town and village names and the numbered hairpins.

## Starting and saving

- Choose the start location on the title screen: Adivaram, Lakkidi, Vythiri, Chundale, Pozhuthana or Kalpetta.
- **K** quick-saves. The game also autosaves every 2 minutes and after each delivery. **Esc** opens the pause menu (save / load / quit).
- **Continue saved career** on the title screen restores money, the lorry's position and condition, cargo, the active job, time of day and weather. Saves are kept in browser localStorage.

## Gameplay and physics

- The lorry is modelled on the Kerala semi-forward-cab goods truck: yellow cab, mesh grille, lamps with painted "eyes", an arched crown board in gold letters over a painted feather fan, floral door art, a striped under-run guard, a plank body with rope hooks, red wheels and a yellow two-line KL plate.
- The right-hand-drive cab has an engine hump, a long gear stick with a rubber boot, a leather-wrapped wheel, a working speedo and tacho, quilted seat covers, a marigold garland, a fringe curtain, a framed picture with an LED ring, and a spinning dashboard fan.
- Cargo is visible on the deck: piled jute or cement sacks, silver oak logs, Nendran bananas, LPG cylinders, tea chests and water crates.
- Raycast suspension, slip-based tyres with a friction circle, and weight transfer. A high, heavy load can **roll over** on a hairpin.
- Diesel engine torque curve, 5-speed gearbox (auto or manual), clutch slip, and engine and **exhaust braking**.
- **Brake heat and fade**: going down the churam on the service brakes alone overheats them past 250 °C. Use a low gear and the exhaust brake (B).
- Cargo condition drops with lateral g, impacts and rollovers. Fragile loads such as bananas and LPG cylinders pay more.
- Monsoon rain cuts grip, and the roads go wet and reflective.
- Left-hand traffic: buses in KSRTC-style and private liveries, autorickshaws, jeeps, cars, bikes, pickups and other lorries. They follow the real road graph, slow for curves and honk when you block them.

## Controls

W/S throttle/brake (hold S when stopped to reverse) · A/D steer · Space handbrake · Shift/Z gear up/down (manual) ·
G auto/manual · B exhaust brake · H horn · L lights · E jobs/deliver · F refuel · C camera · M map ·
T time of day · N monsoon · R tow (₹750) · F1 help · P pause

## Code map

- `src/world/` — heightfield, road graph (`roads.js`), shared road/terrain sampler, worker-built LOD terrain, biomes, vegetation, buildings, props, sky
- `src/vehicles/` — models (lorry, buses, autos…), `truck.js` physics, `traffic.js`
- `src/game/` — jobs/economy, HUD and maps, procedural audio
- `tools/fetch-map.mjs` — data download and bake

Map data © OpenStreetMap contributors (ODbL). Elevation: SRTM via AWS Terrain Tiles.
