from pathlib import Path

# 1) kit exposes the flowering-tree anchors (carpet + bokeh placement)
p = Path("game/src/map/kit.js")
s = p.read_text(encoding="utf-8")
old = "  return {\n    group,\n    update,"
if "treeAnchors" not in s:
    s = s.replace(
        old,
        "  const treeAnchors = treeObjects.map((t) => ({\n"
        "    x: t.group.position.x,\n"
        "    z: t.group.position.z,\n"
        "  }));\n\n"
        "  return {\n    group,\n    update,\n    treeAnchors,",
        1,
    )
p.write_text(s, encoding="utf-8")
print("kit: anchors exposed")

# 2) index.js: layered petal field with the camera + anchors
p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")

s = s.replace(
    "    petalCount = 320,\n    petalTypes = [\"sakura-pink\", \"ginkgo-gold\", \"maple-red\"],\n    petalWind = 0.9,",
    "    petalCounts = { near: 36, ground: 140, mid: 260, far: 380, carpet: 700, bokeh: 500 },\n"
    "    petalTypes = [\"sakura-pink\", \"ginkgo-gold\", \"maple-red\"],\n"
    "    petalWind = 0.9,",
)

old = """    petalField = createPetalField({
      seed: seed + 17,
      count: petalCount,
      types: petalTypes,
      wind: petalWind,
      halfX: 30,
      halfZ: 30,
      ceiling: 12,
    });"""
new = """    petalField = createPetalField({
      seed: seed + 17,
      counts: petalCounts,
      types: petalTypes,
      wind: petalWind,
      camera,
      anchors: kit.treeAnchors ?? [],
      area: 44,
    });"""
if old in s:
    s = s.replace(old, new)
else:
    # tolerate a previous edit shape
    import re
    s = re.sub(r"    petalField = createPetalField\(\{.*?\n    \}\);", new, s, flags=re.S)

s = s.replace(
    "    if (petalField) petalField.update(Number.isFinite(dt) ? dt : 0.016);",
    "    if (petalField) petalField.update(Number.isFinite(dt) ? dt : 0.016, camera);",
)

p.write_text(s, encoding="utf-8")
print("index: layered petals wired")
