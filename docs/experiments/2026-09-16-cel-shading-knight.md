# Cel-shading the Knight — approach notes

Status: thinking doc, not a spec. Written 2026-09-16.

## The idea

Turn the KayKit Knight from flat low-poly into **cel-shaded anime**.

The method is *not* "take the existing atlas image and restyle it with AI". It is:

1. Treat the UV atlas as a set of **named semantic parts** — this region is the
   helmet, this is the face, this is the plume, this is the leather belt.
2. Hand the image model that part map as explicit context: "region A = helmet
   metal, region B = skin, region C = red cloth plume".
3. Let it produce a coherent restyle in one pass, knowing what it is painting.

The part map is the missing ingredient. Without it the AI is guessing at
abstract gradient rectangles. With it, it is painting a knight.

## Why the original blog approach does not fit

<https://www.richardfu.net/re-skinning-a-3d-character-with-ai-image-tools-without-touching-blender/>

Tested it directly. Its `split.py` run on `knight_texture.png` returns
**one island spanning the whole 1024×1024 atlas**. The technique is built for
packed atlases with many separated islands on a black void. KayKit has neither:
its background is colour, not black, so the connected-component detector sees
one solid blob.

Scanned every real texture in `library/`:

```
total: 60 | with >1 island >=20k px: 0
```

Zero. The blog's technique degenerates to a no-op on this entire library. It is
a good technique for a different kind of asset (Synty, Suriyun, most itch.io
character packs) and useless here.

## What the KayKit atlas actually is

This is the part that makes the idea viable.

`knight_texture.png` is **not** a packed island atlas. It is a rigid
**8 columns × 4 rows grid of 128×256 cells**. Each cell is a pure vertical
gradient — verified across all four characters: every cell is monotonic
top→bottom, and the mesh UVs land *inside* single cells.

```
knight   15 of 32 cells used
mage     18 of 32
barbarian 19 of 32
rogue    17 of 32
```

The cells are the real unit of meaning. And they map cleanly to body parts —
this is the part map we need, derived from the GLB itself:

| Cell | Atlas region | Mesh | Colour | Reads as |
|---|---|---|---|---|
| r0c0 | x0–128, y0–256 | `PrototypePete_head.001` | `246,192,156` | face / skin |
| r0c1 | x128–256, y0–256 | `PrototypePete_head.001` | `223,182,134` | hair / tan |
| r0c2 | x256–384, y0–256 | `PrototypePete_head.001` | `21,27,29` | eye / dark detail |
| r0c3 | x384–512, y0–256 | `Cube.124–128` + body | `120,130,135` | helmet steel |
| r0c4 | x512–640, y0–256 | `Cube.125,126` | `73,80,84` | helmet dark |
| r0c6 | x768–896, y0–256 | `Cube.125–128` + body | `151,86,65` | leather straps |
| r0c7 | x896–1024, y0–256 | `Cube.124–128` + body | `155,168,173` | armour highlight |
| r1c0 | x0–128, y256–512 | `Plane.004` + body | `201,50,60` | **red plume** |
| r1c1 | x128–256, y256–512 | body | `193,203,205` | white cloth |
| r1c2 | x256–384, y256–512 | body | `152,164,170` | mid steel |
| r1c3 | x384–512, y256–512 | `Cylinder.*` | `129,139,144` | arm/leg armour |
| r1c5 | x640–768, y256–512 | `Cylinder.*` | `146,82,61` | belt leather |
| r1c6 | x768–896, y256–512 | `Cylinder.*` | `107,92,83` | dark leather |
| r1c7 | x896–1024, y256–512 | `Cube.127,128` + body | `70,76,80` | deep shadow steel |
| r2c2 | x256–384, y512–768 | `Cube.12993` | `186,45,59` | shield red |

Row 3 (all 8 cells) is unused by the Knight — it is a shared gradient strip.

The mapping is derivable programmatically: read the GLB, rasterise the UVs,
intersect with the 8×4 grid, and report which mesh names land in which cell.
That is how the table above was produced.

## The important consequence for cel shading

**KayKit's gradients are baked shading.** Every cell is a light→dark ramp that
pretends to be lighting. A cel shader computes its own lighting from scratch.

So for cel shading you do not want to preserve those gradients — you want to
**flatten them**. One flat base colour per material zone. The toon shader then
supplies the shading as hard steps.

This inverts the goal: the target texture is *simpler* than the source, not
more detailed. Which is good news — it is exactly the kind of change a
deterministic script does perfectly and an image model does badly.

## What cel shading actually requires

Cel shading is a **shader effect**, not a texture. Texture alone will not get
there. The full look needs:

1. **Flat albedo texture** — one colour per zone, no gradients. (Deterministic
   flatten of the existing atlas; trivial.)
2. **Toon shader** — quantised diffuse into 2–3 hard bands. In three.js this is
   a custom `ShaderMaterial` or `MeshToonMaterial` with a stepped gradient map.
3. **Outline** — inverted-hull pass (duplicate mesh, backface, scaled along
   normals) or a post-process edge detect. This is what sells "anime" more than
   anything else.
4. **Optional: face treatment** — anime faces often need flat/unlit shading for
   the skin so the face reads cleanly. Usually a separate material.

Items 2–4 are renderer work in the three.js viewer, not texture work. Item 1 is
where the atlas work happens.

The art-bible tension: the kit is *deliberately* flat low-poly. Cel shading is
an additive change to how it is lit, not a change to the geometry, so it does
not violate "Kenney props are static, KayKit characters keep their rig". The
mesh, skin and all 76 clips stay untouched.

## Where the image model fits

Two possible roles, and they are not equivalent:

**Option A — image model makes the flat albedo.** Give it the atlas plus the
part map above, ask for a cel-shaded anime palette: flat colours per zone,
plume a specific red, armour a specific steel, face a specific skin tone.
Risk: it may return gradients or drift colours, and we only need flat fills,
which a script does exactly.

**Option B — image model does the *design*, script does the *fill*.** Use the
image model to decide the *palette and material identities* (anime knight:
cold blue-white steel, crimson plume, deep navy underlayer, warm skin), then
apply that palette deterministically per cell. Best of both: AI for taste,
script for pixel exactness.

Option B is the more promising direction. It uses the image model for what it
is actually good at — colour and mood decisions — and never asks it to
reproduce a hard-edged rectangle, which it is bad at.

## Proven so far

- Blog technique is a no-op on this library. Verified, 60 textures scanned.
- KayKit atlases are an 8×4 grid of pure vertical gradient cells. Verified
  across all four characters, every cell monotonic.
- Cells map to semantic body parts. Derived for the Knight (table above).
- Deterministic per-cell gradient remap works and is drop-in: recoloured the
  Knight to obsidian, swapped the embedded PNG inside the GLB, re-rendered on
  the rig with `Idle` playing. `skins=1 animations=76 meshes=15 nodes=57`
  unchanged. Rendered side-by-side, no seams, no artefacts.
- Blender 5.2.1 headless works: imports a Kenney GLB, re-unwraps it
  (`smart_project`), exports GLB back. Verified on `bedDouble.glb`.
- 622 library models have no texture at all (`kenney-nature` 329,
  `kenney-space` 153, `kenney-furniture` 140). Their existing UVs are a
  collapsed overlapping jumble — verified visually — so they would each need a
  real re-unwrap before any texturing. Not relevant to the Knight, which
  already has good UVs.

## Open questions

1. **Cel shading needs renderer work.** Is the target the three.js viewer, or
   are we baking the look into the texture so it works anywhere? Baking
   outlines is possible but ugly; a real toon shader is cleaner but only works
   where we control the renderer.
2. **How far to take the anime look?** A palette swap is easy. Real anime
   character treatment (face features, hair shape, expressive eyes) would need
   geometry changes, which breaks the "don't rebuild the skeleton" rule.
   Where is the line?
3. **Does the part map generalise?** It was derived for the Knight. The other
   three adventurers (Mage, Barbarian, Rogue) use the same grid and the same
   head/body mesh names (`PrototypePete_head`, `PrototypePete_body`), so it
   should. Worth verifying before building on it.
4. **Is one pass enough, or does this need iteration?** Unknown until tried.

## Not yet done

- No cel shader written.
- No outline pass.
- No image model called for this task.
- Nothing installed into the kit. The blog skill sits in a temp folder,
  uninstalled. The library is untouched. The only artefact left in the project
  is one screenshot in `.playwright-mcp/`.

## Suggested next step when resuming

Cheapest thing that tests the core idea: build the part map for the Knight
programmatically (rasterise UVs, intersect the 8×4 grid, emit a labelled JSON),
then flatten each cell to a single flat colour and render with a basic 3-step
toon shader plus an inverted-hull outline. If that reads as "anime knight" on
screen, the approach is sound and the image model can be brought in for palette
design. If it reads as "flat knight", the look depends on the shader and
outline far more than the texture, and the whole texture-side effort is
secondary.

---

# RESULT — 2026-09-16 (same day, later)

The suggested next step is done, and the whole pipeline works end to end.

## The one architectural fact that decides everything

**The image model cannot see images.** `gpt-image-2_5`'s `reference_images`
argument is silently dropped, so `edit_image` runs as text-to-image and the
model never receives the file.

Proven three ways:

1. Sent a swatch board, asked for one square to change. Got back a
   **byte-identical file** — same sha256, 78,325 bytes, `elapsed_s: 4.3`.
2. Sent a solid olive square (`#6c8e3d`) and asked the model to *name its
   colour*. It answered **red**. The prompt named no colour, so text alone
   cannot explain the answer — it never saw olive.
3. `logs/jobs.jsonl` records `"refs": 1` on every call, and the anti-silent-drop
   guard in `chatgpt_farm.py:_wait_attachment_ready` raises no
   `error_attach_failed.png`. The guard believes the upload succeeded.

Earlier "successes" in this session were text-to-image coincidences: the prompts
described the colours they asked for, so a correct-looking result proved nothing.
That is why the diagnostic card (below) exists — its colours cannot be guessed.

Reported to the tool's author with reproduction steps. `generate_image` (no
refs) is unaffected.

## The pipeline that works

Because the model's only usable input is text, the split has to be:

| Step | Owner | Why |
|---|---|---|
| Derive the part map | script | measured fact, from the GLB's real UVs |
| Decide the palette | image model | taste and colour, its actual strength |
| Place every pixel | script | the model is bad at hard-edged rectangles |

**Palette-in, palette-out.** The model never touches the atlas. It restyles a
board of nine flat swatches; the script reads the nine colours back and fills
the atlas cells. This is Option B from above, confirmed as the right call.

## Verified artifacts

`experiments/cel-knight/harness/` — the tooling:

- `partmap.py` — rasterises mesh UVs, intersects the 8×4 grid, emits
  `partmap.json`. Reproduces the table above on all 15 used cells.
  **Needs `flip_v`**: trimesh UVs are bottom-left origin, the atlas PNG is
  top-left, so without the flip every mesh lands in the mirrored cell.
- `materials.json` — 15 used cells grouped into **9 material zones**.
- `make_inputs.py` — builds the input shapes (annotated atlas, swatch board,
  clean board, flat atlas).
- `extract_palette.py` — samples a returned board centre-out into palette JSON.
  Uses the median of a patch, so a soft edge cannot shift the value.
- `apply_palette.py` — palette → flat atlas → embed → render.
- `embed_texture.py` — swaps the PNG inside the GLB, byte-exact. Shifts only
  `bufferView` offsets; JSON chunk, node graph, skin and all 76 animations are
  preserved untouched. No re-export, no re-rig.
- `render.mjs` — headless three.js: `MeshToonMaterial` with a 3-step ramp plus
  inverted-hull outline, four angles, one contact sheet.
- `check_atlas.py` — scores a returned atlas for flatness and edge drift.
- `make_diagnostic.py` — the unguessable test card.

`experiments/cel-knight/manual/` — the finished run:

- `Knight_anime.glb` — 15 meshes, 7,024 verts, **76 clips intact**
- `knight-anime-atlas.png` — 15/15 cells flat, 0 soft edges, verdict PASS
- `knight-anime-render.png` — 4-view toon + outline
- `compare-before-after.png` — the before/after sheet

## Two facts that changed the design

**15 used cells, only 10 distinct gradients.** `r0c3 = r0c7 = r1c2 = r1c3` are
byte-identical; `r0c6 = r1c5` and `r1c0 = r2c2` likewise. So the palette has to
be authored per *material*, not per cell, or the model develops seams. That is
what `materials.json` encodes.

**`edit_image` was the wrong tool to test with.** A restyle task can accidentally
succeed from text alone. Any future check of image input must use content the
prompt does not reveal — hence the diagnostic card.

## The diagnostic card

`manual/diagnostic-card.png` — nine squares in nine arbitrary colours, and a
prompt that names none of them:

> Name the colour of each square in reading order, left to right, top to bottom,
> as a numbered list of nine. Use plain colour words. Then stop.

Correct answer: olive green, hot magenta, medium blue, amber, violet, near
black, pale mint, rust brown, off white. Anything else means the attachment was
dropped. **Run this first whenever the tool is touched.**

## Still open

1. The FBX (`fantasy_warrior_untextured.fbx`, Tripo, 5,498 verts, 5,774 faces)
   has **no UV layers at all** — it needs a real unwrap before any texturing.
   `analyse_fbx.py` does the Blender-headless inspection and render.
2. The part map is derived for the Knight only. The other three adventurers use
   the same grid and the same `PrototypePete_head` / `PrototypePete_body` mesh
   names, so it should generalise. Unverified.
3. Face treatment (item 4 of the shader list) is not implemented.
4. Nothing installed into the kit; `library/` untouched.
