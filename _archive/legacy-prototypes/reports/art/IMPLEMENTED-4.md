# IMPLEMENTED-4 — Sunpetal Vale, round 4 (final)

Renders: `reports/art/round-4/` — `gameplay.png`, `gameplay-clean.png` (`#hud=0`,
the image every pixel number below was measured on), `eye.png`, `shrine.png`,
`lake.png`, plus the petal A/B pair `_ab-all.png` / `_ab-nopetals.png`.

## Acceptance — measured once

| metric | round 3 | target | round 4 | verdict |
|---|---|---|---|---|
| canopy blossom value p5–p95 | 0.094 | ≥ 0.30 | **0.09** (p5 0.808, p95 0.898) | **FAIL** |
| blossom sat | 0.284 | 0.34–0.40 | **0.302** | **FAIL** (close) |
| leaf val (p95) | 0.722 | 0.55–0.65 | **0.776** (p5 0.655) | **FAIL** |
| leaf sat | — | 0.30–0.35 | **0.318** | **PASS** |
| grass p95 | 0.757 | ≥ 0.88 | **0.796** | **FAIL** |
| grass value range p5–p95 | 0.306 | ≥ 0.42 | **0.337** | **FAIL** |
| near-band horizontal gradient | 0.0086 | ≥ 0.016 | **0.0107** | **FAIL** (up 24 %) |
| largest petal blob | 2,492 px² | ≥ 6,000 px² | **not measured** | **UNVERIFIED** |
| shrine bottom-30 % coverage | — | ≥ 16 % | **5.25 %** (my instrument) | **FAIL** |
| triangles, gameplay | 961,548 | ≤ 1,010,000 | **1,005,008** | **PASS** |

Other views: eye 1,055,512, shrine 632,696, lake 620,386. The **eye view is over the
1.01 M gameplay budget** — it is not the play camera, but it is worth knowing.

The blossom p5–p95 did not move at all (0.094 → 0.09). The new ramp is in the
shader, but the measured blossom values are uniformly bright (0.81–0.90), which
says `lightFactor` is high across the whole canopy: the cluster normals all face
the sun, so `smoothstep(0.05, 0.85, ndl)` never reaches its dark end. Widening the
smoothstep range was the wrong lever for this geometry — the dark interior has to
come from `vColor` (the baked blossom ramp) or from an ambient term, not from
`ndl`.

The petal blob is **unverified**: the A/B pair is captured, but the connected-blob
measure did not get run inside the timebox. It must not be reported as passing.

## What changed

### `port/anime-flower-tree.js`
- Flower fragment: `norm = normalize(mix(vFaceNormal, vClusterNormal, 0.65))`,
  `if (!gl_FrontFacing) norm = -norm;` (petals are DoubleSide),
  `lightFactor = smoothstep(0.05, 0.85, ndl)` (was 0.18–0.75),
  `shadowCol = mix(vColor * 0.55, #7a5aa8, 0.65)`,
  `sunlitCol = mix(vColor, #e6d8ff, 0.60)`.
- Leaf `uLeafSunlit #a8cf74 → #86ab5e`, `uLeafTip #d6e9a0 → #a8c47c`,
  `tipBright 0.18 → 0.10`.
- Bark palette: tan-orange `(0.45,0.34,0.24)/(0.59,0.46,0.32)/(0.74,0.60,0.43)`
  → cool grey-brown `#6e5f52 / #8a7a6a / #a2937f`.

### `kit.js`
- `grassSunBright` → `#b8e69c` (hue 97, val 0.90).
- Near pass box `x ±16`, taper start **1.2 m** (was 2.5).
- **Fine layer**: 1,200 attempts of `lowGrassGeos` (24 tris) at `scale 0.30–0.50`,
  same box and taper → 759 placed.
- **Shrine patch**: 500 attempts of `lowGrassGeos` at `scale 0.40–0.70`,
  `x ±12`, `z −40…−18`, taper 1.2 → 341 placed.

### `petal-field.js` / `index.js`
- `lens` layer back to the soft sprite, `scale 0.42–0.60`, canvas blur `5 → 16 px`.
- `foreground` 9 → 14, `far` 160 → 140.
- `meadow-cream` base `#fff4d8 → #ecd9a8`.

## Deviations

1. **`nearCount` 2600 → 1750.** At the plan's 2600 the gameplay view measured
   **1,058,886** tris. The cause is not the new layers (they cost 26 k): the wider
   box (±16) and the tighter 1.2 m taper make the *existing* pass accept far more
   tufts than the plan projected. The plan's fallback ("then nearCount in 200s")
   is what I applied; the fine layer is kept because it is the detail lever.
   Final: **1,005,008**, 4,992 under budget.
2. **Lens petal opacity** is the soft-sprite default 0.5, not a specified number —
   the plan only gave the scale.
3. **The blob and the canopy ramp** are reported as failed/unverified rather than
   tuned after the clock.

## What still looks wrong to my eyes

- The canopy **reads much better than it measures**: the render shows a dark
  purple interior and a lit lavender-pink rim, the trunks are no longer orange,
  and the black speckle is gone. But the p5–p95 range is still 0.09 because the
  lit rim dominates the pixel population — the measurement is right and the look
  is only half-fixed.
- The **lens petals are now very soft** — at 16 px of blur on a 0.42–0.60 scale
  they read as coloured out-of-focus patches rather than petals. That is what the
  plan asked for and it does read as bokeh, not as paper, but it is close to the
  "smudge" end.
- The **near grass is brighter at the tips** but the p95 target (0.88) is still
  out of reach: the tuft shader's own `pow(col, 2.2)` pulls an authored 0.90 down
  to ~0.80 after the grade.
- The **shrine foreground** got a patch but still reads sparse.
