// Storm Lance — pooled visuals for the mage's second spell.
//
// A braided bundle of lightning filaments snaps from the caster's hand to the
// aimed point, gutters while it holds, and blows out around a bright discharge
// dome. Adapted from the MIT-licensed reference project
// (spellbook/src/config/abilities/thunder.js and its ribbon material); see
// game/src/spellbook-LICENSE.txt.
//
// Cheap by construction: one shared ribbon geometry, ONE instanced draw call per
// pass (body + core) for every filament of every cast, and two shaders compiled
// once. The whole jagged path, the bundle fan, the kinks and the camera-facing
// width are evaluated in the vertex shader from per-instance attributes; the CPU
// only writes a handful of floats on spawn.
//
// Two passes over that geometry:
//   - body: normal-blended saturated blue. Additive blue over the bright meadow
//     saturates every channel and reads as white scratches, so the body must be
//     an alpha blend to stay blue.
//   - core: additive white-hot centre plus a soft blue glow.
// The impact dome reuses the fresnel shell shader.

import * as THREE from "three";
import { STORM_LANCE } from "./storm-lance-config.js";

const TAU = Math.PI * 2;
const MAX_STRANDS = 24;

function sat(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A flat ribbon strip in parameter space: position = (t, side, 0). */
function createRibbonGeometry(nodes = 40) {
  const steps = Math.max(2, Math.round(nodes));
  const positions = new Float32Array(steps * 2 * 3);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const o = i * 6;
    positions[o] = t;
    positions[o + 1] = -1;
    positions[o + 3] = t;
    positions[o + 4] = 1;
  }
  const indices = new Uint16Array((steps - 1) * 6);
  for (let i = 0; i < steps - 1; i++) {
    const a = i * 2;
    const o = i * 6;
    indices[o] = a;
    indices[o + 1] = a + 1;
    indices[o + 2] = a + 2;
    indices[o + 3] = a + 1;
    indices[o + 4] = a + 3;
    indices[o + 5] = a + 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

const BOLT_VERT = `
attribute vec3 aOrigin;
attribute vec3 aDirRange;
attribute float aStart;
attribute float aStrand;
attribute float aSeed;

uniform float uTime;
uniform float uStrands;
uniform float uHandHeight;
uniform float uHandForward;
uniform float uHandSide;
uniform float uEndHeight;
uniform float uSag;
uniform float uSpread;
uniform float uSpreadNear;
uniform float uSpreadCurve;
uniform float uTwist;
uniform float uTwistSpeed;
uniform float uJitter;
uniform float uJitterScale;
uniform float uJitterFalloff;
uniform float uCrawl;
uniform float uPinch;
uniform float uConverge;
uniform float uWidth;
uniform float uWidthTip;
uniform float uWidthCurve;
uniform float uCoreWidth;
uniform float uLifetime;
uniform float uFadeTime;

varying float vSide;
varying float vT;
varying float vFade;
varying float vSeed;

vec3 pathPoint(float t, vec3 dir, vec3 sideV, vec3 up, vec3 hand, vec3 end) {
  float tt = clamp(t, 0.0, 1.0);
  float off = (aStrand / max(1.0, uStrands - 1.0)) * 2.0 - 1.0;

  vec3 p = mix(hand, end, tt) + up * (uSag * sin(3.14159265 * tt));
  float spread = mix(uSpreadNear, uSpread, pow(tt, uSpreadCurve));
  // Filaments sit around the bolt axis (not in one flat fan), so the bundle
  // reads as a braided 3D cable from any camera angle.
  float ringAng = aSeed * 6.28318 + aStrand * 2.39996 + uTwist * 6.28318 * tt + uTime * uTwistSpeed * 6.28318;
  vec3 radial = sideV * cos(ringAng) + up * sin(ringAng);
  p += radial * off * spread;

  float k = 0.0;
  float amp = uJitter;
  float freq = uJitterScale;
  for (int i = 0; i < 4; i++) {
    float s = sin(tt * freq * 6.28318 + aSeed * 11.0 + aStrand * 3.7 + uTime * uCrawl * (1.0 + float(i)) + float(i) * 2.3);
    // Plateau-with-sharp-turns shaping gives lightning kinks instead of a
    // smooth sine wave.
    k += amp * (s * 0.65 + sign(s) * pow(abs(s), 0.35) * 0.35);
    amp *= uJitterFalloff;
    freq *= 2.0;
  }
  float pinch = smoothstep(0.0, uPinch, tt) * smoothstep(1.0, 1.0 - uPinch, tt);
  vec3 kdir = normalize(sideV * sin(aSeed * 9.0 + aStrand * 1.3) + up * cos(aSeed * 5.0 + aStrand * 1.7) + dir * 0.3);
  p += kdir * k * pinch;

  p = mix(p, end, uConverge * smoothstep(0.7, 1.0, tt));
  return p;
}

void main() {
  float age = uTime - aStart;
  if (aStart < -100.0 || age < 0.0 || age > uLifetime + uFadeTime) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vFade = 0.0;
    vSide = 0.0;
    vT = 0.0;
    vSeed = 0.0;
    return;
  }

  vec3 dir = normalize(vec3(aDirRange.x, 0.0, aDirRange.y));
  float range = aDirRange.z;
  vec3 sideV = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
  vec3 up = vec3(0.0, 1.0, 0.0);
  float off = (aStrand / max(1.0, uStrands - 1.0)) * 2.0 - 1.0;
  vec3 hand = aOrigin + dir * uHandForward + sideV * (uHandSide * off) + up * uHandHeight;
  vec3 end = aOrigin + dir * range + up * uEndHeight;

  float t = position.x;
  float side = position.y;
  float eps = 0.012;
  vec3 p0 = pathPoint(t, dir, sideV, up, hand, end);
  vec3 pa = pathPoint(max(0.0, t - eps), dir, sideV, up, hand, end);
  vec3 pb = pathPoint(min(1.0, t + eps), dir, sideV, up, hand, end);
  vec3 tangent = normalize(pb - pa);
  vec3 view = normalize(cameraPosition - p0);
  vec3 ribbon = normalize(cross(tangent, view));

  float width = uWidth * mix(1.0, uWidthTip, pow(t, uWidthCurve));
  if (abs(off) < 0.05) width *= uCoreWidth;

  vec3 world = p0 + ribbon * side * width;

  float fadeIn = smoothstep(0.0, 0.05, age);
  float fadeOut = 1.0 - smoothstep(uLifetime, uLifetime + uFadeTime, age);
  vFade = fadeIn * fadeOut;
  vSide = side;
  vT = t;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const BODY_FRAG = `
uniform vec3 uBodyOuter;
uniform vec3 uBodyInner;
uniform float uBodyAlpha;
uniform float uFlicker;
uniform float uFlickerSpeed;
uniform float uTime;
uniform float uRestrike;

varying float vSide;
varying float vT;
varying float vFade;
varying float vSeed;

void main() {
  float edge = abs(vSide);
  float centre = clamp(1.0 - edge, 0.0, 1.0);
  float body = smoothstep(1.0, 0.2, edge);
  vec3 col = mix(uBodyOuter, uBodyInner, smoothstep(0.05, 0.75, centre));

  float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * uFlickerSpeed * 6.28318 + vSeed * 10.0));
  float restrike = floor(uTime * uRestrike);
  float strandFlash = 1.0 - 0.75 * step(0.72, fract(sin(restrike * 1.7 + vSeed * 13.0) * 43758.5453));

  float alpha = body * uBodyAlpha * vFade * flick * strandFlash;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}`;

const CORE_FRAG = `
uniform vec3 uColorCore;
uniform vec3 uColorInner;
uniform float uCoreSharp;
uniform float uGlowFalloff;
uniform float uGlowOpacity;
uniform float uGlow;
uniform float uFlicker;
uniform float uFlickerSpeed;
uniform float uTime;
uniform float uRestrike;

varying float vSide;
varying float vT;
varying float vFade;
varying float vSeed;

void main() {
  float edge = abs(vSide);
  float centre = clamp(1.0 - edge, 0.0, 1.0);
  float core = pow(centre, uCoreSharp);
  float glow = pow(centre, uGlowFalloff);

  // White-hot centre, blue glow at the rim.
  vec3 col = mix(uColorInner, uColorCore, smoothstep(0.35, 0.9, centre));

  float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * uFlickerSpeed * 6.28318 + vSeed * 10.0));
  float restrike = floor(uTime * uRestrike);
  float strandFlash = 1.0 - 0.75 * step(0.72, fract(sin(restrike * 1.7 + vSeed * 13.0) * 43758.5453));

  float alpha = (core * 1.15 + uGlowOpacity * glow) * vFade * flick * strandFlash;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col * uGlow, alpha);
}`;

const HALO_FRAG = `
uniform vec3 uHaloColor;
uniform float uHaloAlpha;
uniform float uHaloFalloff;
uniform float uFlicker;
uniform float uFlickerSpeed;
uniform float uTime;

varying float vSide;
varying float vT;
varying float vFade;
varying float vSeed;

void main() {
  float edge = abs(vSide);
  float centre = clamp(1.0 - edge, 0.0, 1.0);
  float glow = pow(centre, uHaloFalloff);
  float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * uFlickerSpeed * 6.28318 + vSeed * 10.0));
  float alpha = glow * uHaloAlpha * vFade * flick;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uHaloColor, alpha);
}`;

// Discharge dome: brighter and milkier than the ice shell, with a hard glowing
// rim so it reads as an electric discharge rather than a frosted bubble.
const STORM_DOME_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const STORM_DOME_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float rim = pow(1.0 - ndv, 1.3);
  float a = uOpacity * (0.5 + 0.5 * rim);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.05 + 0.85 * rim), a);
}`;

export function createStormLanceVFX({ parent, rng, burst, ring, shake, emit } = {}) {
  const cfg = STORM_LANCE;
  const rand = typeof rng === "function" ? rng : Math.random;
  const slots = Math.max(1, Math.round(cfg.slots || 3));
  const strands = Math.max(1, Math.min(MAX_STRANDS, Math.round(cfg.strands || 13)));
  const capacity = slots * strands;

  const group = new THREE.Group();
  group.name = "storm-lance-vfx";
  if (parent && typeof parent.add === "function") parent.add(group);

  const geometry = createRibbonGeometry(40);
  const origins = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const dirRanges = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const starts = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const strandIdx = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  for (let i = 0; i < capacity; i++) {
    starts.array[i] = -1000;
    strandIdx.array[i] = i % strands;
    seeds.array[i] = rand() * 10;
  }
  geometry.setAttribute("aOrigin", origins);
  geometry.setAttribute("aDirRange", dirRanges);
  geometry.setAttribute("aStart", starts);
  geometry.setAttribute("aStrand", strandIdx);
  geometry.setAttribute("aSeed", seeds);

  // Uniform objects are shared between the two passes (updating uTime once
  // updates both materials); only width and colour differ per pass.
  const shared = {
    uTime: { value: 0 },
    uStrands: { value: strands },
    uHandHeight: { value: cfg.handHeight },
    uHandForward: { value: cfg.handForward },
    uHandSide: { value: cfg.handSide },
    uEndHeight: { value: cfg.endHeight },
    uSag: { value: cfg.sag },
    uSpread: { value: cfg.spread },
    uSpreadNear: { value: cfg.spreadNear },
    uSpreadCurve: { value: cfg.spreadCurve },
    uTwist: { value: cfg.twist },
    uTwistSpeed: { value: cfg.twistSpeed },
    uJitter: { value: cfg.jitter },
    uJitterScale: { value: cfg.jitterScale },
    uJitterFalloff: { value: cfg.jitterFalloff },
    uCrawl: { value: cfg.crawl },
    uPinch: { value: cfg.pinch },
    uConverge: { value: cfg.converge },
    uWidthTip: { value: cfg.widthTip },
    uWidthCurve: { value: cfg.widthCurve },
    uCoreWidth: { value: cfg.coreWidth },
    uLifetime: { value: cfg.lifetime },
    uFadeTime: { value: cfg.fadeTime },
    uFlicker: { value: cfg.flicker },
    uFlickerSpeed: { value: cfg.flickerSpeed },
    uRestrike: { value: cfg.restrike },
  };

  const bodyUniforms = Object.assign({}, shared, {
    uWidth: { value: cfg.width * (cfg.bodyWidthMult || 1.45) },
    uBodyOuter: { value: new THREE.Color(cfg.bodyOuter) },
    uBodyInner: { value: new THREE.Color(cfg.bodyInner) },
    uBodyAlpha: { value: cfg.bodyAlpha != null ? cfg.bodyAlpha : 0.88 },
  });
  const coreUniforms = Object.assign({}, shared, {
    uWidth: { value: cfg.width * (cfg.coreWidthMult || 0.5) },
    uColorCore: { value: new THREE.Color(cfg.colorCore) },
    uColorInner: { value: new THREE.Color(cfg.colorInner) },
    uCoreSharp: { value: cfg.coreSharp },
    uGlowFalloff: { value: cfg.glowFalloff },
    uGlowOpacity: { value: cfg.glowOpacity },
    uGlow: { value: cfg.glow },
  });
  const haloUniforms = Object.assign({}, shared, {
    uWidth: { value: cfg.width * (cfg.haloWidthMult || 2.4) },
    uHaloColor: { value: new THREE.Color(cfg.haloColor) },
    uHaloAlpha: { value: cfg.haloAlpha != null ? cfg.haloAlpha : 0.3 },
    uHaloFalloff: { value: cfg.haloFalloff != null ? cfg.haloFalloff : 1.4 },
  });

  const bodyMaterial = new THREE.ShaderMaterial({
    uniforms: bodyUniforms,
    vertexShader: BOLT_VERT,
    fragmentShader: BODY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const coreMaterial = new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    vertexShader: BOLT_VERT,
    fragmentShader: CORE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    vertexShader: BOLT_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const identity = new THREE.Matrix4();
  function makeBoltMesh(material, order) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.count = capacity;
    mesh.renderOrder = order;
    mesh.visible = false;
    // The vertex shader owns the world position; instance matrices are unused.
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, identity);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }
  const haloMesh = makeBoltMesh(haloMaterial, 4);
  const bodyMesh = makeBoltMesh(bodyMaterial, 5);
  const coreMesh = makeBoltMesh(coreMaterial, 6);
  const boltMeshes = [haloMesh, bodyMesh, coreMesh];

  const domeGeometry = new THREE.SphereGeometry(1, 18, 12);
  const domes = [];
  for (let s = 0; s < slots; s++) {
    const domeUniforms = {
      uColor: { value: new THREE.Color(cfg.colorDome) },
      uOpacity: { value: 0 },
    };
    const domeMaterial = new THREE.ShaderMaterial({
      uniforms: domeUniforms,
      vertexShader: STORM_DOME_VERT,
      fragmentShader: STORM_DOME_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.visible = false;
    dome.frustumCulled = false;
    dome.renderOrder = 7;
    group.add(dome);
    domes.push({ mesh: dome, uniforms: domeUniforms });
  }

  let time = 0;
  const slotState = [];
  for (let s = 0; s < slots; s++) {
    slotState.push({
      index: s,
      active: false,
      age: 0,
      ox: 0,
      oz: 0,
      dx: 0,
      dz: 1,
      range: 0,
      impactFired: false,
      domeT: -1,
    });
  }

  function writeSlot(slot) {
    const base = slot.index * strands;
    for (let i = 0; i < strands; i++) {
      const idx = base + i;
      origins.setXYZ(idx, slot.ox, 0, slot.oz);
      dirRanges.setXYZ(idx, slot.dx, slot.dz, slot.range);
      starts.array[idx] = time;
      strandIdx.array[idx] = i;
    }
    origins.needsUpdate = true;
    dirRanges.needsUpdate = true;
    starts.needsUpdate = true;
    strandIdx.needsUpdate = true;
  }

  function hideSlot(slot) {
    const base = slot.index * strands;
    for (let i = 0; i < strands; i++) starts.array[base + i] = -1000;
    starts.needsUpdate = true;
    const dome = domes[slot.index];
    dome.mesh.visible = false;
    dome.uniforms.uOpacity.value = 0;
    slot.domeT = -1;
  }

  function impact(slot) {
    if (slot.impactFired) return;
    slot.impactFired = true;
    const x = slot.ox + slot.dx * slot.range;
    const z = slot.oz + slot.dz * slot.range;
    if (typeof ring === "function") {
      ring({ x, y: 0, z }, { radius: cfg.impactRing, color: cfg.colorInner, life: 0.45 });
    }
    if (typeof burst === "function") {
      // Radial discharge spikes: zero gravity, no upward bias.
      burst(
        { x, y: 1.0, z },
        {
          count: cfg.impactSpikes || 44,
          color: cfg.colorInner,
          speed: 18,
          size: 0.2,
          life: 0.45,
          gravity: 0,
          up: 0,
        }
      );
      burst(
        { x, y: 0.9, z },
        {
          count: cfg.impactSparkCount || 20,
          color: cfg.colorOuter,
          speed: 6,
          size: 0.13,
          life: 0.8,
          gravity: -3,
          up: 0.8,
        }
      );
    }
    const dome = domes[slot.index];
    dome.mesh.position.set(x, 0.7, z);
    dome.mesh.scale.setScalar(0.35);
    dome.mesh.visible = true;
    dome.uniforms.uOpacity.value = cfg.impactDomeAlpha;
    slot.domeT = 0;
    if (typeof shake === "function") shake(cfg.impactShake);
    if (typeof emit === "function") {
      emit("sfx", { name: "explode", position: { x, y: 0, z }, pitch: 1.35, volume: 0.55 });
    }
  }

  function spawn(payload) {
    if (!payload || payload.spellId !== cfg.spellId) return null;
    const o = payload.origin;
    const d = payload.dir;
    if (!o || !d) return null;
    const dl = Math.hypot(d.x, d.z);
    if (dl < 1e-6) return null;
    const range = Number.isFinite(payload.range) ? payload.range : 0;
    if (!(range > 0)) return null;

    let slot = null;
    for (const s of slotState) {
      if (!s.active) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      slot = slotState[0];
      for (const s of slotState) if (s.age > slot.age) slot = s;
      hideSlot(slot);
    }
    slot.active = true;
    slot.age = 0;
    slot.ox = o.x;
    slot.oz = o.z;
    slot.dx = d.x / dl;
    slot.dz = d.z / dl;
    slot.range = range;
    slot.impactFired = false;
    slot.domeT = -1;
    writeSlot(slot);
    // Muzzle flash at the casting hand: one short shared burst, no new pool.
    if (typeof burst === "function") {
      burst(
        {
          x: slot.ox + slot.dx * cfg.handForward,
          y: cfg.handHeight,
          z: slot.oz + slot.dz * cfg.handForward,
        },
        { count: 8, color: cfg.colorInner, speed: 3, size: 0.12, life: 0.18, gravity: 0, up: 0.4 }
      );
    }
    for (const m of boltMeshes) m.visible = true;
    return slot;
  }

  function update(dt) {
    let step = Number(dt);
    if (!Number.isFinite(step) || step < 0) step = 0;
    if (step > 0.25) step = 0.25;
    time += step;
    shared.uTime.value = time;

    let any = false;
    for (const slot of slotState) {
      if (!slot.active) continue;
      any = true;
      slot.age += step;
      if (!slot.impactFired && slot.age >= slot.range / Math.max(0.01, cfg.speed)) impact(slot);

      if (slot.domeT >= 0) {
        slot.domeT += step;
        const k = sat(slot.domeT / Math.max(0.05, cfg.impactDomeLife));
        const dome = domes[slot.index];
        const ease = 1 - Math.pow(1 - k, 2.4);
        dome.mesh.scale.setScalar(0.35 + (cfg.impactDome - 0.35) * ease);
        dome.uniforms.uOpacity.value = cfg.impactDomeAlpha * Math.pow(1 - k, 1.6);
        dome.mesh.visible = k < 1;
        if (k >= 1) slot.domeT = -1;
      }

      if (slot.age > cfg.lifetime + cfg.fadeTime) {
        hideSlot(slot);
        slot.active = false;
      }
    }
    for (const m of boltMeshes) m.visible = any;
  }

  function reset() {
    for (const slot of slotState) {
      slot.active = false;
      hideSlot(slot);
    }
    for (let i = 0; i < capacity; i++) starts.array[i] = -1000;
    starts.needsUpdate = true;
    for (const m of boltMeshes) m.visible = false;
    time = 0;
    shared.uTime.value = 0;
  }

  return {
    group,
    spawn,
    update,
    reset,
    get activeCasts() {
      return slotState.filter((s) => s.active).length;
    },
  };
}
