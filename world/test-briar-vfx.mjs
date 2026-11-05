import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLENDER_VOLUMETRIC_FLOWERS } from './assets/flowers/blender-flower-data.js';
import { createArtoriousVfxSystem } from './assets/vfx/artorious-vfx.js';

// 1. Verify Blender-baked Witcher 3 briar arch & crimson flower slump exist with valid attributes
assert.ok(
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch,
  'witcherBriarArch must be baked in blender-flower-data.js'
);
assert.ok(
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles >= 1200 &&
    BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles <= 3200,
  `witcherBriarArch triangles (${BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles}) must be within 1200..3200`
);
assert.equal(
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.uv.length,
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles * 3 * 2,
  'witcherBriarArch must include per-vertex [uCurveT, vPartKind] uv pairs'
);
assert.equal(
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.anc.length,
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles * 3 * 3,
  'witcherBriarArch must include per-vertex 3D spine/attachment anchors (anc)'
);
assert.ok(
  BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump,
  'crimsonFlowerSlump must be baked in blender-flower-data.js'
);
assert.ok(
  BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump.triangles >= 400 &&
    BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump.triangles <= 960,
  `crimsonFlowerSlump triangles (${BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump.triangles}) must be within 400..960`
);

// Verify backward compatibility for meadow flower species
for (const legacyKey of ['crimsonRose', 'daisy', 'bellflower', 'lupine', 'cosmos']) {
  assert.ok(
    BLENDER_VOLUMETRIC_FLOWERS[legacyKey],
    `Legacy meadow flower ${legacyKey} must remain in blender-flower-data.js`
  );
}

// 2. Verify Universal Zero Glass Law & 4-beat Blessing timeline (2.50s total)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.2, 900);
camera.position.set(0, 2.5, 6.0);
camera.lookAt(0.75, 1.0, 0);
camera.updateMatrixWorld();

const vfx = createArtoriousVfxSystem({ scene, getGroundHeight: () => 0 });
for (const mesh of [
  vfx.skyRibbonsMesh,
  vfx.monolithsMesh,
  vfx.prismsAndDebrisMesh,
  vfx.groundSigilMesh,
]) {
  assert.equal(mesh.material.transparent, false, `${mesh.name} must obey Zero Glass Law`);
  assert.equal(mesh.material.depthWrite, true, `${mesh.name} must write depth`);
  assert.equal(mesh.material.side, THREE.FrontSide, `${mesh.name} must use FrontSide`);
}

// Verify Channel (Frame 37): 40 crimson petals (32 world + 8 foreground) + 18 slow creeping briar roots (Option 04 default)
vfx.startChannel({ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 }, { camera });
vfx.seek(0.5);
assert.equal(vfx.monolithsMesh.count, 18, 'Channel must creep 18 thick briar net modules around boots');
assert.equal(
  vfx.prismsAndDebrisMesh.count,
  40,
  'Channel must render 32 world petals + 8 foreground soft-focus petals'
);

// Trigger Blessing (4-beat 4.80s sequence)
vfx.triggerBlessing({ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 });
assert.equal(vfx.totalDuration, 4.8);

// Beat 1 (1.85s): Conical briar mound (18 thick instances) growing with staggered asymmetry, heroes still on ground (levY == 0)
vfx.seek(1.85);
assert.equal(vfx.monolithsMesh.count, 18, 'Beat 1 must render 18 thick briar mound modules');
assert.equal(vfx.getHeroLevitationOffset('Knight'), 0);
assert.equal(vfx.isHeroUndergroundHidden(), false);

// Beat 2 end (2.63s): Heroes pulled underground near -2.5m, vines 100% submerged (submergeDepth >= 3.0m), flower slump active
vfx.seek(2.63);
assert.ok(vfx.getHeroLevitationOffset('Knight') < -2.2, 'Beat 2 must yank heroes to ~ -2.5m');
assert.ok(
  vfx.monolithMetaAttr.getZ(0) >= 3.0,
  `Beat 2 submergeDepth (${vfx.monolithMetaAttr.getZ(0)}) must exceed 3.00m before Beat 3 so 0 pixels remain above ground`
);
assert.equal(vfx.groundSigilMesh.count, 1, 'Flower slump must be visible on cobblestones');
assert.ok(vfx.getCameraLookOffset().y < -0.5, 'Camera look offset must dip toward flower slump');

// Beat 3 (3.45s): Heroes kept underground (hidden), vines 100% gone (count == 0), only flower slump remains
vfx.seek(3.45);
assert.equal(
  vfx.isHeroUndergroundHidden(),
  true,
  'Heroes must be flagged underground-hidden during Beat 3 (2.65s..4.25s)'
);
assert.equal(
  vfx.monolithsMesh.count,
  0,
  'Briar vines must have completely disappeared into the ground in Beat 3'
);
assert.equal(
  vfx.groundSigilMesh.count,
  1,
  'Only the quiet flower slump remains on the ground in Beat 3'
);
assert.equal(vfx.getHeroLevitationOffset('Knight'), -2.5);
assert.equal(vfx.getHeroLevitationOffset('Mage'), -2.5);
assert.ok(Math.abs(vfx.getCameraLookOffset().y - -0.68) < 0.05);

// Beat 4 (4.55s): Heroes popping back up to ground, flower slump scattering into crimson petals
vfx.seek(4.55);
assert.equal(
  vfx.isHeroUndergroundHidden(),
  false,
  'Heroes must unhide at 4.25s for the Beat 4 pop-up'
);
assert.ok(
  vfx.getHeroLevitationOffset('Knight') > -0.8 && vfx.getHeroLevitationOffset('Knight') <= 0.0
);
assert.ok(vfx.prismsAndDebrisMesh.count >= 40, 'Beat 4 must scatter matte crimson petals');

// 3. Verify Smite timeline (2.80s total, loose crimson petals running away & vanishing in flight, 0 whole roses, 0 golden embers)
vfx.triggerSmite({ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 }, { camera });
assert.equal(vfx.totalDuration, 2.8);
vfx.seek(1.4);
assert.ok(vfx.getCharacterDissolveProgress() > 0.45 && vfx.getCharacterDissolveProgress() < 0.95);
assert.equal(
  vfx.groundSigilMesh.count,
  0,
  'Smite must render 0 whole roses (groundSigilMesh.count === 0), only loose petals'
);
assert.ok(vfx.prismsAndDebrisMesh.count >= 90, 'Smite mid-stream must have active wind-borne petals');
for (let i = 0; i < vfx.prismsAndDebrisMesh.count; i++) {
  assert.equal(
    vfx.debrisMetaAttr.getW(i),
    2.0,
    `Smite debris instance ${i} must be kind=2.0 (crimson rose petal, zero golden embers)`
  );
}
// By t = 2.55s, petals must have already vanished as they ran away to the right instead of staying parked on screen
vfx.seek(2.55);
assert.ok(
  vfx.prismsAndDebrisMesh.count <= 45,
  `Smite petals at t=2.55s (${vfx.prismsAndDebrisMesh.count}) must have vanished in flight as they ran away`
);
console.log('PASS test-briar-vfx');
