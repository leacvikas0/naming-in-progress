import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  ZONES,
  BUILDINGS,
  getBuildingDoorWorldPos,
  roadDistanceAt,
  sampleWorld,
  createWorldMaskTexture,
} from './geography.js';

const assetDir = import.meta.dirname;
const reportPath = path.join(assetDir, 'shots', 'pass2', 'report.json');

console.log('=== Haru-machi v7 Terrain, Water & Landmarks Verification (Pass 2) ===');

// 1. Verify exact v7 coordinates in geography.js
assert.equal(PLAY_BOUNDARY_RADIUS, 125, 'PLAY_BOUNDARY_RADIUS must be 125');
assert.equal(INNER_EXTENT, 140, 'INNER_EXTENT must be 140');
assert.equal(ZONES.shrine.z, -86, 'ZONES.shrine.z must be -86');
assert.equal(ZONES.arena.x, 68, 'ZONES.arena.x must be 68');
assert.equal(ZONES.millpond.x, -62, 'ZONES.millpond.x must be -62');
console.log('[PASS] v7 zone & boundary coordinates verified.');

// Verify getBuildingDoorWorldPos alignment for all 5 buildings
assert.equal(BUILDINGS.length, 5, 'Must have all 5 v7 context buildings');
for (const b of BUILDINGS) {
  const [doorX, doorZ] = getBuildingDoorWorldPos(b);
  assert.ok(
    Number.isFinite(doorX) && Number.isFinite(doorZ),
    `getBuildingDoorWorldPos(${b.id}) must return finite coordinates`
  );
  const rd = roadDistanceAt(doorX, doorZ);
  assert.ok(
    rd.dist <= 0.5,
    `Building ${b.id} door at (${doorX.toFixed(2)}, ${doorZ.toFixed(2)}) must align with a road spur (dist=${rd.dist.toFixed(3)})`
  );
  const sw = sampleWorld(doorX, doorZ);
  assert.ok(
    sw.cobbleWeight > 0.7 || sw.roadWeight > 0.7,
    `Building ${b.id} doorstep must sit on paved road/cobble surface`
  );
  assert.equal(
    sw.foliageMask,
    0.0,
    `Building ${b.id} doorstep must exclude foliage (foliageMask === 0.0)`
  );
}
console.log('[PASS] getBuildingDoorWorldPos alignment verified for all 5 buildings.');

// 2. Verify createWorldMaskTexture(512) B channel (foliage exclusion)
const maskTex = createWorldMaskTexture(512);
const maskData = maskTex.image.data;
const size = 512;
const span = INNER_EXTENT * 2; // 280m

function sampleMaskB(wx, wz) {
  const ix = Math.min(size - 1, Math.max(0, Math.floor(((wx / span) + 0.5) * size)));
  const iz = Math.min(size - 1, Math.max(0, Math.floor(((wz / span) + 0.5) * size)));
  const idx = (iz * size + ix) * 4;
  return maskData[idx + 2] / 255.0;
}

for (const b of BUILDINGS) {
  const bVal = sampleMaskB(b.x, b.z);
  assert.equal(
    bVal,
    0.0,
    `Mask B channel inside building ${b.id} at (${b.x}, ${b.z}) must be 0.0, got ${bVal}`
  );
}

const exclusionProbes = [
  { name: 'Well Plaza', x: 0, z: 0 },
  { name: 'Well Plaza Ring Gap Check', x: 7.4, z: 0 },
  { name: 'Arena Center', x: 68, z: -4 },
  { name: 'Shrine Platform', x: 0, z: -86 },
  { name: 'Millpond Basin', x: -62, z: 6 },
];

for (const p of exclusionProbes) {
  const bVal = sampleMaskB(p.x, p.z);
  assert.equal(
    bVal,
    0.0,
    `Mask B channel at ${p.name} (${p.x}, ${p.z}) must be 0.0, got ${bVal}`
  );
}

const meadowProbes = [
  { name: 'SW Open Meadow', x: -42, z: 62 },
  { name: 'SE Open Meadow', x: 42, z: 58 },
  { name: 'NE Open Meadow', x: 45, z: -55 },
  { name: 'NW Open Meadow', x: -25, z: -45 },
];

for (const p of meadowProbes) {
  const bVal = sampleMaskB(p.x, p.z);
  assert.equal(
    bVal,
    1.0,
    `Mask B channel on ${p.name} (${p.x}, ${p.z}) must be 1.0, got ${bVal}`
  );
}
console.log('[PASS] createWorldMaskTexture(512) B channel exclusions and open meadow turf verified.');

// 3. Verify shots/pass2/report.json metrics & rendered PNGs
assert.ok(fs.existsSync(reportPath), `Missing Pass 2 report at ${reportPath}`);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

assert.equal(
  report.consoleErrors.length,
  0,
  `Expected 0 console errors, got: ${JSON.stringify(report.consoleErrors)}`
);

const expectedShots = [
  'shrine-arch-stairs',
  'waterfall-flume-channel',
  'pier-shoreline',
  'wisteria-trees-arena',
  'well-plaza-roads',
  'aerial-overview',
];

for (const shotId of expectedShots) {
  const s = report.shots[shotId];
  assert.ok(s, `Missing shot '${shotId}' in report.json`);
  assert.ok(fs.existsSync(s.file), `Missing PNG file ${s.file}`);
  const stat = fs.statSync(s.file);
  assert.ok(stat.size > 20000, `Shot PNG ${s.file} is unexpectedly small (${stat.size} bytes)`);
  assert.ok(
    s.draws <= 24,
    `Shot '${shotId}' draw calls (${s.draws}) exceeded max budget of 24`
  );
  assert.ok(
    s.triangles < 120000,
    `Shot '${shotId}' frustum triangles (${s.triangles}) exceeded 120,000`
  );
  assert.ok(
    s.totalSceneTriangles < 120000,
    `Shot '${shotId}' totalSceneTriangles (${s.totalSceneTriangles}) exceeded 120,000`
  );
}

console.log(
  `[PASS] All 6 Pass 2 shots verified: 0 console errors, max draws = ${report.summary.maxDrawCallsObserved} (<= 24), totalSceneTriangles = ${report.summary.totalSceneTriangles} (< 120,000).`
);
console.log('=== VERIFICATION RESULT: PASS ===');
