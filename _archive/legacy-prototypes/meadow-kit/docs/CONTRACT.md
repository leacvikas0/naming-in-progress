# Species contract

Read this before writing a plant. `src/foliage/daisy.js` is the reference
implementation — copy its structure.

## What this pack is

A modular Three.js foliage kit. Every plant is an independent, self-contained
module that the scatter system can drop anywhere. Nothing is baked into a
scene; nothing imports another plant.

The look: **soft toon ramp** — an 8-step gradient map with wide transitions.
Enough banding to give a petal form, never enough to draw a hard line. It was
chosen against three alternatives (bent-normal SSS, Kuwahara painterly post,
and all of them combined) and it won.

## The contract

Every species module exports exactly one thing:

```js
export const spec = {
  id: "buttercup",          // must equal the filename
  label: "Buttercup",       // human name
  layer: "flower",          // "grass" | "flower" | "fx"
  material: "petal",        // "petal" | "leaf" | "grass" | "stem"
  density: 2.3,             // instances per m² at quality "high"
  scale: [0.16, 0.26],      // ACTUAL HEIGHT IN METRES
  clump: 0.22,              // 0 = even spread, 1 = strong drifts
  build({ seed }) {         // deterministic; same seed => same geometry
    return mergeParts(parts);
  },
};
```

`build` may also receive `{ config, materials, palette, species }` but must not
depend on them — it must run standalone from a seed alone.

## Local space rules

These are enforced automatically by `finalizeGeometry()` (called by the loader
and by both tools), so you cannot ship something that breaks them:

- base sits on `y = 0`
- exactly **1.0 unit tall**
- horizontally centred on the origin
- `+Y` is up
- every vertex has `color` (0..1 RGB) and `aSway` (0..1)

Author at a natural scale (e.g. a 0.7-unit stem) and let normalisation rescale.
**`scale` in the spec is the real height in metres** — that is the only size
control, so a daisy is `[0.2, 0.32]` and a lupine spike is `[0.45, 0.72]`.

## Primitives

```js
import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
```

**`taperedPlane({ length, widthBase, widthTip, segments, crossSegments, bend, lean, cup, ruffle, widthCurve })`**

A curved strip in the XY plane, base at origin, growing `+Y`, front face `+Z`.
This one primitive builds blades, petals, leaves and sepals.

- `widthCurve`: `"blade"` (linear taper), `"petal"` (rounded, blunt tip), `"leaf"` (pointed, widest at 40%)
- `bend`: curl toward `+Z` as a fraction of length (negative curls back)
- `cup`: edges curl toward `+Z` as a fraction of width — a bowl
- `ruffle`: ripple along the edges, as a fraction of width
- `crossSegments`: 3 is a cheap V, 5 is smooth. Use 5 for petals.
- `segments`: 4–7 is plenty.

**`tube({ points, radius, tubular, radial })`** — stem. `points` are `[x,y,z]`.

**`dome({ radius, height, segments })`** — flower centre, facing `+Z`.

**`transform({ position, rotation, scale, order })`** — returns a Matrix4.
`order: "YXZ"` is what you want for pointing a `+Y` petal outward then spinning
it around the stem.

**`combine(parent, child)`** — matrix multiply, for placing a petal inside a
flower head that is itself tilted.

**`mergeParts(parts)`** — welds everything into one geometry.

```js
mergeParts([
  { geo, color, color2, gradientAxis: "y", gradientPower: 1, sway, matrix },
]);
```

- `color` → `color2` is interpolated along `gradientAxis` (default `y`) of that
  part, measured **before** its matrix is applied.
- `sway` is a number or `(t) => 0..1`. Default is `t` along `+Y`. Base must be
  near 0, tip near 1.

## Colours

Never hard-code hex. Use the palette so the whole meadow can be retinted at once:

```js
import { speciesCol } from "../core/palette.js";
const petal = speciesCol("buttercup", "petal");
```

Available keys are in `data/meadow.palette.json` under `species.<yourId>`.
If you need a shade that isn't there, derive it with `THREE.Color.offsetHSL`
or `.multiplyScalar()` rather than inventing a new hex.

## Sway

`aSway` is how much a vertex leans in the wind. Set it per part:

- stems: `(t) => 0.05 + t * 0.9`
- leaves: `(t) => 0.1 + t * 0.45`
- petals: `0.7 + t * 0.3`
- flower centres: `0.9`

A species whose max `aSway` is below 0.2 is rejected — it would look frozen.

## Budgets

`validate` enforces these per instance:

| material | max triangles |
|---|---|
| grass | 420 |
| leaf | 900 |
| stem | 900 |
| petal | 3000 |

These plants are instanced thousands of times. A daisy is 778. If you are over,
reduce `segments`/`crossSegments` before reducing silhouette quality.

## Tools — use these before you report

```bash
node tools/validate.mjs --only=<id>       # contract gate, exits non-zero on failure
node tools/render.mjs --species=<id>      # writes scratch/shots/<id>.png
```

`render.mjs` rasterises your actual geometry with the same toon ramp the kit
uses at runtime, so the PNG is a fair preview. Look at it. Then fix what looks
wrong and render again. Flags: `--size`, `--az`, `--el`, `--out`.

Do not use Playwright — several agents share one browser. `render.mjs` is yours.

## Rules

1. **Only write the files assigned to you.** Do not touch `src/core/`,
   `src/foliage/daisy.js`, `data/`, `tools/`, or another agent's species.
2. **Deterministic.** Seed a local RNG with `makeRng(seed ^ <your constant>)`.
3. **One geometry per species.** One material, one draw call.
4. **Look at your render before reporting.** A passing validator with an ugly
   plant is a failure.
5. Report: tris, height range, what you built, what you're unsure about.

## Art direction

The reference is a sun-washed anime meadow: 76% green, ~7% gold, ~7% earth,
~3.7% violet, and pink/blue as accents under 2%. The flowers are **small and
quiet**; the field reads as green first and flowers second. Do not make a
showy hero flower — make something that disappears into a field and rewards a
close look.

Lighting is soft, warm from upper right, with cool green bounce from below.
Shadows are never black — the darkest green in the palette is `#3d6034`.
