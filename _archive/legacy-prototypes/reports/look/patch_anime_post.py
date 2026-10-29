from pathlib import Path

# ------------------------------------------------------------ 1. camera presets
p = Path("game/handoff/map-bg/preview.html")
s = p.read_text(encoding="utf-8")
s = s.replace(
    """const VIEWS = {
  gameplay: { pos: [0, 7.6, 10.6], target: [0, 1.1, -0.5] },
  aerial:   { pos: [0, 78, 92],    target: [0, 0, 0] },
  eye:      { pos: [3.2, 1.75, 8.6], target: [0.5, 1.2, -2] },
  lake:     { pos: [-28, 8.4, 5.5], target: [-62, -0.2, -3] },
  shrine:   { pos: [2, 6.4, -20],  target: [0, 1.2, -34] },
};
function applyView(name) {
  const v = VIEWS[name] || VIEWS.gameplay;
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
}""",
    """// Eye-level framing, like the reference painting: low horizon, path leading in,
// sky occupying the top of the frame.
const VIEWS = {
  gameplay: { pos: [0, 1.85, 14.0], target: [0, 3.2, -20.0], fov: 50 },
  aerial:   { pos: [0, 78, 92],    target: [0, 0, 0], fov: 58 },
  eye:      { pos: [3.2, 1.7, 9.0], target: [0, 3.0, -20.0], fov: 50 },
  lake:     { pos: [-28, 3.2, 5.5], target: [-62, 1.0, -3], fov: 55 },
  shrine:   { pos: [0, 2.2, -22.0], target: [0, 4.2, -38.5], fov: 50 },
};
function applyView(name) {
  const v = VIEWS[name] || VIEWS.gameplay;
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  if (v.fov) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
  controls.update();
}""",
)
p.write_text(s, encoding="utf-8")
print("camera: eye-level presets")

# ------------------------------------------------------------ 2. exposure
p = Path("game/src/map/palette.js")
s = p.read_text(encoding="utf-8")
s = s.replace("exposure: 1.0,", "exposure: 1.12,")
p.write_text(s, encoding="utf-8")
print("exposure 1.12")

# ------------------------------------------------------------ 3. post: airy anime
p = Path("game/src/map/post.js")
s = p.read_text(encoding="utf-8")
s = s.replace("uSaturation: { value: 1.1 },", "uSaturation: { value: 1.12 },")
s = s.replace("uContrast: { value: 1.06 },", "uContrast: { value: 1.0 },")
s = s.replace("uLift: { value: 0.015 },", "uLift: { value: 0.02 },")
s = s.replace("uVignette: { value: 0.3 },", "uVignette: { value: 0.14 },")
s = s.replace("bloomStrength = 0.42,", "bloomStrength = 0.46,")
s = s.replace("bloomRadius = 0.88,", "bloomRadius = 0.9,")
s = s.replace("bloomThreshold = 0.86,", "bloomThreshold = 0.82,")
s = s.replace("c = mix(c, vec3(0.94, 0.95, 1.0), haze * 0.03);", "c = mix(c, vec3(0.93, 0.95, 1.0), haze * 0.05);")
p.write_text(s, encoding="utf-8")
print("post: airy anime grade")

# ------------------------------------------------------------ 4. petals: pink/lilac
p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    'palette: { stem: "#9a7ac0", base: "#c9a6e8", mid: "#e0c8f4", tip: "#f4eaff", vein: "#b48ae0", emissive: 0xb48ae0, emissiveIntensity: 0.18 },',
    'palette: { stem: "#e09ab8", base: "#f2b8d4", mid: "#fad4e6", tip: "#fff0f8", vein: "#e8a8c8", emissive: 0xffc0dc, emissiveIntensity: 0.2 },',
)
s = s.replace(
    'palette: { stem: "#7fa06a", base: "#b4d494", mid: "#d2e8b4", tip: "#f0fad8", vein: "#a8cc80", emissive: 0xc0dc9c, emissiveIntensity: 0.12 },',
    'palette: { stem: "#a88ad0", base: "#cbb0ee", mid: "#e2d2f8", tip: "#f6efff", vein: "#bda0e0", emissive: 0xd4c0f0, emissiveIntensity: 0.18 },',
)
p.write_text(s, encoding="utf-8")
print("petals: pink + lilac")
