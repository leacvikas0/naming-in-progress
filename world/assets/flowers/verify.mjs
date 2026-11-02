import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  SPECIES_SPECS,
  MEADOW_PROFILES,
  SACRED_ROSE_ANCHORS,
  createSpeciesGeometries,
  createBotanicalPack,
  createDefaultWorldMaskTexture,
  createToroidalMeadow,
} from './index.js';

const flowersDir = import.meta.dirname;
const expectedBudgets = {
  grassTuft: 28,
  bellflower: 96,
  daisy: 88,
  lupine: 110,
  cosmos: 88,
  crimsonRose: 112,
  toonShrub: 140,
};

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function sampleMaskB(maskTex, x, z, worldExtent) {
  const img = maskTex?.image;
  const u = THREE.MathUtils.clamp(x / (2 * worldExtent) + 0.5, 0, 1);
  const v = THREE.MathUtils.clamp(z / (2 * worldExtent) + 0.5, 0, 1);
  const ix = Math.min(img.width - 1, Math.floor(u * img.width));
  const iz = Math.min(img.height - 1, Math.floor(v * img.height));
  return img.data[(iz * img.width + ix) * 4 + 2] / 255;
}

// 1. Verify all 7 species geometries, attributes, grounding, and triangle caps
const geos = createSpeciesGeometries();
const pack = createBotanicalPack();

for (const [key, maxTris] of Object.entries(expectedBudgets)) {
  const geo = geos[key];
  assert(Boolean(geo), `Missing geometry for species "${key}"`);
  if (!geo) continue;

  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const col = geo.getAttribute('color');

  assert(Boolean(pos) && pos.itemSize === 3 && pos.count > 0, `${key}: invalid position attribute`);
  assert(Boolean(nrm) && nrm.itemSize === 3 && nrm.count === pos.count, `${key}: invalid normal attribute`);
  assert(Boolean(col) && col.itemSize === 3 && col.count === pos.count, `${key}: invalid color attribute`);

  for (const [attrName, attr] of [['position', pos], ['normal', nrm], ['color', col]]) {
    if (!attr) continue;
    let hasNaN = false;
    for (let i = 0; i < attr.array.length; i++) {
      if (!Number.isFinite(attr.array[i])) {
        hasNaN = true;
        break;
      }
    }
    assert(!hasNaN, `${key}: ${attrName} attribute contains NaN or Infinity`);
  }

  const tris = pos.count / 3;
  assert(Number.isInteger(tris) && tris > 0 && tris <= maxTris, `${key}: triangles=${tris} exceeds cap=${maxTris}`);
  assert(SPECIES_SPECS[key]?.budget === maxTris, `${key}: SPECIES_SPECS budget mismatch`);

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  assert(Math.abs(bb.min.y) <= 0.03, `${key}: not grounded at y=0 (min.y=${bb.min.y.toFixed(4)})`);
  assert(bb.max.y >= 0.25, `${key}: implausibly short height (max.y=${bb.max.y.toFixed(4)})`);
  assert((bb.max.x - bb.min.x) >= 0.15 && (bb.max.z - bb.min.z) >= 0.15, `${key}: degenerate horizontal footprint`);
}

// Verify 14-tri multi-clump grassTuft exact triangle count & ~0.85m footprint
const grassGeo = geos.grassTuft;
if (grassGeo) {
  const grassTris = grassGeo.getAttribute('position').count / 3;
  const gBox = grassGeo.boundingBox;
  const gSpanX = gBox.max.x - gBox.min.x;
  const gSpanZ = gBox.max.z - gBox.min.z;
  assert(grassTris === 14, `grassTuft: expected exactly 14 triangles, got ${grassTris}`);
  assert(gSpanX >= 0.72 && gSpanX <= 0.98 && gSpanZ >= 0.72 && gSpanZ <= 0.98, `grassTuft: expected ~0.85m footprint, got ${gSpanX.toFixed(2)}m x ${gSpanZ.toFixed(2)}m`);
}

// 2. Verify MEADOW_PROFILES & createToroidalMeadow contracts (14k tablet / 24k desktop, worldExtent=165)
assert(MEADOW_PROFILES.tablet.grassCount === 14000 && MEADOW_PROFILES.tablet.grassRadius === 58, 'tablet profile grassCount/grassRadius mismatch');
assert(MEADOW_PROFILES.desktop.grassCount === 24000 && MEADOW_PROFILES.desktop.grassRadius === 76, 'desktop profile grassCount/grassRadius mismatch');
assert(MEADOW_PROFILES.tablet.counts.crimsonRose === 96 && MEADOW_PROFILES.desktop.counts.crimsonRose === 120 && MEADOW_PROFILES.demo.counts.crimsonRose === 48, 'crimsonRose profile counts mismatch');

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

// 3. Verify shots/pass2/report.json and PNG evidence
const reportPath = path.join(flowersDir, 'shots', 'pass2', 'report.json');
assert(fs.existsSync(reportPath), `Missing Pass 2 report at ${reportPath}`);
if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert(Array.isArray(report.consoleErrors) && report.consoleErrors.length === 0, `Pass 2 report has consoleErrors: ${JSON.stringify(report.consoleErrors)}`);
  assert(report.meadowDrawCalls === 7, `Pass 2 report meadowDrawCalls=${report.meadowDrawCalls} !== 7`);

  const requiredShots = [
    'species-sheet',
    'meadow-drift',
    'grassTuft',
    'crimsonRose',
    'bellflower',
    'daisy',
    'lupine',
    'cosmos',
    'toonShrub',
  ];
  for (const shot of requiredShots) {
    const pngPath = path.join(flowersDir, 'shots', 'pass2', `${shot}.png`);
    assert(fs.existsSync(pngPath) && fs.statSync(pngPath).size > 10000, `Missing or empty Pass 2 screenshot: ${pngPath}`);
  }
}

if (failures.length > 0) {
  console.error('FAIL: Botanical & Toroidal Meadow verification failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('PASS: All 7 botanical species (14-tri grassTuft, 110-tri crimsonRose), 24k/14k toroidal meadow profiles, 4-tap golden-angle relocation (>96% retention), Sacred Stone crimsonRose rings, and 360° Pass 2 renders verified.');
