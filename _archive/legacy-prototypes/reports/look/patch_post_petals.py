from pathlib import Path

# ---------------------------------------------------------------- refb: linear
p = Path("game/src/map/port/refb-kit.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "        // Authored display-referred colour -> linear. The single tone-map\n"
    "        // (renderer, or the composer's grade) is then the only conversion.\n"
    "        gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);",
)
p.write_text(s, encoding="utf-8")
print("refb: linear output")

# ------------------------------------------------------- petals: meadow types
p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    'import { getPetalType } from "./port/petals/petalTypes.js";',
    'import { getPetalType, registerPetalType } from "./port/petals/petalTypes.js";\n'
    'import { createBlossomGeometry } from "./port/petals/geometry.js";\n\n'
    "// Petal palettes taken from the meadow itself: the lilac of the bellflowers,\n"
    "// the sage of the grass, the cream of the chamomile. Petals should look like\n"
    "// they fell off this world, not out of a different one.\n"
    "const MEADOW_PETALS = [\n"
    "  {\n"
    "    id: \"meadow-lilac\",\n"
    "    build: createBlossomGeometry,\n"
    "    palette: { stem: \"#9a7ac0\", base: \"#c9a6e8\", mid: \"#e0c8f4\", tip: \"#f4eaff\", vein: \"#b48ae0\", emissive: 0xb48ae0, emissiveIntensity: 0.14 },\n"
    "    scale: 0.5, weight: 0.5, motion: { spin: 0.7, fall: 0.85, sway: 1.1 }, size: [1.0, 1.9],\n"
    "    params: { length: 1.0, width: 0.36, widthPow: 0.8, notch: 0.2, tipStyle: \"broad\", cupDepth: 0.13, skew: 0.03, seed: 5 },\n"
    "  },\n"
    "  {\n"
    "    id: \"meadow-sage\",\n"
    "    build: createBlossomGeometry,\n"
    "    palette: { stem: \"#6f9a5c\", base: \"#9cc47a\", mid: \"#b8dc90\", tip: \"#e2f4c4\", vein: \"#a8cc80\", emissive: 0xa8cc80, emissiveIntensity: 0.1 },\n"
    "    scale: 0.48, weight: 0.3, motion: { spin: 0.8, fall: 0.95, sway: 1.0 }, size: [0.9, 1.7],\n"
    "    params: { length: 0.95, width: 0.34, widthPow: 0.85, notch: 0.18, tipStyle: \"broad\", cupDepth: 0.12, skew: -0.02, seed: 13 },\n"
    "  },\n"
    "  {\n"
    "    id: \"meadow-cream\",\n"
    "    build: createBlossomGeometry,\n"
    "    palette: { stem: \"#c9b47a\", base: \"#f0e6b8\", mid: \"#faf2d0\", tip: \"#fffbe8\", vein: \"#e8d9a0\", emissive: 0xf0e0a8, emissiveIntensity: 0.12 },\n"
    "    scale: 0.46, weight: 0.2, motion: { spin: 0.65, fall: 0.9, sway: 1.15 }, size: [0.9, 1.7],\n"
    "    params: { length: 0.92, width: 0.32, widthPow: 0.85, notch: 0.16, tipStyle: \"broad\", cupDepth: 0.12, skew: 0.02, seed: 23 },\n"
    "  },\n"
    "];\n"
    "for (const t of MEADOW_PETALS) registerPetalType(t);",
)
s = s.replace(
    '    types = ["ginkgo-gold", "ginkgo-amber", "sakura-pink"],',
    '    types = ["meadow-lilac", "meadow-sage", "meadow-cream"],',
)
p.write_text(s, encoding="utf-8")
print("petals: meadow palettes registered")

# ------------------------------------------------------------- index: petals + post
p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    'petalTypes = ["ginkgo-gold", "ginkgo-amber", "sakura-pink"],',
    'petalTypes = ["meadow-lilac", "meadow-sage", "meadow-cream"],',
)
s = s.replace(
    'petalWeights = { "ginkgo-gold": 0.62, "ginkgo-amber": 0.18, "sakura-pink": 0.20 },',
    'petalWeights = { "meadow-lilac": 0.5, "meadow-sage": 0.3, "meadow-cream": 0.2 },',
)
s = s.replace(
    "    postChain = createMeadowPost({ renderer, scene, camera, width, height, enabled: true });",
    "    postChain = createMeadowPost({ renderer, scene, camera, width, height, enabled: true, displayReferred: false });",
)
p.write_text(s, encoding="utf-8")
print("index: meadow petal types + linear post")

# ---------------------------------------------------------------- preview: post on
p = Path("game/handoff/map-bg/preview.html")
s = p.read_text(encoding="utf-8")
s = s.replace('const postEnabled = params.get("post") === "1";', 'const postEnabled = params.get("post") !== "0";')
p.write_text(s, encoding="utf-8")
print("preview: post on by default")
