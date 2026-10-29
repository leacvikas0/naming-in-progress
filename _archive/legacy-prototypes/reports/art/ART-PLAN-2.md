# ART-PLAN-2 — Sunpetal Vale, round 2 (content, not tuning)

**Round 1 fixed the frame.** Camera, sky hue, green hue and the post chain are right —
`CRITIQUE-1` says do not re-tune them. Round 2 fills the frame: grass in the near
field, mountains on the horizon, lilies and canopies pulled back, petals out of the sky.
Every item is file → value → acceptance. Write scopes: `kit.js`, `terrain.js`
(approved by the Lead this round), plus `palette.js`, `post.js`, `petal-field.js`,
`index.js`, `preview.html`. `sky.js` needs a 3-number approval — see §8.

Do not change: camera, grade uniforms, `uSaturation`/`uContrast`, petal colours,
grass hue (all PASS in CRITIQUE-1).

---

## 1. Near field — 6.5 % → ≥ 25 % detail coverage (critic Fix 1)

**Root cause, in the code:** `kit.js:301` `clearingMask(x,z) = smoothstep(26,14,dist from origin)`
gives the camera's near field `tall = 0`, so `scale ×0.95` and `sy ×0.78` — the shortest,
flattest grass on the map is exactly where the lens is. The lake view gets 27.8 %
because it stands outside the clearing. Fix by adding a dedicated near pass that
ignores the clearing, not by raising the global count.

### 1a. Near-field pass — `kit.js`, after the main grass loop (~line 354)

```js
const nearCount = 900;
for (let i = 0; i < nearCount; i++) {
  const x = -11 + random() * 22;          // ±11 m
  const z = -2 + random() * 13.5;         // z −2 … 11.5  (3.5 … 16 m in front of the camera)
  if (pathDistance(x, z) < 0.9) continue; // keep the path corridor clear
  const variant = random() < 0.5 ? 0 : random() < 0.6 ? 1 : 2;
  grassPlacements[variant].push({
    x, y: heightAt(x, z), z,
    yaw: random() * TAU,
    tiltX: (random() - 0.5) * 0.10,
    tiltZ: (random() - 0.5) * 0.10,
    scale: 1.20 + random() * 0.40,        // was 0.66–1.12 in the clearing
    sy:    1.15 + random() * 0.25,        // was 0.78 × 0.9–1.25  → stands up
  });
  placed += 1;
}
```

They join the existing per-tile instanced meshes, so **no new draw calls** and they
use the full LOD (all within 24 m).

### 1b. Framing fringe — `kit.js`, immediately after

40 tall blades at **1.5–3 m from the lens**, variant 1, scale `1.8–2.4`, `sy 1.5`,
`x ∈ [−7, 7]`, `z ∈ [11.0, 12.5]`, reject `pathDistance < 1.0`.
**Do not use the critic's `z = 11.5–13.5`.** With the camera at `z = 14` (y 2.45),
pitch 6.8° down and `fov 50`, the bottom edge of frame is `1.70 − 0.62·d` metres above
the meadow floor: **1.08 m at d = 1 m, 0.46 m at 2 m, 0.15 m at 2.5 m** (the ray meets
the ground at 2.74 m). At 0.5 m in front nothing under 1.4 m tall can be seen; at
1.5–3 m a 0.9–1.3 m blade clearly crosses the bottom edge. (Check: the fringe must be
visible in the bottom 40 px.)

### 1c. Variation — same loop

Three size classes instead of one stamp: multiply `scale` by `0.85`, `1.0`, `1.15`
picked per instance; `yaw` already random. This kills the "uniform rosette" read.

### 1d. Ground albedo — `palette.js`

The near field renders `#83a277` (sat 0.269, val 0.635); reference `#6f8b55`
(sat 0.380, val 0.549) — 16 % too bright, 29 % under-saturated. Darken and saturate
the *ground plane* (the tufts stay light on purpose — dark base, bright tips):

| key | now | new |
|---|---|---|
| `grassBase` | `#8fae70` | **`#6f9455`** |
| `grassWarm` | `#a8c483` | **`#88ab63`** |
| `grassCool` | `#7ea383` | **`#6d9179`** |
| `grassShadow` | `#4e7a68` | **`#446b5a`** |

**Acceptance (measure on `gameplay-clean.png`, bottom 30 %):** detail coverage
**25–32 %** (was 6.5 %); mean horizontal gradient ≥ 0.015 (was 0.0021); median colour
`#6f8b55` ±0.04 val, sat ≥ 0.33. If coverage > 40 %, cut `nearCount` to 600 — that is
a hedge, not a meadow. **Tris: +63,000 + 2,800.**

---

## 2. Horizon — kill the white haze wall (critic Fix 2)

**The bleaching stage is in `sky.js`, and it is not fog.** `ridgeMat` has `fog:false`,
so `fogNear/fogFar` never touches the ridges — do not change them. The culprit is
`buildRidgeGeometry`:

```js
const top = linearColor(color).lerp(linearColor(fogColor), haze);
const bot = top.clone().lerp(linearColor(fogColor), 0.82);   // <-- 82 % white
```

Every ridge is a curtain from `y = −40` to `y = 20/32/46`; from eye level we see its
**bottom**, which is 82 % `fog #dde8ef`. That is the `#e1e4e5` wall. Three numbers fix it.

### 2a. `sky.js` (approval — §8)

- `bot`: `lerp(fogColor, 0.82)` → **`0.22`**
- `haze` per ridge: `0.06 / 0.20 / 0.40` → **`0.03 / 0.12 / 0.26`**

Leave `bottom: -40` and the radii/heights alone — the lower half of each curtain is
hidden by terrain and the visible band is coloured correctly once `bot` is fixed.

### 2b. `palette.js` — darken the two farthest ramps

| key | now | new |
|---|---|---|
| `ridgeFar` | `#aecbdd` | **`#93aec9`** |
| `hillFar` | `#bcd3dd` | **`#a4bed4`** |
| `hillMid` | `#9dbdc0` | **`#8fb0bd`** |

### 2c. `post.js` — stop bloom lifting the pale band

`bloomThreshold 0.62 → 0.72`, `bloomStrength 0.50 → 0.42` (also kills the ~150 px
halo on the top cloud). If the band still sits above val 0.85, the bloom is not the
cause — the `bot` lerp is; do not tune bloom further.

**Acceptance:** in the band `y 8–30 %` there are **three distinct ridge values**,
each a readable silhouette (step ≥ 0.05 val between bands); the far band measures
**sat 0.12–0.20, val 0.72–0.82** (now 0.012 / 0.89); toggling `P` changes the band
by < 0.02 val.

---

## 3. Lilies and canopies (critic Fix 4 + 5)

### 3a. Lilies — `kit.js`

- Clump scale: `0.85 + rand*0.45` → **`0.48 + rand*0.18`** for `z > −30` (caps height
  at 1.3–1.8 m, was 2.5–3 m). Keep `0.85 + rand*0.45` for `z ≤ −30` — the tree-line
  band reads well and stays.
- Hero clumps at `z ≈ 5.5` (line ~439): `1.15 + rand*0.4` → **`0.62 + rand*0.22`**.
- Central thinning: reject with 55 % probability when `|x| < 10 && z > −32`.
- Stamen: before the geometries are built (~line 266), override the shared palette —
  same pattern as the existing `REFB_SHARED_UNIFORMS` writes:
  `REFB_PALETTE.stamenGold.setStyle("#f2e2b0"); REFB_PALETTE.stamenOrange.setStyle("#e2c890");`

### 3b. Canopy — `index.js` (after `createMeadowKit`, before `scene.add`)

Leaves have uniforms; blossom and bark are baked vertex colours, so use both routes:

```js
kit.group.traverse((o) => {
  const u = o.material && o.material.uniforms;
  if (u && u.uLeafMid) {                       // flowerTreeLeaves: leaf shader
    u.uLeafShadow.value.setStyle("#3f6f5a");
    u.uLeafMid.value.setStyle("#6f9f66");
    u.uLeafSunlit.value.setStyle("#a8cf74");
    u.uLeafTip.value.setStyle("#d6e9a0");
  }
  // flowerTreeFlowers / flowerTreeBark bake their ramp into vertex colours and
  // expose no colour uniform, so rewrite the attribute. Name test on purpose:
  // the ported grass/flower/rock materials also use vertexColors and must NOT
  // be touched by this loop.
  if (/flowerTree(Flowers|Bark)/.test(o.name) && o.geometry) {
    const c = o.geometry.getAttribute("color");
    if (!c) return;
    for (let i = 0; i < c.count; i++) {        // values are linear
      const col = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i));
      col.convertLinearToSRGB().offsetHSL(0, -0.18, 0.03).convertSRGBToLinear();
      c.setXYZ(i, col.r, col.g, col.b);
    }
    c.needsUpdate = true;
  }
});
```

Blossom coverage: `anime-flower-tree.js` `flowerCount` is per-tree and not in scope —
instead thin the leaf cards so blossom dominates: pass `leafCount` in `kit.js`'s
`TREE_LOD` `hero 4600 → 3000`, `full 900 → 650`, `low 500 → 380`.

**Acceptance:** blossom sat **≤ 0.42**, val 0.80–0.86; leaf sat **≤ 0.45**, val 0.55–0.65;
saturated-green pixels in the tree band **≤ 4 %** (now 14.3 %); tallest near lily
**≤ 1.8 m** and the path + tree bases visible between clumps in `x 350–1000`.

---

## 4. Petals — out of the sky, and one at the lens (critic Fix 3 + 6)

The grey shards **are petals** — verified by A/B: hide the nine `petals:*` meshes and
they vanish. Cause: the `far` layer spawns at `y 0.6–12` and the `mid` layer at
`y 0.8–8.5`, so petals sit at canopy height against the pale horizon; `MeshLambertMaterial`
lights them from behind, so the sunless face renders grey-mauve.

`petal-field.js`:

- **Hard ceiling:** no petal above `y = 5.0`. `far`: `y ∈ [0.6, 5.0]` (was 0.6–12);
  `mid`: `y ∈ [0.8, 4.2]` (was 0.8–8.5). Recycle to the same ceiling.
- **No grey possible:** in `MEADOW_PETALS`, `emissiveIntensity 0.20/0.18/0.16 → 0.38`
  and emissive `#ffc0dc → #ffcfe2`, `#d4c0f0 → #e2d2f8`, `#fff6dc → #fff8e6`.
  A petal's darkest possible pixel is then its own pastel.
- **Lens petals:** a fifth layer `lens` — 5 petals, **soft** sprite material (5 px ramp),
  `opacity 0.58`, world-space at `z ∈ [11.0, 12.8]` (1.2–3 m from the lens),
  `y ∈ [1.55, 2.15]`, `x ∈ [−3, 3]`, `scale 0.25–0.35`. At 2–3 m that projects to
  120–170 px, i.e. the reference's 14,000 px² blob. Out-of-focus without a DOF pass.
  Take the 5 from `foreground` (14 → 9) so the total stays 238. Cost: +3 draw calls,
  +1,450 tris, −1,450 from foreground — net zero.

**Acceptance:** with `petals` hidden and shown, **no pixel above the horizon changes**
by more than 6/255; largest petal blob ≥ **6,000 px²** (now 876); no petal-shaped
pixel anywhere above the crest darker than `#c9a8c8`.

---

## 5. Sky value (critic Fix 8) — `palette.js`

Clear sky is 11 % too dark: `#5492cb` val 0.796 vs reference `#66a5e5` val 0.898.

| key | now | new |
|---|---|---|
| `skyZenith` | `#0052b4` | **`#0a5fc4`** |
| `skyMid` | `#3888d2` | **`#4a95dc`** |

**Acceptance:** clear-sky patch `x 1050–1350, y 40–90` (no cloud): val **0.86–0.92**,
hue 208–214, sat 0.50–0.60.

---

## 6. Contact shadows — `index.js`

The mechanism is right; it is occluded by the lily band (§3a) and too faint.
`opacity 0.34 → 0.50`, `color 0x35543f → 0x2f4a3a`, size `8.0 × 5.0 → 9.0 × 6.0`.
No new geometry.

**Acceptance:** a dark ellipse ≥ **40 px** wide is readable under at least **3** of
the near trees in `gameplay-clean.png`, at least 0.08 val darker than the grass 2 m
in front of it.

---

## 7. Path — `terrain.js` + `palette.js` (critic Fix 7)

- `DEFAULT_SPOKES[0]`: `{ from: [0, 6], to: [0, −31], width: 3.0 }` →
  **`{ from: [0, 12], to: [0, −31], width: 3.4 }`** — the camera at `z = 14` sees the
  bottom edge at `z ≈ 11.3`, so the ribbon now crosses it. `pathDistance` feeds `kit.js`,
  so §1's grass automatically keeps off it.
- Edge, `terrain.js:352`: `smoothstep(3.4, 0.1, pd) * 0.30` →
  **`smoothstep(1.6, 0.05, pd) * 0.45`** (halved falloff = an edge, not a smudge).
- `palette.js`: `pathEdge #937f63 → #7d6a52`.

**Acceptance:** the path is continuous from the bottom edge to the tree line; its edge
gradient width ≤ 25 px at `y 700`; the near-field grass does not grow in the corridor.

---

## 8. Budget and approvals

| item | tris |
|---|---|
| gameplay now | 944,702 (headroom 105,298) |
| near tufts 900 × 70 | +63,000 |
| fringe 40 × 70 | +2,800 |
| lens petals (5 moved, not added) | ±0 |
| lilies 58→40/pocket + central thinning | −100,000 to −150,000 |
| tree leaf cards 4600→3000 / 900→650 / 500→380 | −8,600 |
| **projected** | **≈ 865,000–915,000** |

Hard check: gameplay view ≤ **1,010,000** tris. If it is over, cut `nearCount` in
200s — never the lilies (they are the composition fix).

**Approval needed — `sky.js`, §2a:** two numbers (the `bot` lerp `0.82 → 0.22` and three
`haze` values). This is the only way to get three distinct ridges; without it the best
palette-only result is a single blue band, because `bot` can never be darker than
`0.82 × fog` no matter what hex you author.
Optional in the same file if approved: 4–6 additional clouds at 30–55 m size, `baseY 18–34`,
spread over the sky band (the current two are both in the top 12 %, one cropped).

---

## 9. Round-2 acceptance, in the critic's units

| metric | now | target |
|---|---|---|
| bottom 30 % detail coverage | 6.5 % | **25–32 %** |
| bottom 30 % horizontal gradient | 0.0021 | **≥ 0.015** |
| bottom 30 % median colour | `#83a277` sat 0.269 | **`#6f8b55`-family, sat ≥ 0.33** |
| ridge band sat / val | 0.012 / 0.89 | **0.12–0.20 / 0.72–0.82**, 3 bands |
| blossom sat / leaf sat | 0.585 / 0.607 | **≤ 0.42 / ≤ 0.45** |
| hard-green pixels in tree band | 14.3 % | **≤ 4 %** |
| largest petal blob | 876 px² | **≥ 6,000 px²** |
| clear sky val (y 4–10 %) | 0.796 | **0.86–0.92** |
| path continuous bottom → tree line | no | **yes** |
| readable contact shadows | 0 | **≥ 3** |
| triangles, gameplay | 944,702 | **≤ 1,010,000** |
