from pathlib import Path

p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

# drop the dead lens count
s = s.replace("counts = { near: 14, mid: 64, far: 140, carpet: 0, lens: 5 },", "counts = { near: 14, mid: 64, far: 140, carpet: 0 },")

# capture the camera's starting position so the first generation fills the view,
# not the world origin
s = s.replace(
    "  const WIND = new THREE.Vector3(windDir[0], windDir[1], windDir[2]).normalize();",
    "  const WIND = new THREE.Vector3(windDir[0], windDir[1], windDir[2]).normalize();\n"
    "  const startPos = new THREE.Vector3();\n"
    "  if (camera && camera.getWorldPosition) camera.getWorldPosition(startPos);",
)

# initial far petals around the viewer
s = s.replace(
    "    } else if (mode === \"far\") {\n      st.x = range(rand, -area, area);\n      st.z = range(rand, -area, area);\n      st.y = range(rand, 0.4, 5.0);",
    "    } else if (mode === \"far\") {\n      // Around the viewer at birth, so the first frame already has petals\n      // wherever the camera looks.\n      const ang = rand() * Math.PI * 2;\n      const r = 4 + Math.sqrt(rand()) * area;\n      st.x = startPos.x + Math.cos(ang) * r;\n      st.z = startPos.z + Math.sin(ang) * r;\n      st.y = range(rand, 0.4, 5.0);",
)

# foreground: recycle in front of the current camera, not in a fixed world box
s = s.replace(
    """  function respawnFar(st, cam) {""",
    """  function respawnNear(st, cam) {
    // Foreground petals are reborn just in front of the viewer, low, so the
    // band follows where you look. The long fade-in hides the birth.
    if (cam) {
      cam.getWorldPosition(camPos);
      camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    }
    const fwd = range(rand, 2.5, 8.0);
    const side = range(rand, -3.5, 3.5);
    st.x = camPos.x + camFwd.x * fwd + side;
    st.z = camPos.z + camFwd.z * fwd + side * 0.25;
    st.y = range(rand, 0.6, 2.2);
    st.age = 0;
    st.life = range(rand, 9, 16);
    st.fadeIn = range(rand, 2.6, 4.5);
    st.fadeOut = range(rand, 3.0, 5.5);
  }

  function respawnFar(st, cam) {""",
)

s = s.replace(
    "          if (layer.mode === \"foreground\" || layer.mode === \"lens\") {\n            // recycle inside the near volume, but restart the fade\n            st.age = 0;\n            st.life = range(rand, 9, 16);\n            st.fadeIn = range(rand, 2.6, 4.5);\n            st.fadeOut = range(rand, 3.0, 5.5);\n          } else {",
    "          if (layer.mode === \"foreground\") {\n            respawnNear(st, cam);\n          } else {",
)

p.write_text(s, encoding="utf-8")
print("petals: viewer-relative birth for foreground and far layers")
