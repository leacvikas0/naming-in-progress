# Fantasy Warrior — texturing task, resolved

Status: **done**. Written 2026-09-16.

## The task

`fantasy_warrior_untextured.fbx` had no texture, no UVs, no materials. The ask
was to texture it. A prior attempt produced a washed-out pastel render.

## The finding

**The task was already solved by the asset, and the "problem" was the preview
lighting.**

Two files arrived with the request:

| File | What it is |
|---|---|
| `fantasy_warrior_textured.fbx` | the same mesh + a UV layer + a packed 4096² texture |
| `fantasy_warrior_texture.jpg` | the same texture as a standalone file |

Measured, not assumed:

```
untextured  verts=5498 faces=5774 uv_layers=[]                    materials=1
textured    verts=5498 faces=5774 uv_layers=[..._NewUVMap]        materials=1
same_verts: true   same_faces: true
```

Identical geometry. The textured file is the untextured file plus UVs and a
texture. Nothing needed to be unwrapped, projected, or synthesised.

## Why the first render looked wrong

The texture was never washed out. Two independent measurements say so:

**Unlit render.** Rendering the model with a pure emission shader (no lighting
at all) shows deep saturated red hair, a navy tunic, a cream underlayer and
brown boots — exactly the reference. The texture contributes correct colour at
every surface point.

**Texture statistics.** 4096×4096, mean sRGB `(207, 165, 154)`, median
`(176, 66, 58)`, mean saturation 0.49, and 67% of pixels above 0.4 saturation.
That is a saturated texture.

The cause was light energy. The original `render_model.py` used three area
lights at **850W / 320W / 650W** roughly one model-height away. At that distance
the surface was blown far past white and desaturated toward the light colour —
pale pink hair, lavender tunic. It is the classic overexposure look, not a
texture fault.

Two secondary contributors, both now fixed:

- The preview used Blender's default **AgX** view transform, which compresses
  saturation hard. These renders use **Standard**.
- The material carried an **empty Normal Map node** (the `.fbm` sidecar folder
  was never shipped), so a normal map was referenced that did not exist.

## The fix

Lighting replaced with suns at physically sane energy (key 3.2, fill 1.1,
rim 1.6, world 0.45), view transform set to Standard, empty Normal Map node
removed. Same texture, same mesh, no edits to either.

`compare-lighting-fix.png` is the side-by-side: before on the left, after on
the right.

## Verified

- **GLB round-trip.** `FantasyWarrior.glb` (2.64 MB) re-imports with its UV
  layer and 4096² texture intact and renders correctly from four angles.
- **UV layout is sound.** U span 0.994, V span 0.998, median face UV span
  0.0125, max 0.0759, and **zero faces spanning more than 10% of the texture**.
  No smearing, no collapsed UVs.
- **8-view turntable** rendered and checked at every angle.
- **Mesh untouched.** 5,498 verts, 5,774 faces in, same out.

## The literal ask, done exactly

The request was to texture `fantasy_warrior_untextured.fbx` itself. That was
done, not approximated — and proved pixel-identical.

`transfer_texture.py` loads the textured file, captures its UVs and material,
then loads the untextured file and applies them. Two guards make it exact
rather than hopeful:

1. **Vertex order must match.** UVs are indexed by vertex, so a transfer is only
   valid if the two files list vertices in the same order. Measured:
   `vertex_order_identical: true`.
2. **UVs live on loops, not vertices.** This is the trap. **4,212 of 5,498
   vertices carry more than one UV** because they sit on a UV seam. A
   per-vertex copy would collapse those to a single value and smear the texture
   along every seam. The script therefore copies **loop for loop**, which is
   exact, and refuses to run unless the faces and their loop order match:
   `faces_identical_in_order: true`, `22329` loops in, `22329` out.

**Result:** rendering the transferred model against the original gives
**identical images from all four angles** — mean absolute difference `0.000`,
max `1/255`, zero pixels differing by more than 6.

```
out/deliver/FantasyWarrior_textured.glb   12.75 MB   (lossless PNG texture)
out/deliver/transfer-report.json
```

This GLB is larger than the 2.64 MB `FantasyWarrior.glb` purely because it
embeds the texture as a lossless PNG instead of the original JPEG. Same pixels,
bigger container. **For shipping, prefer `FantasyWarrior.glb`.**

## Full quality audit

An independent audit measured the texture across the whole model. Complete data
in `out/audit/`. Headline numbers:

### Texel density — excellent

```
min 1831   p05 2059   p25 2144   median 2191   p75 2236   p95 2273   max 2281
max_over_min_ratio   1.25
p75_over_p25_ratio   1.043
median / uniform benchmark  1.00
UV overlap           0.036% of used area
UV islands           1015
```

A **1.25× spread between the best and worst texel density on the entire model**
means no part is starved relative to any other. The 25th-to-75th spread of 4.3%
means density is near-uniform.

Vertical bands are flat — band spread 2185 to 2205, i.e. the best band is
**1.01×** the worst:

| band | z (normalised) | median density |
|---|---|---|
| 1 (feet) | 0.0–0.1 | 2192 |
| 2 | 0.1–0.2 | 2198 |
| 3 | 0.2–0.3 | 2200 |
| 4 | 0.3–0.4 | 2185 |
| 5 | 0.4–0.5 | 2188 |
| 6 | 0.5–0.6 | 2189 |
| 7 | 0.6–0.7 | 2185 |
| 8 | 0.7–0.8 | 2196 |
| 9 | 0.8–0.9 | 2205 |
| 10 (head) | 0.9–1.0 | 2193 |

Head and boots get identical density. The usual failure mode — a starved face —
is absent.

The five lowest-density clusters sit only **5.7% below median** (2066 to 2102
against 2191). They are the low tail of a tight distribution, not defects.

### Seams — clean

5,109 of 11,066 interior edges (46.2%) are island boundaries. Comparing texture
colour across them:

| | seam ΔE | interior baseline ΔE |
|---|---|---|
| median | 0.8 | 1.3 |
| p95 | 9.5 | 19.7 |

Seam error sits **at or below the interior distribution at every percentile**.
**Zero suspicious seams.** The large ΔE values sit on genuine art boundaries
(eye, trim, hems), not on UV cuts.

### Baked lighting — none

Two independent tests, both negative:

- **Normal↔luma correlation.** All faces: `nx +0.09, ny +0.01, nz −0.05`.
  Hair only: `−0.31, +0.001, −0.03`. A texture with baked lighting from one view
  makes brightness a function of the normal; these are near zero.
- **Island probes.** Flat regions show plane slopes of 0.003–0.023 sRGB
  levels/texel (navy tunic: luma range 33, std 1.7) with *large* residuals
  (5–46). That is the signature of painted detail, not a smooth gradient — a
  baked ramp would show a large range with a *small* residual.

**This corrects an assumption I made earlier.** I described the texture as
carrying "gentle baked shading" from its source render. Measured, it does not.

### Colour inventory

CIELAB k-means, k=9, over UV-interior texels:

| hex | rgb | % of used | reads as |
|---|---|---|---|
| `#b03b32` | 176, 59, 50 | **41.74** | hair red |
| `#5d4638` | 93, 70, 56 | 15.39 | brown |
| `#473c50` | 71, 60, 80 | 13.55 | navy tunic |
| `#e6d5be` | 230, 213, 190 | 9.73 | cream |
| `#b88d65` | 184, 141, 101 | 7.12 | tan |
| `#eba47f` | 235, 164, 127 | 6.80 | skin |
| `#9e433d` | 158, 67, 61 | 2.96 | hair shadow |
| `#a27159` | 162, 113, 89 | 1.57 | brown |
| `#bc9b80` | 188, 155, 128 | 1.15 | tan |

Top five = 87.5% of used texels. Per-cluster standard deviation is low (2–17),
confirming flat painted colour rather than gradients.

## The one real defect: soft edges

**Median edge width 5.59 texels** (p95 21.0). A crisp edge is 1–2 texels. 19.1%
of the used area classifies as blurry, concentrated on skin and cream — the
torso and waist account for 45% of blurry faces.

Two candidate causes were tested and ruled out:

- **Not an upscale.** A bilinear 4× upscale leaves a second-derivative spike
  train at period 4. Real texture: **1.16**. Deliberately softened native
  control: **1.09**. Known 4× upscale: **9.5e11**. So the 4096 grid is genuine.
- **Not UV stretching.** Blur-versus-density correlation is **+0.09**, i.e.
  none.

So the softness is **authoring blur inherited from the source art**. It cannot
be fixed by re-unwrapping or re-baking — the source would have to be re-rendered
at higher fidelity.

Practical impact: fine for mobile or mid-distance. For close-up hero use, a
5.6-texel edge covers 0.0026 model units and the face detail will read as
smudges.

Secondary, mild: **JPEG blocking** confirmed. Ratio 1.31 on the 8-pixel grid
against 1.01 on control grids of 7 and 9 pixels. Shipping the lossless PNG
avoids it — which is what `texture-4k-lossless.png` is for.

## Verdict

**Production-quality UV layout, clean seams, no baked lighting, soft detail.**

The UV work is genuinely well made: 1.25× density spread, 0.036% overlap,
matched seams, correct padding. The limitation is softness from the source art.

Nothing needs doing to the UVs or the density. If the softness matters for a
close-up, the source art has to be re-authored; there is no texture-side fix.

## Colour-space correction

The audit's first-pass `palette.json` reported the dominant colour as `#d8847a`
(muted salmon, labelled "skin"). **That was wrong.** It read Blender's
`Image.pixels` — which returns 8-bit images already sRGB-encoded, not
scene-linear — and re-encoded them, lightening and desaturating every value.

The true dominant colour is **deep red `#b03b32`/`#a83030`** — the hair.
Confirmed three independent ways: a direct sRGB read of the texture PNG (34.0%
of texels), a quantisation of the unlit render (54.2% of surface pixels), and
the audit's own re-measurement after the fix (`#b03b32`, 41.74%).

Full working in `out/audit/CORRECTION-colour-space.md`. The texel-density
analysis was never affected — it works in areas and ratios, not colours.

**Lesson:** any time pixel values cross between Blender and a script, the colour
space must be stated explicitly. The bug is silent — it yields plausible
colours, just the wrong ones.

## Deliverables

`experiments/warrior/out/deliver/`

| File | Use |
|---|---|
| `FantasyWarrior.glb` | engine-ready, texture embedded, 2.64 MB |
| `FantasyWarrior.fbx` | original textured FBX |
| `FantasyWarrior_texture_4k.jpg` | the 4K texture, as shipped |
| `texture-4k-lossless.png` | the same texture, lossless |
| `turntable-8views.png` | correctly lit, 8 angles |
| `hero-3up.png` | three-quarter hero views |
| `SUMMARY.png` | one-sheet overview |
| `compare-lighting-fix.png` | before/after the lighting fix |
| `compare-vs-reference.png` | reference image beside the render |
| `verify/threejs-final.png` | GLB loaded in three.js |
| `README.md` | handover notes |

## GLB internals

Verified by parsing the container directly:

```
magic ok, version 2, declared length == file length
chunks: JSON 1512 bytes, BIN 2768320 bytes
meshes 1, nodes 1, primitives 1
attributes: POSITION, NORMAL, TEXCOORD_0
indices: 32343  ->  10,781 triangles
image: 1, mimeType image/jpeg, embedded as bufferView 4
material: baseColorTexture, metallicFactor 0, roughnessFactor 0.9
extensionsUsed: none
```

Two deliberate cleanups on export:

- **Empty Normal Map node removed.** Tripo wired a normal-map node with no
  image (the `.fbm` sidecar was never shipped). Leaving it in risks a dangling
  reference; removing it is correct since there is no normal map to apply.
- **`doubleSided` set to false.** glTF defaults to single-sided, so the
  attribute was removed rather than written as `false`. Verified visually
  neutral: re-rendering before and after gives **byte-identical images**
  (mean absolute difference 0.0 across 1280×1280), because the mesh has no open
  shells to see through.

## Not for `library/`

The catalogue's own style bible states it:

```
"styleBible": "Kenney low-poly + KayKit (human CC0, no AI catalogues)"
```

2,703 assets, all `prop` or `character` from Kenney/KayKit packs. This is a
Tripo generation, so it is an **experiment artefact** and stays in
`experiments/warrior/`. Adding it to `library/` would break the art bible and
require a `scripts/packs.json` entry and a `npm run fetch`/`index`/`inspect`
cycle that has no business running for a non-kit asset.

Also worth noting against the kit's conventions: it is a **static T-pose mesh
with no rig and no clips**. The kit's characters are expected to be rigged
KayKit files whose existing clips you play, not meshes you re-rig. So even if
the art-bible rule did not apply, this would not qualify as a character here.

## A correction worth recording

An earlier note in this session called `fantasy_warrior_texture.jpg` "a
splatter of colours with no relationship to the geometry". That was wrong. The
standalone JPG and the texture embedded in the FBX are **byte-identical**
(mean absolute difference 0.0). A UV atlas of many small islands looks like
noise when viewed flat; it is correct when sampled through the UVs. The mistake
was judging an atlas by eye instead of by rendering it.

## The reference

`tripo_input_image.png` (in the Antigravity brain folder) is the front-view
image this model was generated from, in this exact pose. `compare-vs-reference.png`
puts it beside the render. The palette and material breakdown match: red hair,
navy tunic with gold trim, cream underlayer, maroon sash with the same diamond
motif, brown boots.

The back of the head is the generator's inference, since the reference was a
front view only. It reads correctly from every angle tested but is not
reference-matched.

## Tooling built

`experiments/warrior/harness/` — all Blender-headless, config via env var
(PowerShell eats `--` and Blender keeps its own flags in `sys.argv`, so argv
passing does not work here):

| Script | Purpose |
|---|---|
| `analyse_mesh.py` | loose parts, islands, bounds, clay turntable |
| `render_views.py` | turntable renderer, clay or material mode |
| `inspect_textured.py` | how a texture is wired; reports view transform |
| `texture_forensics.py` | the unlit test that isolates texture from lighting |
| `compare_meshes.py` | proves two models share identical geometry |
| `render_final.py` | lit / unlit / clay turntables at sane exposure |
| `export_glb.py` | cleans the material and exports a GLB |
| `unwrap.py` | smart-project unwrap + distortion measurement (unused — UVs already existed) |
| `transfer_texture.py` | copies UVs + material onto the untextured FBX, exact loop-for-loop |
| `glb_check.mjs` | three.js runtime verification |

Audit harness (written by the audit subagent): `audit_lib.py`, `measure.py`,
`render_heatmap.py`, `report.py`, `probe.py`, `blockiness.py`,
`padding_check.py`, `upscale_test.py`, `test_colorspace.py`, `microfont.py`.

## Open / known limitations

1. **No normal map.** Tripo generated one but the `.fbm` sidecar folder was not
   shipped, so it is absent. The model reads fine without it; re-generating it
   would need the original source.
2. **Not in the kit.** Nothing was added to `library/` or the catalog. The
   catalog's own style bible reads *"Kenney low-poly + KayKit (human CC0, no AI
   catalogues)"* and all 2,703 assets are Kenney/KayKit. This is a Tripo
   generation, so it stays an experiment artefact. It is also a static T-pose
   mesh with no rig and no clips, so it would not qualify as a kit character
   regardless. Budget-wise it is fine: 5,498 verts / 5,774 faces, well under the
   20k character limit.
3. **Not rigged.** No armature, no clips. Tripo can rig; this export has none.
4. **Soft edges — the one real defect.** Median edge width 5.59 texels against
   1–2 for a crisp texture; 19.1% of used area classifies as blurry, mostly on
   the torso and waist. Proven *not* an upscale (period-4 second-derivative
   profile 1.16, versus 1.09 for a soft-native control and 9.5e11 for a known
   4× upscale) and *not* UV stretching (blur-versus-density correlation +0.09).
   It is authoring blur from the source art, so no texture-side fix exists.
   Fine at mid-distance; the face reads as smudges in close-up.
5. **Mild JPEG blocking.** Ratio 1.31 on the 8-pixel grid against 1.01 on
   control grids of 7 and 9 pixels. Ship `texture-4k-lossless.png` to avoid it.
6. **Single LOD only.**

## Corrections made during this work

Two claims I made earlier in the session were wrong. Both are corrected above
rather than quietly dropped:

1. I called `fantasy_warrior_texture.jpg` "a splatter of colours with no
   relationship to the geometry". It is **byte-identical** to the texture
   embedded in the FBX. A UV atlas of many small islands looks like noise when
   viewed flat; judging an atlas by eye instead of by rendering it was the
   mistake.
2. I described the texture as carrying "gentle baked shading". Measured two
   independent ways, **it does not** — normal↔luma correlations are near zero
   (all faces `nx +0.09, ny +0.01, nz −0.05`) and the island probes show painted
   detail rather than gradients.

An independent audit also caught its own colour-space bug mid-run, re-measured
everything, and verified the correction against an outside reference
(10/10 samples byte-exact). See `out/audit/CORRECTION-colour-space.md`.
