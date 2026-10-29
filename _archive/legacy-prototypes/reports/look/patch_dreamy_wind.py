from pathlib import Path

# ============================================================ 1. SKY: linear out
p = Path("game/src/map/sky.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "    gl_FragColor = vec4(col, 1.0);\n\n    #include <tonemapping_fragment>\n    #include <colorspace_fragment>",
    "    // Authored display-referred -> linear, then the standard tonemap/encode.\n"
    "    col = pow(clamp(col, 0.0, 1.0), vec3(2.2));\n"
    "    gl_FragColor = vec4(col, 1.0);\n\n    #include <tonemapping_fragment>\n    #include <colorspace_fragment>",
)
p.write_text(s, encoding="utf-8")
print("sky: linear output")

# ============================================================ 2. POST: dreamy
p = Path("game/src/map/post.js")
s = p.read_text(encoding="utf-8")
s = s.replace("uSaturation: { value: 1.09 },", "uSaturation: { value: 1.14 },")
s = s.replace("uContrast: { value: 1.06 },", "uContrast: { value: 1.03 },")
s = s.replace("uLift: { value: 0.003 },", "uLift: { value: 0.012 },")
s = s.replace("uVignette: { value: 0.18 },", "uVignette: { value: 0.26 },")
s = s.replace("bloomStrength = 0.22,", "bloomStrength = 0.42,")
s = s.replace("bloomRadius = 0.55,", "bloomRadius = 0.85,")
s = s.replace("bloomThreshold = 0.88,", "bloomThreshold = 0.78,")
p.write_text(s, encoding="utf-8")
print("post: dreamy grade + softer bloom")

# ============================================================ 3. PETALS: wind + size
p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

s = s.replace(
    "    area = 30,\n    ground = 0,",
    "    area = 30,\n    ground = 0,\n    windDir = [1, 0, 0.35], // one direction for everything",
)
s = s.replace(
    "  const rand = createRng(seed);",
    "  const rand = createRng(seed);\n"
    "  const WIND = new THREE.Vector3(windDir[0], windDir[1], windDir[2]).normalize();\n"
    "  const WIND_SPEED = 0.9; // m/s steady drift",
)

# near layer smaller
s = s.replace('mode: "near", size: [2.0, 3.2]', 'mode: "near", size: [0.9, 1.5]')

# ground drift: one direction with gust, small cross-sway
s = s.replace(
    "        } else if (mode === \"ground\") {\n"
    "          const gust = 0.6 + 0.4 * Math.sin(time * 0.9 + st.phase);\n"
    "          st.x += st.vx * gust * step;\n"
    "          st.z += st.vz * step;\n"
    "          st.y += Math.sin(time * 2.2 + st.phase) * 0.12 * step;",
    "        } else if (mode === \"ground\") {\n"
    "          const gust = 0.65 + 0.35 * Math.sin(time * 0.9 + st.phase);\n"
    "          st.x += (WIND.x * WIND_SPEED * 2.2 + Math.sin(time * 2.2 + st.phase) * 0.35) * gust * step;\n"
    "          st.z += (WIND.z * WIND_SPEED * 2.2 + Math.cos(time * 1.9 + st.phase) * 0.25) * step;\n"
    "          st.y += Math.sin(time * 2.2 + st.phase) * 0.12 * step;",
)

# falling petals: steady wind + gentle cross-sway
s = s.replace(
    "          const sway =\n"
    "            Math.sin(time * st.swayFreq * 2 + st.phase + st.y * 0.35) * st.swayAmp * m.sway;\n"
    "          const breeze = Math.cos(time * st.swayFreq * 1.4 + st.phase) * 0.4;\n"
    "          st.x += sway * step;\n"
    "          st.z += breeze * step;",
    "          const sway =\n"
    "            Math.sin(time * st.swayFreq * 2 + st.phase + st.y * 0.35) * st.swayAmp * m.sway;\n"
    "          const breeze = Math.cos(time * st.swayFreq * 1.4 + st.phase) * 0.35;\n"
    "          st.x += (WIND.x * WIND_SPEED + sway * 0.6) * step;\n"
    "          st.z += (WIND.z * WIND_SPEED + breeze * 0.6) * step;",
)

# near layer: drift along the same wind
s = s.replace(
    "          const oz = st.oz + Math.sin(time * 0.31 + st.phase * 0.7) * 0.4;",
    "          const oz = st.oz + Math.sin(time * 0.31 + st.phase * 0.7) * 0.4;\n"
    "          st.ox += WIND.x * 0.25 * step;\n"
    "          st.oz += WIND.z * 0.25 * step;",
)
p.write_text(s, encoding="utf-8")
print("petals: one wind direction + smaller near petals")

# ============================================================ 4. TREES: wind bias
p = Path("game/src/map/port/anime-flower-tree.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "      uSunDir: { value: SUN_DIR },\n      uTime: { value: 0 },\n      uLeafShadow:",
    "      uSunDir: { value: SUN_DIR },\n      uTime: { value: 0 },\n      uWindDir: { value: new THREE.Vector3(1, 0, 0.35).normalize() },\n      uLeafShadow:",
)
s = s.replace(
    "      attribute vec3 aClusterNormal;\n      attribute float aColorVar;\n      uniform float uTime;",
    "      attribute vec3 aClusterNormal;\n      attribute float aColorVar;\n      uniform float uTime;\n      uniform vec3 uWindDir;",
)
s = s.replace(
    "        float bend = (windWave + detailFlutter) * 0.08 * uv.y;\n        pos.y += bend;\n        pos.x += bend * 0.4;",
    "        float bend = (windWave + detailFlutter) * 0.08 * uv.y;\n"
    "        // All foliage bends along one wind direction, with a little lift.\n"
    "        pos.x += uWindDir.x * bend * 1.1;\n"
    "        pos.z += uWindDir.z * bend * 1.1;\n"
    "        pos.y += bend * 0.35;",
)
p.write_text(s, encoding="utf-8")
print("trees: directional wind")

# ============================================================ 5. preview HUD stats
p = Path("game/handoff/map-bg/preview.html")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: \"high-performance\" });",
    "const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: \"high-performance\" });\n"
    "renderer.info.autoReset = false;",
)
s = s.replace(
    "  bg.update(elapsed, dt);\n  controls.update();\n  bg.render(dt);",
    "  bg.update(elapsed, dt);\n  controls.update();\n  renderer.info.reset();\n  bg.render(dt);",
)
p.write_text(s, encoding="utf-8")
print("preview: honest triangle stats")
