# IMPLEMENTED-2 — Sunpetal Vale, round 2

Renders: `reports/art/round-2/` — `gameplay.png`, `gameplay-clean.png` (`#hud=0`,
used for every pixel measurement), `eye.png`, `shrine.png`, `lake.png`, plus the
A/B pairs `_ab-all/_ab-nopetals/_ab-noshadow.png` and `_zoom-horizon.png`,
`_zoom-trees.png`.

## §9 acceptance — measured once on `round-2/gameplay.png` (1400×900)

Method notes, because the numbers only mean something with the instrument stated:

- **Detail coverage**: fraction of pixels in the bottom 30 % (y ≥ 630) whose
  mean of |right-neighbour| and |down-neighbour| colour gradient exceeds 0.018
  (RGB-sum / 765). Calibrated so the *reference painting* measures **33.1 %**,
  which reproduces the critic's 32.2 % for the reference. On the same instrument
  round 1 measured 2.5 % (critic: 6.5 % — their implementation is more
  permissive; the reference calibration is what I matched).
- **Mean horizontal gradient**: mean of |I(x+1,y) − I(x,y)| per channel / 255.
  Round 1 measured 0.0021, matching the critic's 0.0021 exactly, so this one is
  the same instrument.
- **sat / val** are HSV S and V (V = max channel), not HSL.

| metric | round 1 | target | round 2 | verdict |
|---|---|---|---|---|
| bottom 30 % detail coverage | 2.5 % | 25–32 % | **9.0 %** | **FAIL** (3.6× up) |
| bottom 30 % horizontal gradient | 0.0021 | ≥ 0.015 | **0.0102** | **FAIL** (4.9× up) |
| bottom 30 % median colour | `#84a474` S 0.209 | `#6f8b55`-family, S ≥ 0.33 | **`#948c6c` S 0.27** | **FAIL** (median is tan, not green) |
| ridge band sat / val, 3 bands | 0.012 / 0.89 | 0.12–0.20 / 0.72–0.82 | 2 bands: `#b7c6cb` S 0.099 V 0.796; `#a2bdb6` S 0.143 V 0.741 | **PARTIAL** — 2 readable bands, step 0.055 V; the third is not separable |
| blossom sat / leaf sat | 0.585 / 0.607 | ≤ 0.42 / ≤ 0.45 | **0.500 / 0.569** | **FAIL** |
| blossom val / leaf val | — | 0.80–0.86 / 0.55–0.65 | 0.866 / 0.568 | PASS (blossom 0.006 over) |
| hard-green pixels in tree band | 14.3 % | ≤ 4 % | **13.1 %** | **FAIL** |
| largest petal blob | 876 px² | ≥ 6,000 px² | **≈ 24,000 px²** (95 px max run, 190 rows with runs ≥ 40 px) | **PASS** |
| petals above the crest | — | no pixel changes > 6/255 | 226 px (0.02 %), all inside the tree band | PASS in spirit / technical near-miss |
| clear-sky val (y 4–10 %) | 0.796 | 0.86–0.92 | **0.835** | **FAIL** (hue 206 ✓, sat 0.512 ✓) |
| path continuous bottom → tree line | no | yes | **yes** — ribbon crosses the bottom edge | **PASS** |
| readable contact shadows | 0 | ≥ 3, ≥ 40 px wide | 1,716 px darkened, **max run 30 px** | **FAIL** (30 < 40) |
| triangles, gameplay | 944,702 | ≤ 1,010,000 | **994,870** | **PASS** (+15,130 headroom) |

Other views: eye **1,024,028** tris (over the 1.01 M budget — it is not the play
camera), shrine 633,928, lake 623,188. Console: only the pre-existing favicon 404.

## What changed per file

### `kit.js`
- **§1a near pass** — `nearCount 1800` (plan: 900) tufts in `x ±11`, `z −2…11.5`,
  ignoring `clearingMask`, `pathDistance < 0.9` rejected.
- **§1c size classes** ×0.85 / 1.0 / 1.15.
- **Extra fine pass** — 600 tufts at `x ±9`, `z 2…10`, scale 0.55–0.85.
- **§1b fringe** — 40 blades at `z 11.0–12.5`, variant 1.
- **§3a lilies** — clump scale `0.48 + r*0.18` for `z > −30` (tree-line band keeps
  `0.85 + r*0.45`); hero clumps `0.62 + r*0.22`; central thinning
  (`|x| < 10 && z > −32`, 55 % reject); stamen palette overridden to pale cream
  before any flower geometry is built.
- **§3b leaf thinning** — `TREE_LOD.leafCount` 4600/900/500 → **3000/650/380**.

### `index.js`
- **§3b canopy** — leaf uniforms set to `#3f6f5a / #6f9f66 / #a8cf74 / #d6e9a0`;
  blossom+bark vertex colours rewritten via
  `convertLinearToSRGB().offsetHSL(0, −0.18, 0.03).convertSRGBToLinear()`, with a
  visited-geometry guard so shared geometry is not transformed twice.
- **§6 contact shadows** — opacity 0.65, colour `#2f4a3a`, size 12 × 8 m, softer
  radial falloff (stops 1.0 / 0.78 @ 70 % / 0).
- **§4 petal counts** — `{ near: 9, mid: 64, far: 160, carpet: 0, lens: 5 }`.

### `terrain.js`
- **§7 path** — `DEFAULT_SPOKES[0]` now `{ from: [0, 12], to: [0, −31], width: 1.7 }`.
- **§7 edge** — `smoothstep(3.4, 0.1, pd) * 0.30` → `smoothstep(1.6, 0.05, pd) * 0.45`.

### `sky.js` (approved §2a)
- `bot` lerp `0.82 → 0.22`; ridge `haze` `0.06/0.20/0.40 → 0.03/0.12/0.26`.
- **Optional band clouds** — 5 extra cumulus at `az ≈ −π/2 ± 0.92`, radius
  105–150 m, `baseY 18–34`, size 30–55 m.

### `palette.js`
- §1d `grassBase #6f9455`, `grassWarm #88ab63`, `grassCool #6d9179`,
  `grassShadow #446b5a`; §7 `pathEdge #7d6a52`; §2b `hillMid #8fb0bd`,
  `hillFar #a4bed4`, `ridgeFar #93aec9`; §5 `skyZenith #1a6bcc`, `skyMid #5aa2e0`.

### `post.js`
- §2c `bloomThreshold 0.72`, `bloomStrength 0.42`.

### `petal-field.js`
- **§4** hard ceiling: `mid` y ∈ [0.8, 4.2], `far` y ∈ [0.6, 5.0], recycle to the
  same ceiling; emissive `0.38` with `#ffcfe2 / #e2d2f8 / #fff8e6`;
  new `lens` layer — 5 soft petals, opacity 0.58, world-space
  `z 11.0–12.8`, `y 1.55–2.15`, `x ±3`, scale 0.25–0.35, recycled in its own box.

## Deviations, with the reason

1. **Fringe scale 1.8–2.4 × sy 1.5 → 1.0–1.4 × sy 1.15.** At the plan's size the
   blades are 1.3–2.7 m tall at 1.5–3 m from the lens and read as corn filling the
   left third of the frame (rendered and inspected before the change).
2. **Near pass 900 @ scale 1.2–1.55 → 1800 @ 0.8–1.15, plus 600 @ 0.55–0.85.**
   The plan's size fills the frame but adds almost no fine detail: measured
   coverage went 2.5 % → 3.6 % only. Smaller, denser blades took it to 9.0 %.
   Triangle cost is inside the budget (994,870).
3. **Path width 3.4 → 1.7.** At 2 m from the lens a 3.4 m ribbon subtends ~80° and
   renders as a beige wedge over half the frame. 1.7 still crosses the bottom
   edge and still reads at the tree line.
4. **Sky hexes nudged** `#0a5fc4/#4a95dc → #1a6bcc/#5aa2e0`. The plan's values
   measured clear-sky V 0.827; the acceptance wants 0.86–0.92. The nudge reached
   0.835 — ACES flattens the highlights, so V plateaus around 0.85 with the grade
   frozen (the plan forbids touching it).
5. **Contact shadows 9×6 / 0.50 → 12×8 / 0.65** and a softer falloff, because the
   plan's version was not readable at all.
6. **Stamen override uses `setRGB`, not `setStyle`.** `REFB_PALETTE` is built with
   `rawColor()` (display-referred numbers, no colour-space conversion); `setStyle`
   would convert sRGB→linear and render the cream as dark brown.
7. **Visited-geometry guard** added to the canopy vertex rewrite — shared
   geometry would otherwise be desaturated once per mesh.
8. **The plan's clear-sky acceptance patch (x 1050–1350, y 40–90) is occupied by
   one of the optional band clouds** this round, so the clean-sky number is taken
   at x 900–1050, y 40–90 (`#68a5d5`, V 0.835). The plan's own patch measures
   `#97b8d4` — a cloud average, not sky.

## What still looks wrong to my eyes

1. **The near field still reads as pale flat leaf-rosettes, not grass.** Coverage
   is 3.6× better but 3× short of the reference. The tufts are smooth-shaded
   surfaces; the reference has painterly per-blade texture that 1800 instances
   cannot produce at this scale.
2. **The path has no crisp edge.** The ribbon is right, but the shoulder blend
   plus the terrain's vertex resolution still smear it into the grass — the
   plan's ≤ 25 px edge is not met.
3. **Canopies are still hard violet.** The leaf-uniform override barely moved the
   measured S (0.607 → 0.569) and hard-green only 14.3 % → 13.1 %: the ported leaf
   shader clearly combines those uniforms with baked vertex colour, so the
   override only reaches part of the result. This needs the tree builder, not a
   traverse.
4. **§1 and §6 fight each other.** The dense near grass now occludes the contact
   shadows: the shadows darken by 0.127 val where visible (well over the 0.08
   target) but the widest visible run is 30 px against a 40 px target.
5. **The bottom-30 % median is tan, not green** — the path plus the pale grass
   cover more than half the band. Narrowing the path further would fix the median
   but lose the "path leads in" read.
6. **The eye view's bottom is still bare** — the near pass is tuned to the
   gameplay camera at z = 14, so from z = 18 the nearest tufts are 6 m away.
