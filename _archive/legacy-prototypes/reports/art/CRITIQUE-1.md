# CRITIQUE-1 — Sunpetal Vale, round 1

**Critic:** art-critic (independent; did not produce the render, the plan or the report).
**Judged:** the actual pixels in `reports/art/round-1/` against
`game/handoff/map-bg/concepts/ref-lavender-meadow.png`, plus the brief
(`ART-BRIEF.md`), the plan (`ART-PLAN.md`) and the designer's claims
(`IMPLEMENTED-1.md`).
**Renders looked at:** `gameplay.png`, `gameplay-clean.png`, `eye.png`,
`shrine.png`, `lake.png` — all five, at native resolution, plus 2×–3× crops of
the near field, the tree line, the horizon band and the right-hand sky.
**Measurements:** sampled directly from the PNGs (a throwaway script, not
committed). Numbers below are medians over the stated region unless noted.

---

## 1. Verdict: **FAIL**

Not close, and not a tuning failure — a *content* failure. The framing, the sky
hue and the green hue are now right, and that is real progress. But the frame a
player actually spends the game looking at is an empty pale-green lawn with a
row of neon-violet trees standing on it, under a white haze wall where the
mountains should be. No player screenshots this and thinks "beautiful". They
screenshot it and think "unfinished level".

The single most damaging fact in the image: **the bottom 30 % of the frame has
6.5 % detail coverage against the reference's 32.2 %, and its mean horizontal
gradient is 10.8× flatter** (0.0021 vs 0.0223). The near field is, measurably and
visibly, a smooth plane. That is the shot. Everything else is secondary.

| quantity (measured) | reference | round-1 render | read |
|---|---|---|---|
| Bottom 30 %: "detail" pixel coverage | **32.2 %** | **6.5 %** | the meadow is missing its grass |
| Bottom 30 %: mean horizontal gradient | 0.0223 | **0.0021** | 10.8× flatter — a plane, not a meadow |
| Bottom 30 %: median colour | `#6f8b55` sat 0.380 val 0.549 | `#83a277` sat 0.269 val 0.635 | 16 % too bright, 29 % under-saturated |
| Far ridge band (y 20–30 %, right side) | `#a5b6c8` sat **0.18** val 0.78 | `#e1e4e5` sat **0.012** val 0.89 | the mountains are bleached to white |
| Blossom purple | `#a079d4` sat 0.407 val 0.831 | `#ac60e7` sat **0.585** val 0.906 | electric violet, not lavender |
| Leaf green | `#769350` sat 0.420 val 0.576 | `#90c249` sat **0.607** val 0.761 | acid lime, not sage |
| Saturated-green pixels in the tree band | **1.5 %** | **14.3 %** | canopies are a green/purple checkerboard |
| Petal blobs ≥ 30 px, full frame | **413** | **80** | 1/5 the petals |
| Largest petal blob | **14 067 px²** (≈120×120) | **876 px²** (≈30×30) | no out-of-focus petal at the lens |
| Clear sky, y 4–10 % | `#66a5e5` sat 0.555 val **0.898** | `#5492cb` sat 0.586 val **0.796** | right hue, ~11 % too dark |

---

## 2. The three worst things, ranked by impact on the look

### 2.1 The near field is empty — the bottom 40 % of the frame is a smooth pale-green plane

**What I see.** From about `y = 560` to the bottom edge, the frame is one
continuous olive-green gradient with roughly twenty pale yellow-green rosettes
scattered on it, each ~80–120 px apart, each the same size, each lying flat
against the ground. There is no path, no flower clump, no drifting petal, and
nothing at the bottom edge to frame the shot. Between the rosettes the ground is
literally smooth — no blade, no shadow, no variation. The rosettes themselves
are flat pale sprays that read as **fallen straw on a lawn**, not standing grass;
they are brighter than the ground, so they read as litter.

**Where.** Full width, `y ≈ 560–900` in the 1400×900 gameplay frame. Same defect
in `eye.png` (worse: the smooth plane is `y ≈ 470–900`).

**Why it hurts.** This is the largest single region of the image (about 38 % of
the frame by area) and it is the region the camera is *closest* to, so it is the
region with the most screen space per world metre. The reference fills this
exactly opposite: dense blades to the bottom edge, clumps of lilac, a dirt path
curving in, pink petals passing the lens. Emptiness here does not read as "sparse
meadow", it reads as **missing content** — a golf course or an untextured test
level. It also destroys the scene's sense of scale: with no near blades there is
nothing to measure the trees against, so the trees read as small models.

**It is a placement/density bug, not an engine limit — the lake view proves it.**
`lake.png` measures **27.8 %** detail coverage in its bottom third, essentially
the reference's 32 %. The grass system *can* do this. The gameplay camera is
simply standing in a bald patch.

### 2.2 The horizon is a white haze wall — no mountain range, no aerial perspective, and the trees are a picket line

**What I see.** Where the reference has three stacked blue-grey mountain ridges
occupying roughly `y = 8–30 %`, the render has a **flat near-white band**:
measured `#e1e4e5`, saturation **0.012**, value 0.89, across `y ≈ 180–270` at the
right edge. It is not "pale mountains"; it is a fog wall with a faint silhouette
edge at ~0.02 contrast. There is one barely-visible ridge step on the right and
nothing on the left. Above it, two enormous clouds — one cropped by the top-left
corner, one with a ~150 px white bloom halo — and then flat azure. The tree line
is a row of near-identical trees at near-identical depth, evenly spaced across
the whole width, so it reads as a **hedge of assets**, not a grove on a rise.

**Where.** `y ≈ 150–300`, full width. Most visible between the tree canopies and
above them.

**Why it hurts.** The reference's entire sense of depth is carried by the ridge
stack: cool blue far, blue-grey mid, green-grey near, each separated by value and
saturation. The brief calls this out explicitly ("strong aerial perspective —
nothing in the far field is as saturated as the near field"). The render has the
opposite problem from the brief's diagnosis: the far field is not *too
saturated*, it is **completely desaturated** — 0.012 against a target of 0.18.
So the world reads as a flat backdrop with a cut-out tree row in front of it.
This is the "flat cutout" tell the brief warned about, and it is the reason the
scene has no valley in it.

**The designer's evidence for this passing does not survive the pixels.**
`IMPLEMENTED-1.md` §4 reports "distant ridge hue 187–195 vs near grass 106 →
PASS". A hue measured on a **sat-0.012** pixel is noise, not a measurement — you
cannot pass a colour test on a pixel that is 99 % white. The ridge is gone; the
hue test is measuring rounding error.

### 2.3 The mid-ground is a wall of origami lilies, and the trees are neon violet over acid lime with hard low-poly facets

**What I see.** Across the centre of the frame, `y ≈ 300–470`, a bank of lilac
flowers 2.5–3 m tall stands shoulder-to-shoulder, each bloom ~100 px wide with
flat, hard-edged, folded-looking petals and a **bright yellow five-point star
centre**. They are larger on screen than the tree canopies behind them, they
occlude the path, and they occlude the tree bases. Behind them the trees are
`#ac60e7` blossoms (sat 0.585) against `#90c249` leaves (sat 0.607) — measured
**44 % more saturated than the reference's blossom and 45 % more than its
leaves** — with visible flat-shaded facets on every petal, leaf and trunk. The
canopy is 14.3 % hard saturated green against the reference's 1.5 %: it reads as
a green-and-purple checkerboard, not blossom with leaves showing through. The
trunks are a warm orange-brown, smooth and plastic.

**Where.** Centre band `x ≈ 350–1300`, `y ≈ 290–480`; trees `y ≈ 140–340`.

**Why it hurts.** These are the two things a viewer's eye goes to first — the
biggest, most saturated, highest-contrast objects in the frame. The lilies read
as a toy because their silhouette is simple, their petals are flat planes, and
their scale is wrong for the reference (the reference's clumps are ~0.4–0.6 m,
small and dense; these are 5× too tall and too sparse). The trees read as a
game asset because the palette is neon and the shading has no softness. Together
they are what makes the frame look like **a diorama of a meadow** rather than
the meadow.

**And there are floating grey petals.** In the upper right, two flat grey-mauve
petal-shaped polygons float in the haze: roughly 90×55 px at
`x 1300–1360, y 220–275`, and 45×70 px at `x 1260–1300, y 262–310`. A third pale
shard sits near the ground at `x 867–885, y 340–362`. They are the same silhouette
family as the pink petals, so they are almost certainly a petal material losing
its colour (unlit backface or a missing base colour). A player reads them as
**floating grey cardboard** — an obvious bug in a scene that is otherwise clean
of artifacts.

---

## 3. What is already working — do not destroy it in round 2

1. **The sky is blue again.** The navy hole is fixed and the fix is visible:
   clear sky at `y 4–10 %` now measures `#5492cb` (hue 210°, sat 0.586) against
   the reference's `#66a5e5` (hue 211°, sat 0.555). Hue and saturation are
   effectively matched. The `sky.js` double-linearisation removal is the real win
   of this round; it took the sky from `#0140bf` to a plausible day.
2. **The framing is right.** Horizon/crest at ~30–31 % (`y ≈ 275–285`), sky in the
   top third, no canopy cropped in `gameplay`, tree bases ~37 %. The camera fix
   landed and the composition now has the reference's proportions. Do not move
   the camera again to fix content problems.
3. **The green hue is fixed.** Near grass is hue 103–106° — green, not the old
   77–85° yellow-green. The palette change worked. (The remaining problem is
   saturation and density, not hue.)
4. **The post chain is clean.** One ACES tone map, bloom + one grade pass, no
   grain, no chromatic aberration, no DOF, blue-dominant haze, no orange cast.
   The pipeline is not the problem any more and should not be touched to solve
   content problems.
5. **The lake view's near field is genuinely good** — 27.8 % detail coverage,
   dense standing blades, decent depth. That is the proof that fix 2.1 is a
   density/placement change, not new tech.
6. **Budget is healthy:** 944,702 tris, 231 draw calls, 105 k headroom under the
   ceiling. There is room for the grass this scene needs.
7. **The tree-line flower band reads well** — the small lavender speckles along
   `y ≈ 300–360` between the trunks are the closest thing in the frame to the
   reference. Keep them and extend the idea forward.
8. **Petal colours are correct pastel** (`#f7b8d3` / `#d9c2f5` / `#fff4d8`). The
   problem is size and count, not hue.
9. **No contact shadow is readable** — but the mechanism exists and the designer
   already flagged it PARTIAL. See fix 6; this is a placement problem, not a
   rewrite.

---

## 4. Fixes, highest impact first, with numbers

A planner can turn each of these into a value. The first three are the round.

### Fix 1 — fill the near field (single highest-impact change)
The bottom 30 % must go from **6.5 %** detail coverage to **≥ 25 %**.
- Raise near-field grass-tuft density **3–4×** in the band 4–14 m in front of the
  gameplay camera, and stop the tuft scale falling below 0.6× at that range.
  Budget: ~1,500 extra tufts × ~60 tris ≈ **90 k tris** — inside the 105 k
  headroom.
- Make the tufts **stand up**: their cards are currently near-horizontal and read
  as fallen leaves. Tilt them toward vertical (blade axis 60–80° from the ground
  plane) and darken the base so they have a shadow side.
- Add a **framing fringe**: 30–50 tall blades at `z = 11.5–13.5` (0.5–2.5 m from
  the lens at `z = 14`), scale 1.4–2.0×, spread across the bottom 15 % of frame.
  This one band does most of the "meadow" read.
- Stop the rosettes being identical: 2–3 size classes and a small random yaw
  per instance. The uniform stamp is a large part of the "golf course" feel.

### Fix 2 — un-bleach the distant hills and restore the ridge stack
Target for the far ridge band: **sat 0.12–0.20, val 0.72–0.82** (reference
`#a5b6c8`, sat 0.18, val 0.78). Currently sat 0.012, val 0.89.
- The palette already says `hillFar #bcd3dd` / `ridgeFar #aecbdd`; those values
  are nowhere near `#e1e4e5`. Something between the palette and the pixel is
  adding ~+0.15 value and removing ~0.19 saturation. **Find that stage before
  re-tuning the hex** — otherwise you will chase a moving target. Prime suspects:
  the ridge shader's own lerp toward the near-white `skyHorizon #eef2fb`, and the
  bloom pass lifting the pale band.
- Cheap test: raise `bloomThreshold` 0.62 → 0.70 and re-measure the band. If it
  darkens by more than 0.02 value, bloom is part of the bleaching.
- Then darken/blue the ridge ramp by ~15 %: `ridgeFar #aecbdd → #93aec9`,
  `hillFar #bcd3dd → #a4bed4`.
- Give the horizon **at least three distinct ridge values** with visible
  silhouettes spanning `y ≈ 8–30 %`, like the reference. One faint step is not a
  mountain range.
- Also thin the fog on the ridge: if the ridges are picking up scene fog at
  `fogNear 55 / fogFar 320`, raise to `fogNear 140 / fogFar 600` so the ridge
  keeps its colour at 175–295 m.

### Fix 3 — delete or re-colour the grey floating petals (bug, ~1 line)
Grey-mauve petal polygons at `(1300–1360, 220–275)`, `(1260–1300, 262–310)` and
`(867–885, 340–362)`. Give the mid/foreground petal material a lit pastel base on
**both** faces (`#f7b8d3` or `#d9c2f5`, `DoubleSide` with the same colour), or
drop the layer that produces them. Nothing grey should be in this scene's air.

### Fix 4 — de-saturate the canopy and the trunks
- Blossom: sat **0.585 → ≤ 0.42**, val 0.906 → ~0.83. Use the plan's §4.4 targets
  `#c9a8ef` mid / `#efe0ff` tip (the C.2 traverse of `kit.group` leaf uniforms in
  `index.js` — 10 lines, already written in the plan).
- Leaves: sat **0.607 → ≤ 0.45**, val 0.761 → ~0.60. Use
  `#3f6f5a / #6f9f66 / #a8cf74 / #d6e9a0`.
- Push blossom coverage up so the canopy goes from **14.3 % hard green** toward
  the reference's **1.5 %**: scale blossom clusters ~1.3× or thin the leaf cards
  ~40 %. The trees should read as lavender blossom with leaves showing through.
- Trunks: orange-brown `#8a5947` → grey-brown `#8a7a6a` (desaturate, no hue shift).

### Fix 5 — shrink and scatter the giant lilies
- Cap clump height to **1.2–1.6 m** in the 4–12 m band (currently 2.5–3 m).
- Thin them in the **central 40 %** of the frame so the path and the tree bases
  are visible; keep the dense band at the tree line.
- Reduce the yellow star centre from bright yellow to `#f2e2b0` — at current
  saturation it reads as candy.

### Fix 6 — bring one or two big petals to the lens
Largest visible petal is **876 px²**; the reference's is **14 067 px²**. There is
no out-of-focus foreground petal at all.
- Add 4–6 soft petals at `z = 12.5–13.5` (0.5–1.5 m from the lens), scale
  **2.5–4.0**, opacity **0.5–0.65**, drifting left→right. One number change in
  the foreground layer's z range plus a scale bump.

### Fix 7 — make the path a path
It currently renders as a soft brown airbrush smear at `y ≈ 440–500` with no edge
and no bottom-edge contact; it reads as a mud stain.
- Extend the leading path spoke from `z = 6` to `z ≈ 2` so it crosses the bottom
  edge at the `z = 14` camera (one line in `terrain.js`).
- Tighten the edge: `pathEdge #937f63 → #7d6a52` and halve the vertex-colour
  blend width so the path has an edge instead of a smudge.

### Fix 8 — sky value and clouds
- Clear sky is **11 % too dark** in value (`#5492cb` val 0.796 vs the reference's
  `#66a5e5` val 0.898). Raise `skyZenith #0052b4 → #0a5fc4` and
  `skyMid #3888d2 → #4a95dc`, then **re-measure on a clear patch**, not on the
  cloud.
- The top-centre cloud has a ~150 px bloom halo. `bloomThreshold 0.62 → 0.70`
  (or `bloomStrength 0.50 → 0.40`).
- Two clouds, both in the top 12 % of the frame, one cropped by the edge. Add
  4–6 smaller clouds distributed across the whole sky band, like the reference.

### Contact shadows — do not count them as done
I could not find one readable shadow ellipse in any frame. The ground under the
tree line shows an irregular dark band, but that is the flower-clump bases, not
ellipses. The designer already marked this PARTIAL/occluded, and the pixels agree
with the pessimistic reading: **it is not visible, so it is not fixed.** Move the
ellipses forward of the flower band, or thin the band, and re-check.

---

## 5. The reference-vs-render gap, in one sentence

The reference is a **deep, luminous, densely grown meadow** — blades at the lens,
three layered blue mountain ridges, soft lavender blossom and big blurred petals
crossing the foreground — while round 1 is a **shallow, pale diorama**: a smooth
lawn in the bottom half, a white haze wall where the mountains should be, and a
row of neon violet-and-lime trees standing on it.

---

## Appendix — claims in `IMPLEMENTED-1.md` that the pixels do not support

Recorded so they do not come back as settled facts. I am not accusing anyone of
dishonesty; three of these are measurement-method problems, and the designer
flagged two of them themselves.

1. **"Top-of-frame sky `#6093cc`, PASS on G/B, R +15 %."** Does not reproduce on
   the clear sky. My samples: `#3a80ca` at `y 1 %`, `#5492cb` at `y 4–10 %`
   (right side), `#5d91ce` as the median of `y 0–6 %`. The `#6093cc` figure is
   inflated by the cloud and its bloom halo; the clear sky is **~11 % darker in
   value** than the reference. The verdict should be "hue PASS, value ~11 % dark",
   not "PASS".
2. **"Distant ridge hue 187–195 vs near grass 106 → PASS."** The ridge band
   measures **sat 0.012**. Hue on a 99 %-white pixel is noise. This test cannot
   pass or fail anything; the ridge is bleached out and the test hid it.
3. **"Contact shadow present (verified by projection + A/B) but occluded."** The
   projection proves the quads exist, not that they read. They do not read in any
   of the five frames. Correctly labelled PARTIAL, but the practical status is
   "invisible".
4. **"Near grass hue PASS, sat FAIL (0.18–0.21 vs ≥0.30)."** Confirmed, and worse
   than stated: my measurement is sat **0.269** and val **0.635** against the
   reference's 0.380 / 0.549. It is not just under-saturated, it is 16 % too
   bright — the meadow is washed out, which is a different fix from
   "more saturated".
5. **"Path FAIL"** — confirmed, and the pixels are worse than the report's
   description: it is not a thin ribbon that stops short, it is a **blurred
   smudge with no edge** that never reads as a path at any point.
6. **Petal behaviour cannot be judged from stills.** I judged size, count, colour
   and placement only. Whether they "dance on curved paths" needs motion, and no
   video was in the review set. Do not mark that brief item as verified.

---

## Bottom line for the planner

Round 2 should not re-tune the grade, the sky hexes or the camera. Those are
close. Round 2 is **content**: put grass in the near field (Fix 1), put mountains
back on the horizon (Fix 2), fix the grey floaters (Fix 3), and take the neon out
of the trees (Fix 4). Fix 1 alone moves the image further than everything else in
this list combined.
