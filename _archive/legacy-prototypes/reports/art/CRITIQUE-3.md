# CRITIQUE-3 — Sunpetal Vale, round 3

**Critic:** art-critic (independent; did not produce the render, the plan or the report).
**Judged:** `reports/art/round-3/` — `gameplay.png`, `gameplay-clean.png`, `eye.png`,
`shrine.png`, `lake.png` — at native resolution plus 2×–3× crops of the near field,
the canopy, the petals and the horizon, against
`game/handoff/map-bg/concepts/ref-lavender-meadow.png`.
**Method:** the same instruments as CRITIQUE-1 and CRITIQUE-2, unchanged, so all
three rounds and the reference are directly comparable. The petal fill and blob that
`IMPLEMENTED-3` left unverified are measured below.

---

## 1. Verdict: **FAIL — narrowly, and this is now a finish problem, not a design problem**

Round 1 was broken on content. Round 2 was broken on colour. Round 3 has the
composition, the palette and the frame. What is left is **shading depth and fine
detail**: every element is a flat-shaded polygon with a hard edge, so the scene
reads as a well-composed **paper collage** rather than a painting.

That is a much better failure to have, and two of the three items from CRITIQUE-2
are genuinely fixed: the near field's colour is now within 3.5° of the reference,
and the trees are no longer neon or speckled with black. The horizon has ridges.
The path is warm. The eye view has a foreground.

**Would I ship it?** Not against this brief. Against a lower bar — "a coherent,
attractive stylised low-poly meadow" — yes, comfortably. The brief targets the
reference painting, and this is not yet that. See §5 for exactly what one more
round has to change; it is a short list and it is not composition or colour.

| quantity (instruments unchanged) | reference | round 1 | round 2 | round 3 |
|---|---|---|---|---|
| Near-band median colour | `#708c55` (hue 90.5) sat 0.380 val 0.557 | `#83a276` (103) | `#95916d` (81) | **`#728956` (87)** ✔ |
| Near-band horizontal gradient | **0.0235** | 0.0021 | 0.0100 | **0.0086** ✘ |
| Near-band "detail" coverage | 32.2 % | 6.5 % | 36.3 % | **36.1 %** ✔ |
| Near-grass value range (p5–p95) | **0.498** | — | 0.349 | **0.306** ✘ |
| Blossom sat / val | 0.375 / 0.827 | 0.572 / 0.906 | 0.479 / 0.878 | **0.284 / 0.863** |
| Leaf sat / val | 0.304 / 0.678 | 0.606 / 0.761 | 0.589 / 0.714 | **0.276 / 0.722** |
| Near-black px in tree band | 0.09 % | 0.22 % | 1.76 % | **0.00 %** ✔ |
| **Canopy value range (p5–p95)** | **0.365** | — | 0.149 | **0.094** ✘✘ |
| Ridge, right side | visible, cool blue | none | white band | **`#b2bfcb` val 0.796 sat 0.15** ✔ shape |
| Path colour at y 85 % | `#847a57` hue 48 | none | `#948c6c` hue 54 sat 0.23 | **`#88794e` hue 48 sat 0.43** ✔ |
| Path width at y 85 % | 88 px | — | 343 px | **208 px** ✘ |
| Largest connected petal blob | **14 173 px²** | 876 | 2 453 | **2 492** ✘ |
| Petal fill sat / val | 0.227 / 0.914 | — | 0.157 / 0.800 | **0.15–0.28 / 0.69–0.92** |
| Global mean saturation | 0.340 | 0.325 | 0.305 | **0.329** ✔ |
| Global luminance std | 0.143 | 0.099 | 0.126 | **0.124** |
| Triangles (gameplay) | — | 944 702 | 994 870 | **961 548** ✔ |

---

## 2. What improved since round 2

1. **The near field's colour is fixed.** Median `#728956` against the reference's
   `#708c55` — hue 87 vs 90.5, sat 0.372 vs 0.380, val 0.537 vs 0.557. On a
   like-for-like measure (hue of the median colour, not the median of hues) this is
   **within 3.5° of the reference** and the saturation and value are within 0.02.
   The near field is now the right green. Do not re-tune it again.
2. **The trees are no longer neon and no longer speckled with black.** Blossom sat
   0.479 → 0.284, near-black pixels **1.76 % → 0.00 %**, darkest tree pixel
   val 0.122 → 0.424, hard-green 11.0 % → **0 %**. The double-linearisation fix
   worked. The `rawColor` correction is the right diagnosis and it should stay.
3. **The horizon has ridges on both sides now.** The right-hand band measures
   `#b2bfcb` val 0.796 sat 0.15, where round 2 had a white void. The height-floor
   fix worked.
4. **The path's colour is right.** `#88794e` hue 48 sat 0.43 against the reference's
   `#847a57` hue 48 sat 0.34. Warm dirt, not grey sand. Width is still wrong (§3),
   but the colour is done.
5. **The eye view has a near field.** Bottom-30 % coverage 3.85 % → 36.3 % on my
   instrument (the designer's stricter instrument: 12.37 %). The taper also
   **removed the hard straight seam** that was round 2's worst regression — the
   eye and lake foregrounds now thin out gradually instead of ending on a line.
   That was the right fix and it should be kept.
6. **Global saturation recovered**: 0.305 → 0.329 against the reference's 0.340.
7. **The shrine and lake canopies** are now soft lavender masses rather than
   green-violet noise. The lake view in particular is a pleasant composition.
8. **Budget improved**: 961 548 tris (from 994 870), inside the 1.01 M ceiling.

---

## 3. The three worst remaining things, ranked

### 3.1 The trees are flat pale lavender — the canopy has 4× less value range than the reference

**What I see.** Every canopy is a uniformly pale lavender mass of flat polygon
petals with a few pale mint leaves. There is no interior shadow, no dark side, no
sunlit rim — the canopy is the same value all over, so it reads as **crumpled
tissue paper** rather than a lit volume. The trunks are the most saturated thing on
the tree now: bright tan-orange, which pulls the eye away from the blossom.

**Where.** `y ≈ 140–340`, every tree; worst in `shrine.png` where the canopy fills
the frame.

**Measured.** Blossom value **p5–p95 range 0.094** against the reference's **0.365**
— the canopy is **3.9× flatter** than the reference. (Round 2 was 0.149, so the
shading range *fell* this round even as the neon was fixed.) Blossom sat 0.284
against the reference's 0.375 — now **under**-saturated, over-corrected. Leaf val
0.722 against the reference's 0.678 — the mint leaves are too bright.

**Why it hurts.** The trees are the highest-contrast objects in the frame and the
thing a viewer's eye lands on. The reference's canopy is a soft mass with a dark
interior and bright tips — that value range is what makes it read as blossom in
light. Removing the double-linearisation removed the black speckle *and* the
shading, and nothing replaced the shading. This is now the single biggest reason
the scene does not look beautiful.

### 3.2 The near field is the right colour but still flat and paper-like

**What I see.** The bottom 40 % is a dense field of **large flat sage-green
ribbons** with hard, aliased edges — individual blades 60–150 px long, all
smooth-shaded, all the same tone, arranged in visible star rosettes. There are dark
gaps between blades now (an improvement), but the blades themselves have no
gradient, no bright sunlit tip, and no fine variation. It reads as a **paper-cut
meadow**. There is also a bare green wedge in the bottom-right corner where the
patch taper thins the grass out.

**Where.** Full width, `y ≈ 560–900`; the bare wedge is `x ≈ 1150–1400, y ≈ 800–900`.

**Measured.** Colour is right (§2.1) but: horizontal gradient **0.0086** against the
reference's **0.0235** — still **2.7× flatter**, and *down* from round 2's 0.0100.
Grass value range (p5–p95) **0.306** against the reference's **0.498**, and the
bright end collapsed: p95 **0.757** against the reference's **0.925**. The reference
has bright sunlit tips; the render's brightest grass is 0.757. Across the whole
bottom 30 %, **2.33 %** of pixels have medium edge contrast (grad > 0.10) against the
reference's **10.35 %** — the render has **less than a quarter** of the reference's
fine edge detail. That is the paper-collage signature, quantified.

**Why it hurts.** It is 38 % of the frame. The colour being right is necessary but
not sufficient: a meadow reads as grass because of *many small, high-contrast,
varied edges*, and this has few, large, smooth ones.

### 3.3 The petals are flat hard-edged paper confetti — too few, too small, too crisp

**What I see.** About eight visible petals, all **crisp flat polygons with hard
edges**: a mauve pentagon at frame (480–545, 492–552), a pale pink notched shape at
(785–840, 500–555), a **near-white** shard at (555–595, 575–615), a lavender polygon
at (780–845, 442–480), plus thin edge-on slivers. They read as **coloured paper
stickers** floating in the air, not as petals — and at 1–3 m from the lens they
should be the *softest* things in the frame, not the hardest.

**Where.** Scattered across `y ≈ 440–620`, concentrated centre.

**Measured** (the item `IMPLEMENTED-3` left unverified): largest connected pink blob
**2 492 px²** against the reference's **14 173 px²** and the round-3 target of
**6 000** — **FAIL, and essentially unchanged from round 2's 2 453**. The blob count
≥ 30 px fell from 86 to **4**. Petal fill sits at sat 0.15–0.28 / val 0.69–0.92
against the target sat 0.25–0.40 / val 0.80–0.90 — partly met, but the white one is
still sat **0.085** (near-white), so the "no grey/white shards" fix is incomplete.

**Why it hurts.** The reference uses big soft foreground petals as a depth cue — the
single largest blob is 14 173 px², roughly 120×120 px, and it is *out of focus*.
Round 2's soft blurred lens petal was closer to that read; round 3 replaced it with
a crisp polygon because the plan argued "a crisp petal at the lens reads as a petal;
the blurred sprite reads as a smudge". The pixels disagree: at the lens, crisp reads
as **paper**. This is a plan decision worth reversing.

---

## 4. Regressions — things that got worse in round 3

1. **Canopy value range collapsed: 0.149 → 0.094** (reference 0.365). The
   double-linearisation fix removed the black speckle *and* the shading. The trees
   are now flatter than they have ever been, and flatter than the reference by 4×.
   This is the round's most damaging regression.
2. **Blossom saturation over-corrected: 0.479 → 0.284**, now *below* the reference's
   0.375. Round 2 was too neon; round 3 is too washed out. The target is 0.375, not
   "as low as possible".
3. **Leaf value went the wrong way: 0.714 → 0.722** against a 0.55–0.65 target. The
   mint leaves are too bright.
4. **Near-field fine detail fell: gradient 0.0100 → 0.0086**, grass value range
   0.349 → 0.306. Merging the two passes into one with bigger tufts (scale 0.60–1.10
   replacing the 0.55–0.85 fine pass) traded detail for seam removal. The seam fix
   was right; the detail loss was the cost and it needs to be bought back.
5. **Shrine foreground detail fell: 16.29 % → 13.00 %**, and the ground there is
   darker now. The shrine camera sits at `z = −22`, outside the near-pass box
   (`z −2…16.5`), so it has no near field at all — a smooth dark-green plane with
   sparse rosettes, visible in `shrine-bottom.png`.
6. **Lens petals went from soft to crisp** (plan §5). The soft sprite read as a
   smudge; the crisp polygon reads as paper. Neither is right, but paper is further
   from the reference's out-of-focus petals.
7. **Petal count ≥ 30 px: 86 → 4.** Fewer visible petals than round 2, and far fewer
   than the reference's 413.
8. **Bottom-right bare wedge** in gameplay (`x 1150–1400, y 800–900`) — the taper
   zone is visible as a smooth dark-green corner.

---

## 5. Does it clear the "a player would screenshot this and think it looks beautiful" bar?

**No.** It clears "a player would screenshot this and think it's a nice low-poly
meadow". It does not clear "beautiful" in the reference's sense. The difference is
not composition and not colour — both are now right — it is that **nothing in the
image has a soft edge or a value gradient**. Everything is a flat polygon.

**What one more round would have to change — in order:**

1. **Give the canopy its value range back.** Target p5–p95 **≥ 0.30** (now 0.094).
   That means a real light/shadow term on the blossom shader — a darker interior
   (toward `#7a5aa8`), a brighter sunlit rim (toward `#e6d8ff`), and a shadow
   multiplier for petals facing away from the sun. This is the single change that
   would move the image most.
2. **Give the grass bright sunlit tips and finer blades.** Target grass p95
   **≥ 0.88** (now 0.757) and gradient **≥ 0.016** (now 0.0086). Halve the blade
   width and double the count inside the same triangle budget; add a tip highlight
   to the blade ramp.
3. **Make the near petals soft and big.** Target largest blob **≥ 6 000 px²** at
   **sat 0.25–0.40**, with a soft alpha falloff (a 16–24 px feather, not a 5 px
   sprite ramp and not a hard polygon). Roughly 1.6× the current scale.
4. **Raise fine edge density.** Medium-contrast edge pixels **2.33 % → ≥ 6 %**
   (reference 10.35 %). This comes from more small elements — small flowers, finer
   blades, clover — not from more large polygons.
5. Then the small stuff: shrine near field, path width, sky saturation.

If items 1–3 land, it clears the bar. If only 1 lands, it will look considerably
better and probably still not "beautiful".

---

## 6. Fixes for round 4, with numbers

### Fix 1 — canopy shading range (highest impact)
- Target blossom value range **p5–p95 ≥ 0.30** (now 0.094), sat **0.34–0.40** (now
  0.284 — raise it back, do not leave it at the over-corrected value).
- Add a shadow term: petals whose normal faces away from the sun multiply toward
  `#7a5aa8` (val ~0.55); sunlit faces toward `#e6d8ff` (val ~0.95). In the ported
  tree shader this is a `dot(N, sunDir)` ramp — the leaf shader already has one;
  the blossom shader needs the same.
- Leaves: val 0.722 → **0.60–0.65**; sat 0.276 → 0.30–0.35.
- Trunks: desaturate the tan-orange toward `#8a7a6a` so the blossom is the
  most-saturated thing on the tree again.

### Fix 2 — near grass: bright tips, finer blades
- Grass p95 **0.757 → ≥ 0.88**: add a highlight colour at the blade tip
  (`#c8e6a0`-family, hue ~95, val ≥ 0.90) and make the tip a larger fraction of the
  blade.
- Gradient **0.0086 → ≥ 0.016**: halve the tuft scale (0.60–1.10 → 0.35–0.65) and
  double the count inside the same triangle budget. The fine pass was deleted to fix
  the seam; bring its *scale* back without its separate box.
- Keep the taper — it fixed the seam and should not be undone.
- Fill the bottom-right bare wedge: reduce the taper start from 2.5 m to 1.2 m, or
  extend the box `x ±14 → ±16`.

### Fix 3 — petals: soft, big, coloured
- Largest blob **2 492 → ≥ 6 000 px²**: scale the lens petals ×1.6.
- Restore **softness**: an alpha-feathered edge (16–24 px) on the lens layer, or a
  sprite with a much wider ramp than 5 px. Crisp polygons at the lens read as paper.
- Fill **sat 0.15–0.28 → 0.25–0.40**; kill the near-white one (sat 0.085) by
  lowering its emissive further or darkening its base.
- Raise the visible count toward the reference's ~20: the reference has **413 blobs
  ≥ 30 px** against the render's **4**.

### Fix 4 — shrine view near field
The shrine camera at `z = −22` is outside the near-pass box. Extend the box or add a
second near patch for the shrine (`z −40…−18`), or accept that the shrine view is a
mid-ground view and put the grass there.

### Fix 5 — path width
208 px at `y = 85 %` against the reference's 88 px. Width **1.0 → 0.5–0.6 m** (the
designer's own arithmetic: reaching 80–110 px needs ≈ 0.5 m). Colour is correct —
do not touch it.

### Fix 6 — sky (unchanged since round 2, still short)
Clear sky `#68a4d5` sat 0.512 val 0.835 against the reference's `#66a9ec` sat 0.568
val 0.925. Raise the sky ramp's chroma and value: `skyZenith #1a6bcc → #0f63cc`,
`skyMid #5aa2e0 → #4f9ee4`. Target sat ≥ 0.55, val ≥ 0.88.

### Fix 7 — contact shadows
Still not unambiguously readable. The near grass now provides dark gaps that may be
masking or mimicking them, and the designer's own A/B was inconclusive. Either
commit to the baked terrain-AO approach (a wide soft dark patch in the terrain
vertex colour within ~3 m of each trunk, which reads through blades) or drop the
feature and say so. Do not tune the 12 × 8 decal a third time.

---

## 7. Claims in `IMPLEMENTED-3.md` that need correcting

1. **"Near band hue 60 / sat 0.345 / val 0.455 — FAIL, hue went the wrong way."**
   **Does not reproduce.** On `gameplay-clean.png` I measure median `#728956`
   (hue **87**, sat 0.372, val 0.537) and mean `#79945e` (hue 90, sat 0.361,
   val 0.580). Neither is `#74744c`. The reported number looks like it was taken
   over a region dominated by the path or the shadowed ground. **The near-field
   colour actually passes** — hue 87 vs the reference's 90.5, sat 0.372 vs 0.380,
   val 0.537 vs 0.557. This matters because the report records a FAIL that would
   send a planner back to re-tune a colour that is already correct.
2. **"Petal fill / largest blob — UNVERIFIED."** Now verified: largest connected
   blob **2 492 px²** against the 6 000 target — **FAIL**, effectively unchanged from
   round 2 (2 453). Fill sat 0.15–0.28 / val 0.69–0.92, partly met; the white petal
   is still near-white (sat 0.085). The designer was right not to claim a pass.
3. **"Max row step cannot pass while the path has an edge."** Fair — my own
   instrument is contaminated by the path and shoreline too. What matters is that
   the *visible* seam from round 2 is gone; I confirmed that by eye in the eye and
   lake foregrounds. The metric should be replaced, not chased.
4. **"Leaf val 0.777 — FAIL (too bright)."** Confirmed: 0.722 by my measure, still
   above the 0.55–0.65 target.
5. **"Blossom sat 0.348 — PASS."** Confirmed directionally (0.284 by my measure,
   which is *lower* than reported), but note that it is now **below the reference's
   0.375** — the pass is an overshoot, not a match.
6. **The report's "what still looks wrong" list is accurate and honest**, including
   the cotton-candy canopy and the near-grass regression. Credit for that.

---

## 8. The reference-vs-render gap, in one sentence

Round 3 finally has the reference's **composition and palette** — the right green
meadow, the right warm path, lavender blossom, blue hills — but not its **light**:
every element is a flat-shaded polygon with a hard edge and no value gradient, so the
scene reads as a well-composed paper collage where the reference is a luminous
painting.

---

## Bottom line for the planner

Do not touch the camera, the path layout, the lily band, the near-field colour, the
tree colour pipeline or the seam taper — all of those are now right. Round 4 is
**shading and edge softness**, in this order: (1) give the canopy a real light/shadow
range (0.094 → ≥0.30), (2) give the grass bright tips and half-size blades
(p95 0.757 → ≥0.88, gradient 0.0086 → ≥0.016), (3) make the near petals soft and
1.6× bigger (2 492 → ≥6 000 px²). If those three land, this clears the bar.
