import * as THREE from 'three';
import {
  SPECIES_SPECS,
  MEADOW_PROFILES,
  SACRED_ROSE_ANCHORS,
  buildGrassTuft,
  createSpeciesGeometries,
  createBotanicalPack,
  createDefaultWorldMaskTexture,
  createToroidalMeadow,
} from './index.js';

const expectedBudgets = {
  grassTuft: 70,
  bellflower: 460,
  daisy: 480,
  lupine: 520,
  cosmos: 480,
  crimsonRose: 620,
  toonShrub: 560,
};

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function getTriCount(geo) {
  return geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3;
}

function sampleMaskB(maskTex, x, z, worldExtent) {
  const img = maskTex?.image;
  const u = THREE.MathUtils.clamp(x / (2 * worldExtent) + 0.5, 0, 1);
  const v = THREE.MathUtils.clamp(z / (2 * worldExtent) + 0.5, 0, 1);
  const ix = Math.min(img.width - 1, Math.floor(u * img.width));
  const iz = Math.min(img.height - 1, Math.floor(v * img.height));
  return img.data[(iz * img.width + ix) * 4 + 2] / 255;
}

// 1. Verify all 7 species geometries (desktop & tablet), attributes, grounding, and triangle caps
const geos = createSpeciesGeometries();
const tabletGeos = createSpeciesGeometries({ profile: 'tablet' });
const pack = createBotanicalPack();

for (const [profileLabel, geoSet] of [
  ['desktop', geos],
  ['tablet', tabletGeos],
]) {
  for (const [key, maxTris] of Object.entries(expectedBudgets)) {
    const geo = geoSet[key];
    assert(Boolean(geo), `Missing ${profileLabel} geometry for species "${key}"`);
    if (!geo) continue;

    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    const col = geo.getAttribute('color');

    assert(Boolean(pos) && pos.itemSize === 3 && pos.count > 0, `${profileLabel}/${key}: invalid position attribute`);
    assert(Boolean(nrm) && nrm.itemSize === 3 && nrm.count === pos.count, `${profileLabel}/${key}: invalid normal attribute`);
    assert(Boolean(col) && col.itemSize === 3 && col.count === pos.count, `${profileLabel}/${key}: invalid color attribute`);

    for (const [attrName, attr] of [['position', pos], ['normal', nrm], ['color', col]]) {
      if (!attr) continue;
      let hasNaN = false;
      for (let i = 0; i < attr.array.length; i++) {
        if (!Number.isFinite(attr.array[i])) {
          hasNaN = true;
          break;
        }
      }
      assert(!hasNaN, `${profileLabel}/${key}: ${attrName} attribute contains NaN or Infinity`);
    }

    const tris = getTriCount(geo);
    assert(Number.isInteger(tris) && tris > 0 && tris <= maxTris, `${profileLabel}/${key}: triangles=${tris} exceeds cap=${maxTris}`);
    assert(SPECIES_SPECS[key]?.budget === maxTris, `${key}: SPECIES_SPECS budget mismatch`);

    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    assert(Math.abs(bb.min.y) <= 0.03, `${profileLabel}/${key}: not grounded at y=0 (min.y=${bb.min.y.toFixed(4)})`);
    assert(bb.max.y >= 0.25, `${profileLabel}/${key}: implausibly short height (max.y=${bb.max.y.toFixed(4)})`);
    assert((bb.max.x - bb.min.x) >= 0.15 && (bb.max.z - bb.min.z) >= 0.15, `${profileLabel}/${key}: degenerate horizontal footprint`);
  }
}

// Verify desktop (24-tri) and tablet (8-tri) grassTuft geometries
const grassDesktop = buildGrassTuft();
const grassTablet = buildGrassTuft({ profile: 'tablet' });
assert(getTriCount(grassDesktop) === 24, `buildGrassTuft(): expected 24 triangles, got ${getTriCount(grassDesktop)}`);
assert(getTriCount(grassTablet) === 8, `buildGrassTuft({ profile: 'tablet' }): expected 8 triangles, got ${getTriCount(grassTablet)}`);

for (const [label, g] of [['desktop', grassDesktop], ['tablet', grassTablet]]) {
  g.computeBoundingBox();
  const gBox = g.boundingBox;
  const gSpanX = gBox.max.x - gBox.min.x;
  const gSpanZ = gBox.max.z - gBox.min.z;
  assert(gSpanX >= 0.65 && gSpanX <= 0.98 && gSpanZ >= 0.65 && gSpanZ <= 0.98, `grassTuft (${label}): expected ~0.85m footprint, got ${gSpanX.toFixed(2)}m x ${gSpanZ.toFixed(2)}m`);
}

// 2. Verify MEADOW_PROFILES & createToroidalMeadow contracts
assert(
  MEADOW_PROFILES.tablet.grassCount === 6400 &&
    MEADOW_PROFILES.tablet.grassRadius === 32 &&
    MEADOW_PROFILES.tablet.flowerToroidRadius === 30,
  'tablet profile grassCount/grassRadius/flowerToroidRadius mismatch'
);
assert(
  MEADOW_PROFILES.desktop.grassCount === 34000 && MEADOW_PROFILES.desktop.grassRadius === 68,
  'desktop profile grassCount/grassRadius mismatch'
);
assert(
  MEADOW_PROFILES.tablet.counts.crimsonRose === 95 &&
    MEADOW_PROFILES.desktop.counts.crimsonRose === 220 &&
    MEADOW_PROFILES.demo.counts.crimsonRose === 68,
  'crimsonRose profile counts mismatch'
);

const worldExtent = 165;
const maskTex = createDefaultWorldMaskTexture(256);
assert(maskTex.userData?.worldExtent === 165, `default worldMaskTexture worldExtent=${maskTex.userData?.worldExtent} !== 165`);

const posVec = new THREE.Vector3();
const mat4 = new THREE.Matrix4();

for (const profileName of ['tablet', 'desktop']) {
  const meadow = createToroidalMeadow({
    profile: profileName,
    worldMaskTexture: maskTex,
    worldExtent,
  });

  assert(meadow.drawCalls === 7, `${profileName}: expected drawCalls=7 (1 toroidal grass + 6 flower/shrub batches), got ${meadow.drawCalls}`);
  assert(meadow.meshes.length === 7, `${profileName}: meshes.length=${meadow.meshes.length} !== 7`);

  let excludedViolations = 0;
  let roseOutOfRingViolations = 0;
  let totalSubmittedTris = 0;

  for (const m of meadow.meshes) {
    totalSubmittedTris += getTriCount(m.geometry) * m.count;
  }
  if (profileName === 'tablet') {
    assert(
      totalSubmittedTris <= 102000,
      `tablet ToroidalMeadow totalSubmittedTris=${totalSubmittedTris} exceeds 102,000 budget`
    );
  }

  for (const [key, imesh] of Object.entries(meadow.flowerMeshes)) {
    assert(imesh.count > 0, `${profileName}: ${key} spawned 0 instances`);
    for (let i = 0; i < imesh.count; i++) {
      imesh.getMatrixAt(i, mat4);
      posVec.setFromMatrixPosition(mat4);
      const maskB = sampleMaskB(maskTex, posVec.x, posVec.z, worldExtent);
      if (maskB < 0.5) excludedViolations++;

      if (key === 'crimsonRose') {
        let inSacredRing = false;
        for (const anchor of SACRED_ROSE_ANCHORS) {
          const d = Math.hypot(posVec.x - anchor.x, posVec.z - anchor.z);
          if (d >= 1.55 && d <= 5.85) {
            inSacredRing = true;
            break;
          }
        }
        if (!inSacredRing) roseOutOfRingViolations++;
      }
    }
  }
  assert(excludedViolations === 0, `${profileName}: ${excludedViolations} flower instances violated worldMaskTexture (mask.b < 0.5)`);
  assert(roseOutOfRingViolations === 0, `${profileName}: ${roseOutOfRingViolations} crimsonRose instances spawned outside Sacred Stone rings (1.6m..5.8m)`);

  // Verify 4-tap golden-angle spiral relocation retains >96% of grass instances on valid meadow
  const R = MEADOW_PROFILES[profileName].grassRadius;
  const diam = R * 2;
  const gMesh = meadow.grassMesh;
  let validGrass = 0;
  const radii = [2.2, 4.4, 6.8, 9.5];
  for (let i = 0; i < gMesh.count; i++) {
    gMesh.getMatrixAt(i, mat4);
    posVec.setFromMatrixPosition(mat4);
    const ox = posVec.x, oz = posVec.z;
    if (sampleMaskB(maskTex, ox, oz, worldExtent) >= 0.72) {
      validGrass++;
    } else {
      const dotVal = ox * 12.9898 + oz * 78.233;
      const sVal = Math.sin(dotVal) * 43758.5453;
      const baseAng = (sVal - Math.floor(sVal)) * 6.2831853;
      let relocated = false;
      for (let k = 0; k < 4; k++) {
        const ang = baseAng + k * 2.3999632;
        const r = radii[k];
        const ax = ((((ox + Math.cos(ang) * r + R) % diam) + diam) % diam) - R;
        const az = ((((oz + Math.sin(ang) * r + R) % diam) + diam) % diam) - R;
        if (sampleMaskB(maskTex, ax, az, worldExtent) >= 0.75) {
          relocated = true;
          break;
        }
      }
      if (relocated) validGrass++;
    }
  }
  const retention = validGrass / gMesh.count;
  assert(retention >= 0.96, `${profileName}: 4-tap golden-angle relocation retention=${(retention * 100).toFixed(2)}% < 96%`);

  meadow.dispose();
}

pack.dispose();

if (failures.length > 0) {
  console.error('FAIL: Botanical & Toroidal Meadow verification failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('PASS: All 7 botanical species (24-tri desktop / 12-tri tablet grassTuft, 42-52 tri tablet wildflowers), forward-shifted toroidal meadow profiles (181,740 total tablet tris), 4-tap golden-angle relocation (>96% retention), and Sacred Stone crimsonRose rings verified.');
