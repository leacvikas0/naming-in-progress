// Dreamy petal field — a viewer-following volume, three depth layers, one wind.
//
// Art direction:
//   foreground  a handful of petals close to the viewer, low, in front of the lens
//   mid         crisp delicate petals around the flowering trees
//   far         tiny pale flecks that read as air, not confetti
//   carpet      a few fallen petals under each tree (static)
//
// The volume follows the camera: petals are born in a ring around the viewer and
// recycled there, so wherever you look there are petals — but the fade is slow
// enough (2.6-4.5 s in, 3-5.5 s out) that you never see one appear or vanish.
// Nothing is ever created or destroyed on screen.

import * as THREE from "three";
import { createRng, range } from "./port/petals/rng.js";
import { createPetalMaterial } from "./port/petals/materials.js";
import { registerPetalType } from "./port/petals/petalTypes.js";
import { createBlossomGeometry } from "./port/petals/geometry.js";

const MEADOW_PETALS = [
  {
    id: "meadow-lilac",
    build: createBlossomGeometry,
    palette: { stem: "#e09ab8", base: "#f7b8d3", mid: "#fad4e6", tip: "#fff0f8", vein: "#e8a8c8", emissive: 0xf7b8d3, emissiveIntensity: 0.22, softBase: "#dd86ad", softTip: "#f6c2dc" },
    scale: 0.5, weight: 0.5, motion: { spin: 0.7, fall: 0.85, sway: 1.1 }, size: [1.0, 1.9],
    params: { length: 1.0, width: 0.36, widthPow: 0.8, notch: 0.2, tipStyle: "broad", cupDepth: 0.13, skew: 0.03, seed: 5 },
  },
  {
    id: "meadow-sage",
    build: createBlossomGeometry,
    palette: { stem: "#a88ad0", base: "#d9c2f5", mid: "#e6d8fa", tip: "#f6efff", vein: "#c4a9e6", emissive: 0xd9c2f5, emissiveIntensity: 0.22, softBase: "#b795e0", softTip: "#ddc9f7" },
    scale: 0.48, weight: 0.32, motion: { spin: 0.8, fall: 0.95, sway: 1.0 }, size: [0.9, 1.7],
    params: { length: 0.95, width: 0.34, widthPow: 0.85, notch: 0.18, tipStyle: "broad", cupDepth: 0.12, skew: -0.02, seed: 13 },
  },
  {
    id: "meadow-cream",
    build: createBlossomGeometry,
    palette: { stem: "#d8cba0", base: "#ecd9a8", mid: "#f6e9c8", tip: "#fffdf4", vein: "#f0e6c8", emissive: "#fff4d8", emissiveIntensity: 0.22, softBase: "#e3cfa0", softTip: "#f8ead0" },
    scale: 0.46, weight: 0.18, motion: { spin: 0.65, fall: 0.9, sway: 1.15 }, size: [0.9, 1.7],
    params: { length: 0.92, width: 0.32, widthPow: 0.85, notch: 0.16, tipStyle: "broad", cupDepth: 0.12, skew: 0.02, seed: 23 },
  },
];
for (const t of MEADOW_PETALS) registerPetalType(t);

function distribute(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const counts = raw.map((v) => Math.floor(v));
  let used = counts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < total) {
    counts[order[k % order.length].i]++;
    used++;
    k++;
  }
  return counts;
}

function createSoftPetalTexture(palette) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const grad = ctx.createLinearGradient(0, S, 0, 0);
  grad.addColorStop(0, palette.softBase || palette.base);
  grad.addColorStop(1, palette.softTip || palette.tip);
  ctx.filter = "blur(5px)";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(S * 0.5, S * 0.96);
  ctx.bezierCurveTo(S * 0.02, S * 0.62, S * 0.12, S * 0.12, S * 0.5, S * 0.04);
  ctx.bezierCurveTo(S * 0.88, S * 0.12, S * 0.98, S * 0.62, S * 0.5, S * 0.96);
  ctx.closePath();
  ctx.fill();
  ctx.filter = "none";
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Per-instance lifetime fade, drawn as a soft front-to-back wipe.
//
// A petal never pops: it fades in over seconds and, when its life ends, the tip
// goes first and the body recedes toward the stem as pure alpha. No discard, no
// speckle — the petal thins away instead of breaking up.
function patchFade(material) {
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute float aFade;\nvarying float vFade;\nvarying vec2 vPetalUv;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vFade = aFade;\n  vPetalUv = uv;"
      );
    shader.fragmentShader =
      "varying float vFade;\nvarying vec2 vPetalUv;\n" +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float cut = mix(-0.55, 1.55, vFade);
        float wipe = 1.0 - smoothstep(cut - 0.48, cut, vPetalUv.y);
        gl_FragColor.a *= wipe * smoothstep(0.0, 0.08, vFade);`
      );
  };
}

export function createPetalField(options = {}) {
  const {
    seed = 133742,
    wind = 1,
    camera = null,
    anchors = [],
    area = 34,
    ground = 0,
    windDir = [0.9, 0, 0.25],
    counts = { near: 14, mid: 64, far: 160, carpet: 0 },
  } = options;

  const rand = createRng(seed);
  const group = new THREE.Group();
  group.name = "petalField";

  const WIND = new THREE.Vector3(windDir[0], windDir[1], windDir[2]).normalize();
  const WIND_SPEED = 0.85;
  const startPos = new THREE.Vector3();
  if (camera && camera.getWorldPosition) camera.getWorldPosition(startPos);

  const resolved = MEADOW_PETALS;
  const dummy = new THREE.Object3D();
  const camPos = new THREE.Vector3();
  const camFwd = new THREE.Vector3();

  let draws = 0;
  let triangles = 0;
  const layers = [];

  const Y_LOW = 0.4;
  const Y_HIGH = 5.0; // half tree height: petals never drift into the sky

  function makeState(type, mode, sizeRange) {
    const st = {
      type,
      mode,
      scale: range(rand, sizeRange[0], sizeRange[1]),
      phase: rand() * Math.PI * 2,
      swirlR: range(rand, 0.6, 2.6),
      swirlSpeed: range(rand, 0.18, 0.45) * (rand() > 0.5 ? 1 : -1),
      swayAmp: range(rand, 0.35, 0.8),
      swayFreq: range(rand, 0.18, 0.4),
      rx: rand() * Math.PI * 2,
      ry: rand() * Math.PI * 2,
      rz: rand() * Math.PI * 2,
      vrx: range(rand, -0.5, 0.5),
      vry: range(rand, -0.7, 0.7),
      vrz: range(rand, -0.45, 0.45),
      fall: range(rand, 0.1, 0.22),
      age: range(rand, 0, 8),
      life: range(rand, 9, 16),
      fadeIn: range(rand, 2.6, 4.5),
      fadeOut: range(rand, 3.0, 5.5),
      fade: 1,
    };

    if (mode === "foreground") {
      const ang = rand() * Math.PI * 2;
      const r = 2.5 + Math.sqrt(rand()) * 6;
      st.x = startPos.x + Math.cos(ang) * r;
      st.z = startPos.z + Math.sin(ang) * r;
      st.y = range(rand, 0.6, 2.2);
    } else if (mode === "mid") {
      const a = anchors.length ? anchors[Math.floor(rand() * anchors.length)] : { x: 0, z: 0 };
      const ang = rand() * Math.PI * 2;
      const r = 1.5 + Math.sqrt(rand()) * 7;
      st.x = a.x + Math.cos(ang) * r;
      st.z = a.z + Math.sin(ang) * r;
      st.y = range(rand, Y_LOW, Y_HIGH);
    } else if (mode === "far") {
      const ang = rand() * Math.PI * 2;
      const r = 4 + Math.sqrt(rand()) * area;
      st.x = startPos.x + Math.cos(ang) * r;
      st.z = startPos.z + Math.sin(ang) * r;
      st.y = range(rand, Y_LOW, Y_HIGH);
    } else {
      const a = anchors.length ? anchors[Math.floor(rand() * anchors.length)] : { x: 0, z: 0 };
      const ang = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 5.5;
      st.x = a.x + Math.cos(ang) * r;
      st.z = a.z + Math.sin(ang) * r;
      st.y = ground + 0.02 + rand() * 0.03;
      st.rx = -Math.PI / 2 + range(rand, -0.15, 0.15);
      st.rz = range(rand, -0.2, 0.2);
    }
    return st;
  }

  function addLayer(mode, count, sizeRange, detailed, soft) {
    if (!count) return;
    const byType = distribute(count, resolved.map((t) => t.weight));
    const states = [];

    resolved.forEach((type, ti) => {
      const n = byType[ti];
      if (!n) return;

      const geo = detailed
        ? type.build({ ...type.params, ...(type.params.ribs ? { ribs: 10 } : {}), scale: type.scale, palette: type.palette })
        : new THREE.PlaneGeometry(0.8, 1.2);

      const mat = soft
        ? new THREE.MeshBasicMaterial({
            map: createSoftPetalTexture(type.palette),
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: true,
          })
        : createPetalMaterial(type.palette);

      patchFade(mat);
      const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
      fadeAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aFade", fadeAttr);

      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.name = `petals:${mode}:${type.id}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.userData.fadeAttr = fadeAttr;

      if (!soft) {
        const baseCol = new THREE.Color(type.palette.base);
        const hsl = {};
        baseCol.getHSL(hsl);
        const tint = new THREE.Color();
        for (let i = 0; i < n; i++) {
          tint.setHSL(
            (hsl.h + range(rand, -0.012, 0.012) + 1) % 1,
            Math.min(1, Math.max(0, hsl.s + range(rand, -0.05, 0.05))),
            Math.min(1, Math.max(0, hsl.l + range(rand, -0.07, 0.07)))
          );
          mesh.setColorAt(i, tint);
        }
        mesh.instanceColor.needsUpdate = true;
      }

      group.add(mesh);
      draws += 1;
      triangles += (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3) * n;

      for (let i = 0; i < n; i++) {
        const st = makeState(type, mode, sizeRange);
        st.mesh = mesh;
        st.index = i;
        states.push(st);
      }
    });

    layers.push({ mode, states });
  }

  addLayer("foreground", counts.near, [0.55, 0.95], true, false);
  addLayer("mid", counts.mid, [0.4, 0.7], true, false);
  addLayer("far", counts.far, [0.1, 0.2], false, true);
  addLayer("carpet", counts.carpet, [0.3, 0.55], true, false);

  let time = 0;

  function write(st) {
    dummy.position.set(st.x, st.y, st.z);
    dummy.rotation.set(st.rx, st.ry, st.rz);
    dummy.scale.setScalar(st.scale);
    dummy.updateMatrix();
    st.mesh.setMatrixAt(st.index, dummy.matrix);
  }

  for (const layer of layers) {
    if (layer.mode !== "carpet") continue;
    for (const st of layer.states) write(st);
    for (const st of layer.states) st.mesh.instanceMatrix.needsUpdate = true;
  }

  function respawnNear(st, cam) {
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

  function respawnFar(st, cam) {
    if (cam) cam.getWorldPosition(camPos);
    const dist = range(rand, 16, 30);
    const ang = rand() * Math.PI * 2;
    st.x = camPos.x + Math.cos(ang) * dist;
    st.z = camPos.z + Math.sin(ang) * dist;
    st.y = range(rand, Y_LOW, Y_HIGH);
    st.age = 0;
    st.life = range(rand, 9, 16);
    st.fadeIn = range(rand, 2.6, 4.5);
    st.fadeOut = range(rand, 3.0, 5.5);
  }

  function update(dt, cam = camera) {
    const step = Math.min(Math.max(dt, 0), 0.05) * wind;
    if (step <= 0) return;
    time += step;

    for (const layer of layers) {
      if (layer.mode === "carpet") continue;

      for (const st of layer.states) {
        st.age += step;
        if (st.age >= st.life) {
          if (layer.mode === "foreground") respawnNear(st, cam);
          else respawnFar(st, cam);
        }
        const inFade = Math.min(1, st.age / st.fadeIn);
        const outFade = Math.min(1, Math.max(0, (st.life - st.age) / st.fadeOut));
        st.fade = Math.min(inFade, outFade);

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
          if (st.y < 0.5) st.y = 2.2;
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

  update(1 / 60, camera);

  return {
    group,
    update,
    stats: {
      petals: layers.reduce((n, l) => n + l.states.length, 0),
      draws,
      triangles: Math.round(triangles),
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    },
  };
}

export default createPetalField;
