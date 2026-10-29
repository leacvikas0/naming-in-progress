# Map background — status

**Direction (final):** the two reference HTML pages are the **asset source**. Their botanical
geometry builders and shader material are ported nearly verbatim; our own 96 × 96 map layout
(terrain, path, lake, sky, landmarks) sits under them.

## View it

```
http://127.0.0.1:4173/game/handoff/map-bg/preview.html
```

- `1` gameplay · `2` aerial · `3` eye level · `4` lake · `5` shrine
- drag orbit, wheel zoom, `P` post, `H` hide UI

Screenshots: `game/handoff/map-bg/shots/final-01-gameplay.png` … `final-05-shrine.png`.

## What is actually in the scene now

| Layer | Source | Notes |
|---|---|---|
| Meadow grass, bellflowers, daisies, violet sprigs, faceted rocks | **ported from reference B** (`src/map/port/refb-kit.js`) | verbatim geometry + B's two-colour ramp material (`createGhibliBotanicalMaterial`) |
| Tree canopies + trunks | B's `addArchingLeaf` primitive, new tree builders | canopies rebuilt at map scale (see `CANOPY_OPTS` in `kit.js`) |
| Terrain, dirt path, lake, pebbles | ours (`src/map/terrain.js`) | playable square stays exactly flat at y = 0 |
| Sky dome, cumulus, ridges, light rig | ours (`src/map/sky.js`) | procedural, no textures |
| Post chain | ours (`src/map/post.js`) | built, but **off by default** — see "Known issues" |

Placement: `src/map/kit.js` — 24 000 grass tufts, ~550 flower clumps, ~45 boulders,
~200 trees, batched into tiled `InstancedMesh` (≈121 draw calls, ≈2.3 M tris).

## Reference-A port

`src/map/port/refa-kit.js` exists (hero flower stalks, wildflowers, grass tufts + A's
twilight/dusk/moonlit shader material). It is **not wired into the map yet** — A's material is
authored for a dark 46 m diorama, so it needs a sunlit preset before it can sit next to B's.
That is the next asset addition (tall hero stalks for foreground/garden pockets).

## Known issues / next steps

1. **Post-processing is off.** The ported materials are *display-referred* (they write final
   sRGB values, never tone-map), while the terrain is a PBR material that relies on the
   renderer's ACES + sRGB pass. A composer can only be correct for one of them without
   converting the other, so the meadow ships on the plain render path — which is also what the
   reference scenes use. Fixing it properly means: convert the ported material output to linear
   (one shader line) and let the grade do ACES + encode once. Then bloom/grade can be enabled.
2. **Tree trunks** still read as a little red/bare at gameplay angle; canopies sit high.
3. **Lake shore** boulders are better but could be fewer and more half-submerged.
4. **Ground vs grass tone** is close but not identical (lit ground vs self-lit grass).
5. No landmarks yet (shrine arch, camp) — the concept sheet for those is in
   `ASSET-CONCEPTS.md` and awaits approval for 3D conversion.
6. The old procedural kit (`src/map/foliage.js`) is superseded but kept as a fallback.

## Files

```
game/src/map/
  palette.js        shared palette + light rig constants
  terrain.js        height field, ground, path, lake, pebbles
  kit.js            placement of the ported assets on our map
  sky.js            sky dome, clouds, ridges, lights
  post.js           bloom + grade chain (disabled by default)
  index.js          composition root: createMeadowBackground()
  port/refb-kit.js  reference B assets + material (verbatim)
  port/refa-kit.js  reference A assets + material (verbatim, not wired yet)
  foliage.js        old procedural kit (fallback)

game/handoff/map-bg/
  SPEC.md  REF-NOTES.md  PORT-PLAN.md  ASSET-CONCEPTS.md  STATUS.md
  preview.html  preview-terrain.html  preview-port-b.html  preview-port-a.html
  concepts/  shots/  shoot*.mjs (screenshot helpers)
```
