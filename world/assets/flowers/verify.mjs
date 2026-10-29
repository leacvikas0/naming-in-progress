import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  SPECIES_SPECS,
  createSpeciesGeometries,
  createBotanicalPack,
  createDefaultWorldMaskTexture,
  createToroidalMeadow,
} from './index.js';

const flowersDir = import.meta.dirname;
const expectedBudgets = {
  grassTuft: 48,
  bellflower: 96,
  daisy: 88,
  lupine: 110,
  cosmos: 88,
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

// 1. Verify all 6 species geometries, attributes, grounding, and triangle caps
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

// 2. Verify createToroidalMeadow draw calls (<= 6) and worldMaskTexture exclusion (mask.b < 0.5)
const worldExtent = 125;
const maskTex = createDefaultWorldMaskTexture(256, worldExtent);
const posVec = new THREE.Vector3();
const mat4 = new THREE.Matrix4();

for (const profileName of ['tablet', 'desktop']) {
  const meadow = createToroidalMeadow({
    profile: profileName,
    worldMaskTexture: maskTex,
    worldExtent,
  });

  assert(meadow.drawCalls <= 6, `${profileName}: drawCalls=${meadow.drawCalls} exceeds 6`);
  assert(meadow.meshes.length <= 6, `${profileName}: meshes.length=${meadow.meshes.length} exceeds 6`);

  let excludedViolations = 0;
  for (const [key, imesh] of Object.entries(meadow.flowerMeshes)) {
    assert(imesh.count > 0, `${profileName}: ${key} spawned 0 instances`);
    for (let i = 0; i < imesh.count; i++) {
      imesh.getMatrixAt(i, mat4);
      posVec.setFromMatrixPosition(mat4);
      const maskB = sampleMaskB(maskTex, posVec.x, posVec.z, worldExtent);
      if (maskB < 0.5) excludedViolations++;
    }
  }
  assert(excludedViolations === 0, `${profileName}: ${excludedViolations} flower instances violated worldMaskTexture (mask.b < 0.5)`);
  meadow.dispose();
}

pack.dispose();

// 3. Verify shots/pass2/report.json and PNG evidence
const reportPath = path.join(flowersDir, 'shots', 'pass2', 'report.json');
assert(fs.existsSync(reportPath), `Missing Pass 2 report at ${reportPath}`);
if (fs.existsSync(reportPath)) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert(Array.isArray(report.consoleErrors) && report.consoleErrors.length === 0, `Pass 2 report has consoleErrors: ${JSON.stringify(report.consoleErrors)}`);
  assert(report.meadowDrawCalls <= 6, `Pass 2 report meadowDrawCalls=${report.meadowDrawCalls} > 6`);

  const requiredShots = ['species-sheet', 'meadow-drift', 'grassTuft', 'bellflower', 'daisy', 'lupine', 'cosmos', 'toonShrub'];
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

console.log('PASS: All 6 botanical species, triangle budgets, toroidal meadow draw-call caps (<= 6), mask exclusions, and Pass 2 renders verified.');
