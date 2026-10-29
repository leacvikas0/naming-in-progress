# CRITIQUE-2 — Sunpetal Vale, round 2

**Critic:** art-critic (independent; did not produce the render, the plan or the report).
**Judged:** `reports/art/round-2/` — `gameplay.png`, `gameplay-clean.png`, `eye.png`,
`shrine.png`, `lake.png` — at native resolution plus 2×–3× crops of the near field,
the tree line, the horizon, the lens petals and the row where the grass stops —
against `game/handoff/map-bg/concepts/ref-lavender-meadow.png`.
**Method:** I re-ran the **same instrument as CRITIQUE-1** on the round-2 PNGs, so
round-1 → round-2 → reference numbers are directly comparable. Where
`IMPLEMENTED-2` used a different instrument I say so and give both.

---

## 1. Verdict: **FAIL — but narrowly, and for a different reason than round 1**

Round 1 failed on **content**: there was nothing in the bottom half of the frame.
Round 2 has fixed that. There is grass in the near field, a path that crosses the
bottom edge and reaches the tree line, smaller lilies that no longer block the
view, more clouds, hills that now have a silhouette, and a genuinely soft
out-of-focus petal near the lens. At a glance the frame now reads as **a meadow
scene**. That is real progress and it should be credited.

It still fails on **surface and light**. The near field is a pale yellow-green
field of large flat paper blades (band median hue **81** against the reference's
**98**; still **2.35× flatter** in local contrast). The trees are still neon violet
over acid lime — and now have near-black speckle through the canopy. The horizon
has shapes but not colour: the hills sit at val **0.84** against the reference's
**0.745**, so they read as haze, not mountains. A player screenshots this and sees
a competent stylised mobile game, not the reference painting.

| quantity (my instrument, unchanged from CRITIQUE-1) | reference | round 1 | round 2 |
|---|---|---|---|
| Bottom 30 % "detail" coverage | 32.2 % | 6.5 % | **36.3 %** ✔ |
| Bottom 30 % mean horizontal gradient (edge contrast) | 0.0235 | 0.0021 | **0.0100** (4.8× up, still 2.35× short) |
| Bottom 30 % median colour | `#708c55` hue 98 sat 0.380 val 0.557 | `#83a276` hue 103 sat 0.271 val 0.635 | `#95916d` hue **81** sat 0.299 val 0.592 |
| Blossom sat / val | 0.404 / 0.827 | 0.585 / 0.906 | **0.492** / 0.875 |
| Leaf sat / val | 0.399 / 0.647 | 0.607 / 0.761 | **0.602** / 0.714 |
| Hard-green pixels in tree band | 2.2 % | 14.3 % | **11.0 %** |
| Near-black pixels in tree band (gameplay) | 0.08 % | 0.22 % | **1.76 %** ⚠ |
| Ridge band, left (y 12–20 %) | `#a5b6c8` val 0.745 | 1 faint step | `#8eb8d7` val **0.84**, 2–3 steps |
| Clear sky, y 4–10 % | `#66a9ec` sat 0.568 val 0.925 | `#488dcf` sat 0.649 val 0.812 | `#68a4d5` sat **0.512** val 0.835 |
| Largest connected petal blob | 14 067 px² | 876 px² | **2 453 px²** |
| Path at bottom edge | continuous, ~80–100 px wide, `#947e56` sat 0.42 | absent | continuous, **~300 px wide**, `#8d8a6c` sat 0.23 |

---

## 2. What improved since round 1 (do not regress these)

1. **The near field exists.** Coverage 6.5 % → 36.3 % on my instrument (reference
   32.2 %), and the plan's "≥ 25 %" target is met on this measure. The single
   biggest complaint of round 1 — "the bottom half is a smooth plane" — is gone.
   The bottom edge is now framed by grass.
2. **The path leads in.** It crosses the bottom edge and runs continuously to the
   tree line. Round 1's blurred smear is now a ribbon. Plan §7: PASS.
3. **The mid-ground composition is fixed.** The 2.5–3 m origami lilies are now
   1.3–1.8 m and scattered, so the path and the tree bases are visible between
   them. This was CRITIQUE-1's #3 and it is genuinely solved.
4. **The horizon has shapes now.** Two-to-three distinct ridge value steps on the
   left (`#bcc5d3 → #8eb8d7 → #a7b2bd`), where round 1 had one barely-visible
   band. The `bot` lerp fix worked; the remaining problem is that they are too
   bright, not that they are missing.
5. **There is a real out-of-focus petal at the lens.** The large soft pink blob at
   the lower left (`x 127–193, y 520–613`) reads as bokeh and is exactly the
   reference's foreground language. Keep it.
6. **Clouds and bloom are better.** 2 clouds → 4–5 spread across the sky; the
   ~150 px bloom halo on the top cloud is gone (`bloomThreshold 0.72` worked).
7. **Sky value improved**: 0.812 → 0.835 (reference 0.925).
8. **Blossom saturation moved the right way**: 0.585 → 0.492 (still above the
   0.42 target, but a real 16 % reduction).
9. **Budget holds**: 994,870 tris in gameplay, inside the 1.01 M ceiling.
10. **No post slop.** Still one ACES, bloom + one grade, no grain/CA/DOF.

---

## 3. The three worst remaining things, ranked

### 3.1 The near field is full but reads as a pale yellow wheat field, not a green meadow

**What I see.** The bottom 40 % is now covered, but it is covered by **large, flat,
pale yellow-green blades** — individual blades 100–170 px long on screen, all the
same tone, arranged in visible star-rosettes, with **hard aliased edges** (the pale
blade against the darker ground is stair-stepped, like a paper cut-out). There is
almost no dark gap between blades, so the mass has no depth. The band reads as
**wheat, reeds or long grass in drought**, not the reference's vivid green sward.

**Where.** Full width, `y ≈ 560–900` in the 1400×900 gameplay frame.

**Measured.** Band median `#95916d` — hue **81**, sat 0.299, val 0.592. Reference
`#708c55` — hue **98**, sat 0.380, val 0.557. The components are close (tuft hue
78 vs the reference's 76; ground hue 96 vs 104) but the **tufts are too bright**
(val **0.796** vs the reference's 0.737) and the **ground is too desaturated**
(sat **0.282** vs 0.376), so the bright tufts win the median and the whole band
goes yellow. Local contrast is still **2.35× lower** than the reference
(gradient 0.0100 vs 0.0235): the blades are smooth flat surfaces, so the near
field is *filled* but *flat*.

**Why it hurts.** It is 38 % of the frame and the region the camera is closest
to, so it carries the most screen space per world metre. It is also the reason the
"beautiful" test fails: the dominant colour of the shot is a pale yellow-green
that exists nowhere in the reference.

### 3.2 The trees are still neon, and now have near-black speckle through the canopy

**What I see.** Every canopy is a high-frequency confetti of **saturated violet
blossoms**, **bright acid-lime leaves**, and — new this round — **near-black leaf
clusters** that read as holes or dirt in the blossom. Individual leaves are large
hard-edged polygons, some of them floating outside the canopy silhouette. The
trunks are smooth tan-orange. The trees are also still a row of similar trees at
similar depth, so the line reads as a picket of assets rather than a grove.

**Where.** `y ≈ 140–340`, full width; worst on the right cluster and in `shrine.png`
where the canopy fills the frame.

**Measured.** Blossom sat **0.492** (target ≤ 0.42, reference 0.404), leaf sat
**0.602** (target ≤ 0.45, reference 0.399), hard-green **11.0 %** (target ≤ 4 %,
reference 2.2 %). New regression: near-black pixels in the tree band went
**0.22 % → 1.76 %** and the darkest pixel went **val 0.200 → 0.122**. The reference
has 0.08 % near-black. The `uLeafShadow #3f6f5a` override is too dark and is
producing black clumps.

**Why it hurts.** These are the highest-contrast objects in the frame, so they are
what the eye lands on first. The reference's canopy is a *soft lavender mass* with
leaves peeking through; the render's is a *hard green-violet-black mosaic*. That
mosaic is the single strongest "this is a low-poly game asset" tell left in the
image.

### 3.3 The horizon has shapes but not colour — the hills are pale haze, not cool blue mountains

**What I see.** On the left, two-to-three hill silhouettes now exist, but they are
**pale sage-green-grey**, almost the same value as the meadow, so they read as
mist rather than as a mountain range. On the right, behind the trees, there is
still a **white band** with no ridge in it. The reference has three stacked
**cool blue-grey** ridges spanning roughly `y = 8–30 %`, each clearly darker and
bluer than the meadow in front of it.

**Where.** `y ≈ 150–300`, full width; the right half is the worst.

**Measured.** Left ridge band: `#bcc5d3` (val 0.827) → `#8eb8d7` (val **0.84**) →
`#a7b2bd`. The reference's equivalent band is `#a5b6c8`, val **0.745**. The ridge
is ~0.09 too bright, so it sits in the haze rather than in front of it. Aerial
perspective still fails the brief's test: the far field is not visibly cooler or
bluer than the near field.

**Why it hurts.** The reference's depth comes entirely from the ridge stack. With
the hills at meadow value, the world reads as a flat backdrop with a tree row in
front — the same "cut-out" problem CRITIQUE-1 flagged, now with better shapes and
the same wrong values.

---

## 4. Regressions — things that got worse in round 2

These matter as much as the gaps. Ranked by how obvious they are.

### R1. The near-grass pass is a rectangular patch with a hard straight edge — visible in three of five views
The near pass is a fixed world box (`x ±11, z −2…11.5`). Its front edge projects to
**a perfectly straight horizontal line at y ≈ 560–565** in `eye.png`, `lake.png`
and `shrine.png`, with dense pale grass above it and a **bare smooth plane** below.
It looks like a hedge planted across the frame with a lawn in front. Measured
row-to-row step at the seam: **0.0135** in eye (round 1's max anywhere was 0.0075),
**0.0295** in shrine, and the eye view's lower half now has the two strongest row
discontinuities it has ever had. This is the clearest new artifact in round 2, and
it will follow the camera if the player orbits.

### R2. The near field's median hue went green → yellow-green
**103 → 81** (reference 98). Round 1's near field was correctly green; round 2's is
yellow-green. The cause is compositional: 2,400 bright pale tufts now dominate the
band's median, and they are val 0.796 against the reference's 0.737.

### R3. The eye view's near field got worse, not better
Detail coverage **4.77 % → 3.85 %**, and the ground under it is now darker
(`#7d9d76 → #678c67`). Because the near pass is tuned to the `z = 14` gameplay
camera, the `z = 18` eye camera stands **in front of** the grass: bare dark plane
in the foreground, grass band in the middle distance, seam between them. The eye
view is now the weakest of the five.

### R4. New near-black speckle in the canopies
**0.22 % → 1.76 %** of the gameplay tree band, darkest pixel val 0.200 → 0.122.
Visible as black clumps in every tree. The reference has none.

### R5. The grey petals became near-white blown-out shards
Round 1's grey-mauve floaters are no longer grey — but they are now
**near-white, sat 0.095** (`#f0d9e1`, `#ded2e7`, val 0.91–0.94). They still read as
**flat paper shards**, just white instead of grey. The `emissiveIntensity 0.38`
change over-corrected: it removed the grey by washing the colour out. A petal
should be sat 0.25–0.40, not 0.095.

### R6. The path is now three times too wide and too grey
Round 1 had no path; round 2 has one, but it is **~300 px wide at `y = 85 %`**
against the reference's ~80–100 px, and it is `#8d8a6c` (hue 54, sat **0.23**)
against the reference's `#947e56` (hue 39, sat **0.42**). It reads as a pale sandy
road, not a dirt footpath, and it is the reason the bottom-30 % median is now
**tan** rather than green (the designer noticed the symptom, not the cause).

### R7. Minor — the lake shoreline step got stronger
Row step at the water edge `y = 530`: **0.0307 → 0.0467**. Probably the harder path
edge or the darker ground; low impact, noted for completeness.

---

## 5. Fixes for round 3, with numbers

Ordered by impact. R1 and R2 are regressions and should be fixed in the same pass
as 3.1 — they are all the near-field system.

### Fix 1 — correct the near field's colour and contrast (highest impact)
Target the band median at the reference: **hue 95–105, sat ≥ 0.36, val 0.55–0.58**
(now hue 81 / sat 0.299 / val 0.592).
- **Darken the tuft fill** val 0.796 → ~0.73 and raise sat to ~0.40. The grass
  ramp's light tips are the culprit; move the tip colours from the current
  `#c6dd97`-family toward `#a8c47a` / `#b5cf83`.
- **Saturate the ground**: rendered ground sat is 0.282 against an albedo that
  should give ~0.36. Raise the albedo chroma and/or lower the blue hemisphere fill;
  try `grassBase #6f9455 → #5f8f4a`, `grassCool #6d9179 → #5f8668`.
- **Add local contrast**: target gradient ≥ 0.016 (now 0.0100). The cheapest lever
  is a **dark base** on each tuft — a second, larger, darker card under each tuft
  (`#3f6b3f`-family), or multiply the blade base colour down. The reference's edge
  energy comes from dark gaps between blades; the render has none.
- **Halve the blade scale** (100–170 px → 50–85 px) and raise the count in the same
  triangle budget — the budget is full (994,870 / 1,010,000), so trade, do not add.
  Cutting the extra fine pass and doubling its count at half scale is tri-neutral.

### Fix 2 — de-neon the canopy and remove the black speckle
- Blossom sat **0.492 → ≤ 0.42**; leaf sat **0.602 → ≤ 0.45**.
- `uLeafShadow #3f6f5a → #5b8a63` (val ≥ 0.55). Target near-black pixels
  **≤ 0.4 %** (now 1.76 %). The reference's darkest leaf is dark, but it is 0.08 %
  of the canopy, not 1.76 %.
- Hard-green **11.0 % → ≤ 4 %**. Leaf-card thinning did not move this (14.3 → 11.0
  on a 35 % card cut), so the lever is **blossom coverage**: `anime-flower-tree.js`
  `flowerCount` needs to come into scope — raise it ~1.6× or scale the blossom
  clusters up. Without that, this target cannot be met from `index.js`.
- Break the picket line: per-tree scale **0.8–1.3×** and height jitter, so the
  tree row stops reading as a row.

### Fix 3 — make the ridges read as mountains
Target: ridge **val 0.72–0.78, sat 0.15–0.25**, three distinct steps (now val 0.84).
- Darken the ramps: `ridgeFar #93aec9 → #7f9cba`, `hillFar #a4bed4 → #8faec6`,
  `hillMid #8fb0bd → #7ea3b2`.
- Reduce the per-ridge haze further: `0.03 / 0.12 / 0.26 → 0.02 / 0.08 / 0.18`.
- Find out why the **right half** (`x 900–1400, y 20–30 %`) has no ridge at all —
  either the ridge geometry does not extend there or the far terrain crest
  occludes it. A horizon with mountains on one side only reads as a mistake.

### Fix 4 — feather the near-grass patch edge (regression R1)
- Reject near-pass instances with a probability that rises from 0 at the patch
  centre to 1 over the last **2–3 m** of each edge, so the density tapers instead
  of stopping.
- Extend the pass to cover the `z = 18` eye camera (the box should reach `z ≈ 17`),
  or make it camera-relative with a soft radial falloff.
- **Acceptance:** no row-to-row step greater than **0.006** in the lower half of
  any of the five views. Currently eye 0.0135, shrine 0.0295.

### Fix 5 — narrow and warm the path (regression R6)
- Width **1.7 → 0.9–1.1 m** (target ~80–100 px at the bottom edge, now ~300).
- Warm it: `path #ab9675 → #a08558`, `pathEdge #7d6a52 → #7a6244`,
  `dirt #b7a077 → #a8895f`. Target hue 35–45, sat 0.38–0.45.
- This also restores the bottom-30 % median to green without losing the path read.

### Fix 6 — give the crisp petals colour (regression R5)
- `emissiveIntensity 0.38 → 0.20` and set the emissive to the petal's own base
  (`#f7b8d3` / `#d9c2f5`), not a near-white. Target petal fill **sat 0.25–0.40,
  val 0.80–0.90** (now sat 0.095, val 0.91–0.94).
- Keep the big soft lens petal — it works. But give it a petal silhouette rather
  than a fuzzy ellipse; right now it reads as a smudge on the lens.

### Fix 7 — sky saturation
Clear sky is now `#68a4d5` — hue 207, sat **0.512**, val 0.835, against the
reference's `#66a9ec` — hue 210, sat **0.568**, val 0.925. The value improved; the
saturation went the wrong way. Raise the sky ramp's chroma (`skyZenith
#1a6bcc → #0f63cc`, `skyMid #5aa2e0 → #4f9ee4`); target sat ≥ 0.55.

### Fix 8 — contact shadows: change the approach
Still not readable (max run 30 px against a 40 px target), and the near grass now
occludes the decals — §1 and §6 fight each other, as the designer said. At this
grass density a ground decal cannot win. Either raise opacity to ~0.8 with a
**14 × 9 m** soft ellipse, or drop the decal and **bake a wide soft dark patch into
the terrain vertex colour** within ~3 m of each trunk, which reads as ground
shading even through blades. Do not spend another round tuning the existing 12 × 8
at 0.65.

---

## 6. Claims in `IMPLEMENTED-2.md` that need correcting

Not dishonesty — three of these are instrument mismatches, and the designer flagged
two of them. Recorded so they do not become settled facts.

1. **"Largest petal blob ≈ 24,000 px² — PASS"** does not reproduce. On a
   like-for-like **connected-blob area** (the measure I used for the reference's
   14,067 px²) the largest is **2,453 px²**. The designer's figure comes from
   "max run × rows", which is not a blob area and cannot be compared to the
   reference's number. The plan's **≥ 6,000 px²** target is **not met** on a
   consistent measure. The lens petal is a real improvement; it is not 24 k.
2. **"Detail coverage 9.0 % vs target 25–32 % — FAIL."** My round-1 instrument
   gives **36.3 %**. Both numbers are "true" under their own threshold, and they
   bracket the truth: the field is **covered** but **flat**. The measure that
   settles it is the gradient — **0.0100 vs the reference's 0.0235**, still
   2.35× short. Do not report "coverage PASS" and stop; coverage is not the
   property that makes the near field read.
3. **"Clear-sky val 0.835"** — confirmed. But the report omits that saturation
   **fell** from 0.589 to 0.512 while the reference is 0.568. Brighter and greyer
   is not the reference's sky.
4. **"Ridge: 2 bands, third not separable."** My profile finds **three** value
   steps on the left (`#bcc5d3 / #8eb8d7 / #a7b2bd`), so this is slightly better
   than reported — but all three are too bright to read as mountains, which is the
   real failure.
5. **"Contact shadows FAIL, max run 30 px"** — confirmed, and I could not find a
   readable ellipse anywhere in the five frames either.
6. **The report's own "what still looks wrong" list is accurate**, including
   "pale flat leaf-rosettes, not grass" and "§1 and §6 fight each other". Credit
   for that — the self-assessment is honest. It just understates how much the
   near field's **hue** moved (103 → 81).

---

## 7. The reference-vs-render gap, in one sentence

Round 2 finally has the meadow's **content** — grass, path, flowers, hills — but
not its **light**: the reference is a saturated, luminous, soft painting, and the
render is a pale yellow-green field of hard paper blades with neon violet trees and
pale haze where the blue mountains should be.

---

## Bottom line for the planner

Do **not** re-plan composition. The frame, the path, the lilies and the near-field
density are done. Round 3 is **colour and surface**, in this order: (1) darken and
saturate the near field and add dark gaps between blades, (2) take the neon and
the black out of the canopy and get blossom to cover the leaves, (3) darken the
ridges into mountains. Fix the grass-patch seam (R1) in the same pass as (1) —
they are the same system, and the seam is the most obvious new artifact in the
round.
