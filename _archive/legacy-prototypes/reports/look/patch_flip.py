from pathlib import Path

p = Path("game/src/map/port/refb-kit.js")
s = p.read_text(encoding="utf-8")

old = "  const useFog = options.fog === true;"
new = (
    "  const useFog = options.fog === true;\n"
    "  // Backface normal flipping makes a blade change tone when the camera orbits\n"
    "  // to its other side. For grass/petals that reads as the colour shifting with\n"
    "  // the view, so it can be disabled: both faces shade from the same normal.\n"
    "  const flipBackfaces = options.flipBackfaces !== false;"
)
if old in s and "flipBackfaces" not in s:
    s = s.replace(old, new, 1)

old2 = "  if (useFog) material.fog = true;"
new2 = (
    "  if (!flipBackfaces) {\n"
    "    material.fragmentShader = material.fragmentShader.replace(\n"
    '      "vec3 rawN = gl_FrontFacing ? normalize(vWorldNormal) : -normalize(vWorldNormal);",\n'
    '      "vec3 rawN = normalize(vWorldNormal);"\n'
    "    );\n"
    "  }\n\n"
    "  if (useFog) material.fog = true;"
)
if old2 in s:
    s = s.replace(old2, new2, 1)

p.write_text(s, encoding="utf-8")
print("refb patched")

p = Path("game/src/map/kit.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "const matFoliage = createGhibliBotanicalMaterial({ fog: true, isPetal: false, isRock: false, isTerrain: false });",
    "const matFoliage = createGhibliBotanicalMaterial({ fog: true, isPetal: false, isRock: false, isTerrain: false, flipBackfaces: false });",
)
s = s.replace(
    "const matPetal = createGhibliBotanicalMaterial({ fog: true, isPetal: true, isRock: false, isTerrain: false });",
    "const matPetal = createGhibliBotanicalMaterial({ fog: true, isPetal: true, isRock: false, isTerrain: false, flipBackfaces: false });",
)
p.write_text(s, encoding="utf-8")
print("kit patched")
