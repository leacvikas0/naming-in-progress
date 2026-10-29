# REF-NOTES — what makes the two reference scenes look good

Mined from two read-only reference HTML files, for the Sunpetal Vale rebuild (see `SPEC.md`).
Numbers below are copied from the source, not estimated, unless marked `~` (derived).

| | **REF A** | **REF B** |
|---|---|---|
| File | `C:\Users\silen\Downloads\ai_studio_code (31).html` (61 KB, 1574 lines) | `C:\Users\silen\Downloads\sunlit_anime_meadow_modular_3d_botanical_studio_scene.html` (3.4 MB, 2256 lines; 3.3 MB of it is one base64 PNG on line 366) |
| three | r0.160.0 ES modules via importmap (`three`, `three/addons/`) | r128 global script from cdnjs |
| Look | **Twilight/dusk**, dense brute-force instancing, bloom, ACES | **High-key sunlit**, sparse hand-placed composition, no lights, no post |
| Scene size | 46 × 46 m, 21 000 grass instances | 26 × 24 m, ~890 grass instances |
| Camera | FOV 38°, y=8.2, z=13.2 (high meadow) | FOV 32°, r=8.6, phi=1.08 (≈28° down) |
| Lighting | 0 lights — all in one `ShaderMaterial` | 0 lights — all in one `ShaderMaterial` |
| Post | ACESFilmic + UnrealBloomPass | none (`renderer.render` direct, sRGB output only) |
| Sky | flat `scene.background` colour | flat `scene.background` colour |

**The single most important finding:** *neither file uses lights, fog objects, a sky dome, or
(except A's one bloom pass) post-processing.* Both achieve the anime look with **one custom
`ShaderMaterial` that interpolates between a hand-authored sun colour and a hand-authored
shadow colour per vertex**, plus a procedural "canopy shadow cookie" sampled in world XZ.
That is the technique to port. Everything else is density and composition.

---

## 1. REF A — twilight meadow engine (r160)

### 1.1 Sky / atmosphere
- **No sky dome.** `scene.background = new THREE.Color('#071824')` (twilight preset).
- Atmosphere is *faked in the fragment shaders*: a diagonal dappled "evening canopy light"
  mask + a radial fog blend to the background colour (see §4 S1).
- Three mood presets, all with the same 12 uniform slots:

| preset | skyBg | skyAmbient | groundAmbient | sunColor | sunDir (normalized) |
|---|---|---|---|---|---|
| twilight (default) | `#071824` | `#244d70` | `#07221d` | `#ffe6bd` | `(-0.55, 0.52, -0.65)` |
| dusk | `#121626` | `#3e3e6b` | `#0d211b` | `#ffc488` | `(-0.65, 0.42, -0.63)` |
| moonlight | `#040e1a` | `#18365c` | `#05171a` | `#b0deff` | `(-0.45, 0.62, -0.64)` |

- Canopy light (the signature): world-XZ rotated by `mat2(0.82,-0.57,0.57,0.82)`, then
  `bands = sin(p.y*0.44 + noise(p*0.18 + drift)*2.6)*0.5+0.5`, `dapple = noise(p*0.52 - drift)`,
  `fine = noise(p*1.25 + drift*0.6)`, `mask = bands*0.56 + dapple*0.31 + fine*0.13`,
  `drift = uTime*0.10`, then `smoothstep(0.35, 0.62, mask)`. Result multiplied by a
  `smoothstep(-20,-5, worldZ)` vignette so the near field gets 0.32× and the distance 1.05×.
- **Quirk to not copy:** fog is radial from the *world origin*, not the camera —
  `length(vWorldPos.xz)` with `smoothstep(16.0, 24.5, …)`. Fine for a 46 m diorama, wrong for
  a 140 m map.

### 1.2 Sun / fog
- Sun is a *uniform direction + colour*, never a `DirectionalLight`. `uSunDir` is the only
  light source; ambient comes from `mix(uGroundAmbient, uSkyAmbient, N.y*0.5+0.5)`.
- Fog: shader-side `smoothstep(16, 24.5, dist)` → `uSkyBg`. No `scene.fog`.
- Wrapped diffuse: `wrappedDiff = clamp((NdotL + 0.48) / 1.48, 0, 1)` — the `+0.48` wrap is
  what stops thin blades going black on the dark side.
- `directLightFactor = canopySun * (0.36 + 0.64 * wrappedDiff)`; then
  `color = mix(baseShadow + ambient*0.42, baseLit * uSunColor, directLightFactor)`.
- Backlight SSS: `backLight = pow(clamp(dot(V, -L + N*0.35), 0, 1), 2.6)`;
  rim: `fresnelRim = pow(1 - clamp(dot(N,V),0,1), 2.8)`;
  `color += sssColor * (backLight*0.65 + fresnelRim*0.48) * (0.25 + 0.75*canopySun) * sssWeight * uTranslucency * 0.48`.
- Specular: `pow(dot(N,H), 22.0) * specStrength * canopySun`, specStrength 0.08 (stem) /
  0.15 (leaf) / 0.24 (petal).
- Final soft highlight compression, on *both* foliage and terrain: `color = color/(1.0 + color*0.14)`.

### 1.3 Terrain / ground
- `PlaneGeometry(46, 46, 130, 130)` rotated `-PI/2`, displaced by `TerrainNoise.getHeight`
  (→ 33 800 tris), `computeVertexNormals()`.
- Height function (three terms only): a two-wave swell + fbm detail + a constant tilt (§4 S4).
  Amplitude ±1.24 m over 46 m — very gentle, no hills.
- Ground is **vertex-shader-free**: it is a `ShaderMaterial` with a *fragment-only* colour
  blend, `patchNoise = valueNoise(worldXZ*0.32)`, `shadowGround = mix(grassShadow*0.72,
  grassShadow*1.05, patchNoise)`, `litGround = mix(grassLit*0.48, grassLit*0.76, patchNoise) * uSunColor`,
  `col = mix(shadowGround, litGround, sun * NdotL)`.
- **No path, no water, no rocks, no trees.** The ground is deliberately a colour-drift field
  that foliage sits on. Its job is to never show a flat green plane — the noise does that.

### 1.4 Path / ground detail
- Absent. Nearest thing to ground detail: `patchNoise` at `0.32` frequency and the canopy
  dapple at `0.44/0.52/1.25` — i.e. detail is done with *light*, not with geometry or texture.
- Concrete lesson for the path: don't model a ribbon, **darken/lighten the terrain shader by a
  distance-to-path function**, exactly like `patchNoise` modulates the ground colour.

### 1.5 Water
- Absent.

### 1.6 Grass
- 3 tuft variants × `GRASS_PER_VARIANT = 7000` = **21 000 instances**, `InstancedMesh`,
  `frustumCulled = false`, one shared material → 3 draw calls.
- Tuft = 6 blades from `create3DLanceolateLeaf`: `bladeCount 6`, `yaw = b/6*2PI ± 0.32`,
  `dist 0.02..0.08` from origin, `length 0.62..0.95`, `width 0.09..0.135`,
  `archPitch 0.92..1.30`, `droop 0.28..0.48`. `~144 tris/tuft` (6 blades × 24).
- Blade cross-section is a **V-crease** (3 verts per row: left raised, mid dropped, right
  raised) — `creaseDepth = halfW*0.34`. This is what gives a 2-tri-wide blade volume.
- Placement: uniform in a disc, `r = sqrt(rand)*20.5`, `theta = rand*2PI`, y from height fn.
- Clumping: `clusterBoost = fbm(x*0.25+6, z*0.25-4)`; if `> 0.52` add `+0.25` to XZ scale and
  `+0.35` to Y scale. Base scale `0.78..1.38` XZ, `0.75..1.35` Y. That single threshold is the
  entire "grass has patches" effect.

### 1.7 Flowers
- **Hero stalks:** 4 variants (`seeds 101, 227, 389, 541`) × `STALKS_PER_VARIANT = 440` = 1 760
  instances. `~780 tris/stalk` per the file's own HUD (stem 10×6 tube + 7–9 V-folded leaves +
  9–11 florets + 2 buds).
- **Wildflowers:** 3 variants (`701, 823, 947`) × 720 = 2 160 instances, 3 stems/clump, height
  0.48–0.66, 5-petal head tagged `aPartId 4.0` (pearl-white).
- Floret builder (the good bit): 5 sepals + a **fused bell tube that flares into 5 cupped,
  recurved petals** + 5 stamens. All constants in §4 S3 / below.
  - calyx: `r0 0.024, rMid 0.056, rTip 0.078, hMid 0.048, hTip 0.105`, span `0.55` of sector.
  - corolla: `uSteps 4` across petal, `vSteps 6` along; `tubeRadius = (0.026 + v*0.115)*scale`;
    `lobeFlare = pow(isLobe,1.4)*0.26*openness*scale`; `yTube = v*0.24*scale`;
    `yRecurve = sin(isLobe*PI*0.78)*0.085*scale - pow(isLobe,2.3)*0.06*scale`.
  - petal surface: `cupDepth = (1-uNorm²)*isLobe*0.036*scale`,
    `midribGroove = (1-|uNorm|)*isLobe*0.014*scale`, `y += uNorm²*isLobe*0.02*scale`.
  - colour: `veinWave = sin(uNorm*18)*0.5+0.5` modulating 1.0→0.87; luminous throat ring
    `exp(-((vNorm-0.36)*7)²)` adds `vec3(0.26,0.18,0.35)`.
- Placement in colonies: warp each candidate by ±4.2 m of noise, then
  `colony = fbm(wx*0.28+2.4, wz*0.28+7.1)`; accept if `> 0.48`; size
  `0.78 + min(1,(colony-0.48)*3.5)*0.68`. Wildflowers: `fbm(x*0.34-5.2, z*0.34+3.8) > 0.45`.
- **Hero foreground bouquet:** 9 stalks forced into a bottom-right box `x 1.1..3.4, z 8.2..10.8`,
  scale `1.22..1.65` — deliberately oversized foreground framing, like the reference art.

### 1.8 Trees / bushes
- Absent as geometry. The "canopy" exists only as the `getEveningCanopyLight` shadow cookie —
  the scene pretends a tree overhead casts dappled shade. Cheap, and it reads convincingly.
- Steal for trees: the *shadow cookie* for real trees, plus the V-folded leaf builder as the
  canopy primitive (see §5).

### 1.9 Lighting
- No `DirectionalLight`, no `HemisphereLight`, no `AmbientLight`, no shadow maps anywhere.
- `renderer.toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = 1.05`
  (UI slider 0.7–1.45), `setPixelRatio(min(dpr, 2))`, antialias on.
- Ambient term is a hemisphere mix in shader: `mix(groundAmbient, skyAmbient, N.y*0.5+0.5)`.

### 1.10 Post-processing
- `EffectComposer` → `RenderPass` → **one** `UnrealBloomPass(res, strength 0.16, radius 0.55,
  threshold 0.86)`. Deliberately weak/high-threshold: "only sunlit specular/rim accents glow".
- No grade pass, no vignette, no SMAA, no outline pass, no dithering.
- Combined with the in-shader `color/(1+color*0.14)`, nothing ever clips.

### 1.11 Camera framing
- `PerspectiveCamera(38, aspect, 0.1, 120)`.
- Meadow view: `pos (0.4, 8.2, 13.2)` → `target (0.2, 0.7, 0.5)` (≈31° down, 15.5 m away).
- Hero view: `pos (1.9, 1.85, 11.8)` → `target (0.8, 0.75, 4.5)` (≈5° down, eye level).
- `OrbitControls`: `damping 0.05`, `maxPolarAngle 0.48π`, `minDistance 0.8`, `maxDistance 32`.
- Composition trick: foreground flowers occupy the bottom-right third; meadow opens to the
  upper left; the fog/skyBg band closes the top.

### 1.12 Palette (REF A) — the good hexes, per mood preset
| preset | skyBg / skyAmbient / groundAmbient | sun | grass shadow / lit / tip | petal shadow / lit / rim |
|---|---|---|---|---|
| twilight (default) | `#071824` / `#244d70` / `#07221d` | `#ffe6bd` | `#0b3830` / `#42a333` / `#9df03a` | `#3b2d85` / `#b86bf2` / `#ff9ce9` |
| dusk | `#121626` / `#3e3e6b` / `#0d211b` | `#ffc488` | `#10382c` / `#57ab2b` / `#c2f238` | `#4a2b7c` / `#cf6af5` / `#ffb0e4` |
| moonlight | `#040e1a` / `#18365c` / `#05171a` | `#b0deff` | `#072629` / `#227859` / `#60d48e` | `#282268` / `#7f58e8` / `#c69cff` |

Note `grassTip #9df03a` and `petalRim #ff9ce9` are *deliberately over-bright* (they are added
through the SSS term, not used as albedo) — that is how the tips get their glow without bloom.

### 1.13 Performance
- 11 draw calls in meadow mode (3 grass + 4 stalk + 3 wildflower + 1 terrain), `~4.5 M tris`.
- All instanced meshes have `frustumCulled = false` → **no culling at all**; it brute-forces.
- Geometry merged per-asset into one `BufferGeometry` with a custom 6-attribute layout
  (`position, normal, uv, aPartId, aSwayWeight, aPetalCoord`) so one material draws every part
  of a flower: 1 draw call per variant. `mergeSubGeometries` is a hand-rolled, index-free merger.

---

## 2. REF B — sunlit meadow studio (r128)

### 2.1 Sky / atmosphere
- **No sky dome.** `scene.background = new THREE.Color('#6a9c78')` (a *green* — the camera is
  pitched down far enough that the horizon is never in frame). Turntable mode swaps to `#1a2a25`.
- No fog object. The only aerial perspective is a fragment-shader term (§2.2): distant geometry
  warms toward `vec3(0.76, 0.87, 0.56)` = **`#c2de8f`** over the last 14 m of Z.
- So: atmosphere here = *depth-fade colour only*. If the Lead's sky is visible, this ref gives
  no sky to copy — it gives the haze colour `#c2de8f` and the rule "distance warms and desaturates".

### 2.2 Sun / fog
- Sun is `sharedUniforms.uSunDir = (0.58, 0.74, 0.34).normalize()` → elevation ≈ 47.7°,
  azimuth ≈ 30° from +Z toward +X.
- The UI "Sun Angle" slider remaps it as
  `uSunDir = (sin(rad)*0.68, 0.74, cos(rad)*0.55).normalize()`, default 38°.
- No `DirectionalLight`. Lighting model per fragment:
  - `rawN = gl_FrontFacing ? N : -N` (double-sided leaves), then
    `upN = normalize(vec3(rawN.x*0.35, 1.0, rawN.z*0.35))`
  - `softFactor`: rock `0.08`, terrain `0.45`, foliage `uNormalSoftness = 0.82`;
    `N = normalize(mix(rawN, upN, softFactor))` ← **the anti-black-blade trick**
  - `wrapLit = smoothstep(-uSubsurfaceWrap, 0.55, dot(N, uSunDir))`, `uSubsurfaceWrap = 0.35`
  - `lightFactor = wrapLit * (1 - canopyShadow*0.86)`
  - `col = mix(vColorShadow, vColorSun, lightFactor)` — **a 2-colour ramp, no PBR at all**
  - petal-only rim: `smoothstep(0.2,0.95,vWindWeight) * (1-canopyShadow*0.75) * 0.35`, then
    `col = mix(col, vColorSun*1.06, rim*0.45)` — capped at 1.06× so it can never blow out
  - `col = mix(col, vec3(0.76,0.87,0.56), smoothstep(3.0,-11.0,z)*0.14*(1-canopyShadow*0.5))`
  - `gl_FragColor = clamp(col, 0, 1)` — **no tone mapping** (r128 `outputEncoding = sRGBEncoding`)
- Canopy shadow cookie, authored as **two explicit ellipse zones** in world XZ (a hand-painted
  shadow map as math), blended with fbm: upper-left zone centred `(-5.2, -4.8)` with radii
  `(5.8, 5.2)` and `1.28 - dist` falloff; centre-right band centred `(1.4, 0.9)`, rotated
  `0.82/0.57`, radii `(2.9, 1.65)`, `1.08 - dist`; then `smoothstep(0.32, 0.72, max(c1, c2*0.92))`
  × `uCanopyIntensity = 0.88`.

### 2.3 Terrain / ground
- Hand-built grid, not `PlaneGeometry`: `tWidth 26, tDepth 24, segX 72, segZ 72` = 10 368 tris,
  X spans `[-13,13]`, Z spans `[-13.2, 10.8]` (`(iz/segZ - 0.55)*tDepth`, i.e. offset toward
  the viewer).
- Height (§4 S4): `slopeZ = -z*0.14`, `bowlX = x²*0.0035`, `undulation = sin(x*0.22+z*0.18)*0.18
  + cos(x*0.45-z*0.35)*0.08`. Over 26 m that is ~3.6 m of cross-slope plus ±0.26 m of roll —
  reads as a hillside because of the *tilt*, not the noise.
- Per-vertex 2-colour bake: `n = fbm2D(x*0.45, z*0.45)`;
  `sun = grassSunMid.lerp(grassSunBright, n*0.72)`, `shd = grassShadeDeep.lerp(grassShadeMid, n*0.65)`.
- Index winding is `(a,c,b, b,c,d)` — note this is the *opposite* of REF A; it matters only if
  you copy the loop.

### 2.4 Path / ground detail
- Absent (this ref is a flowerbed vignette, no path). Ground detail = the two-tone fbm bake at
  `0.45` frequency only.
- The **rock collar** trick is the reusable bit: tall grass is *not* scattered randomly, it is
  ringed around each anchor (`anchorPoints` = rocks with `rad = sx*0.68, count 10`, hero clumps
  with `rad 0.55, count 6`, plus 3 hand-placed patches of 8–12). Foliage density follows objects.

### 2.5 Water
- Absent.

### 2.6 Grass
- 3 variants (`createMeadowGrassTuftGeometry`): **v0 short turf** (7 broad blades, `len
  0.24..0.39`, `width 0.058..0.08`, `arch 0.22`, windScale 0.45), **v1 tall arching sword**
  (9 blades, `len 0.48..0.76`, `width 0.068..0.093`, `arch 0.32`, windScale 0.75), v2 collar.
- Blade builder `addArchingLeaf` is the workhorse (see §4 S6): `segments 3`, profile
  `sin(pow(t,0.72)*PI)` (narrow base → wide belly at t≈0.38 → point), `reach = length*t*cos(pitch
  + t*arch*0.6)`, `lift = length*(t*sin(pitch) - t²*arch)`, V-fold `fold 0.01..0.022` with the
  mid vertex pushed *down* by `fold*0.5*profile` and darkened ×0.94.
- **10 tris/blade** → `~70 tris` short tuft, `~90 tris` tall tuft.
- Instancing: short turf on a jittered grid `gz -7.5..4.2 step 0.46`, `gx -6.5..6.5 step 0.46`,
  jitter `±0.17`, skip inside boulders (`dist < sx*0.52`) → **~740 instances**; tall tufts
  ring the anchors → **~149 instances**. Two `InstancedMesh`, 2 draw calls, ~65 k tris total.
- Scale `0.78..1.30` XZ, Y `×(0.85..1.20)`; rotation ±0.06 rad tilt, random yaw.

### 2.7 Flowers
- 4 families × 3 variants, **every head hand-placed** (`heroClumpPlacements` 15, `fgPlacements` 4,
  `violetPlacements` 8, `daisyPlacements` 13 = **40 meshes, 40 draw calls**). No flower instancing.
- **Star-bellflower head** (5 petals, the hero flower) — constants in §4 S3:
  `cupR 0.042, cupH 0.048, midR 0.125, midH 0.095, tipR 0.215, tipH 0.115` (all × scale),
  petals at 72°, cup/mid angular spans `0.92`/`0.78` of a sector, mid ring lifted `+0.012`
  at the shoulders and dropped `-0.008` at the centre (the "depressed vein crease"),
  `~58 tris/head` + 4-vert golden stamen cone.
- **Daisy head** (6–7 petals): `btnR 0.032`, `innerR 0.028`, `midR 0.088`, `outerR 0.128`,
  petal half-span `0.56` sector, each petal a 4-vert quad `(base, midL, tip, midR)`,
  button ring at `y 0.005*scale`, top at `0.022*scale`.
- Per-blossom tint jitter: `color.offsetHSL(tintShift*0.03, 0, tintShift*0.03)` — ±3% hue/±4%
  lightness only. That is enough to read as hand-painted.
- Composition rule stated in the source: **60 % breathable green turf**, flowers only in
  "compositional islands", centre diagonal corridor kept open.

### 2.8 Trees / bushes
- No trees. The "bush" is the hero bellflower clump: **15–16 broad dark-sage lance leaves** in a
  2-tier basal rosette (tier 0: `pitch 0.32..0.54`, `len 0.68..0.90`; tier 1: `pitch 0.68..0.96`,
  `len 0.58..0.76`; `width 0.13..0.17`; `fold 0.022`; `arch 0.28..0.40`) + 6–7 curved stems
  (`quadratic Bezier`, 3-sided, `radius 0.018→0.008`) each carrying a main blossom, a lateral
  blossom at `t 0.74` and a crown bud on alternate stems.
  `~1.3 k tris/clump` (derived: 15 leaves×10 + 6 stems×24 + 12 heads×58 + 3 buds×20 + 6 lateral stems×24).
- **Rocks** as the third "mass": `IcosahedronGeometry(0.68, 1)` → non-indexed, per-variant stretch
  `(1.35,0.78,1.05)`, lower hemisphere flattened (`if (y < -0.15) y = -0.15 + (y+0.15)*0.25`),
  ridge displacement `sin(vx*2.7 + variant*1.4)*0.09 + cos(vz*2.3 - variant)*0.08`, then
  **per-face** colour: `topFactor = smoothstep(0.15,0.72, fn.y)` →
  `rockMidSlate.lerp(rockTopSun, topFactor*0.92 + sideLight*0.25)`, plus green moss blend
  `smoothstep(0.18, 0.0, v.y)*0.45` toward `rockMossBase`.

### 2.9 Lighting
- **No lights.** Only `sharedUniforms.uSunDir`, `uCanopyIntensity 0.88`, `uNormalSoftness 0.82`,
  `uSubsurfaceWrap 0.35`, `uWindStrength 0.55`.
- Renderer: `outputEncoding = sRGBEncoding`, `setPixelRatio(min(dpr,2))`, antialias. No tone
  mapping, no exposure control, no shadow map.
- The file's own comment states the intent: "Clamped soft wrap-lighting with **ZERO blown-out
  bloom**" and "NEVER blows out to white".

### 2.10 Post-processing
- **None.** `renderer.render(scene, camera)` straight to the canvas.
- Anti-washout is achieved instead by: (a) `clamp(col,0,1)` in shader, (b) 2-colour ramp
  (never a white specular), (c) rim capped at `×1.06`.

### 2.11 Camera framing
- `PerspectiveCamera(32, aspect, 0.1, 120)` — the narrow "telephoto anime lens".
- Valley pose: `target (0, 0.38, -0.45)`, `radius 8.6`, `phi 1.08` (≈28° down), `theta 0.02`.
  So: **32° FOV, 8.6 m back, 2.2 m eye height, near-dead-on, 28° pitch.**
- Pan/orbit hand-rolled in spherical coords; `phi` clamped `0.25..1.48`, radius `1.4..22`.
- Composition: 3 hero boulders at `(-2.45,-2.55)`, `(-1.32,0.48)`, `(2.85,0.55)`; flower islands
  between them; two oversized foreground clumps at `z ≈ +3.4` (scale 1.48–1.55) framing the
  bottom corners; everything else left as open green.

### 2.12 Palette (REF B) — extracted
| family | sun ramp (base → mid → tip) | shadow ramp |
|---|---|---|
| grass | `#8cb566` → `#b5d372` → `#c1dc79` | `#49776e` → `#598975` |
| leaf | `#466e5d` → `#5e8d6f` → `#a7c878` | `#3b6058` |
| petal | `#8e75cd` → `#c39ef0` → `#e4bdf6` | `#5d5896` → `#736eb0` → `#8d89c7` (bud `#9c7fe0`) |
| violet | `#6f58a8` → `#a873db` → `#d299f2` | — |
| daisy | `#c7d4cc` → `#fafaf6` | — |
| stamen | `#d98a2b` → `#eeb942` | — |
| rock | top `#e9dad3`, slate `#939bb0`, shadow `#5b7789`, moss `#5a876f` | — |
| haze (depth fade) | `#c2de8f` | — |
| UI swatches "from image" | `#c1dc79` `#4e8874` `#507865` `#c9a5ef` `#6c68a4` `#e9dad3` | — |

### 2.13 Performance
- 46 draw calls, `~115 k tris` (terrain 10.4 k + grass 65 k + 40 flower clumps ~39 k + rocks 240).
- **One tenth the triangles of REF A and it looks better**, because every triangle is
  hand-composed and the shading is a clean 2-colour ramp.
- `InstancedMesh` used only for grass; flowers are individual `Mesh` sharing a material
  (40 draw calls is acceptable at this scale but does not scale to a 140 m map).
- Telemetry reads `obj.count` for `isInstancedMesh` to report instance-expanded triangles.

---

## 3. Palette table — merged, grouped by role, mapped to `palette.js`

`game/src/map/palette.js` already covers every slot. This table says *which ref hex to trust*
for each slot and where the refs disagree with the current palette.

| role | REF A | REF B | `MEADOW.*` slot | note |
|---|---|---|---|---|
| **sky zenith** | `#071824` | — | `skyZenith 0x3d86cf` | refs are night/none; keep palette |
| **sky mid** | `#244d70` (ambient) | — | `skyMid 0x86cff0` | — |
| **sky horizon / haze** | `#071824` (fog target) | `#c2de8f` | `skyHorizon 0xe9f7ee`, `fog 0xd6ecea` | ref B's `#c2de8f` is a *ground* haze; good for low fog, too green for sky |
| **sun glow / disc** | `#ffe6bd` (twilight sun) | — | `skySunGlow 0xfff0c2`, `sunDisc 0xfffbe8` | palette is right |
| **sunlight** | `#ffe6bd` | — (uniform only) | `sun 0xfff3d6` | ref A's is 8 % more orange; good for golden hour preset |
| **sunlit grass** | `#42a333` (lit) / `#9df03a` (tip) | `#b5d372` (mid) / `#c1dc79` (bright) | `grassBase 0x7cb257`, `grassWarm 0xaccf6b`, `grassTip 0xd9ea8d` | **ref B is the better match**; ref A's `#42a333` is neon |
| **shadow grass** | `#0b3830` | `#49776e` / `#598975` | `grassShadow 0x3f7248`, `grassCool 0x5f9757` | **hue delta worth fixing**: ref B shadows are teal `hsl(168,24%,38%)`; palette's `#3f7248` is green `hsl(131,29%,35%)`. Nudging `grassShadow` toward `#3f7248 → #47756a` is the cheapest "anime" win |
| **foliage light** | `#9df03a` (tip) | `#a7c878` | `canopyLight 0xb8dd6c` | — |
| **foliage mid** | `#42a333` | `#5e8d6f` | `canopyMid 0x77b74f`, `bushMid 0x62a052` | ref B is desaturated sage; use for far foliage |
| **foliage shadow** | `#0b3830` | `#3b6058` / `#466e5d` | `canopyDark 0x3f7a4c`, `bushDark 0x3d7749` | ref B `#3b6058` is the teal-shadow target |
| **foliage rim** | `#9df03a` / `#ff9ce9` | `#a7c878` | `canopyRim 0xeaf7ab` | — |
| **trunk** | — | — | `trunk 0x8a6244`, `trunkDark 0x5f4331` | not in either ref |
| **path** | — | — | `path 0xdcc79c`, `pathEdge 0xc2a97c` | not in either ref; ref B's `rockTopSun #e9dad3` is the closest sunlit-dirt value |
| **path stone** | — | `#939bb0` / `#5b7789` / `#e9dad3` | `pathStone 0xd2c9ae` | use ref B rock trio for stepping stones |
| **stone (rock)** | — | `#e9dad3` top, `#939bb0` mid, `#5b7789` shadow, `#5a876f` moss | `pathStone`, `hillNear` | **copy this trio verbatim**, it is the best-specified thing in either file |
| **water** | — | — | `water 0x5fc9c9`, `waterDeep 0x2f8f9a`, `waterShallow 0x9fe6dd`, `waterFoam 0xe6fdf8` | not in either ref |
| **flower accent lilac** | `#b86bf2` (lit) / `#3b2d85` (shadow) / `#ff9ce9` (rim) | `#c39ef0` / `#e4bdf6` / `#736eb0` / `#5d5896` | `flowerLilac 0xc0a8f0` | palette sits between the two, correct |
| **flower accent cream** | — | `#fafaf6` (daisy) / `#eeb942` (stamen) | `flowerCream 0xfff1b8`, `flowerGold 0xffd76b` | — |
| **flower accent pink** | `#ff9ce9` (rim) | `#d299f2` (violet) | `flowerPink 0xf7b8d3` | — |
| **highlight / rim** | `#9df03a` grass, `#ff9ce9` petal | `#e4bdf6` tip, `#c1dc79` | `canopyRim`, `flowerWhite` | refs never use pure white as a highlight except the daisy `#fafaf6` |
| **haze (distance)** | `#071824` | `#c2de8f` | `fog 0xd6ecea`, `hillFar 0xc6dbd6` | for a *sunlit* map use ref B's warm-green haze near the ground, palette's `fog` at the horizon |

Measured hue check (why the shadow shift matters): REF B `#598975` = `hsl(155,21%,44%)`,
`#49776e` = `hsl(168,24%,38%)`; `palette.grassShadow #3f7248` = `hsl(131,29%,35%)`.
A 25–35° hue rotation toward teal in the shadow ramp is the difference between "green plastic"
and "anime meadow". Recommend the Lead adjust `grassShadow`/`canopyDark` (palette owner).

---

## 4. Verbatim snippets

### S1 — Atmosphere: canopy light + shader fog (REF A, verbatim, trimmed)

```glsl
// sharedGLSL — included in every REF A material
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Diagonal dappled evening light bands filtering through canopy leaves
float getEveningCanopyLight(vec2 worldXZ) {
  if (uInspectorMode > 0.5) return 0.88;
  mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
  vec2 p = rot * worldXZ;
  float drift = uTime * 0.10;
  float bands  = sin(p.y * 0.44 + valueNoise(p * 0.18 + drift) * 2.6) * 0.5 + 0.5;
  float dapple = valueNoise(p * 0.52 - vec2(drift, drift * 0.5));
  float fine   = valueNoise(p * 1.25 + vec2(drift * 0.6, -drift * 0.7));
  float mask = bands * 0.56 + dapple * 0.31 + fine * 0.13;
  float topVignette = smoothstep(-20.0, -5.0, worldXZ.y);
  mask *= mix(0.32, 1.05, topVignette);
  return smoothstep(0.35, 0.62, mask);
}
// ...used in the fragment shader as:
//   float sun = getEveningCanopyLight(vWorldPos.xz);
//   float dist = length(vWorldPos.xz);
//   float fogFactor = smoothstep(16.0, 24.5, dist);
//   col = mix(col, uSkyBg, fogFactor);
```

### S1b — Sky dome (DERIVED — *neither reference has a sky dome*)

Both files use a flat `scene.background`. Since the new map must show sky, this is written from
`palette.js` slots and REF B's haze rule (distance → warmer/desaturated). Treat as a starting
point, not extracted.

```glsl
uniform vec3 uZenith, uMid, uHorizon, uSunGlow, uSunDir;
varying vec3 vDir;                       // normalized world-space view direction
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.00, 0.28, h));
  col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunGlow * pow(sd, 6.0)   * 0.55;   // wide warm glow
  col += uSunGlow * pow(sd, 180.0) * 1.40;   // soft disc (no bloom needed)
  col = mix(col, uHorizon, smoothstep(0.12, -0.02, d.y));  // horizon haze band
  gl_FragColor = vec4(col, 1.0);
}
// uZenith = 0x3d86cf, uMid = 0x86cff0, uHorizon = 0xe9f7ee, uSunGlow = 0xfff0c2
```

### S2 — Grass wind vertex shader (REF B, verbatim)

```glsl
attribute float aWindWeight;
uniform float uTime, uWindStrength, uSwayScale;
// ...
vec4 worldPosition = modelMatrix * vec4(position, 1.0);
#ifdef USE_INSTANCING
  worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
#endif

// Gentle layered meadow breeze wave
float w = aWindWeight * uWindStrength * uSwayScale;
if (w > 0.001) {
  float wave1 = sin(uTime * 2.1 + worldPosition.x * 0.75 + worldPosition.z * 0.55);
  float wave2 = cos(uTime * 3.4 - worldPosition.x * 0.45 + worldPosition.z * 0.95) * 0.35;
  float gust = (wave1 + wave2) * w;
  worldPosition.x += gust * 0.14;
  worldPosition.z += gust * 0.08;
  worldPosition.y -= abs(gust) * 0.03;   // blades shorten as they bend
}
```

REF A's equivalent adds a per-instance phase and interactive player parting:

```glsl
float windPhase   = worldXZ.x * 0.42 + worldXZ.y * 0.35 + uTime * 1.85;   // worldXZ from
float primaryWave = sin(windPhase) + cos(windPhase * 0.65) * 0.5;         // instanceMatrix
float bend = aSwayWeight * uWindStrength * 0.13;    // aSwayWeight = pow(y/maxH, 1.4)
pos.x += primaryWave * bend;  pos.z += primaryWave * bend * 0.7;
// petal-only flutter: sin(uTime*4.8 + pos.x*16 + pos.z*16) * 0.007 * aPetalCoord.y
// parting: radius 2.5 m, push = pow(1 - d/2.5, 1.75) * 0.95 * aSwayWeight, pos.y -= push*0.22
```

### S3 — Flower geometry builder core math (REF B `addStarBellflowerHead`, verbatim, trimmed)

```js
// orthonormal basis around the blossom's aim direction
const up = aimDir.clone().normalize();
const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3().crossVectors(up, ref).normalize();
const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
const toWorld = (lx, ly, lz) => new THREE.Vector3(
  centerPos.x + right.x * lx + up.x * ly + fwd.x * lz,
  centerPos.y + right.y * lx + up.y * ly + fwd.y * lz,
  centerPos.z + right.z * lx + up.z * ly + fwd.z * lz
);
// per-blossom hand-painted tint jitter
const cThroatSun = PALETTE.petalSunBase.clone().offsetHSL(tintShift * 0.03, 0, tintShift * 0.03);
const cMidSun    = PALETTE.petalSunMid .clone().offsetHSL(tintShift * 0.03, 0, tintShift * 0.04);
const cTipSun    = PALETTE.petalSunTip .clone().offsetHSL(tintShift * 0.02, 0, tintShift * 0.03);
const cThroatShd = PALETTE.petalShadeDeep.clone().offsetHSL(tintShift * 0.02, 0, 0);
const cMidShd    = PALETTE.petalShadeMid .clone().offsetHSL(tintShift * 0.02, 0, 0);
const cTipShd    = PALETTE.petalShadeTip .clone().offsetHSL(tintShift * 0.02, 0, 0);

const vBase = this.addVertex(centerPos.x, centerPos.y, centerPos.z,
                             PALETTE.leafDeepBase, PALETTE.leafShade, windWeight * 0.85);
const numPetals = 5;
const cupR = 0.042 * scale, cupH = 0.048 * scale;   // fused cup throat
const midR = 0.125 * scale, midH = 0.095 * scale;   // wide ovate shoulders
const tipR = 0.215 * scale, tipH = 0.115 * scale;   // pointed star tip
for (let p = 0; p < numPetals; p++) {
  const aCenter = (p / numPetals) * Math.PI * 2;
  const aLeft   = aCenter - (Math.PI / numPetals) * 0.92;
  const aRight  = aCenter + (Math.PI / numPetals) * 0.92;
  // cup throat (3 verts) -> fan from the calyx centre
  const pCupL = toWorld(Math.cos(aLeft)  * cupR, cupH,     Math.sin(aLeft)  * cupR);
  const pCupM = toWorld(Math.cos(aCenter) * (cupR * 0.92), cupH * 0.9, Math.sin(aCenter) * (cupR * 0.92));
  const pCupR = toWorld(Math.cos(aRight) * cupR, cupH,     Math.sin(aRight) * cupR);
  const vCupL = this.addVertex(pCupL.x, pCupL.y, pCupL.z, cThroatSun, cThroatShd, windWeight * 0.9);
  const vCupM = this.addVertex(pCupM.x, pCupM.y, pCupM.z, cThroatSun.clone().multiplyScalar(0.9),
                               cThroatShd.clone().multiplyScalar(0.9), windWeight * 0.9);
  const vCupR = this.addVertex(pCupR.x, pCupR.y, pCupR.z, cThroatSun, cThroatShd, windWeight * 0.9);
  this.addTri(vBase, vCupM, vCupL); this.addTri(vBase, vCupR, vCupM);
  // wide flaring shoulders + depressed central vein crease
  const aMidL = aCenter - (Math.PI / numPetals) * 0.78;
  const aMidR = aCenter + (Math.PI / numPetals) * 0.78;
  const pMidL = toWorld(Math.cos(aMidL)   * midR, midH + 0.012 * scale, Math.sin(aMidL)   * midR);
  const pMidM = toWorld(Math.cos(aCenter) * (midR * 0.95), midH - 0.008 * scale, Math.sin(aCenter) * (midR * 0.95));
  const pMidR = toWorld(Math.cos(aMidR)   * midR, midH + 0.012 * scale, Math.sin(aMidR)   * midR);
  const vMidL = this.addVertex(pMidL.x, pMidL.y, pMidL.z, cMidSun, cMidShd, windWeight * 0.96);
  const vMidM = this.addVertex(pMidM.x, pMidM.y, pMidM.z,
                               cThroatSun.clone().lerp(cMidSun, 0.55),
                               cThroatShd.clone().lerp(cMidShd, 0.55), windWeight * 0.96);
  const vMidR = this.addVertex(pMidR.x, pMidR.y, pMidR.z, cMidSun, cMidShd, windWeight * 0.96);
  this.addQuad(vCupL, vCupM, vMidM, vMidL);
  this.addQuad(vCupM, vCupR, vMidR, vMidM);
  // pointed star tip
  const pTip = toWorld(Math.cos(aCenter) * tipR, tipH, Math.sin(aCenter) * tipR);
  const vTip = this.addVertex(pTip.x, pTip.y, pTip.z, cTipSun, cTipShd, windWeight);
  this.addTri(vMidL, vMidM, vTip); this.addTri(vMidM, vMidR, vTip);
}
// golden stamen: 4-vert ring at cupH*0.85 + cone to midH*0.92, radius 0.026*scale
```

REF A's floret is the alternative (5 sepals + fused tube + recurved petals, 5 stamens,
`uSteps 4 × vSteps 6` per petal, `~58 tris/head`) — see §1.7 for its constants.

### S4 — Terrain height functions (both, verbatim)

```js
// REF A — 46x46 m meadow, amplitude ~±1.24 m
static getHeight(x, z) {
  const wave   = Math.sin(x * 0.13 + z * 0.09) * 0.72 + Math.cos(x * 0.09 - z * 0.14) * 0.52;
  const detail = (this.fbm(x * 0.16, z * 0.16, 3) - 0.5) * 0.85;
  const slope  = -z * 0.085;
  return wave + detail + slope;
}
// fbm: 3 octaves, amp 0.5, freq 1.0, freq *= 2.02, amp *= 0.5 (both files identical)

// REF B — 26x24 m hillside, ~3.6 m cross-slope + ±0.26 m roll
function getValleyHeight(x, z) {
  const slopeZ     = -z * 0.14;
  const bowlX      = (x * x) * 0.0035;
  const undulation = Math.sin(x * 0.22 + z * 0.18) * 0.18 + Math.cos(x * 0.45 - z * 0.35) * 0.08;
  return slopeZ + bowlX + undulation;
}
// normal by central difference, eps 0.15:
function getValleyNormal(x, z) {
  const eps = 0.15;
  const n = new THREE.Vector3(
    getValleyHeight(x - eps, z) - getValleyHeight(x + eps, z), 2.0 * eps,
    getValleyHeight(x, z - eps) - getValleyHeight(x, z + eps));
  return n.normalize();
}
```

### S5 — Post-processing chain with parameters (REF A, verbatim)

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;          // UI slider 0.7 .. 1.45

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Restrained, high-threshold bloom so only sunlit specular/rim accents softly glow
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.16,   // strength
  0.55,   // radius
  0.86    // threshold
);
composer.addPass(bloomPass);
// ...animate(): composer.render();
// ...resize(): renderer.setSize(w,h); composer.setSize(w,h);
```

REF B has **no** post chain — its anti-washout is entirely in-shader:
`col = clamp(col, 0.0, 1.0)` after a 2-colour ramp and a rim capped at `×1.06`.

### S6 — Leaf/blade builder (REF B `addArchingLeaf`, verbatim core)

One function builds grass blades, lance leaves, canopy leaf fans and fern fronds.

```js
addArchingLeaf({ baseX=0, baseY=0, baseZ=0, yaw=0, pitch=0.45, length=0.65, width=0.11,
                 arch=0.24, fold=0.018, segments=4,
                 colBaseSun, colTipSun, colBaseShd, colTipShd, windScale=0.6 }) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const sideX = -sinY, sideZ = cosY;
  const rings = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const profile = Math.sin(Math.pow(t, 0.72) * Math.PI);   // belly at t≈0.38
    const halfW = width * 0.5 * profile;
    const reach = length * t * Math.cos(pitch + t * arch * 0.6);
    const lift  = length * (t * Math.sin(pitch) - t * t * arch);
    const cx = baseX + cosY * reach, cy = baseY + Math.max(0.005, lift), cz = baseZ + sinY * reach;
    const sunC = colBaseSun.clone().lerp(colTipSun, Math.pow(t, 0.85));
    const shdC = colBaseShd.clone().lerp(colTipShd, Math.pow(t, 0.85));
    const w = t * t * windScale;                             // bend ∝ height²
    if (i === segments) { rings.push([this.addVertex(cx, cy, cz, sunC, shdC, w)]); continue; }
    // V-fold: L/R lifted +fold, mid dropped -fold/2 and darkened ×0.94
    rings.push([
      this.addVertex(cx + sideX*halfW, cy + fold*profile,     cz + sideZ*halfW, sunC, shdC, w),
      this.addVertex(cx,              cy - fold*0.5*profile, cz, sunC.clone().multiplyScalar(0.94),
                     shdC.clone().multiplyScalar(0.94), w),
      this.addVertex(cx - sideX*halfW, cy + fold*profile,     cz - sideZ*halfW, sunC, shdC, w),
    ]);
  }
  for (let i = 0; i < segments - 1; i++) {   // 2 quads per ring pair
    const r0 = rings[i], r1 = rings[i + 1];
    this.addQuad(r0[0], r0[1], r1[1], r1[0]);
    this.addQuad(r0[1], r0[2], r1[2], r1[1]);
  }
  const rLast = rings[segments - 1], vTip = rings[segments][0];   // 2 tris to the tip
  this.addTri(rLast[0], rLast[1], vTip);
  this.addTri(rLast[1], rLast[2], vTip);
}
// 10 tris/blade at segments=3, 14 at segments=4
```

---

## 5. RECOMMENDATIONS FOR A 96x96 MEADOW MAP

Targets below reconcile the two refs with `SPEC.md` (< 1.6 M tris, < 220 draw calls, fov 58,
11.5 m back, 2.4 m high, 35° pitch, palette from `palette.js`).

1. **Build the whole look on one `ShaderMaterial` family, not on lights.** Port REF B's
   `createGhibliBotanicalMaterial` with its 4 flag variants (`uIsTerrain`, `uIsFoliage`,
   `uIsPetal`, `uIsRock`). That gives terrain + grass + flowers + rocks + trees in **5 materials**
   and is why REF B looks like anime with zero post-processing. Do *not* use `MeshStandardMaterial`
   for foliage — PBR is exactly what makes the current map read as flat green plastic.
2. **Two-colour vertex ramp is the core rule.** Every mesh carries `color` (sunlit RGB) and
   `aShadowColor` (shadow RGB) per vertex; fragment does
   `col = mix(shadow, sun, smoothstep(-0.35, 0.55, dot(N, uSunDir)) * (1 - canopy*0.86))`.
   Three tones per family max, per SPEC. Author pairs from `MEADOW`: grass
   `#3f7248`→`#accf6b`→`#d9ea8d`, canopy `#3f7a4c`→`#77b74f`→`#b8dd6c`.
3. **Soft-upward normals or the blades will be black.** `upN = normalize(vec3(N.x*0.35, 1.0, N.z*0.35))`,
   `N = normalize(mix(rawN, upN, 0.82))` for foliage, `0.45` for terrain, `0.08` for rock.
   Also flip `N` on backfaces (`gl_FrontFacing`) since everything is `DoubleSide`.
4. **Grass: 3 `InstancedMesh` variants, 12 000 total** (not 21 000 like REF A — the 96 m map needs
   coverage, not density). 6–7 blades/tuft, 10–14 tris/blade → 96–140 tris/tuft → **~1.4 M tris**,
   too close to budget; so: 2 near variants (6 blades, 144 tris) × 5 000 + 1 far variant
   (3 blades, 72 tris) × 8 000 ≈ 1.3 M tris. Drop to 9 000 total if the frame budget is tight.
   Density by rule, not uniform: `8–10 tufts/m²` inside r < 25 m, `2/m²` to r 46 m, `0.5/m²` beyond,
   and `×0` where `pathDistance(x,z) > -1.5`.
5. **Grass clumping is one threshold.** `cluster = fbm2D(x*0.25 + 6, z*0.25 - 4)`;
   if `> 0.52` multiply XZ scale by `+0.25` and Y by `+0.35` (REF A's exact trick). Base scale
   `0.78..1.38` XZ, `0.75..1.35` Y, tilt `±0.1` rad. Short turf 0.10–0.25 m, tall 0.45–0.95 m per SPEC.
6. **Wind: copy REF B verbatim, then add REF A's phase.** `wave1 = sin(t*2.1 + x*0.75 + z*0.55)`,
   `wave2 = cos(t*3.4 - x*0.45 + z*0.95)*0.35`, `gust = (wave1+wave2)*w`,
   `x += gust*0.14; z += gust*0.08; y -= abs(gust)*0.03`, with `w = pow(heightFrac, 2.0) * 0.55`.
   Add `+ uTime*1.85` phase offset per instance (REF A) so neighbouring tufts don't sync.
   Optional player parting: radius 2.5 m, `pow(1-d/2.5, 1.75) * 0.95`.
7. **Canopy-shadow cookie = the cheapest "dense foliage" illusion.** Implement REF B's two
   ellipse zones in the terrain/grass shader, scaled to the new map: zone 1 centred `(-60, -55)`
   radii `(45, 40)`, zone 2 a rotated band centred `(20, 10)` radii `(30, 18)` at `0.82/0.57`
   rotation, blended with `fbm(x*0.85, z*0.85)`. Clamp `uCanopyIntensity 0.88`. This makes the
   ground read as *under trees* without drawing a single tree, and it drifts with `uTime*0.10`.
8. **Flowers in drifts, 1 500–2 500 instances, 3 `InstancedMesh`** (one per dominant colour),
   using REF B's star-bell head (§4 S3) at `cupR 0.042, midR 0.125, tipR 0.215`, `~58 tris/head`.
   Drift mask: `fbm2D(x*0.34 - 5.2, z*0.34 + 3.8) > 0.45`, one colour per patch, never rainbow.
   Colors: lilac `#c0a8f0` (hero, matches both refs' purple), cream `#fff1b8`, white `#fdfbff`.
9. **Trees: 70–110, and they must be leaf *fans*, not spheres.** Build each canopy from 6–10
   flattened puffs; each puff = 6–8 `addArchingLeaf` calls radially from a point, `length 1.2–2.0`,
   `width 0.6–0.9`, `pitch 0.15–0.55`, `arch 0.30`, `segments 3`, windScale `0.15` (canopy moves
   less than grass). Bake the 3-tone ramp `canopyDark → canopyMid → canopyLight` along `t`, and
   add REF B's rim on the sun side: `col = mix(col, col*1.06, rim*0.45)` where
   `rim = smoothstep(0.2,0.95,heightFrac) * sunSide`. Trunk = 3-sided `addStemCurve`, taper
   `0.18 → 0.06`, `trunk #8a6244` sun / `#5f4331` shadow. **Total tree budget: 100 trees ×
   ~1.2 k tris = 120 k tris**, 1 instanced mesh per canopy variant (5 draw calls).
10. **Sky: build it (neither ref has one).** BackSide sphere r = 220, `depthWrite: false`,
    fragment from §4 S1b with `skyZenith 0x3d86cf / skyMid 0x86cff0 / skyHorizon 0xe9f7ee /
    skySunGlow 0xfff0c2`. Sun disc via `pow(dot(d,uSunDir), 180)` — no bloom required for the disc.
    5–8 cumulus clusters of flat-shaded puffs (`cloudLight 0xffffff` top, `cloudShadow 0xcbdcef`
    base) at 60–140 m, `y 25–45 m`, drifting `0.6 m/s`; keep them out of the 35° sightline.
11. **Haze: use a real `THREE.Fog`, warm-green, not lavender.** REF B's depth fade goes to
    `#c2de8f`; REF A fades to `#071824` (night). For a sunlit 96 m map:
    `scene.fog = new THREE.Fog(0xd6ecea, 45, 190)` (palette `fog`), and add a second, warmer
    near-ground band `#c2de8f` in the terrain shader over `smoothstep(60, 140, dist)` at 0.18
    weight. Reserve lavender `#bfe2ff` for the sky only — lavender fog on green grass reads dirty.
12. **Post: keep it weak, and put the glow in the shader.** REF A's bloom is `0.16 / 0.55 / 0.86`
    at exposure 1.05 (ACES). SPEC asks for `0.42 / 0.55 / 0.82` — with a high-key sunlit scene
    that will wash the grass tips; start at **strength 0.22, radius 0.55, threshold 0.88**,
    ACESFilmic + exposure 1.0, and get the "glow" from REF B's clamped rim (`×1.06`) instead.
    Add the grade pass (saturation +0.06, contrast +0.04, warm highlights / cool shadows,
    vignette 0.15) as a final `ShaderPass`, and keep `setEnabled(false)` → plain render.

### Concrete starting numbers (one-liner cheat sheet)
| item | value |
|---|---|
| grass instances | 13 000 (3 variants: 5k near 144 tri, 8k far 72 tri) |
| wildflower instances | 2 000 (lilac / cream / white drifts) |
| shrubs+ferns | 280 clusters, 0.6–1.8 m, 3-tone `bushDark/Mid/Light` |
| trees | 90 (4 broadleaf + 1 conifer), 5–12 m, 6–10 puffs each |
| terrain | 96×96 playable flat, ring mesh to r 140, 3–4 m relief outside |
| height fn | `slopeZ -z*0.055` + `sin(x*0.09+z*0.07)*0.9` + fbm detail `*0.6` |
| sun dir | `(0.58, 0.74, 0.34)` normalized (REF B), elevation 47.7° |
| sun colour | `#fff3d6`, sky fill `#bfe2ff`, ground bounce `#8fbc6b` |
| fog | `Fog(0xd6ecea, 45, 190)` + ground haze `#c2de8f` |
| bloom | `0.22 / 0.55 / 0.88`, ACES, exposure 1.0 |
| canopy cookie | intensity 0.88, drift 0.10, two ellipse zones |
| camera | fov 58, 11.5 m back, 2.4 m high, 35° pitch (per SPEC) |

---

## 6. Gaps and gotchas

- **Neither ref has: a sky dome, `scene.fog`, `DirectionalLight`, `HemisphereLight`, shadow maps,
  a path, water, or real trees.** Everything in §5 marked "build it" is derived from their
  palette + haze rules, not copied — don't cite these files as precedent for those.
- **r128 → r170 API drift** (REF B): `outputEncoding = sRGBEncoding` → `outputColorSpace =
  SRGBColorSpace`; global `three.min.js` → ES module import; `EffectComposer`/`UnrealBloomPass`
  now under `three/addons/postprocessing/`. REF A is already r160 module style (near-zero change).
- **Do not copy REF A's `frustumCulled = false`.** Fine at 46 m / 21 k instances; at 140 m it
  will destroy the frame. Chunk into 4–6 `InstancedMesh` per variant by spatial tile instead.
- **Do not copy REF A's radial-from-origin fog** (`length(vWorldPos.xz)`); use camera distance
  or a real `Fog`.
- REF A's `~780 tris/stalk` and REF B's badge counts (`~24 tris` grass) are **understated**;
  use the derived counts in §1.7/§2.6/§2.7 when budgeting.
- Both refs bake sun *and* shadow colour into vertices, so **instance colour variation must come
  from a shader hash of instance position** (`hash21(instOrigin.xz * 1.73)`), not per-instance
  vertex colours — `InstancedMesh` can't vary attributes per instance cheaply.
