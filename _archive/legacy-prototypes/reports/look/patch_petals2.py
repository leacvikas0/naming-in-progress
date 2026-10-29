from pathlib import Path
import re

p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

# 1) Always use the package's real 3D petal geometry — the cheap quad reads as a
#    triangle, which is exactly what looked wrong.
s = s.replace(
    "      const geo = detailed\n        ? type.build({\n            ...type.params,\n            ...(type.params.ribs ? { ribs: 12 } : {}),\n            scale: type.scale,\n            palette: type.palette,\n          })\n        : makeCheapPetalGeometry(type.palette);",
    "      const geo = type.build({\n        ...type.params,\n        ...(type.params.ribs ? { ribs: Math.min(type.params.ribs, 10) } : {}),\n        scale: type.scale,\n        palette: type.palette,\n      });",
)

# 2) Per-type weight override so the field can be golden like the avenue.
s = s.replace(
    "    types = [\"sakura-pink\", \"ginkgo-gold\", \"maple-red\"],\n  } = options;",
    "    types = [\"ginkgo-gold\", \"ginkgo-amber\", \"sakura-pink\"],\n    typeWeights = null, // optional { id: weight } override\n  } = options;",
)
s = s.replace(
    "    const countsPerType = distribute(count, resolved.map((t) => t.weight ?? 1));",
    "    const countsPerType = distribute(\n      count,\n      resolved.map((t) => (typeWeights && typeWeights[t.id] != null ? typeWeights[t.id] : t.weight ?? 1))\n    );",
)

# 3) Density + size: smaller petals, many more of them, more near ground.
s = s.replace(
    'counts = { near: 36, ground: 140, mid: 260, far: 380, carpet: 700, bokeh: 500 },',
    'counts = { near: 40, ground: 130, mid: 320, far: 420, carpet: 600, bokeh: 600 },',
)
s = s.replace(
    'buildLayer({ id: "near", count: counts.near, mode: "near", size: [1.1, 1.9], detailed: true, motion: { spin: 0.5, fall: 0.25, sway: 0.8 } });',
    'buildLayer({ id: "near", count: counts.near, mode: "near", size: [0.5, 1.0], detailed: true, motion: { spin: 0.5, fall: 0.25, sway: 0.8 } });',
)
s = s.replace(
    'buildLayer({ id: "ground", count: counts.ground, mode: "ground", size: [0.5, 1.0], detailed: false, motion: { spin: 0.7, fall: 0, sway: 1.2 } });',
    'buildLayer({ id: "ground", count: counts.ground, mode: "ground", size: [0.35, 0.7], detailed: true, motion: { spin: 0.7, fall: 0, sway: 1.2 } });',
)
s = s.replace(
    'buildLayer({ id: "mid", count: counts.mid, mode: "fall", size: [0.55, 1.05], detailed: false, motion: { spin: 0.9, fall: 1.0, sway: 1.0 } });',
    'buildLayer({ id: "mid", count: counts.mid, mode: "fall", size: [0.35, 0.75], detailed: true, motion: { spin: 0.9, fall: 1.0, sway: 1.0 } });',
)
s = s.replace(
    'buildLayer({ id: "far", count: counts.far, mode: "fall", size: [0.3, 0.6], detailed: false, motion: { spin: 0.8, fall: 1.1, sway: 0.9 } });',
    'buildLayer({ id: "far", count: counts.far, mode: "fall", size: [0.2, 0.45], detailed: true, motion: { spin: 0.8, fall: 1.1, sway: 0.9 } });',
)
s = s.replace(
    'buildLayer({ id: "carpet", count: counts.carpet, mode: "carpet", size: [0.35, 0.75], detailed: false, motion: { spin: 0, fall: 0, sway: 0 } });',
    'buildLayer({ id: "carpet", count: counts.carpet, mode: "carpet", size: [0.3, 0.6], detailed: true, motion: { spin: 0, fall: 0, sway: 0 } });',
)

# 4) Near layer: keep them close to the lens but not giant.
s = s.replace(
    "          st.ox = range(rand, -3.4, 3.4);\n          st.oy = range(rand, -1.4, 2.6);\n          st.oz = range(rand, -7.5, -1.8);",
    "          st.ox = range(rand, -3.8, 3.8);\n          st.oy = range(rand, -1.6, 2.8);\n          st.oz = range(rand, -7.5, -1.6);",
)

p.write_text(s, encoding="utf-8")
print("petal field: real geometry, golden weights, denser layers")

# 5) index.js: golden type mix + weights
p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    'petalTypes = ["sakura-pink", "ginkgo-gold", "maple-red"],',
    'petalTypes = ["ginkgo-gold", "ginkgo-amber", "sakura-pink"],\n    petalWeights = { "ginkgo-gold": 0.62, "ginkgo-amber": 0.18, "sakura-pink": 0.20 },',
)
s = s.replace(
    "      types: petalTypes,",
    "      types: petalTypes,\n      typeWeights: petalWeights,",
)
p.write_text(s, encoding="utf-8")
print("index: golden petal mix")
