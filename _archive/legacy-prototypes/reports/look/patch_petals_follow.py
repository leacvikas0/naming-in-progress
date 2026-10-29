from pathlib import Path

p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

# ---------------------------------------------------------------- 1. no lens layer
s = s.replace('  addLayer("lens", counts.lens, [0.42, 0.6], false, true);\n', "")

# drop the lens mode entirely
start = s.find('    } else if (mode === "lens") {')
if start != -1:
    end = s.find('    } else if (mode === "mid") {', start)
    s = s[:start] + s[end:]

# drop the lens branch in update()
start = s.find('        } else if (layer.mode === "lens") {')
if start != -1:
    end = s.find('        } else if (layer.mode === "mid") {', start)
    s = s[:start] + s[end:]

# ---------------------------------------------------------------- 2. volume follows the camera
# spawn every petal around the camera's current position, not around world origin
s = s.replace(
    "    } else if (mode === \"mid\") {\n      const a = anchors.length ? anchors[Math.floor(rand() * anchors.length)] : { x: 0, z: 0 };\n      const ang = rand() * Math.PI * 2;\n      const r = 1.5 + Math.sqrt(rand()) * 7;\n      st.x = a.x + Math.cos(ang) * r;\n      st.z = a.z + Math.sin(ang) * r;\n      // Ceiling at 4.2 m: above that a petal sits against the pale horizon at\n      // canopy height and reads as a grey shard floating in the sky.\n      st.y = range(rand, 0.8, 4.2);",
    "    } else if (mode === \"mid\") {\n      const a = anchors.length ? anchors[Math.floor(rand() * anchors.length)] : { x: 0, z: 0 };\n      const ang = rand() * Math.PI * 2;\n      const r = 1.5 + Math.sqrt(rand()) * 7;\n      st.x = a.x + Math.cos(ang) * r;\n      st.z = a.z + Math.sin(ang) * r;\n      // Half tree height: petals live low, where you look, never in the sky.\n      st.y = range(rand, 0.4, 5.0);",
)
s = s.replace(
    "    } else if (mode === \"far\") {\n      st.x = range(rand, -area, area);\n      st.z = range(rand, -area, area);\n      st.y = range(rand, 0.6, 5.0);",
    "    } else if (mode === \"far\") {\n      st.x = range(rand, -area, area);\n      st.z = range(rand, -area, area);\n      st.y = range(rand, 0.4, 5.0);",
)

# ---------------------------------------------------------------- 3. slower, softer fade
s = s.replace("      fadeIn: range(rand, 1.2, 2.4),\n      fadeOut: range(rand, 2.2, 4.0),", "      fadeIn: range(rand, 2.6, 4.5),\n      fadeOut: range(rand, 3.0, 5.5),")
s = s.replace("    st.fadeIn = range(rand, 1.2, 2.4);\n    st.fadeOut = range(rand, 2.2, 4.0);", "    st.fadeIn = range(rand, 2.6, 4.5);\n    st.fadeOut = range(rand, 3.0, 5.5);")
s = s.replace("            st.fadeIn = range(rand, 1.2, 2.4);\n            st.fadeOut = range(rand, 2.2, 4.0);", "            st.fadeIn = range(rand, 2.6, 4.5);\n            st.fadeOut = range(rand, 3.0, 5.5);")

# wider, softer wipe edge
s = s.replace("float cut = mix(-0.45, 1.45, vFade);\n        float wipe = 1.0 - smoothstep(cut - 0.30, cut, vPetalUv.y);", "float cut = mix(-0.55, 1.55, vFade);\n        float wipe = 1.0 - smoothstep(cut - 0.48, cut, vPetalUv.y);")

# ---------------------------------------------------------------- 4. respawn near the camera
s = s.replace(
    "    if (cam) cam.getWorldPosition(camPos);\n    const dist = range(rand, 18, 32);\n    const ang = rand() * Math.PI * 2;\n    st.x = camPos.x + Math.cos(ang) * dist;\n    st.z = camPos.z + Math.sin(ang) * dist;\n    st.y = range(rand, 0.8, 4.6);",
    "    if (cam) cam.getWorldPosition(camPos);\n    // Rebirth in a ring around the viewer, so wherever you look there are\n    // petals — but always far enough that the fade-in is invisible.\n    const dist = range(rand, 16, 30);\n    const ang = rand() * Math.PI * 2;\n    st.x = camPos.x + Math.cos(ang) * dist;\n    st.z = camPos.z + Math.sin(ang) * dist;\n    st.y = range(rand, 0.4, 5.0);",
)

p.write_text(s, encoding="utf-8")
print("petals: camera-following volume, no lens layer, slower fade")

# ---------------------------------------------------------------- 5. counts
p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "petalCounts = { near: 14, mid: 64, far: 160, carpet: 0 },",
    "petalCounts = { near: 14, mid: 64, far: 160, carpet: 0 },",
)
p.write_text(s, encoding="utf-8")
print("index counts unchanged")
