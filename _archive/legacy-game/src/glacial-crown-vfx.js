// Glacial Crown — pooled visuals for the mage's third spell.
//
// A cold front races to the aimed point, a frozen disc snaps out under a
// frosted dome, and a ring of tall crystal blades tears up around the boundary,
// leaning outward over a banked skirt of wreckage. It stands, breathes cold,
// then breaks and sinks back into the snow.
//
// Adapted from the MIT-licensed reference project
// (spellbook/src/config/abilities/glacier.js, IceAbility.js); see
// game/src/spellbook-LICENSE.txt.
//
// Cheap by construction: it reuses Frost Lance's crystal geometry, ice material
// and frost geometry, so the only new shader program is the shared dome shell.
// Three instanced crystal meshes, one frost mesh, three point pools and one dome
// carry every cast; fixed slots mean nothing is allocated per cast.

import * as THREE from "three";
import { GLACIAL_CROWN } from "./glacial-crown-config.js";
import {
  createCrystalGeometry,
  createIceMaterial,
  createPointPool,
  createFrostGeometry,
  SHELL_VERT,
  SHELL_FRAG,
} from "./ice-lance-vfx.js";

const TAU = Math.PI * 2;
const VARIANTS = 3;

function sat(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function outQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}
function inCubic(t) {
  return t * t * t;
}
function hash11(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

export function createGlacialCrownVFX({ parent, rng, burst, ring, shake, emit } = {}) {
  const cfg = GLACIAL_CROWN;
  const rand = typeof rng === "function" ? rng : Math.random;
  const slots = Math.max(1, Math.round(cfg.slots || 3));
  const crystalCount = Math.max(1, Math.round(cfg.crystalCount || 126));
  const variants = Math.max(1, Math.min(VARIANTS, Math.round(cfg.variants || VARIANTS)));
  const perVariant = Math.ceil(crystalCount / variants);
  const patchesPerCast = Math.max(1, Math.round(cfg.frostPatches || 26));

  const group = new THREE.Group();
  group.name = "glacial-crown-vfx";
  if (parent && typeof parent.add === "function") parent.add(group);

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const lean = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const tmp = { x: 0, z: 0 };

  const material = createIceMaterial();
  const uniforms = material.userData.uniforms;

  const frostColorA = new THREE.Color(cfg.colorFrost);
  const frostColorB = new THREE.Color(cfg.colorFrostEdge);
  const fogColor = new THREE.Color(cfg.colorMist);
  const chipColor = new THREE.Color(cfg.colorShard);
  const sparkColor = new THREE.Color(cfg.colorSparkle);

  const meshes = [];
  const births = [];
  const facetSides = [cfg.facets, cfg.facets + 1, cfg.facets - 1];
  for (let v = 0; v < variants; v++) {
    const geometry = createCrystalGeometry({
      seed: 19.7 + v * 27.1,
      sides: facetSides[v % facetSides.length],
      taper: cfg.taper,
      roughness: cfg.roughness,
      bend: cfg.bend,
    });
    const capacity = slots * perVariant;
    const seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    const birthAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    for (let i = 0; i < capacity; i++) seedAttr.array[i] = rand() * 10;
    geometry.setAttribute("aSeed", seedAttr);
    geometry.setAttribute("aBirth", birthAttr);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 2;
    group.add(mesh);
    meshes.push(mesh);
    births.push(birthAttr);
    for (let i = 0; i < capacity; i++) {
      dummy.position.set(0, -999, 0);
      dummy.quaternion.identity();
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  const frostGeometry = createFrostGeometry();
  const frostMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: cfg.frostAlpha,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const frost = new THREE.InstancedMesh(frostGeometry, frostMaterial, slots * patchesPerCast);
  frost.frustumCulled = false;
  frost.count = 0;
  frost.renderOrder = 1;
  group.add(frost);
  for (let i = 0; i < slots * patchesPerCast; i++) {
    frost.setColorAt(i, frostColorA);
    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    frost.setMatrixAt(i, dummy.matrix);
  }
  frost.instanceMatrix.needsUpdate = true;
  if (frost.instanceColor) frost.instanceColor.needsUpdate = true;

  const fog = createPointPool({ capacity: 170, blending: THREE.NormalBlending, soft: true, renderOrder: 3 });
  const chips = createPointPool({ capacity: 340, blending: THREE.AdditiveBlending, soft: false, renderOrder: 5 });
  const sparkles = createPointPool({ capacity: 200, blending: THREE.AdditiveBlending, soft: false, renderOrder: 6 });
  group.add(fog.points);
  group.add(chips.points);
  group.add(sparkles.points);

  const domeGeometry = new THREE.SphereGeometry(1, 20, 14);
  const domes = [];
  for (let s = 0; s < slots; s++) {
    const domeUniforms = {
      uColor: { value: new THREE.Color(cfg.colorDome) },
      uOpacity: { value: 0 },
    };
    const domeMaterial = new THREE.ShaderMaterial({
      uniforms: domeUniforms,
      vertexShader: SHELL_VERT,
      fragmentShader: SHELL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.visible = false;
    dome.frustumCulled = false;
    dome.renderOrder = 4;
    group.add(dome);
    domes.push({ mesh: dome, uniforms: domeUniforms });
  }

  const slotState = [];
  for (let s = 0; s < slots; s++) {
    const records = new Array(crystalCount);
    for (let i = 0; i < crystalCount; i++) {
      records[i] = {
        angle: 0,
        radial: 0,
        skirt: false,
        heightJitter: 0,
        radiusJitter: 0,
        leanJitter: 0,
        yaw: 0,
        eruptAt: 0,
        breached: false,
        height: 1,
      };
    }
    const patches = new Array(patchesPerCast);
    for (let i = 0; i < patchesPerCast; i++) patches[i] = { angle: 0, radial: 0, radius: 0, delay: 0 };
    slotState.push({
      index: s,
      active: false,
      age: 0,
      phase: "travel",
      phaseT: 0,
      travelT: 0,
      ox: 0,
      oz: 0,
      cx: 0,
      cz: 0,
      range: 0,
      radius: 0,
      impactFired: false,
      domeT: -1,
      fogFront: 0,
      records,
      patches,
    });
  }

  function degenerate(matrixTarget, index) {
    dummy.position.set(0, -999, 0);
    dummy.quaternion.identity();
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    matrixTarget.setMatrixAt(index, dummy.matrix);
  }

  function hideSlot(slot) {
    const base = slot.index * perVariant;
    for (let v = 0; v < variants; v++) {
      for (let i = 0; i < perVariant; i++) {
        degenerate(meshes[v], base + i);
        births[v].array[base + i] = 0;
      }
      meshes[v].instanceMatrix.needsUpdate = true;
      births[v].needsUpdate = true;
    }
    const fbase = slot.index * patchesPerCast;
    for (let i = 0; i < patchesPerCast; i++) degenerate(frost, fbase + i);
    frost.instanceMatrix.needsUpdate = true;
    const dome = domes[slot.index];
    dome.mesh.visible = false;
    dome.uniforms.uOpacity.value = 0;
    slot.domeT = -1;
  }

  function fogPuff(x, y, z, scale, alphaScale) {
    fog.spawn({
      x,
      y,
      z,
      vx: (rand() * 2 - 1) * cfg.mistDrift,
      vy: cfg.mistRise * (0.4 + rand() * 0.8),
      vz: (rand() * 2 - 1) * cfg.mistDrift,
      gravity: 0.25,
      drag: 0.985,
      life: cfg.mistLife * (0.7 + rand() * 0.5),
      size0: cfg.mistSize * 0.35 * scale,
      size1: cfg.mistSize * scale,
      alpha: cfg.mistAlpha * (0.7 + rand() * 0.5) * (alphaScale || 1),
      r: fogColor.r,
      g: fogColor.g,
      b: fogColor.b,
    });
  }

  function chipBurst(x, y, z, count, power) {
    const p = power || 1;
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU;
      const speed = cfg.chipSpeed * (0.35 + rand() * 0.9) * p;
      chips.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * speed * (0.4 + rand() * 0.6),
        vy: cfg.chipSpeed * (0.3 + rand() * 0.8) * p,
        vz: Math.sin(a) * speed * (0.4 + rand() * 0.6),
        gravity: cfg.chipGravity,
        drag: 0.995,
        life: cfg.chipLife * (0.7 + rand() * 0.6),
        size0: cfg.chipSize * (0.7 + rand() * 0.8) * p,
        size1: cfg.chipSize * 0.3 * p,
        alpha: 1,
        r: chipColor.r,
        g: chipColor.g,
        b: chipColor.b,
      });
    }
  }

  function sparkleBurst(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU;
      const spread = 0.35 + rand() * 0.9;
      sparkles.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * spread,
        vy: cfg.sparkleSpeed * (0.5 + rand() * 0.9),
        vz: Math.sin(a) * spread,
        gravity: -0.4,
        drag: 0.99,
        life: cfg.sparkleLife * (0.6 + rand() * 0.8),
        size0: cfg.sparkleSize * (0.6 + rand() * 0.9),
        size1: cfg.sparkleSize * 0.3,
        alpha: 0.95,
        r: sparkColor.r,
        g: sparkColor.g,
        b: sparkColor.b,
      });
    }
  }

  function resetSlotRecords(slot) {
    const ringCount = Math.round(crystalCount * cfg.ringShare);
    const radius = slot.radius;
    for (let i = 0; i < crystalCount; i++) {
      const r = slot.records[i];
      r.skirt = i >= ringCount;
      r.angle = rand() * TAU;
      r.radial = r.skirt
        ? radius * (cfg.skirtSeat + rand() * cfg.skirtBand)
        : radius * (cfg.ringSeat + (rand() * 2 - 1) * cfg.ringScatter);
      r.heightJitter = rand() * 2 - 1;
      r.radiusJitter = rand() * 2 - 1;
      r.leanJitter = rand() * 2 - 1;
      r.yaw = rand() * TAU;
      r.height = cfg.height * (r.skirt ? 0.3 + rand() * 0.22 : 0.72 + rand() * 0.52);
      r.breached = false;
      // The ring closes from a start bearing, both ways around.
      let order = ((r.angle - cfg.sweepStart) % TAU + TAU) % TAU;
      if (order > Math.PI) order = TAU - order;
      order /= Math.PI;
      r.eruptAt = order * cfg.sweepTime + rand() * 0.05;
    }

    const fbase = slot.index * patchesPerCast;
    for (let i = 0; i < patchesPerCast; i++) {
      const p = slot.patches[i];
      p.angle = rand() * TAU;
      p.radial = Math.sqrt(rand()) * radius * 0.98;
      p.radius = (0.55 + rand() * 0.8) * (1 + p.radial / Math.max(0.1, radius)) * cfg.frostSpread;
      p.delay = (p.radial / Math.max(0.1, radius)) * 0.18;
      frost.setColorAt(fbase + i, rand() < 0.6 ? frostColorA : frostColorB);
    }
    if (frost.instanceColor) frost.instanceColor.needsUpdate = true;
  }

  function spawn(payload) {
    if (!payload || payload.spellId !== cfg.spellId) return null;
    const o = payload.origin;
    const center = payload.center;
    const d = payload.dir;
    if (!o || !d || !center) return null;
    const dl = Math.hypot(d.x, d.z);
    if (dl < 1e-6) return null;
    const range = Number.isFinite(payload.range) ? payload.range : 0;
    const radius = Number.isFinite(payload.radius) ? payload.radius : cfg.zoneRadius;
    if (!(range > 0) || !(radius > 0)) return null;

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
    slot.phase = "travel";
    slot.phaseT = 0;
    slot.travelT = 0;
    slot.ox = o.x;
    slot.oz = o.z;
    slot.cx = center.x;
    slot.cz = center.z;
    slot.range = range;
    slot.radius = radius;
    slot.impactFired = false;
    slot.domeT = -1;
    slot.fogFront = 0;
    resetSlotRecords(slot);
    return slot;
  }

  function impact(slot) {
    if (slot.impactFired) return;
    slot.impactFired = true;
    const { cx, cz } = slot;
    if (typeof ring === "function") {
      ring({ x: cx, y: 0, z: cz }, { radius: slot.radius, color: cfg.colorFrost, life: 0.5 });
      ring({ x: cx, y: 0, z: cz }, { radius: slot.radius * 0.6, color: cfg.colorFrostEdge, life: 0.32 });
    }
    if (typeof burst === "function") {
      burst(
        { x: cx, y: 0.4, z: cz },
        { count: 32, color: cfg.colorShard, speed: 8, size: 0.16, life: 0.8, gravity: -9, up: 2.4 }
      );
      burst(
        { x: cx, y: 0.25, z: cz },
        { count: 24, color: cfg.colorFrost, speed: 3.0, size: 0.38, life: 1.2, gravity: 0.5, up: 0.9 }
      );
    }
    chipBurst(cx, 0.35, cz, 24, 1.3);
    fogPuff(cx, 0.35, cz, 2.2, 1.5);
    fogPuff(cx, 0.25, cz, 1.6, 1.2);
    sparkleBurst(cx, 0.6, cz, 14);

    const dome = domes[slot.index];
    dome.mesh.position.set(cx, 0.25, cz);
    dome.mesh.scale.setScalar(0.4);
    dome.mesh.visible = true;
    dome.uniforms.uOpacity.value = cfg.domeAlpha;
    slot.domeT = 0;
    if (typeof shake === "function") shake(cfg.impactShake);
    if (typeof emit === "function") {
      emit("sfx", { name: "explode", position: { x: cx, y: 0, z: cz }, pitch: 0.9, volume: 0.6 });
    }
  }

  function emergence(slot, record) {
    const elapsed = slot.age - record.eruptAt;
    if (elapsed < 0) return -1;
    const rise = Math.max(0.02, cfg.riseTime);
    if (elapsed <= rise) return outQuint(sat(elapsed / rise));
    const after = elapsed - rise;
    return 1 + cfg.riseOvershoot * Math.sin(after * 14) * Math.exp(-after / Math.max(0.05, cfg.settle));
  }

  function updateCrystals(slot, retract) {
    const base = slot.index * perVariant;
    const birthFade = Math.max(0.02, cfg.birthFade);
    for (let i = 0; i < crystalCount; i++) {
      const record = slot.records[i];
      const variant = i % variants;
      const local = (i / variants) | 0;
      const idx = base + local;
      const emerge = emergence(slot, record);
      if (emerge < 0) {
        degenerate(meshes[variant], idx);
        births[variant].array[idx] = 0;
        continue;
      }

      const cos = Math.cos(record.angle);
      const sin = Math.sin(record.angle);
      const px = slot.cx + cos * record.radial;
      const pz = slot.cz + sin * record.radial;
      const height = Math.max(0.05, record.height * (1 + record.heightJitter * cfg.heightJitter));
      const radius = Math.max(
        0.01,
        cfg.radius * (record.skirt ? 0.8 : 1) * (1 + record.radiusJitter * cfg.radiusJitter)
      );

      if (!record.breached && emerge > 0.25) {
        record.breached = true;
        chipBurst(px, 0.12, pz, Math.max(1, Math.round(cfg.chipCount)), 0.8);
        if (rand() < 0.4) fogPuff(px, 0.2, pz, 0.9 + rand() * 0.5, 0.8);
      }

      // Ring blades lean outward over the skirt.
      lean.set(cos, 0, sin);
      axis.crossVectors(up, lean).normalize();
      const leanAngle =
        cfg.lean * (record.skirt ? 0.9 : 1.0) * (0.7 + 0.5 * Math.abs(record.leanJitter));
      tilt.setFromAxisAngle(axis, leanAngle);
      spin.setFromAxisAngle(up, record.yaw * cfg.twist);
      tilt.multiply(spin);

      let y = 0.05 + (emerge - 1) * height * 0.85;
      if (retract > 0) y -= inCubic(retract) * (height + radius + 0.4);

      dummy.position.set(px, y, pz);
      dummy.quaternion.copy(tilt);
      dummy.scale.set(radius, height, radius).multiplyScalar(lerp(0.86, 1, Math.min(1, emerge)));
      dummy.updateMatrix();
      meshes[variant].setMatrixAt(idx, dummy.matrix);
      births[variant].array[idx] = sat(1 - (slot.age - record.eruptAt) / birthFade);
    }
  }

  function updateFrost(slot, retract) {
    const fbase = slot.index * patchesPerCast;
    const freeze = sat(slot.phaseT / 0.25);
    const sink = retract > 0 ? 1 - inCubic(retract) : 1;
    for (let i = 0; i < patchesPerCast; i++) {
      const patch = slot.patches[i];
      const grow = sat((freeze - patch.delay) / 0.18);
      const radius = patch.radius * grow * sink;
      if (radius <= 0.01) {
        degenerate(frost, fbase + i);
        continue;
      }
      dummy.position.set(
        slot.cx + Math.cos(patch.angle) * patch.radial,
        0.06,
        slot.cz + Math.sin(patch.angle) * patch.radial
      );
      dummy.quaternion.identity();
      dummy.scale.set(radius, 1, radius);
      dummy.updateMatrix();
      frost.setMatrixAt(fbase + i, dummy.matrix);
    }
  }

  function updateDome(slot, step) {
    if (slot.domeT < 0) return;
    slot.domeT += step;
    const k = sat(slot.domeT / Math.max(0.05, cfg.domeLife));
    const dome = domes[slot.index];
    const ease = 1 - Math.pow(1 - k, 2.6);
    dome.mesh.scale.setScalar(0.4 + (cfg.domeSize - 0.4) * ease);
    dome.uniforms.uOpacity.value = cfg.domeAlpha * Math.pow(1 - k, 1.7);
    dome.mesh.visible = k < 1;
    if (k >= 1) slot.domeT = -1;
  }

  function updateSlot(slot, step) {
    if (slot.phase === "travel") {
      slot.travelT += step;
      const travelTime = slot.range / Math.max(0.01, cfg.speed);
      const front = Math.min(slot.range, (slot.travelT / Math.max(0.01, travelTime)) * slot.range);
      while (slot.fogFront + 1.4 <= front) {
        slot.fogFront += 1.4;
        const k = slot.fogFront / Math.max(0.01, slot.range);
        fogPuff(
          slot.ox + (slot.cx - slot.ox) * k,
          0.25,
          slot.oz + (slot.cz - slot.oz) * k,
          0.7 + rand() * 0.4,
          0.7
        );
      }
      if (slot.travelT >= travelTime) {
        slot.phase = "freezing";
        slot.phaseT = 0;
        impact(slot);
      }
      return;
    }

    slot.phaseT += step;
    if (slot.phase === "freezing" && slot.phaseT >= cfg.sweepTime + 0.4) {
      slot.phase = "standing";
      slot.phaseT = 0;
    } else if (slot.phase === "standing" && slot.phaseT >= cfg.standTime) {
      slot.phase = "sinking";
      slot.phaseT = 0;
    } else if (slot.phase === "sinking" && slot.phaseT >= cfg.sinkTime) {
      hideSlot(slot);
      slot.active = false;
      return;
    }

    const retract = slot.phase === "sinking" ? sat(slot.phaseT / Math.max(0.05, cfg.sinkTime)) : 0;
    updateCrystals(slot, retract);
    updateFrost(slot, retract);
    updateDome(slot, step);
  }

  function update(dt) {
    let step = Number(dt);
    if (!Number.isFinite(step) || step < 0) step = 0;
    if (step > 0.25) step = 0.25;
    uniforms.uTime.value += step;

    let maxSlot = -1;
    for (let s = 0; s < slotState.length; s++) {
      const slot = slotState[s];
      if (!slot.active) continue;
      maxSlot = Math.max(maxSlot, s);
      slot.age += step;
      updateSlot(slot, step);
    }

    const crystalInstances = maxSlot >= 0 ? (maxSlot + 1) * perVariant : 0;
    for (let v = 0; v < variants; v++) {
      meshes[v].count = crystalInstances;
      meshes[v].instanceMatrix.needsUpdate = crystalInstances > 0;
      births[v].needsUpdate = crystalInstances > 0;
    }
    const frostInstances = maxSlot >= 0 ? (maxSlot + 1) * patchesPerCast : 0;
    frost.count = frostInstances;
    frost.instanceMatrix.needsUpdate = frostInstances > 0;

    fog.update(step);
    chips.update(step);
    sparkles.update(step);
  }

  function reset() {
    for (const slot of slotState) {
      slot.active = false;
      hideSlot(slot);
    }
    for (const mesh of meshes) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    frost.count = 0;
    frost.instanceMatrix.needsUpdate = true;
    fog.clear();
    chips.clear();
    sparkles.clear();
    for (const dome of domes) {
      dome.mesh.visible = false;
      dome.uniforms.uOpacity.value = 0;
    }
    uniforms.uTime.value = 0;
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
