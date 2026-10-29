# ART-PLAN-3 — Sunpetal Vale, round 3 (colour and surface)

Composition is done — do not move the camera, the path layout, the lily band or the
grass patch shape again except where §1 says. Round 3 is colour and surface, in the
critic's order. **Budget is 15,130 tris of headroom** (994,870 / 1,010,000), so every
add below is offset; the table in §6 nets out.

**Correction to record:** the round-2 report's "largest petal blob ≈ 24,000 px² PASS"
does not reproduce. On a connected-blob measure — the one the reference's 14,067 px²
came from — the largest is **2,453 px²**. "Max run × rows" is not a blob area. The
≥ 6,000 px² target is **not met**; §5 fixes it and the report should say so.

---

## 1. Near field — hue 81 → 95–105, val 0.592 → 0.55–0.58, sat 0.299 → ≥0.36, gradient 0.0100 → ≥0.016

Three levers, in this order of impact. All in `kit.js` + `palette.js`.

### 1a. Move the grass ramp's hue, not just its value — `kit.js`

The tufts are hue **78**; darkening them keeps them yellow-green and the band median
never reaches 98. **The critic's suggested `#a8c47a` / `#b5cf83` are hue 80–83 and do
not fix this.** Hue needs G much closer to R. Override the shared palette before the
tuft geometries are built (same pattern as the round-2 stamen override — `setRGB`,
**not** `setStyle`, because `REFB_PALETTE` is display-referred):

```js
REFB_PALETTE.grassSunBright.setRGB(0x9c/255, 0xc4/255, 0x7c/255); // #9cc47c  hue 93
REFB_PALETTE.grassSunMid.setRGB(   0x8f/255, 0xb9/255, 0x6f/255); // #8fb96f  hue 94
REFB_PALETTE.grassRootSun.setRGB(  0x6f/255, 0x94/255, 0x55/255); // #6f9455  hue 95
REFB_PALETTE.grassShadeMid.setRGB( 0x47/255, 0x70/255, 0x5c/255); // #47705c
REFB_PALETTE.grassShadeDeep.setRGB(0x3a/255, 0x5c/255, 0x50/255); // #3a5c50
```

The last two are the **dark gaps**: the tuft's base ramp (`colBaseSun/Shd`) now ends
at val 0.58/0.36 instead of 0.70/0.55, so blades separate instead of merging into a
pale mass. This is the free half of the gradient fix.

### 1b. Saturate and darken the ground — `palette.js`

| key | now | new |
|---|---|---|
| `grassBase` | `#6f9455` | **`#5f8f4a`** |
| `grassWarm` | `#88ab63` | **`#7d9f57`** |
| `grassCool` | `#6d9179` | **`#5f8668`** |
| `grassShadow` | `#446b5a` | **`#3c5f50`** |

### 1c. Seam + eye-view coverage — `kit.js`

The near pass is a world box `x ±11, z −2…11.5`. Its front edge projects to a straight
line at y ≈ 560 in `eye`/`lake`/`shrine` (row step 0.0135 / 0.0295), and from the
`z = 18` eye camera the nearest tufts are 6 m away.

- Box → **`x ±14, z −2…16.5`** (the eye camera at z = 18 then has grass 1.5 m ahead).
- **Taper over the last 2.5 m of every edge** — replace the hard box test with:
  ```js
  const edge = Math.min(14 - Math.abs(x), z + 2, 16.5 - z);
  if (random() > smoothstep(0, 2.5, edge)) continue;
  ```
- **Merge the two passes into one:** `nearCount 2600`, `scale 0.60–1.10` (was 1800 @
  0.8–1.15 plus a separate 600 @ 0.55–0.85 — the split is why the seam has a density
  step as well as a colour step). Delete the fine pass.
- Fringe: 40 → **28** blades (they now sit inside a dense pass; 40 is wasted tris).

**Acceptance:** band (y ≥ 630) median **hue 95–105, sat ≥ 0.36, val 0.55–0.58**;
horizontal gradient **≥ 0.016**; **no row-to-row step > 0.006** in the lower half of
any of the five views; eye-view bottom-30 % coverage **≥ 25 %** (now 3.85 %).

---

## 2. Canopy — the builder, not a traverse

**Root cause found.** Both tree shaders end with
`gl_FragColor = pow(clamp(col,0,1), 2.2)` — they expect **display-referred** uniforms —
but the JS passes `new THREE.Color(hex)`, which ColorManagement converts sRGB→linear.
Every leaf and blossom colour is therefore linearised twice: bright tips survive,
dark shadows crush to near-black. That is the 1.76 % near-black speckle **and** the
acid-lime leaves in one bug.

### 2a. `port/anime-flower-tree.js` — feed display-referred colours

Add one helper and use it everywhere a colour becomes a uniform or a baked attribute:

```js
const rawColor = (hex) => new THREE.Color().setRGB(
  ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
```

- Leaf uniforms (line ~375): `uLeafShadow #5b8a63`, `uLeafMid #6f9f66`,
  `uLeafSunlit #a8cf74`, `uLeafTip #d6e9a0` — all via `rawColor`.
- Blossom palette (line ~76): `stamen #f2e2b0`, `throat #9a78cc`, `mid #b48fdd`,
  `tip #d9c6ef` — via `rawColor` (these are the defaults; `flowerPalette` stays a
  supported override and must use `rawColor` too).
- **New `flowerScale = 1.6` option**, applied at line ~577:
  `dummy.scale.setScalar(randRange(0.85, 1.42) * flowerScale)`. Blossom area ×2.56 for
  **zero triangles** — this is the lever for hard-green, not `flowerCount`.
- `TREE_LOD.leafCount` in `kit.js`: `3000/650/380 → 2600/600/350`.

### 2b. `index.js` — delete the traverse

Remove the `uLeafMid` uniform override **and** the vertex-colour `offsetHSL` loop. The
builder now owns every tree colour; the traverse was double-applying a desaturation and
cannot reach the shader's `pow`. Nothing else in `index.js` changes.

**Acceptance:** blossom sat **≤ 0.42** (now 0.492), val 0.80–0.86; leaf sat **≤ 0.45**
(now 0.602), val 0.55–0.65; hard-green **≤ 4 %** (now 11.0 %); near-black pixels in the
tree band **≤ 0.4 %** (now 1.76 %); darkest tree-band pixel **val ≥ 0.20** (now 0.122).

---

## 3. Horizon — val 0.84 → ~0.745, and a ridge on the right

### 3a. `palette.js` — darken the ramps (in scope)

| key | now | new |
|---|---|---|
| `ridgeFar` | `#93aec9` | **`#7f9cba`** |
| `hillFar` | `#a4bed4` | **`#8faec6`** |
| `hillMid` | `#8fb0bd` | **`#7ea3b2`** |

### 3b. `sky.js` — 6 numbers, same file approved in round 2 (confirm)

- per-ridge `haze` `0.03 / 0.12 / 0.26` → **`0.02 / 0.08 / 0.18`**.
- **The right half has no ridge because the ridge is too low there, not missing.**
  `buildRidgeGeometry`'s height floor is `Math.max(height * 0.16, h)` and the height
  function dips to that floor at some azimuths; at 175 m a 3.2 m ridge top is 1.05°
  above the eye, which the far terrain crest (5.4 m at 120 m, 1.3°) occludes. Raise
  `height 20/32/46 → 26/40/56` and the floor `0.16 → 0.34`.

**Acceptance:** ridge band **val 0.72–0.78, sat 0.15–0.25** (now 0.84), three distinct
steps of ≥ 0.04 val; a visible ridge silhouette in `x 900–1400, y 20–30 %`.

---

## 4. Path — 300 px → 80–110 px, and warm it

- `terrain.js`: `DEFAULT_SPOKES[0].width 1.7 → 1.0`; shoulder blend
  `smoothstep(1.6, 0.05, pd) * 0.45 → smoothstep(0.7, 0.02, pd) * 0.55`.
- `palette.js`: `path #ab9675 → #9e814c`, `dirt #b7a077 → #a88a55`,
  `pathEdge #7d6a52 → #6f5c3e`. Author for **hue 39, sat 0.52** (the reference's
  `#947e56` is hue 39, sat 0.42); the renderer desaturates ~25 % and darkens ~10 %, so
  the albedo has to sit one notch warmer and more saturated than the target pixel.

**Acceptance:** path width at `y = 85 %` is **80–110 px** (now ~300); rendered colour
hue **35–45, sat 0.38–0.45** (now hue 54, sat 0.23); the bottom-30 % median returns to
green (§1 + §4 together — the path is why it went tan).

---

## 5. Petals — un-blow the shards, give the lens petal a silhouette

`petal-field.js`:
- `emissiveIntensity 0.38 → 0.22`, and set each type's `emissive` to **its own base**
  (`#f7b8d3` / `#d9c2f5` / `#fff4d8`) instead of `#ffcfe2` / `#e2d2f8` / `#fff8e6`.
  The near-white emissive is what washed the fill to sat 0.095.
- `lens` layer: soft sprite → **crisp `createBlossomGeometry`**, `opacity 0.92`,
  scale 0.25–0.35 unchanged. A crisp petal at the lens reads as a petal; the blurred
  sprite reads as a smudge.

**Acceptance:** petal fill **sat 0.25–0.40, val 0.80–0.90** (now 0.095 / 0.91–0.94);
largest connected blob **≥ 6,000 px²** on the critic's blob measure (now 2,453).

---

## 6. Budget

| item | tris |
|---|---|
| gameplay now | 994,870 (headroom 15,130) |
| near pass 2,400 → 2,600 (one pass) | +14,000 |
| fringe 40 → 28 | −840 |
| lens petals soft → crisp (5 × 290) | +1,440 |
| leaf cards 3000/650/380 → 2600/600/350 | −6,800 |
| `flowerScale 1.6` (area, not count) | ±0 |
| **projected** | **≈ 1,002,670** |

Hard check ≤ **1,010,000**. If over: cut the fringe to 16, then `nearCount` in 200s.
Do not cut the tree blossoms — they are the hard-green fix.

## 7. Round-3 acceptance, one line each

| metric | now | target |
|---|---|---|
| near band hue / sat / val | 81 / 0.299 / 0.592 | **95–105 / ≥0.36 / 0.55–0.58** |
| near band horizontal gradient | 0.0100 | **≥ 0.016** |
| max row step, lower half, any view | 0.0295 (shrine) | **≤ 0.006** |
| eye-view bottom-30 % coverage | 3.85 % | **≥ 25 %** |
| blossom sat / leaf sat | 0.492 / 0.602 | **≤0.42 / ≤0.45** |
| hard-green / near-black in tree band | 11.0 % / 1.76 % | **≤4 % / ≤0.4 %**, darkest val ≥0.20 |
| ridge val / sat | 0.84 / — | **0.72–0.78 / 0.15–0.25**, ridge on the right |
| path width / hue / sat | 300 px / 54 / 0.23 | **80–110 px / 35–45 / 0.38–0.45** |
| petal fill sat / largest blob | 0.095 / 2,453 px² | **0.25–0.40 / ≥6,000 px²** |
| triangles | 994,870 | **≤ 1,010,000** |
