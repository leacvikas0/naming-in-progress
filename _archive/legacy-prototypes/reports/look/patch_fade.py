from pathlib import Path

p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

# ---------------------------------------------------------------------------
# 1. fade/dissolve shader patch, inserted before createPetalField
# ---------------------------------------------------------------------------
anchor = "export function createPetalField(options = {}) {"
patch_fn = '''// Per-instance fade + dissolve.
//
// A petal does not pop in or out: it fades in over its first second, and at the
// end of its life it dissolves *part by part* — a per-fragment hash is compared
// against the instance fade, so the card erodes in patches instead of dimming as
// a whole. This is the cheap version of what Ghost of Tsushima does with
// lifetime-faded wind particles: nothing ever appears or vanishes in one frame.
function patchFade(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute float aFade;\\nvarying float vFade;\\nvarying vec2 vPetalUv;\\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\\n  vFade = aFade;\\n  vPetalUv = uv;"
      );
    shader.fragmentShader =
      "varying float vFade;\\nvarying vec2 vPetalUv;\\n" +
      "float petalHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\\n" +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        // Dissolve: below 1.0 the card erodes in patches, from the tips inward.
        float dissolve = petalHash(floor(vPetalUv * 16.0));
        if (vFade < 0.999 && dissolve > vFade) discard;
        gl_FragColor.a *= smoothstep(0.0, 0.18, vFade);`
      );
  };
}

'''
s = s.replace(anchor, patch_fn + anchor, 1)

# ---------------------------------------------------------------------------
# 2. lifetime fields on every state
# ---------------------------------------------------------------------------
s = s.replace(
    "      fall: range(rand, 0.1, 0.22),\n    };",
    "      fall: range(rand, 0.1, 0.22),\n"
    "      // Lifetime: long enough that the dissolve is the only exit you see.\n"
    "      age: range(rand, 0, 8),\n"
    "      life: range(rand, 9, 16),\n"
    "      fadeIn: range(rand, 1.2, 2.4),\n"
    "      fadeOut: range(rand, 2.2, 4.0),\n"
    "      fade: 1,\n"
    "    };",
    1,
)

# ---------------------------------------------------------------------------
# 3. attach the aFade attribute + patch the material in addLayer
# ---------------------------------------------------------------------------
s = s.replace(
    "      const mesh = new THREE.InstancedMesh(geo, mat, n);\n      mesh.name = `petals:${mode}:${type.id}`;",
    "      patchFade(mat);\n"
    "      const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);\n"
    "      fadeAttr.setUsage(THREE.DynamicDrawUsage);\n"
    "      geo.setAttribute(\"aFade\", fadeAttr);\n\n"
    "      const mesh = new THREE.InstancedMesh(geo, mat, n);\n      mesh.name = `petals:${mode}:${type.id}`;\n"
    "      mesh.userData.fadeAttr = fadeAttr;",
    1,
)

# ---------------------------------------------------------------------------
# 4. rewrite update(): lifetime, dissolve, respawn far from the camera
# ---------------------------------------------------------------------------
start = s.index("  function update(dt) {")
end = s.index("  update(1 / 60);")
new_update = '''  const camPos = new THREE.Vector3();
  const camFwd = new THREE.Vector3();

  function respawnFar(st, cam) {
    // Rebirth happens far from the lens (or behind it), so even the fade-in is
    // never a visible pop. Foreground/lens petals are recycled inside their own
    // volume, but the long fade covers the transition.
    if (cam) cam.getWorldPosition(camPos);
    const dist = range(rand, 18, 32);
    const ang = rand() * Math.PI * 2;
    st.x = camPos.x + Math.cos(ang) * dist;
    st.z = camPos.z + Math.sin(ang) * dist;
    st.y = range(rand, 0.8, 4.6);
    st.age = 0;
    st.life = range(rand, 9, 16);
    st.fadeIn = range(rand, 1.2, 2.4);
    st.fadeOut = range(rand, 2.2, 4.0);
  }

  function update(dt, cam = null) {
    const step = Math.min(Math.max(dt, 0), 0.05) * wind;
    if (step <= 0) return;
    time += step;

    if (cam) {
      cam.getWorldPosition(camPos);
      camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    }

    for (const layer of layers) {
      if (layer.mode === "carpet") continue;

      for (const st of layer.states) {
        // --- lifetime: fade in, live, dissolve out -----------------------
        st.age += step;
        if (st.age >= st.life) {
          if (layer.mode === "foreground" || layer.mode === "lens") {
            // recycle inside the near volume, but restart the fade
            st.age = 0;
            st.life = range(rand, 9, 16);
            st.fadeIn = range(rand, 1.2, 2.4);
            st.fadeOut = range(rand, 2.2, 4.0);
          } else {
            respawnFar(st, cam);
          }
        }
        const inFade = Math.min(1, st.age / st.fadeIn);
        const outFade = Math.min(1, Math.max(0, (st.life - st.age) / st.fadeOut));
        st.fade = Math.min(inFade, outFade);

        // --- motion ------------------------------------------------------
        const swirlAngle = time * st.swirlSpeed + st.phase;
        const swirlX = Math.cos(swirlAngle) * st.swirlR * 0.06;
        const swirlZ = Math.sin(swirlAngle) * st.swirlR * 0.06;
        const sway = Math.sin(time * st.swayFreq + st.phase) * st.swayAmp * 0.25;

        if (layer.mode === "foreground") {
          st.x += (WIND.x * WIND_SPEED * 0.45 + swirlX) * step;
          st.z += (WIND.z * WIND_SPEED * 0.45 + swirlZ) * step;
          st.y -= st.fall * 0.25 * step;
          st.rx += st.vrx * 0.5 * step;
          st.ry += st.vry * 0.5 * step;
          st.rz += st.vrz * 0.5 * step;
          if (st.x > NEAR.x1) st.x = NEAR.x0;
          else if (st.x < NEAR.x0) st.x = NEAR.x1;
          if (st.z > NEAR.z1) st.z = NEAR.z0;
          else if (st.z < NEAR.z0) st.z = NEAR.z1;
          if (st.y < NEAR.y0) st.y = NEAR.y1;
        } else if (layer.mode === "lens") {
          st.x += (WIND.x * WIND_SPEED * 0.25 + swirlX * 0.5) * step;
          st.z += (WIND.z * WIND_SPEED * 0.25 + swirlZ * 0.5) * step;
          st.y -= st.fall * 0.12 * step;
          st.ry += st.vry * 0.2 * step;
          st.rz += st.vrz * 0.2 * step;
          if (st.x > 3) st.x = -3;
          else if (st.x < -3) st.x = 3;
          if (st.z > 12.8) st.z = 11.0;
          else if (st.z < 11.0) st.z = 12.8;
          if (st.y < 1.55) st.y = 2.15;
        } else if (layer.mode === "mid") {
          st.x += (WIND.x * WIND_SPEED + swirlX + sway) * step;
          st.z += (WIND.z * WIND_SPEED + swirlZ) * step;
          st.y -= st.fall * 0.55 * step;
          st.rx += st.vrx * 0.7 * step;
          st.ry += st.vry * 0.7 * step;
          st.rz += st.vrz * 0.7 * step;
          if (st.y < ground + 0.15) respawnFar(st, cam);
        } else {
          st.x += (WIND.x * WIND_SPEED * 0.7 + swirlX * 0.6) * step;
          st.z += (WIND.z * WIND_SPEED * 0.7 + swirlZ * 0.6) * step;
          st.y -= st.fall * 0.35 * step;
          st.ry += st.vry * 0.4 * step;
          if (st.y < ground + 0.3) respawnFar(st, cam);
        }

        write(st);
        const attr = st.mesh.userData.fadeAttr;
        if (attr) attr.setX(st.index, st.fade);
      }

      for (const st of layer.states) {
        st.mesh.instanceMatrix.needsUpdate = true;
        if (st.mesh.userData.fadeAttr) st.mesh.userData.fadeAttr.needsUpdate = true;
      }
    }
  }

'''
s = s[:start] + new_update + s[end:]

# the first call passes no camera
s = s.replace("  update(1 / 60);", "  update(1 / 60);", 1)

p.write_text(s, encoding="utf-8")
print("petal field: lifetime + dissolve fade")
