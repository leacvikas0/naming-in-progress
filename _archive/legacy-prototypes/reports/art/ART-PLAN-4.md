# ART-PLAN-4 — round 4: shading depth (final)

Only the three things the critic says stand between this and the bar, plus two
placement notes. **Do not touch** the camera, the near-field colour, the tree colour
pipeline, the path colour, the seam taper or the ridge values. Budget: **961,548 /
1,010,000 — 48,452 to spend.** All items net **+40,810**.

---

## 1. Canopy value range — p5–p95 0.094 → ≥0.30

**File:** `game/src/map/port/anime-flower-tree.js`, flower fragment shader (~line 545).

The ramp already exists but is (a) far too narrow and (b) wrong on backfaces. Replace
the tint block:

```glsl
vec3 norm = normalize(mix(vFaceNormal, vClusterNormal, 0.65));
if (!gl_FrontFacing) norm = -norm;                       // NEW: petals are DoubleSide
float ndl = dot(norm, uSunDir) * 0.5 + 0.5;
float lightFactor = smoothstep(0.05, 0.85, ndl);         // was 0.18–0.75
vec3 shadowCol = mix(vColor * 0.55, vec3(0.478, 0.353, 0.659), 0.65); // → #7a5aa8
vec3 sunlitCol = mix(vColor,        vec3(0.902, 0.847, 1.000), 0.60); // → #e6d8ff
vec3 finalCol  = mix(shadowCol, sunlitCol, lightFactor);
```

Values are display-referred (the shader still `pow(…, 2.2)`s), so `#7a5aa8` is
`(122,90,168)/255` and `#e6d8ff` is `(230,216,255)/255`.

**Leaf depth back:** the leaf shader is too bright, not too flat —
`uLeafSunlit #a8cf74 → #86ab5e`, `uLeafTip #d6e9a0 → #a8c47c`, and `tipBright 0.18 → 0.10`.

**Trunks:** in the bark palette at the top of the builder, replace the tan-orange with
`#8a7a6a` (mid) / `#6e5f52` (dark), authored through the existing `rawColor()`.

**Acceptance:** blossom value **p5–p95 ≥ 0.30** (now 0.094), sat **0.34–0.40**
(now 0.284); leaf val **0.55–0.65** (now 0.722), sat 0.30–0.35; trunk is no longer the
most saturated thing on the tree. In `shrine.png` the canopy shows a dark interior and
a lit rim.

---

## 2. Near grass — bright tips, half-size blades, gradient ≥0.016

**File:** `kit.js` (+ one `palette.js`-style override), no hue changes.

- **Tip highlight (p95 0.757 → ≥0.88):** override the shared palette before the tuft
  geometries are built, exactly like the round-3 grass override:
  `REFB_PALETTE.grassSunBright.setRGB(0xb8/255, 0xe6/255, 0x9c/255)` (`#b8e69c`, hue 97,
  sat 0.32, val 0.90). The ramp runs base→tip, so this lifts the tip and upper blade
  without moving the base; the band median stays in its 0.55–0.58 window.
- **Half-size blades (gradient 0.0086 → ≥0.016):** do **not** shrink the coverage pass
  again — that is what lost the detail in round 3. Keep the 2,600 full tufts at
  `scale 0.60–1.10`, and add a **fine layer: 1,200 `lowGrassGeos` tufts (24 tris) at
  `scale 0.30–0.50`, same box, same taper** — half-size blades, 2.4× the instance
  count, +28,800 tris.
- **Bare wedge bottom-right** (`x 1150–1400, y 800–900`): taper start `2.5 m → 1.2 m`
  and box `x ±14 → ±16`. Both are free; the wedge is the taper eating the near corner.
- Keep the taper itself and the box's `z −2…16.5`.

**Acceptance:** grass **p95 ≥ 0.88** (now 0.757), value range p5–p95 **≥ 0.42**
(now 0.306), band horizontal gradient **≥ 0.016** (now 0.0086), median hue still
**85–92** (measured 87 — do not re-tune it), no bare wedge in the bottom-right corner.

---

## 3. Near petals — soft, 1.7× bigger, blob ≥ 6,000 px²

**File:** `game/src/map/petal-field.js`. **Reverse the round-3 crisp-lens decision** —
the critic is right, a crisp polygon at the lens reads as paper.

- `lens` layer: back to the **soft sprite** (`detailed:false, soft:true`), and widen its
  feather: the canvas blur `5 px → 16 px` (a 16 px alpha falloff at 256², not the 5 px
  ramp and not a hard edge).
- Scale `0.25–0.35 → 0.42–0.60` (×1.7 linear; the critic asked ×1.6 — 1.7 covers the
  ~10 % of the blob the wider feather takes back. Area ×2.9 → 2,492 → ~7,200 px²).
- `foreground` 9 → **14** petals (more blobs ≥ 30 px: 4 → ~15), taken from `far`
  (160 → 140, they are 2–6 px and contribute nothing).
- Kill the near-white one: `meadow-cream` base `#fff4d8 → #ecd9a8` (sat 0.29), emissive
  stays 0.22. No petal may render below sat 0.25.

**Acceptance:** largest connected blob **≥ 6,000 px²** (now 2,492); petal fill
**sat 0.25–0.40**, val 0.80–0.90; no petal with sat < 0.20; ≥ 12 blobs ≥ 30 px.

---

## 4. Two placement notes (cheap)

- **Shrine near field (16.29 % → 13.00 %).** The shrine camera at `z = −22` is outside
  the near box. Add a **second patch**: `x ±12, z −40…−18`, **500 `lowGrassGeos` tufts**
  at `scale 0.40–0.70`, tapered over 1.2 m at every edge, `pathDistance < 0.9` rejected.
  **+12,000 tris.** Acceptance: shrine bottom-30 % coverage back to ≥ 16 %.
- **Gameplay wedge:** covered by §2 (taper 1.2 m, `x ±16`).

---

## 5. Budget

| item | tris |
|---|---|
| now | 961,548 |
| fine grass layer 1,200 × 24 | +28,800 |
| shrine patch 500 × 24 | +12,000 |
| petals: foreground 9→14 (+1,450), lens soft (−1,440), far 160→140 (−40) | ≈ 0 |
| **projected** | **1,002,358** (slack 7,642) |

If the low tuft measures 30 tris, the total is 1,012,558 — 2,558 over. In that case cut
the fine layer to 1,000 and the shrine patch to 400: 1,003,548. If anything else is over,
cut `far` petals first (they are invisible), then the fine layer in 200s.

## 6. Acceptance, one line each

| metric | now | target |
|---|---|---|
| canopy blossom value p5–p95 | 0.094 | **≥ 0.30** |
| blossom sat | 0.284 | **0.34–0.40** |
| leaf val | 0.722 | **0.55–0.65** |
| grass p95 | 0.757 | **≥ 0.88** |
| grass value range p5–p95 | 0.306 | **≥ 0.42** |
| near-band gradient | 0.0086 | **≥ 0.016** |
| largest petal blob | 2,492 px² | **≥ 6,000 px²** |
| petal fill sat | 0.085–0.28 | **0.25–0.40** |
| shrine bottom-30 % coverage | 13.00 % | **≥ 16 %** |
| triangles | 961,548 | **≤ 1,010,000** |
