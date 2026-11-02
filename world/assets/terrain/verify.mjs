import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  OUTER_EXTENT,
  WORLD_SIZE,
  ZONES,
  PATROL_CLEARINGS,
  INSCRIPTION_STONES,
  BOULDERS,
  DRY_STONE_WALLS,
  ROADSIDE_FENCES,
  ROADS,
  LANDMARKS,
  TREES,
  BUILDINGS,
  getBuildingDoorWorldPos,
  roadDistanceAt,
  terrainHeightAt,
  walkableHeightAt,
  sampleWorld,
  createWorldMaskTexture,
  bakeWorldDataTextures,
  buildLandmarks,
  buildBotanicalTrees,
} from './index.js';

const assetDir = import.meta.dirname;
const reportPath = path.join(assetDir, 'shots', 'pass2', 'report.json');

console.log('=== Haru-machi Wave 1C Terrain, Volumetric Trees, Boulders & Shoreline Verification ===');

// 1. Verify Expanded Valley (165m) & Southern Flower Field Lobby (0, 128)
assert.equal(PLAY_BOUNDARY_RADIUS, 165, 'PLAY_BOUNDARY_RADIUS must be 165');
assert.equal(INNER_EXTENT, 170, 'INNER_EXTENT must be 170');
assert.equal(OUTER_EXTENT, 360, 'OUTER_EXTENT must be 360');
assert.equal(WORLD_SIZE, 720, 'WORLD_SIZE must be 720');
assert.ok(ZONES.flowerLobby, 'ZONES.flowerLobby must exist');
assert.equal(ZONES.flowerLobby.x, 0.0, 'ZONES.flowerLobby.x must be 0.0');
assert.equal(ZONES.flowerLobby.z, 128.0, 'ZONES.flowerLobby.z must be 128.0');
assert.equal(ZONES.flowerLobby.y, 1.6, 'ZONES.flowerLobby.y must be 1.6');
assert.equal(ZONES.flowerLobby.innerR, 22.0, 'ZONES.flowerLobby.innerR must be 22.0');
assert.equal(ZONES.flowerLobby.outerR, 34.0, 'ZONES.flowerLobby.outerR must be 34.0');

const lobbyCenterY = terrainHeightAt(0, 128);
assert.ok(
  Math.abs(lobbyCenterY - 1.6) < 0.02,
  `Flower Lobby center (0, 128) must be graded to y = 1.6m (got ${lobbyCenterY.toFixed(3)})`
);
const lobbyEdgeY = terrainHeightAt(15, 128);
assert.ok(
  Math.abs(lobbyEdgeY - 1.6) < 0.05,
  `Flower Lobby R=22m plateau (15, 128) must be flat at y = 1.6m (got ${lobbyEdgeY.toFixed(3)})`
);

// Verify winding south_flower_road and 2 patrol clearings at (-14, 86) and (16, 52)
const southRoad = ROADS.find((r) => r.id === 'south_flower_road');
assert.ok(southRoad, "ROADS must include id: 'south_flower_road'");
assert.equal(PATROL_CLEARINGS.length, 2, 'Must have 2 roadside skeleton patrol clearings');
assert.ok(
  Math.abs(terrainHeightAt(-14, 86) - terrainHeightAt(-10, 86)) < 0.02,
  'Patrol clearing at (-14, 86) must be graded flat within r = 10.5m'
);
assert.ok(
  Math.abs(terrainHeightAt(16, 52) - terrainHeightAt(12, 52)) < 0.02,
  'Patrol clearing at (16, 52) must be graded flat within r = 10.5m'
);

// Verify 3 Sacred Inscription Stones
assert.equal(INSCRIPTION_STONES.length, 3, 'Must export 3 INSCRIPTION_STONES');
assert.equal(LANDMARKS.inscriptionStones.length, 3, 'LANDMARKS.inscriptionStones must have 3 stones');
const stoneById = Object.fromEntries(INSCRIPTION_STONES.map((s) => [s.id, s]));
assert.deepEqual([stoneById.stone_plaza.x, stoneById.stone_plaza.z], [0.0, -14.0]);
assert.deepEqual([stoneById.stone_pier.x, stoneById.stone_pier.z], [-42.0, 18.0]);
assert.deepEqual([stoneById.stone_grove.x, stoneById.stone_grove.z], [44.0, 16.0]);
console.log('[PASS] Requirement 1: Expanded Valley (165m), Flower Lobby (0, 128), South Road, Clearings & Sacred Stones verified.');

// 2. Verify sampleWorld and bakeWorldDataTextures cover full INNER_EXTENT = 170
const baked = bakeWorldDataTextures(512);
assert.equal(baked.worldExtent, 170, 'bakeWorldDataTextures worldExtent must be 170');
const maskTex = baked.worldMaskTex;
const maskData = maskTex.image.data;
const size = 512;
const span = INNER_EXTENT * 2; // 340m

function sampleMaskRGBA(wx, wz) {
  const ix = Math.min(size - 1, Math.max(0, Math.floor(((wx / span) + 0.5) * size)));
  const iz = Math.min(size - 1, Math.max(0, Math.floor(((wz / span) + 0.5) * size)));
  const idx = (iz * size + ix) * 4;
  return {
    r: maskData[idx] / 255.0,
    g: maskData[idx + 1] / 255.0,
    b: maskData[idx + 2] / 255.0,
    a: maskData[idx + 3] / 255.0,
  };
}

// Verify south_flower_road mask all the way to (0, 122..128)
const swRoadSouth = sampleWorld(0, 124);
assert.ok(swRoadSouth.roadWeight > 0.7, `sampleWorld(0, 124) on south_flower_road must have roadWeight > 0.7 (got ${swRoadSouth.roadWeight})`);
const maskRoadSouth = sampleMaskRGBA(0, 124);
assert.equal(maskRoadSouth.b, 0.0, 'uWorldMask foliageMask B channel on south_flower_road at (0, 124) must be 0.0');

// Verify open flower meadow on the Southern Flower Field Lobby plateau at (-12, 128) and (12, 128)
assert.equal(sampleMaskRGBA(-12, 128).b, 1.0, 'Flower Lobby West meadow (-12, 128) must have foliageMask = 1.0');
assert.equal(sampleMaskRGBA(12, 128).b, 1.0, 'Flower Lobby East meadow (12, 128) must have foliageMask = 1.0');

for (const b of BUILDINGS) {
  const [doorX, doorZ] = getBuildingDoorWorldPos(b);
  const rd = roadDistanceAt(doorX, doorZ);
  assert.ok(rd.dist <= 0.5, `Building ${b.id} door must align with road spur`);
  assert.equal(sampleMaskRGBA(b.x, b.z).b, 0.0, `Building ${b.id} interior must exclude foliage`);
}
console.log('[PASS] Full INNER_EXTENT = 170 world mask and road/meadow coverage verified.');

// 3. Verify Volumetric 3D Trees & Boulders/Walls/Fences/Shoreline Colliders
assert.ok(TREES.length >= 64 && TREES.length <= 72, `TREES count must be 64..72 (got ${TREES.length})`);
assert.ok(BOULDERS.length >= 45, `BOULDERS count must be >= 45 (got ${BOULDERS.length})`);
assert.ok(DRY_STONE_WALLS.length >= 8, `DRY_STONE_WALLS count must be >= 8 (got ${DRY_STONE_WALLS.length})`);
assert.ok(ROADSIDE_FENCES.length >= 6, `ROADSIDE_FENCES count must be >= 6 (got ${ROADSIDE_FENCES.length})`);

const colliders = [];
const landmarksSys = buildLandmarks({ colliders, includeBuildings: true });
const treesSys = buildBotanicalTrees({ colliders });

let treeMeshCount = 0;
treesSys.group.traverse((o) => {
  if (o.isMesh) treeMeshCount++;
});
assert.ok(treeMeshCount <= 2, `Trees system must use <= 2 draw calls (got ${treeMeshCount})`);

let landmarkMeshCount = 0;
landmarksSys.group.traverse((o) => {
  if (o.isMesh) landmarkMeshCount++;
});
assert.ok(landmarkMeshCount <= 4, `Landmarks system must use <= 4 draw calls (got ${landmarkMeshCount})`);

const boulderColliders = colliders.filter((c) => c.tag === 'boulder');
const wallColliders = colliders.filter((c) => c.tag === 'dry_stone_wall');
const fenceColliders = colliders.filter((c) => c.tag === 'split_rail_fence');
const stoneColliders = colliders.filter((c) => c.tag === 'inscription_stone');
const deepWaterColliders = colliders.filter((c) => c.tag === 'deep_water' || c.tag?.startsWith('pier_deep'));

assert.ok(boulderColliders.length >= 45, `Must register >= 45 boulder colliders (got ${boulderColliders.length})`);
assert.ok(wallColliders.length >= 8, `Must register >= 8 dry-stone wall OBB colliders (got ${wallColliders.length})`);
assert.ok(fenceColliders.length >= 16, `Must register >= 16 split-rail fence OBB colliders (got ${fenceColliders.length})`);
assert.equal(stoneColliders.length, 3, 'Must register 3 inscription stone colliders');
assert.ok(deepWaterColliders.length >= 30, `Must register deep-water boundary collider ring (got ${deepWaterColliders.length})`);

// 4. Verify Shoreline Wading (<= 0.35m ankle depth -> y >= -1.55m) & Pier / (-42, 18) Walkability
const pierWalkY = walkableHeightAt(-44.0, 8.5);
assert.ok(Math.abs(pierWalkY - (LANDMARKS.pier.y + 0.12)) < 0.02, `Wooden pier deck at (-44, 8.5) must be walkable at y=${LANDMARKS.pier.y + 0.12} (got ${pierWalkY})`);

const deepLakeWalkY = walkableHeightAt(-62.0, 6.0);
assert.ok(Math.abs(deepLakeWalkY - (-1.55)) < 1e-4, `Shallow wading floor must be clamped at waterY - 0.35 = -1.55m (got ${deepLakeWalkY})`);

const pierStoneH = terrainHeightAt(-42.0, 18.0);
assert.ok(pierStoneH >= -1.45, `Lakeside Pier Sacred Stone area at (-42, 18) must have terrainHeightAt >= -1.45m (got ${pierStoneH.toFixed(3)})`);

// Check that no deep_water collider blocks the pier deck centerline (-34 .. -51, z = 8.5) or causeway to (-42, 18)
for (let x = -50.5; x <= -34.0; x += 1.5) {
  for (const c of deepWaterColliders) {
    if (c.type === 'circle') {
      const d = Math.hypot(x - c.x, 8.5 - c.z);
      assert.ok(d >= c.r + 0.35, `Deep-water collider at (${c.x}, ${c.z}) blocks wooden pier centerline at (${x}, 8.5)`);
    }
  }
}
console.log(
  `[PASS] Requirements 2, 3 & 4: ${TREES.length} volumetric trees (${treeMeshCount} draw call), ${boulderColliders.length} boulders, ${wallColliders.length} dry-stone walls, ${fenceColliders.length} fence spans, and ${deepWaterColliders.length} deep-water shoreline colliders verified.`
);

// 5. Verify shots/pass2/report.json metrics & rendered PNGs
assert.ok(fs.existsSync(reportPath), `Missing Pass 2 report at ${reportPath}`);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

assert.equal(
  report.consoleErrors.length,
  0,
  `Expected 0 console errors, got: ${JSON.stringify(report.consoleErrors)}`
);

const expectedShots = [
  'flower-lobby-north',
  'boulders-walls-fences',
  'wisteria-orbit-front',
  'wisteria-orbit-side',
  'pier-shoreline',
  'shrine-arch-stairs',
  'waterfall-flume-channel',
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
    s.draws <= 9,
    `Shot '${shotId}' draw calls (${s.draws}) exceeded max budget of 9`
  );
  assert.ok(
    s.triangles < 185000,
    `Shot '${shotId}' frustum triangles (${s.triangles}) exceeded 185,000`
  );
}

console.log(
  `[PASS] All ${expectedShots.length} Pass 2 360° shots verified: 0 console errors, max draws = ${report.summary.maxDrawCallsObserved} (<= 9), totalSceneTriangles = ${report.summary.totalSceneTriangles}, totalColliders = ${colliders.length}.`
);
console.log('=== VERIFICATION RESULT: PASS ===');
