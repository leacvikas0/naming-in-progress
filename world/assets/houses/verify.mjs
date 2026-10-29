import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createHousesKit, VILLAGE_BUILDING_SPECS, LINEUP_SPECS } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`VERIFY FAILED: ${message}`);
  }
}

function countGeometryStats(root) {
  let meshNodes = 0;
  let triangles = 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    meshNodes++;
    const g = obj.geometry;
    const tri = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const instances = obj.isInstancedMesh ? obj.count : 1;
    triangles += Math.round(tri * instances);
  });
  return { meshNodes, triangles };
}

async function main() {
  const kit = createHousesKit(null);
  const requiredTypes = ['inn', 'herbalist', 'smithy', 'gardener', 'watermill'];
  const perBuildingSummary = {};

  for (const type of requiredTypes) {
    const spec = VILLAGE_BUILDING_SPECS[type];
    assert(spec, `Missing VILLAGE_BUILDING_SPECS[${type}]`);

    const built = kit.buildVillageBuilding(type, {
      ...spec,
      x: 0,
      y: 0,
      z: 0,
      rotY: 0,
    });

    assert(built && built.group instanceof THREE.Group, `${type}: group is not a THREE.Group`);
    assert(built.doorWorldOffset instanceof THREE.Vector3, `${type}: doorWorldOffset is not a Vector3`);

    const expectedDoorZ = Number((spec.d * 0.5 + 1.35).toFixed(3));
    assert(
      built.doorWorldOffset.localX === 0 && Math.abs(built.doorWorldOffset.x) < 1e-6,
      `${type}: expected doorWorldOffset.localX = 0, got localX=${built.doorWorldOffset.localX}, x=${built.doorWorldOffset.x}`,
    );
    assert(
      Math.abs(built.doorWorldOffset.localZ - expectedDoorZ) < 1e-3 &&
        Math.abs(built.doorWorldOffset.z - expectedDoorZ) < 1e-3,
      `${type}: expected doorWorldOffset.localZ = ${expectedDoorZ}, got localZ=${built.doorWorldOffset.localZ}, z=${built.doorWorldOffset.z}`,
    );

    assert(built.collider && typeof built.collider === 'object', `${type}: missing collider`);
    assert(
      built.collider.halfW > spec.w * 0.5 && built.collider.halfD > spec.d * 0.5,
      `${type}: invalid collider half-extents (${built.collider.halfW}, ${built.collider.halfD})`,
    );

    built.group.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(built.group);
    const minPlinthY = type === 'watermill' ? -2.5 : -1.4;
    assert(
      bbox.min.y <= minPlinthY,
      `${type}: plinth min.y (${bbox.min.y.toFixed(3)}) must be <= ${minPlinthY}m`,
    );

    if (type === 'watermill') {
      const wheel = built.group.getObjectByName('waterwheel');
      assert(wheel, 'watermill: missing named waterwheel group');
      const r0 = wheel.rotation.x;
      built.update(0.5);
      const r1 = wheel.rotation.x;
      assert(r1 > r0 + 0.1, `watermill: update(dt) did not rotate waterwheel (r0=${r0}, r1=${r1})`);
    }

    const stats = countGeometryStats(built.group);
    perBuildingSummary[type] = {
      doorLocalX: built.doorWorldOffset.localX,
      doorLocalZ: built.doorWorldOffset.localZ,
      minY: Number(bbox.min.y.toFixed(3)),
      maxY: Number(bbox.max.y.toFixed(3)),
      widthX: Number((bbox.max.x - bbox.min.x).toFixed(2)),
      depthZ: Number((bbox.max.z - bbox.min.z).toFixed(2)),
      meshNodes: stats.meshNodes,
      triangles: stats.triangles,
    };
  }

  // Verify combined 5-building lineup
  const lineupSpecs = LINEUP_SPECS || Object.values(VILLAGE_BUILDING_SPECS);
  const lineup = kit.buildAllVillageBuildings(lineupSpecs);
  lineup.group.updateMatrixWorld(true);
  const lineupStats = countGeometryStats(lineup.group);

  assert(
    lineupStats.meshNodes <= 16,
    `Lineup mesh/draw-call nodes (${lineupStats.meshNodes}) exceeds max 16`,
  );
  assert(
    lineupStats.triangles <= 48000,
    `Lineup triangles (${lineupStats.triangles}) exceeds max 48,000`,
  );

  // Verify non-overlapping X intervals in LINEUP_SPECS
  if (LINEUP_SPECS && LINEUP_SPECS.length === 5) {
    const intervals = LINEUP_SPECS.map((s) => {
      const b = kit.buildVillageBuilding(s.id, { ...s, y: 0, z: 0 });
      b.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(b.group);
      return { id: s.id, minX: box.min.x, maxX: box.max.x };
    });
    for (let i = 0; i < intervals.length - 1; i++) {
      const gap = intervals[i + 1].minX - intervals[i].maxX;
      assert(
        gap >= 2.0,
        `Lineup overlap/crowding between ${intervals[i].id} and ${intervals[i + 1].id}: gap=${gap.toFixed(2)}m (< 2.0m)`,
      );
    }
  }

  // Verify shots/pass2/report.json
  const reportPath = path.join(__dirname, 'shots', 'pass2', 'report.json');
  const rawReport = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(rawReport);

  assert(report.pass === 'pass2', `Expected report.pass === 'pass2', got ${report.pass}`);
  assert(
    Array.isArray(report.consoleErrors) && report.consoleErrors.length === 0,
    `Expected 0 console errors in pass2, got: ${JSON.stringify(report.consoleErrors)}`,
  );
  assert(
    report.budget.actualLineupDrawCalls <= 16,
    `WebGL lineup draw calls (${report.budget.actualLineupDrawCalls}) > 16`,
  );
  assert(
    report.budget.actualLineupTriangles <= 48000,
    `WebGL lineup triangles (${report.budget.actualLineupTriangles}) > 48000`,
  );

  const expectedShots = [
    'inn-3q',
    'inn-front',
    'herbalist-3q',
    'smithy-3q',
    'gardener-3q',
    'watermill-3q',
    'all-lineup',
    'all-rear-lineup',
  ];
  for (const shotName of expectedShots) {
    const shotInfo = report.shots[shotName];
    assert(shotInfo && shotInfo.path, `Missing shot '${shotName}' in pass2/report.json`);
    const st = await fs.stat(shotInfo.path);
    assert(st.size > 10000, `Shot '${shotName}' PNG is unexpectedly small (${st.size} bytes)`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        lineupDrawCalls: report.budget.actualLineupDrawCalls,
        lineupTriangles: report.budget.actualLineupTriangles,
        consoleErrors: report.consoleErrors.length,
        buildings: perBuildingSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
