import * as THREE from "three";
import { MEADOW, MEADOW_LIGHT } from "./palette.js";
import { createMeadowTerrain } from "./terrain.js";
import { createMeadowKit } from "./kit.js";
import { createMeadowSky } from "./sky.js";
import { createMeadowPost } from "./post.js";
import { createPetalField } from "./petal-field.js";

// Sunpetal Vale â€” "anime meadow" background.
//
// Composition root for the new map background. The vegetation is built from the
// PORTED reference assets (game/src/map/port/), placed by kit.js on our own
// 96 x 96 map: our terrain, our path, our lake, our sky.
//
// The ported botanical material is self-lit (a two-colour vertex ramp, no PBR),
// which is what gives the reference its anime look. The sky module still owns a
// DirectionalLight/hemisphere for the terrain, and its sun direction is handed to
// the kit so the ramp and the real sun agree.
//
//   const bg = createMeadowBackground({ scene, renderer, camera, rng });
//   bg.update(elapsed, dt); bg.render(dt);

/* ------------------------------------------------------------------------- */
/* contact shadows                                                           */
/* ------------------------------------------------------------------------- */

// One instanced soft ellipse per tree, lying on the ground under the canopy.
// The quad is 7.0 m along the shadow axis and 4.5 m across, offset 1.0 m down
// the shadow direction so the blob sits under the canopy rather than the trunk.
// The kit does not expose per-tree scale, so every tree gets the same footprint.
function createContactShadows({ anchors, heightAt, sunDir, shadowColor = 0x2f4a3a }) {
  const list = (anchors ?? []).filter((a) => Number.isFinite(a.x) && Number.isFinite(a.z));
  // Only the flat meadow floor: beyond this the ground rises and a flat quad
  // would clip through it.
  const onFloor = list.filter((a) => Math.abs(a.x) < 80 && a.z > -80);
  if (!onFloor.length || typeof document === "undefined") return null;

  // Soft radial alpha, encoded in the GREEN channel because that is what three
  // samples from an alphaMap. The canvas must be opaque: a transparent canvas
  // keeps g = 1 everywhere and the "soft" blob renders as a solid dark disc.
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.78)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const alphaMap = new THREE.CanvasTexture(canvas);
  alphaMap.needsUpdate = true;

  // Flat quad in the XZ plane. rotateX bakes the orientation into the geometry,
  // so instance scale.x is the long axis and scale.z the short one.
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: shadowColor,
    alphaMap,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, onFloor.length);
  mesh.name = "treeContactShadows";
  mesh.renderOrder = 1;
  // The geometry is a unit plane at the origin; three would cull it against that
  // bounding sphere instead of the instance transforms.
  mesh.frustumCulled = false;

  // Ground shadow direction: away from the sun, horizontally.
  const dx = -(sunDir?.x ?? 0.61);
  const dz = -(sunDir?.z ?? 0.36);
  const len = Math.hypot(dx, dz) || 1;
  const sx = dx / len;
  const sz = dz / len;
  // Local +X maps to (cos yaw, 0, -sin yaw) under a Y rotation, so this yaw
  // aligns the long axis with (sx, sz).
  const yaw = Math.atan2(-sz, sx);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < onFloor.length; i++) {
    const a = onFloor[i];
    const x = a.x + sx * 1.0;
    const z = a.z + sz * 1.0;
    dummy.position.set(x, (heightAt ? heightAt(x, z) : 0) + 0.02, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(12.0, 1, 8.0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "contactShadows";
  group.add(mesh);

  return { group, count: onFloor.length, triangles: onFloor.length * 2 };
}

export function createMeadowBackground(options = {}) {
  const {
    scene,
    renderer,
    camera,
    rng,
    quality = "high",
    seed = 20261017,
    palette = MEADOW,
    // Forwarded to the kit: false suppresses the default centre feature tree so
    // a scene can place its own landmark tree at (0, -38.5).
    centreTree = true,
    // Post is off by default. The ported reference materials are display-referred
    // (they write final sRGB values and never tone-map), while the terrain is a
    // PBR material that expects the renderer's ACES + sRGB pass. A composer can
    // only be correct for one of those without converting the other, so the
    // meadow ships on the plain render path â€” which is exactly the path the
    // reference scenes themselves use (neither of them has a composer either,
    // except ref A's weak bloom over a fully custom pipeline).
    post = false,
    // Falling petals over the meadow. World-space, not camera-space.
    petals = true,
    // "A few hundred", not confetti. The carpet layer (260 detailed petals lying
    // flat on the ground under trees 50 m away) was 9 % of the triangle budget
    // and invisible from the gameplay camera -- it is gone.
    // Round 2: five of the fourteen foreground petals moved to the lens layer, so
    // there is one big soft petal near the lens (the reference's foreground blob).
    petalCounts = { near: 14, mid: 64, far: 140, carpet: 0, lens: 5 },
    petalTypes = ["meadow-lilac", "meadow-sage", "meadow-cream"],
    petalWeights = { "meadow-lilac": 0.5, "meadow-sage": 0.32, "meadow-cream": 0.18 },
    petalWind = 1,
    width = typeof innerWidth === "number" ? innerWidth : 1600,
    height = typeof innerHeight === "number" ? innerHeight : 900,
  } = options;

  if (!scene) throw new Error("createMeadowBackground: scene is required");

  const group = new THREE.Group();
  group.name = "meadowBackground";

  /* ---------------- terrain ---------------- */

  const terrain = createMeadowTerrain({ palette, quality, rocks: false });
  group.add(terrain.group);

  /* ---------------- sky + light rig ---------------- */

  const sky = createMeadowSky({
    palette,
    sunAzimuth: MEADOW_LIGHT.sunAzimuth,
    sunElevation: MEADOW_LIGHT.sunElevation,
    quality,
  });
  group.add(sky.group);

  /* ---------------- meadow dressing (ported reference assets) ---------------- */

  const kit = createMeadowKit({
    rng,
    seed,
    heightAt: terrain.heightAt,
    pathDistance: terrain.pathDistance,
    sunDir: sky.sunDir,
    quality,
    centreTree,
  });
  group.add(kit.group);

  // NOTE: tree colours are owned entirely by the tree builder now. Round 2
  // patched leaf uniforms and vertex colours from here; that was wrong twice --
  // it double-applied a desaturation and it could never reach the shader's
  // pow(col, 2.2), which is what actually crushed the shadows. See
  // port/anime-flower-tree.js rawColor().

  /* ---------------- contact shadows ---------------- */

  // Grounding, cheaply: one instanced soft ellipse per tree. This is the cue
  // anime backgrounds actually use, and the trees currently float because the
  // kit sets castShadow=false on everything. 28 quads = 56 tris, one draw call.
  //
  // The long axis follows the ground shadow direction, i.e. directly away from
  // the sun: sunDir.xz = (0.61, 0.36) -> shadow = (-0.86, -0.50) in (x, z).
  const contactShadows = createContactShadows({
    anchors: kit.treeAnchors ?? [],
    heightAt: terrain.heightAt,
    sunDir: sky.sunDir,
    shadowColor: 0x2f4a3a,
  });
  if (contactShadows) group.add(contactShadows.group);

  // The 2048^2 shadow map is allocated by the sky rig but nothing in this scene
  // casts into it (the kit is castShadow=false, the terrain receives only), so
  // the pass is dead weight. The contact-shadow decals above do the job.
  sky.sun.castShadow = false;

  /* ---------------- falling petals ---------------- */

  let petalField = null;
  if (petals) {
    petalField = createPetalField({
      seed: seed + 17,
      counts: petalCounts,
      types: petalTypes,
      typeWeights: petalWeights,
      wind: petalWind,
      anchors: kit.treeAnchors ?? [],
      area: 30,
    });
    group.add(petalField.group);
  }

  scene.add(group);

  /* ---------------- atmosphere ---------------- */

  const fogNear = MEADOW_LIGHT.fogNear;
  const fogFar = MEADOW_LIGHT.fogFar;
  scene.fog = new THREE.Fog(palette.fog, fogNear, fogFar);
  scene.background = new THREE.Color(palette.skyHorizon);

  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = sky.exposure ?? MEADOW_LIGHT.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  /* ---------------- post ---------------- */

  // displayReferred: false is the correct setting for this scene and is what
  // keeps the pipeline at ONE tone map: the composer target is linear HDR
  // (three skips tone mapping into a render target), so the grade's ACES +
  // sRGB encode is the only conversion. Do not flip this to true -- it encodes
  // the built-ins twice and leaves the ported custom shaders unencoded.
  let postChain = null;
  if (post && renderer && camera) {
    postChain = createMeadowPost({
      renderer, scene, camera, width, height, enabled: true, displayReferred: false,
    });
  }

  /* ---------------- frame ---------------- */

  function update(elapsed, dt) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;
    terrain.update(t);
    kit.update(t, camera);
    sky.update(t);
    // Keep the lake's glint on the same sun as the sky, including through the
    // day/night cycle.
    if (terrain.uniforms?.waterSunDir) terrain.uniforms.waterSunDir.value.copy(sky.sunDir);
    if (petalField) petalField.update(Number.isFinite(dt) ? dt : 0.016);
  }

  function render(dt) {
    if (postChain) postChain.render(dt);
    else if (renderer && camera) renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (postChain) postChain.setSize(w, h);
  }

  function setPostEnabled(enabled) {
    if (postChain) postChain.setEnabled(enabled);
  }

  // Time of day, 0..1 (0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset).
  // Returns the daylight factor so a host can dim its own exposure.
  function setTimeOfDay(t) {
    return sky.setTimeOfDay ? sky.setTimeOfDay(t) : 1;
  }

  function dispose() {
    if (postChain) postChain.dispose();
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) {
        obj.geometry?.dispose?.();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
        else mat?.dispose?.();
      }
    });
    scene.fog = null;
  }

  const stats = {
    terrain: terrain.stats,
    kit: kit.stats,
    sky: sky.stats,
    petals: petalField ? petalField.stats : null,
    colliders: (kit.colliders?.length ?? 0) + (terrain.colliders?.length ?? 0),
  };

  return {
    group,
    terrain,
    kit,
    sky,
    petals: petalField,
    post: postChain,
    update,
    render,
    resize,
    setPostEnabled,
    setTimeOfDay,
    dispose,
    stats,
    heightAt: terrain.heightAt,
    pathDistance: terrain.pathDistance,
    waterLevel: terrain.waterLevel,
    colliders: [...(terrain.colliders ?? []), ...(kit.colliders ?? [])],
  };
}

export default createMeadowBackground;
