# Worker B brief — `game/src/vale-layout.js`

You are Worker B on a two-worker implementation of **Sunpetal Vale**, an outdoor
map replacing a cramped dungeon in `C:/Users/silen/projects/kilo-3d-kit`.

Read these first, in this order:
1. `C:/Users/silen/projects/kilo-3d-kit/AGENTS.md`
2. `C:/Users/silen/projects/kilo-3d-kit/game/handoff/MAP-DESIGN.md`
3. `C:/Users/silen/projects/kilo-3d-kit/game/src/balance.js` — read
   `ASSETS.valley`, `VALE_PALETTE`, `CONFIG.vale`. These are FROZEN; do not edit
   balance.js.
4. The preview PNGs at
   `library/kenney-fantasy-town/Previews/wall-arch-top.png`,
   `pillar-stone.png`, `wall-broken.png`, and
   `library/kenney-survival/Previews/tent.png`, `bedroll.png`, `campfire-pit.png`
   to understand the silhouettes.

## Your only file

Create exactly one new file: `game/src/vale-layout.js`.

Do **not** edit `world.js`, `balance.js`, `main.js`, `vale-scenery.js`, any CSS,
test, or other file. Another worker owns `vale-scenery.js`.

## Hard constraints

- **Pure data module. No imports at all.** No Three.js import, no asset loads, no
  URLs, no `/library/` strings, no gameplay logic, no functions with side
  effects. Export plain frozen data only. This keeps it trivially reviewable.
- No new dependency. Keep it under ~250 lines.

## What to export

Export exactly two named exports: `SHRINE`, `CAMP`, plus one combined
`LAYOUT` object that groups everything (so the Lead can import one thing). Use
**asset keys** from `ASSETS.valley` (e.g. `"stonePillar"`, `"tent"`), never URLs.

```js
export const SHRINE = { ... };
export const CAMP = { ... };
export const LAYOUT = { shrine: SHRINE, camp: CAMP, accents: [...] };
```

Every placement entry has this shape:

```js
{
  asset: "stonePillar",   // key into ASSETS.valley
  x: -1.55, z: -33.0,     // metres, world space
  y: 0,                   // base Y; ground is 0, leave 0 unless it is a stone
                          // slab meant to sit flush (then still 0 — do NOT raise)
  scale: 3.2,             // uniform scale
  rotY: 0,                // radians
  tint: 0xe6dcbe,         // optional hex tint, omit to keep the asset's own colour
  collider: 0.9,          // optional circular collider radius; OMIT for props
                          // the player should walk through or around freely
  note: "left arch pier", // optional short human label
}
```

Coordinates follow MAP-DESIGN.md. North is **-Z**, east is **+X**, 1 unit = 1 m,
all walkable ground and feet at Y=0. Hero height 1.9 m.

### 1. Wishing Arch shrine — centre `(0, -31)`, clearing ~20 x 16 m

The key composition of the map. Build a **broken pale arch** from Kenney fantasy
town modular stone at 1 m grid, scaled up (`scale` around 3.0-3.4 so a pier is
about 3.2 m tall and the arch opening reads as a real doorway):

- Two `stonePillar` piers, left and right, with a **~3.1 m clear opening between
  them** so the hero and enemies can walk through the arch on the centre line.
- A `archHalf` (`wall-arch-top`) on the left pier, and a visibly **broken** right
  side — either a short `stoneBroken` stub or a second `archHalf` that stops short.
  The design says "broken arch": it must read as ruined, not as a complete gate.
- The arch must not block the path. Put the whole assembly **behind** the
  clearing centre so the main path from the meadow (which arrives from +Z, from
  `(0, -28)`) leads up to it. Piers sit around z = -33 to -34.
- **Empty low pedestal**, cream stone, about 1.6 x 0.45 x 1.1 m, flush with the
  ground (base at y = 0), placed off the walking route — e.g. at z = -29.5,
  x = 2.6. Reserve a clear 10 m diameter testing space in front of the arch: this
  is where a future spellbook task will put an interaction, so do not fill the
  centre with props.
- Two or three `stoneBroken` / `stoneHalf` ruin fragments as scatter at the
  clearing edge, not in the middle.
- Colliders: the two arch piers must be solid (radius ~0.9). The pedestal is low
  enough to step over visually but must still be solid to the AI (radius ~0.9).
  Fragments at the edge: collider ~1.0. Nothing else.

### 2. Traveller's rest camp — centre `(29, 17)`, clearing ~18 x 16 m

A small roadside camp, **unlit** cooking setup (no fire, no light — this is
decoration only and there is no fire effect in the valley task):

- One `tent` (scale ~4.0), rotated to face the clearing.
- One `bedroll` (scale ~3.2) near the tent.
- Two `crate` (scale ~4.0 and ~3.2) stacked at the side.
- One `campfire` (`campfire-pit`) ring, scale ~4.2 — **unlit**.
- One `barrel` (scale ~3.4), one `signpost` (scale ~3.4) at the clearing edge.
- Keep a walkable gap through the middle of the clearing (the path arrives from
  the meadow at roughly `(18, 12)` and the loop passes `(30, 14)`).
- Colliders: tent (~1.6), crates (~1.0 each), barrel (~0.5). Bedroll, campfire
  ring and signpost: no collider (walk over / past).

### 3. Route accents — `LAYOUT.accents`

8-14 small entries placed along the loop path shoulders and at landmark
entrances, using `stoneHalf`, `stoneBroken`, `rock1`, `rock2`, `rock3`,
`pebble`, `signpost`. These are visual waypoints that make the route legible.
Keep every one of them **at least 2.5 m off the path centre line** so they never
block the route, and give colliders only to the genuinely solid ones (rock1-3,
stoneHalf, stoneBroken) with a radius matched to their scaled footprint. Small
pebbles get no collider.

Waypoints of the loop for reference (from `CONFIG.vale.loopPath`):
`(0,24) -> (-27,20) -> (-32,-9) -> (-18,-28) -> (0,-31) -> (26,-23) -> (30,14) -> (18,29) -> (0,24)`.

## Rules that matter for gameplay

- The full rectangle must stay connected and walkable. Do not build interior
  walls, fences, maze corridors, or a ring of props. The enemy AI is direct
  chase with circular push-out — it cannot path around a wall.
- Do not place any solid prop within 3 m of a path centre line or within 6 m of
  a landmark clearing centre (the shrine pedestal is the one deliberate
  exception, placed off-centre).
- Everything is decorative and static. No animation fields, no gameplay values.
- Y stays 0 for everything: no raised platforms pretending to be walkable.

## Report back (concise)

Reply with: the file path, the exported shape, a table of every placement
(asset, x, z, scale, collider radius) for shrine and camp, the accent count, and
the total number of colliders you emitted. Also state which MAP-DESIGN rules you
checked your coordinates against. Do not claim visual quality you have not seen.

## Verification you must do

Run `node --input-type=module -e "import('./game/src/vale-layout.js').then(m => console.log(JSON.stringify(m.LAYOUT, null, 1)))"` from the repo root and paste
the result summary. Then assert by inspection (and say so explicitly) that:
every `asset` value exists as a key in `ASSETS.valley`; no solid prop (one with
a `collider`) is within 3 m of any loop waypoint or within 6 m of any landmark
centre except the shrine pedestal; and the shrine's two piers are more than 3 m
apart so the arch opening is walkable.
