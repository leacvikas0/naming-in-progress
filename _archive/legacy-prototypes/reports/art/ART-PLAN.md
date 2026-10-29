# ART-PLAN — Sunpetal Vale, `gameplay` view

**Goal:** close the gap between the current `gameplay` render and
`concepts/ref-lavender-meadow.png` — low horizon, airy high-key light, lavender-blue
air, a few dancing petals — without losing the stylized-3D anime identity.

**Who this is for:** the designer implementing round 1. Every value below is a
number to type in. Where a value is a *starting point* rather than a measurement,
it says so; where I could not verify something, it says that too.

**Write scopes used:** `preview.html`, `palette.js`, `post.js`, `petal-field.js`,
`index.js`. Nothing else. One required fix lives outside that list — two deleted
lines in `sky.js` (§0.1, Appendix C.0) — and is parked in Appendix C for the
Lead's approval, together with the `port/*` items.

---

## 0. Evidence — what is actually wrong

Measured from the pixels (script: one-off, not committed), reference 1774×887 vs
current `reports/look/anime-01-gameplay.png` 1400×900:

| Quantity | Reference | Current render | Verdict |
|---|---|---|---|
| Visible skyline (far meadow crest), % of frame height | **30–33 %** | **45–46 %** | horizon is ~14 % too low → sky too tall, land too shallow |
| Sky at top of frame | `#5398e3` (hue 211, sat 0.63) | `#0141bf` (hue 220, sat **0.99**) | far too dark and saturated — a navy hole caused by the shader's double linearisation, not by post (§0.1) |
| Sky 10 % down | `#6eb0ef` | `#2a62c6` | same |
| Near grass | `#608456` / `#5e824e` (hue **101–107**, sat 0.35–0.40) | `#94a765` / `#879e66` (hue **77–85**) | ~20° too yellow, ~0.1 too bright |
| Far meadow | `#c7cfa3`, lum 0.79, sat 0.21 | fogged band, lum ~0.6 | distance is neither pale nor hazy enough |
| Distant hills | `#bfd0ea` (cool blue, sat 0.18) | `#cbd0d2` (grey, sat 0.03) | dead grey, not blue |
| Tree line | bases ≈ 33 %, tops ≈ 12 % | bases ≈ 50 %, tops ≈ 29 % | trees are in the *near* field and the skyline is behind them |
| Tree contact shadow | soft dark ground under each trunk | none (kit sets `castShadow=false`) | trees float |

**Two root causes, and they are the whole job:**

1. **The camera is not where `preview.html` says it is.** `VIEWS.gameplay` asks for
   `pos y = 1.85`, `target y = 3.20` (a 2.3° *upward* pitch). `OrbitControls.maxPolarAngle = 0.497π`
   clamps any camera below its target, so at runtime the camera is silently lifted
   to **y = 3.52** and the pitch becomes 0.5° *down*. The framing in the file has
   never been rendered. Fixing the framing is a camera change, not a scene change.
2. **The sky dome double-linearises its colours.** `sky.js` calls
   `linearColor(hex)` (which already converts sRGB→linear) and then applies
   `pow(col, 2.2)` again in both the dome and the cloud fragment shaders. That is
   the navy hole. The ridge layers do not do it — which is exactly why the hills
   read correctly while the sky does not. Fix: **two lines removed in `sky.js`**
   (out of my original write scope — see Appendix C.0; the designer has already
   proved it live).

Everything below assumes both are fixed. Do them first; the rest is tuning.

**Read §0.1 before touching `post.js`.** An earlier version of this plan blamed a
double tone map in the composer and asked for `toneMapInGrade:false` plus a gain
stage. Both were wrong and are retracted there.

---

## 0.1 Retraction — round 1, after the designer's live test

Two claims in the first revision were wrong. Both were disproved by a live test,
not by argument. They are recorded here so they cannot quietly come back.

**Retracted claim 1 — "the composer path tone-maps twice."** I wrote that terrain
and sky apply ACES in-shader, write linear into the composer target, and the grade
applies ACES again; I then built the previous revision's §3.1 (`toneMapInGrade:false`)
and §3.2 (`uGain` 0.92) on that premise. **Wrong.** In three r170, in-shader tone
mapping is only
enabled when drawing to the canvas: `WebGLPrograms.getParameters` sets
`toneMapping: currentRenderTarget === null ? renderer.toneMapping : NoToneMapping`.
Inside the composer's RenderPass `currentRenderTarget` is the HDR target, so every
material writes **raw linear** and the grade's ACES is the **only** tone map.
`uToneMap` stays **1**; `toneMapInGrade` must not be added; there is no duplicate
to remove and therefore **no `uGain`**.

The test that killed it: setting `uToneMap = 0` live lightened the frame because it
removed the *legitimate* tone map, not a duplicate. A brightness change was never
evidence of a duplicate — that was my error.

**Retracted claim 2 — "the navy sky is the pipeline's fault."** Also wrong. The
dome and cloud shaders double-linearise (`linearColor()` then `pow(…, 2.2)`); the
ridges do not, so the hills look right and the sky does not. Removing the two
`pow` lines in `sky.js` took the top-of-frame sky from **`#0140bf` to `#5a9dcd`**
against the reference's `#5398e3`. That is the fix, and it is a scene-shader fix,
not a post fix.

**What survives unchanged:** the camera diagnosis and numbers (§1), the sky/fog
measurement table (§0), the petal/carpet triangle analysis (§5), the
contact-shadow analysis (§6), the budget (Appendix B), and the acceptance test
(§7). **What changes:** §2.2 (keep the sky hexes), all of §3 (no pipeline change,
no gain — the grade is now only a grade), Appendix A, Appendix C.

---

## 1. Camera & composition

### 1.1 `gameplay` view — exact numbers

In `game/handoff/map-bg/preview.html`, `VIEWS`:

```js
gameplay: { pos: [-1.5, 2.45, 20.0], target: [-1.5, 1.02, 8.0], fov: 50 },
```

Derived, so you can check it rather than trust it:

- eye height above the meadow floor (`heightAt = 0.75`): **1.70 m** ✔ brief
- pitch: `atan((2.45 − 1.02) / 12.0)` = **6.8° down**
- distance to the feature tree line (`z = −36.5`): **56.5 m**
- true horizon: `0.5 − 6.8/50` = 36.4 % of frame height
- visible crest (terrain rises from `z = −75` to `y = 5.4` at `z = −120`): +1.3°,
  so the **crest lands at ≈ 34 %** of frame height
- tree canopies: tops **≈ 16 %**, bases **≈ 40 %**
- nearest visible ground: **≈ 4.0 m** in front of the lens

I verified this framing by rendering the live scene at these numbers (the same
numbers with `x = 0`): the crest landed at **32–34 %**, canopy tops at **16–17 %**,
bases at **36–40 %**, no tree cropped at the top. `x = −1.5` shifts the path to
the right of centre like the reference; if the path reads better centred, use
`x = 0` — that variant is the one I saw rendered.

### 1.2 Two things that will silently break it

- **`maxPolarAngle`.** Leave it at `0.497π` **only because the new view looks
  down** (polar 83.2° < 89.5°). Add a comment: any future view whose target is
  above the camera will be clamped and the numbers in `VIEWS` will lie.
- **Do not raise `controls.target` above the camera.** Same trap.

### 1.3 The other presets (cheap consistency)

```js
eye:    { pos: [-3.2, 2.45, 24.0], target: [-3.2, 1.02, 12.0], fov: 50 },
shrine: { pos: [0, 2.45, -22.0],  target: [0, 2.30, -36.0],  fov: 50 },
```
`aerial` and `lake` can stay as they are.

### 1.4 Composition rules the numbers must satisfy

- Sky = **top third** (crest at 33–36 %). Not 45 %.
- **No canopy touches the top edge**; the left and right edge trees may be
  half-cropped, exactly like the reference.
- The path is a **continuous tan ribbon** from the bottom edge to the tree line.
  With the camera at `x = −1.5` the path runs right-of-centre and curves away —
  that is the reference's read.
- The near flower clumps sit in the **mid-ground band (35–55 % of frame height)**,
  not in the lens. At `z = 20` they are 15–25 m away and read as a band.

---

## 2. Light & sky

### 2.1 Sun — fix the direction, not just the intensity

Today the sky's sun sits at azimuth **2.32 rad** (left, behind the camera) while
the ported vegetation is baked against `REFB_SHARED_UNIFORMS.uSunDir = (0.58, 0.74, 0.34)`
(right, behind). The two disagree by ~100° of azimuth, which is why nothing reads
as lit. Make the sky agree with the vegetation: **upper right, behind the viewer**
(front-lit scene, no visible disc in frame — exactly the reference).

`palette.js`, `MEADOW_LIGHT`:

```js
sunAzimuth: 0.53,     // rad; = atan2(0.34, 0.58) — matches the ported uSunDir
sunElevation: 0.78,   // rad = 44.7°; ported ramp wants high sun, shadows stay short
sunIntensity: 2.20,
hemiIntensity: 0.85,
ambientIntensity: 0.10,
exposure: 1.12,       // unchanged; the grade's ACES still owns exposure (see §3)
```

`sun` colour: `#fff6e2` (warm white — **not** cream-yellow, **not** orange).
Shadow direction on the ground is then `(−0.86, −0.50)` in (x,z): away and to the
left, which is what §6's contact shadows follow.

### 2.2 Sky hexes — **leave them alone**

Do **not** retune the sky palette. Every value below was authored against the
shader's double linearisation (§0.1), so once the two `pow` lines are removed
(Appendix C.0) they land where they were meant to. The designer's live test
confirms it: with the hexes untouched, the fixed shader gives `#5a9dcd` at the top
of frame against the reference's `#5398e3`.

| key | value | action |
|---|---|---|
| `skyZenith` | `#3d86cf` | **keep** |
| `skyMid` | `#86cff0` | **keep** |
| `skyHorizon` | `#eef2fb` | **keep** |
| `skySunGlow` | `#fff0c2` | **keep** (the glow is behind the camera) |
| `cloudLight` | `#ffffff` | **keep** |
| `cloudShadow` | `#cbdcef` | **keep** |
| `fog` | `#d9e2f2` | **keep** (see §2.3 — only the fog *distances* change) |

Only if, after the `sky.js` fix and one render, the top of frame falls outside
`#4f8fdc`–`#6aa8e2`, tune `skyZenith` — then, with the fixed shader, and not
before. Tuning it against the broken shader is what produced the `#4a92dd` value
in the previous revision of this plan; that value is withdrawn.

**Acceptance:** top-of-frame sky within ±10 % of `#5398e3`; nothing in the top
25 % darker than `#2f6fbf`. Watch the horizon band after the fix — it brightens
with everything else and must stay a pale blue-white in the `#c7d3e0`–`#eef2fb`
range, not clip to pure white.

### 2.3 Fog — aerial perspective (distances only)

`palette.js`:

```js
fogNear: 55,
fogFar: 320,
```

Colour stays `#d9e2f2` — it is also the sky's horizon-band colour and was tuned
with it (§2.2). Only the ramp changes.

Why: at 55 m nothing fogs (the tree line stays crisp and saturated, like the
reference); at 120 m the far meadow is ~25 % hazed; at 175–295 m the ridge layers
are already haze-baked in `sky.js`. `near: 35 / far: 210` was tried and washes the
tree line out — do not use it.

Fog reaches **only built-in materials** (terrain, water, rocks). The ported
grass/flowers/trees are custom shaders with no fog chunk, so they will *not* cool
with distance. That is the honest limit of this write scope; see Appendix C.

---

## 3. Post

### 3.1 Do not change the pipeline

There is **no** post-pipeline change in this plan. `uToneMap` stays **1**,
`uEncode` stays **1**, `displayReferred` stays `false`, and no `toneMapInGrade`
option and no `uGain` uniform are added. See §0.1: the composer's RenderPass
writes raw linear (three r170 disables in-shader tone mapping for render
targets), so the grade's ACES is the only tone map and it is correct. The navy sky
is fixed in `sky.js` (Appendix C.0), not here.

The only edits in `post.js` are the bloom constants and the grade values below.
**If you find yourself adding an exposure or gain stage, stop — that is the
retracted gain stage coming back.**

### 3.2 Bloom

```js
bloomStrength: 0.50,
bloomRadius:   0.85,
bloomThreshold: 0.62,
```

Threshold operates on the raw linear HDR buffer, so 0.62 catches the pale horizon
band, cloud tops, petal edges and the flower highlights, and leaves grass and
path alone. Verified direction: at 0.85 only the clouds glow (too selective); at
0.46 (current) the whole sky blooms. Expect ±0.05 of tuning after the `sky.js`
fix, because that fix raises the sky's linear values.

### 3.3 Grade uniforms (`post.js`, sRGB space)

These are round-1 taste values, not measurements. The grade now acts on exactly
the same buffer as today (one ACES), so move `uSaturation`/`uContrast` by ±0.03
only if the critic asks.

| uniform | current | new | note |
|---|---|---|---|
| `uSaturation` | 1.12 | **1.05** | the greens are already saturated; pastel, not neon |
| `uContrast` | 0.99 | **1.04** | pivot stays 0.48 |
| `uLift` | 0.02 | **0.025** | shadows stay blue-green, never black |
| `uWarmHigh` | `(1.012, 1.006, 1.0)` | **`(1.004, 1.000, 0.994)`** | effectively neutral; warmth comes from the sun, not the grade |
| `uCoolShadow` | `(0.955, 0.975, 1.045)` | **`(0.966, 0.986, 1.024)`** | gentler, so shadows don't go cyan |
| `uVignette` | 0.14 | **0.10** | frame the eye, don't tunnel it |
| haze colour (hard-coded `vec3(1.0,0.965,0.90)`) | cream | **`vec3(0.88, 0.93, 1.00)`** | lavender-white |
| haze amount (hard-coded `0.045`) | 0.045 | **0.035** | |

### 3.4 What the grade must NOT do

- **No yellow/warm cream in the highlights or the haze.** `uWarmHigh` must stay
  within ±0.006 of neutral; the haze vector's blue must be its largest channel.
- No film grain, no chromatic aberration, no DOF, no sharpen, no channel-wise
  contrast. One composer, bloom + one grade pass, full stop.
- **No exposure or gain stage** — retracted, see §3.1.
- Do not touch hue. If the greens still read yellow after §4, the fix is the
  palette, not a hue-rotation in the shader.
- Do not clamp the bloom before the grade (it is already HDR-clamped at 64).

---

## 4. Palette (`palette.js`)

**Read this first:** `palette.js` drives the **terrain ground plane, sky, fog,
water, rocks and the three ridge layers**. It does **not** reach the ported grass
tufts, flowers or trees — those bake `REFB_PALETTE` / their own tree ramp (see
Appendix C). So these are *ground* colours chosen to sit next to a warm yellow-green
tuft palette: cooler and slightly darker, so the tufts read as sunlit tips on a
cooler meadow. That is the reference's relationship too.

### 4.1 Grass ramp — cooler (hue ~100 instead of ~76) and a touch darker

| key | current | new |
|---|---|---|
| `grassBase` | `#a9c97c` | **`#8fae70`** |
| `grassWarm` | `#c6df8c` | **`#a8c483`** |
| `grassCool` | `#8fb98a` | **`#7ea383`** |
| `grassShadow` | `#5b8a74` | **`#4e7a68`** |
| `grassTip` | `#d2e88c` | **`#c6dd97`** |
| `moss` | `#5a876f` | **`#50796a`** |

### 4.2 Path / dirt — desaturate, take the orange out

| key | current | new |
|---|---|---|
| `dirt` | `#bc9d6c` | **`#b7a077`** |
| `path` | `#b09a72` | **`#ab9675`** |
| `pathEdge` | `#9a855e` | **`#937f63`** |
| `pathWet` | `#8d7850` | **`#86735a`** |

### 4.3 Distance — cool and pale (this is the aerial perspective)

| key | current | new |
|---|---|---|
| `hillNear` | `#82b096` | **`#7fa79b`** |
| `hillMid` | `#a6c6b0` | **`#9dbdc0`** |
| `hillFar` | `#c6dbd6` | **`#bcd3dd`** |
| `ridgeFar` | `#b9d2d6` | **`#aecbdd`** |

### 4.4 Canopy — declared but unreachable here

Target for the record: leaves `#5d8a63` shadow / `#74a566` mid / `#a6cc74` sunlit /
`#d2e6a2` tip; blossom `#c9a8ef` mid / `#efe0ff` tip. **`MEADOW.canopy*` is not
read by the trees** (kit builds them with `createAnimeFlowerTree({...})` and no
palette), so editing those keys changes nothing on screen. The reachable version
is Appendix C.2 — needs approval.

### 4.5 Do not change

`water*`, `stone*`, `flower*` (they feed terrain speckle only), `pollen`.
Keep the three-tones-per-family rule.

---

## 5. Petals (`petal-field.js` + `index.js` defaults)

Today: **520** petals (near 10 / mid 70 / far 180 / carpet 260) = **97.4 k tris**.
The carpet layer is 260 detailed petals flat on the ground under trees 50 m away —
invisible, and it is 9 % of the triangle budget. Kill it.

### 5.1 Counts and sizes

`index.js`:

```js
petalCounts = { near: 14, mid: 64, far: 160, carpet: 0 },
```

`petal-field.js`, `addLayer` size ranges:

| layer | count | scale | material |
|---|---|---|---|
| near | 14 | **1.6 – 2.8** (was 1.1–1.9) | soft sprite, opacity **0.55** |
| mid | 64 | 0.40 – 0.70 | crisp geometry |
| far | 160 | 0.10 – 0.20 | soft sprite, opacity 0.5 |
| carpet | 0 | — | removed |

Total **238 petals**, ≈ **19 k tris** (down from 520 / 97.4 k). That is "a few
hundred" and it buys the contact shadows in §6 with room to spare.

### 5.2 Near-layer placement — currently mostly off-screen

The near layer is camera-relative: `ox ∈ [−2.6, 2.6]`, `oy ∈ [−1.0, 2.0]`,
`oz ∈ [−6.5, −2.2]`. At 3–5 m depth, ±2.6 m is ±33° — outside the 36° half-FOV
once the camera pitches down, so the big soft petals sit at the frame edges and
the bottom third stays empty. Change to:

```js
st.ox = range(rand, -1.55, 1.55);
st.oy = range(rand, -1.55, 0.10);   // biased to the bottom third
st.oz = range(rand, -5.0, -1.8);
```

### 5.3 Motion — one wind, curved, no explosion

```js
windDir = [0.90, 0, 0.25],   // left→right, slightly toward the camera
WIND_SPEED = 0.85,           // m/s (was 0.55)
```
Per-petal: `swirlSpeed 0.18–0.45 rad/s`, `swirlR 0.6–2.6` (keep), `swayAmp 0.35–0.80`,
`fall 0.10–0.22` (floatier). Keep the existing swirl+sway composition — it is
already curved; the problem was speed and direction, not shape. One wind vector
for all layers; never radial.

### 5.4 Colours

Keep the three types; adjust so they read pastel, not candy:

| id | weight | base | tip |
|---|---|---|---|
| `meadow-lilac` | 0.50 | `#f7b8d3` (pink) | `#fff0f8` |
| `meadow-sage` | 0.32 | **`#d9c2f5`** (lilac, was `#cbb0ee`) | `#f6efff` |
| `meadow-cream` | 0.18 | **`#fff4d8`** (was `#f6efd2`) | `#fffdf4` |

---

## 6. Grounding — contact shadows

Cheapest correct cue, and the one anime backgrounds actually use: **one instanced
soft ellipse per tree, in `index.js`.**

- 28 quads (`PlaneGeometry(1,1)` rotated −90° about x), **2 tris each = 56 tris**,
  **1 draw call**, `InstancedMesh`, `MeshBasicMaterial` with a 128×128 canvas
  radial-gradient alpha map (`rgba(0,0,0,1)` centre → transparent edge),
  `color: #35543f`, `opacity: 0.30`, `transparent: true`, `depthWrite: false`,
  `polygonOffset: true, polygonOffsetFactor: -1`.
- One instance per `kit.treeAnchors` entry (28), `y = heightAt(x,z) + 0.02`.
- Scale: **7.0 m** along the shadow axis × **4.5 m** across, scaled by the tree's
  own scale if you have it. Rotation: align the long axis with the ground shadow
  direction **`(−0.86, −0.50)`** (x,z), and offset the centre **1.0 m** along that
  direction so the ellipse sits under the canopy, not the trunk.
- Only trees with `|x| < 80 && z > −80` (the flat meadow floor); beyond that the
  ground rises and the flat quad will clip.

Then reclaim the dead shadow pass: `sky.sun.castShadow = false` in `index.js`
(the 2048² map is allocated today and nothing casts into it).

**Optional, only if the ellipses are not enough:** set `castShadow = true` on the
three feature trees at `z ≈ −36` and leave the rest. Do not enable it on the whole
kit — that is a second pass over ~700 k tris.

---

## 7. Acceptance test — 5 things a critic can check in the render

Render with:
`node game/handoff/map-bg/shoot.mjs "http://127.0.0.1:4173/game/handoff/map-bg/preview.html" "reports/art/round-1/gameplay.png" gameplay 1400 900 16000`

1. **Horizon at ~34 %.** On the 1400×900 frame, the far meadow crest is between
   **y = 297 and y = 324**. Sky occupies the top third; land the bottom two thirds.
   (Current: y ≈ 410.)
2. **Sky is blue, not navy.** Top-of-frame sky within ±10 % of `#5398e3`; no pixel
   in the top 25 % darker than `#2f6fbf`. The horizon band is pale (`#c7d3e0` or
   lighter) and **not cream/yellow**.
3. **Trees are framed and grounded.** No canopy touches the top edge; canopy tops
   sit at **14–22 %** of frame height and tree bases at **36–42 %**. Under every
   near tree there is a visible dark soft ellipse on the grass.
4. **The path leads in.** A continuous tan ribbon runs from the bottom edge to the
   tree line, visible for at least 70 % of its length, with the near flower clumps
   in the mid-ground band (35–55 %) rather than in the lens.
5. **Distance is cooler and paler than the near field.** Near-field grass renders
   at hue **88–100°** (green, not yellow-green) and saturation ≥ 0.30; the far
   meadow is **lighter** (lum ≥ 0.72) and **less saturated** (sat ≤ 0.22) than the
   near field; the distant ridge is visibly bluer than the near grass.

Also check (not a pass/fail on its own): ≥ 6 petals of ≥ 40 px diameter in the
bottom third, drifting left→right; no petal cluster in the sky band.

---

## Appendix A — order of work

1. `preview.html`: camera numbers (§1) + comment on `maxPolarAngle`.
2. **`sky.js`: remove the two `pow(…, 2.2)` lines** (§0.1, Appendix C.0) — needs
   the Lead's approval; already proven live by the designer. Render before and
   after; this alone should take the sky from `#0140bf` to `#5a9dcd`.
3. `post.js`: bloom + grade values only (§3.2–3.3). No pipeline edits.
4. `palette.js`: fog distances + grass/path/distance hexes (§2.3, §4). Leave the
   sky hexes alone (§2.2).
5. `petal-field.js` + `index.js`: counts, near placement, wind, colours (§5).
6. `index.js`: contact-shadow decals + `sun.castShadow = false` (§6).
7. Render round 1, write `IMPLEMENTED-1.md` with the numbers you used and any
   deviation from this plan.

Steps 1–2 alone should move the render more than the rest combined. Do not skip
straight to palette tuning — and do not "fix" the sky in `post.js` (§3.1).

## Appendix B — budget

| item | tris |
|---|---|
| gameplay view today | 1,008,214 |
| remove carpet petals (−260) | −76,440 |
| mid 70→64, far 180→160 | −1,804 |
| near 10→14 (planes) | +8 |
| contact shadows (28 quads) | +56 |
| **after** | **≈ 930,000** |

Headroom under the 1.05 M ceiling: **≈ 120 k**. Draw calls: petals 12→9, +1 decal.

## Appendix C — needs the Lead's approval (out of my write scope)

These are the honest limits. None of them blocks round 1; each would close a
remaining gap.

**C.0 `sky.js` — remove the double linearisation (highest priority, already
proven).** In both `SKY_FRAG` and `CLOUD_FRAG`, the line
`col = pow(clamp(col, 0.0, 1.0), vec3(2.2));` (around lines 145 and 307) must go.
The uniforms are already linear (`linearColor()` converts sRGB→linear on the way
in), so the `pow` is a second conversion. This is why the sky is a navy hole and
the ridges — which do not `pow` — look right. The designer's live test: top of
frame `#0140bf → #5a9dcd` (reference `#5398e3`). `sky.js` is outside my original
write scope, so this needs the Lead's approval; it is two line deletions and no
other value in the file changes.

**C.1 Ported grass is ~20° too yellow and ~15 % too bright** (`port/refb-kit.js`,
`REFB_PALETTE`). The reference grass is hue 101–107; the ported ramp is hue 77–79.
Exact change if approved:

```js
grassSunBright: 0xbfd986,   // was 0xc1dc79
grassSunMid:    0xa9c97c,   // was 0xb5d372
grassRootSun:   0x86ae6c,   // was 0x8cb566
grassShadeMid:  0x527f75,   // was 0x598975
grassShadeDeep: 0x45706a,   // was 0x49776e
```

**C.2 Tree canopy palette** — the trees build with no palette argument, so
`MEADOW.canopy*` is dead. Reachable without touching `port/` by traversing
`kit.group` in `index.js` and setting the leaf material uniforms
(`uLeafShadow`, `uLeafMid`, `uLeafSunlit`, `uLeafTip` — verified names in
`port/anime-flower-tree.js:445-449`) to `#3f6f5a / #6f9f66 / #a8cf74 / #d6e9a0`.
10 lines in a file I may edit, but it changes the ported look — ask first.

**C.3 Aerial perspective on the trees.** The ported tree/grass materials have no
`fog` chunk, so distant trees never cool. The reference's key trick (everything
past ~80 m drifts toward the sky colour) cannot be done from the current write
scope. Options, in order of cost: a fog chunk in the ported material; a per-tree
distance tint at build time; or accept it — at 56 m the tree line is the "near"
field and the ridges already carry the haze.

**C.4 Near-field ground detail.** The bottom third is a smooth terrain plane with
sparse tufts. The reference has dense blades at the bottom edge. That is
`kit.js` grass density / a near-field grass ring, out of scope. The near petals
in §5 cover part of it.

## Appendix D — how to verify without guessing

- Shoot at 1400×900 with the command in §7; judge the actual pixels, not this doc.
- For the horizon number, overlay a 1-px line at y = 306 (34 %) — the crest should
  sit on it. Do not eyeball percentages from a thumbnail.
- For colour checks, sample a 12-px patch with any image tool and compare hex; the
  targets are in §0 and §7.
- Toggle `P` to see the render without post. The post-on and post-off frames must
  not diverge in *hue* — only in bloom, contrast and vignette. If post-off is
  yellow and post-on is not (or vice versa), the grade is doing the palette's job.
