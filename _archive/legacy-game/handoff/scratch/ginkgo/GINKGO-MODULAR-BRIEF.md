# Brief — modular ginkgo tree (for the agent who built the ginkgo avenue page)

Paste this whole file to the agent that created
`icho_namiki_enchanted_golden_ginkgo_avenue_procedural_three_js.html`.

---

## Context

You built the Enchanted Golden Ginkgo Avenue page. We are using **that tree** — not the avenue — as a
landmark in a game scene: a 96 × 96 m stylised meadow, three.js r170, ACES tone mapping, one
directional sun + one hemisphere light + low ambient, fog, no post yet.

The canopy is genuinely beautiful and we do not want it redesigned. We need the tree as a **reusable,
colour-parametric module**, and we need three problems fixed that only show up outside your page.

## What goes wrong when the tree leaves your page

1. **The trunk renders pure black.** Your bark is a Lambert material with a dark canvas texture, lit
   by three strong lights in your scene. In ours (ambient 0.15–0.4) it collapses into a silhouette.
2. **It leans hard to one side.** Your avenue trees lean toward the avenue centre. Standing alone, the
   tree reads as falling over.
3. **The lemon-gold leaves read as radioactive.** Emissive 0.5–0.8 against a green/violet meadow looks
   sickly rather than sunlit.

## What we need

One ESM module, `ginkgo-kit.js`, importable from a browser page, importing **only `three`**.
No scene, no lights, no renderer, no page UI, no avenue, no ground carpet, no sky, no bokeh — just the tree.

### API

```js
createGinkgoTree({
  seed = 1,              // deterministic; same seed -> identical tree
  palette = "summer",    // "summer" | "autumn" | "blossom" | custom palette object
  height = 10,           // metres, trunk base to canopy top
  lean = 0,              // 0 = upright
  crownOffset = 0,       // max metres the canopy centre may drift from the trunk base
  leafDensity = 1,       // multiplier on leaf count
  leafScale = 1,
  bark = "vertex",       // "vertex" | "texture" | null
  lod = false,           // if true also build a low-leaf canopy and expose setLod(near)
}) => { group, update(elapsed), setLod?(near), dispose(), stats }
```

- Origin at the trunk base, `y = 0`, `+Z` forward, no global transforms.
- `stats = { leaves, triangles, draws }`.
- Deterministic. No `Math.random()` anywhere in the build.

### Posture

- Trunk **upright** with a gentle S-curve; no avenue lean.
- Canopy mass centred over the base — at most 0.5 m offset.
- Canopy underside at **≥ 4 m** so a third-person camera (9–12 m back, 35–45° pitch) can see under it.
- Overall height 9–12 m, canopy 7–9 m wide, trunk radius 0.5–0.6 m at the buttress.
- Keep the root flare and the fluted buttress — that part is good.

### Colour

Palette object: `{ stem, base, mid, tip, vein, sun, shadow }` — `sun` / `shadow` are the two-tone pair.
Ship three named palettes:

| name | base | mid | tip | vein | sun | shadow |
|---|---|---|---|---|---|---|
| `summer` | `#4f7a2e` | `#6fa03a` | `#a8c95a` | `#7fae45` | `#a8c95a` | `#2f4f2a` |
| `autumn` | your gold, **20% less saturated** | | | | | |
| `blossom` | pale pink / cream | | | | | |

- **No emissive above 0.15.** The leaves must read by lighting, not by glowing.
- The colour must live in the palette, not be baked into the geometry builder.

### Materials

- Leaves: `MeshLambertMaterial` or `MeshStandardMaterial`, `vertexColors: true`, `DoubleSide`,
  roughness 1, metalness 0, `fog: true`.
- Bark: warm grey-brown ramp (`0x6b5a4a` → `0x3a2f27`), **not near-black**.
  - `bark: "vertex"` — bake two tones into vertex colours so it reads with no texture.
  - `bark: "texture"` — keep the canvas texture but lighten its base.
- Nothing may assume more than one directional light + one hemisphere light.

### Performance

- 1,800–2,500 leaves per tree, **≤ 120k triangles**.
- **≤ 8 draw calls:** merge ALL bark (trunk + primary boughs + sub-branches) into ONE geometry;
  canopy in 3–4 instanced meshes.
- `lod: true` builds a ~40% leaf canopy for distance.

### Deliverables

1. `ginkgo-kit.js` — single ESM file, only `three` import.
2. `preview.html` — the tree three times side by side (summer, autumn, blossom) at gameplay distance,
   plus a 10 m camera and a 25 m camera.
3. Screenshots: front, side, 3/4, and a close-up of the canopy from below.
4. One paragraph on what you changed.

### Acceptance

- Tree stands upright, canopy centred.
- Trunk reads as bark — not a black silhouette — under one directional light + hemisphere with ambient 0.2.
- The green version reads as a healthy summer tree, not a diseased one.
- No leaves floating detached from the canopy silhouette.
- Same seed → identical tree; ≤ 8 draws; ≤ 120k tris.

---

## For our side (not for the tree agent)

When the module lands, our integration is:

- place one tree at the shrine end of the path, `(0, -38.5)`, scale 1.0–1.2, summer palette;
- a fallen-leaf carpet under it (~600–1,000 instanced fan leaves, radius ~7 m);
- ~300 bokeh motes in the canopy, ~60 falling leaves — restrained;
- no post changes needed for the tree itself.
