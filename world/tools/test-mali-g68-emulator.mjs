// ============================================================================
// world/tools/test-mali-g68-emulator.mjs
//
// Unit & API Verification Suite for:
//   1. `world/src/perf/mali-g68-emulator.js` (`evaluateMaliG68Frame`,
//      `analyzeGlslShader`, `stripGlslComments`)
//   2. `world/tools/serve.mjs` (`POST /api/mobile-telemetry` &
//      `GET /api/mobile-telemetry` + 50-snapshot history cap + JSON file write)
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  evaluateMaliG68Frame,
  analyzeGlslShader,
  stripGlslComments,
  MALI_G68_SPECS,
} from '../src/perf/mali-g68-emulator.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const localThreePath = path.join(repoRoot, 'node_modules/three/build/three.module.js');
const mainRepoThreePath = 'C:/Users/silen/projects/kilo-3d-kit/node_modules/three/build/three.module.js';
const threeModuleUrl = pathToFileURL(
  fs.existsSync(localThreePath) ? localThreePath : mainRepoThreePath
).href;
const THREE = await import(threeModuleUrl);

process.env.HARU_COMMUNE_OFFLINE = '1';
const { startServer, mobileTelemetryHistory } = await import('./serve.mjs');

const latestTelemetryFile = path.join(repoRoot, 'world', 'shots', 'latest-mobile-telemetry.json');

function makeIndexedBufferGeometry(vertexCount, triangleCount) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    positions[i * 3 + 0] = (i % 16) * 0.1;
    positions[i * 3 + 1] = ((i >> 4) % 16) * 0.1;
    positions[i * 3 + 2] = -5.0; // In front of camera at origin looking -Z
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const indices = new Uint32Array(triangleCount * 3);
  for (let i = 0; i < triangleCount * 3; i++) {
    indices[i] = i % Math.max(1, vertexCount);
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

async function runTests() {
  console.log('=== 1. GLSL Comment Stripping & Static Valhall Pipe Analysis ===');

  const shaderWithCommentedDiscard = /* glsl */ `
    // if (vViewDist < 3.0) discard;
    /*
      Multi-line comment with discard;
      if (alpha < 0.5) discard;
    */
    varying vec2 vUv;
    varying vec3 vNormal, vWorldPos;
    varying vec4 vColor;
    uniform sampler2D uAlbedo;
    uniform sampler2D tDiffuse;
    void main() {
      vec3 n = normalize(vNormal);
      float s = sin(vUv.x * 3.14159) + cos(vUv.y) + smoothstep(0.1, 0.9, vUv.x);
      float inv = 1.0 / 255.0; // constant division (folded by compiler)
      float dynDiv = s / max(length(vWorldPos), 0.001); // non-constant division -> SFU
      vec4 texA = texture2D(uAlbedo, vUv);
      vec4 texB = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(texA.rgb * texB.rgb * (s + inv + dynDiv) + n * 0.01, 1.0);
    }
  `;

  const stripped = stripGlslComments(shaderWithCommentedDiscard);
  assert.equal(/\bdiscard\b/.test(stripped), false, 'Commented-out discard must be stripped');

  const analysisNoDiscard = analyzeGlslShader(shaderWithCommentedDiscard, 'fragment');
  assert.equal(analysisNoDiscard.hasDiscard, false, 'Commented discard must not set hasDiscard');
  // vUv (2) + vNormal (3) + vWorldPos (3) + vColor (4) = 12 floats
  assert.equal(analysisNoDiscard.varyingFloats, 12, 'Must count 12 interpolated varying floats');
  assert.equal(analysisNoDiscard.rgba8Samples, 1, 'Must count 1 RGBA8 texture sample');
  assert.equal(analysisNoDiscard.rgba16fSamples, 1, 'Must count 1 RGBA16F (tDiffuse) sample');
  // normalize, sin, cos, length + 1 dynamic `/` = 5 SFU ops (smoothstep compiles to FMA+clamp on Valhall)
  assert.ok(analysisNoDiscard.sfuOps >= 5, `Expected >= 5 SFU ops, got ${analysisNoDiscard.sfuOps}`);

  const shaderWithRealDiscard = /* glsl */ `
    varying float vViewDist;
    void main() {
      if (vViewDist < 6.8) {
        discard;
      }
      gl_FragColor = vec4(1.0);
    }
  `;
  const analysisDiscard = analyzeGlslShader(shaderWithRealDiscard, 'fragment');
  assert.equal(analysisDiscard.hasDiscard, true, 'Active discard must set hasDiscard = true');
  console.log('  [PASS] GLSL comment stripping, varying, SFU, texture & discard detection');

  console.log('=== 2. Synthetic Unoptimized Scene (1.44M Tris + Late-Z + 9-Tap FXAA) ===');
  const unoptScene = new THREE.Scene();

  // 1) ToroidalMeadow: 17,000 grass tufts (36 verts, 24 tris) + flowers = ~946,480 tris
  const meadowGroup = new THREE.Group();
  meadowGroup.name = 'ToroidalMeadow';
  const grassGeo = makeIndexedBufferGeometry(36, 24);
  const meadowMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vColor; void main() { vColor = position; gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }',
  });
  const grassInst = new THREE.InstancedMesh(grassGeo, meadowMat, 17000);
  grassInst.name = 'meadow_grassTuft_toroidal';
  grassInst.frustumCulled = false;
  meadowGroup.add(grassInst);

  const flowerGeo = makeIndexedBufferGeometry(140, 96);
  const flowerInst = new THREE.InstancedMesh(flowerGeo, meadowMat, 5609); // 5,609 * 96 = 538,464 tris
  flowerInst.name = 'meadow_flowers_toroidal';
  flowerInst.frustumCulled = false;
  meadowGroup.add(flowerInst);
  unoptScene.add(meadowGroup);

  // 2) BotanicalTrees with `discard` (LATE_Z): 128,394 + 190,944 = 319,338 tris
  const treesGroup = new THREE.Group();
  treesGroup.name = 'BotanicalTrees';
  const treeLateZMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: 'varying float vViewDist; void main() { vViewDist = 2.0; gl_Position = vec4(position, 1.0); }',
    fragmentShader: shaderWithRealDiscard,
  });
  const mergedTreesMesh = new THREE.Mesh(
    makeIndexedBufferGeometry(192000, 128394),
    treeLateZMat
  );
  mergedTreesMesh.name = 'trees-merged-botanical';
  mergedTreesMesh.frustumCulled = false;
  treesGroup.add(mergedTreesMesh);

  const puffInstMesh = new THREE.InstancedMesh(
    makeIndexedBufferGeometry(110, 78),
    treeLateZMat,
    2448 // 2,448 * 78 = 190,944 tris
  );
  puffInstMesh.name = 'trees-canopy-puffs-instanced';
  puffInstMesh.frustumCulled = false;
  treesGroup.add(puffInstMesh);
  unoptScene.add(treesGroup);

  // 3) SacredStoneCalligraphy: 167,037 tris
  const stoneMesh = new THREE.Mesh(
    makeIndexedBufferGeometry(180000, 167037),
    new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
  );
  stoneMesh.name = 'UnifiedMonument_stone_plaza';
  stoneMesh.frustumCulled = false;
  unoptScene.add(stoneMesh);

  const mockRendererUnopt = {
    getSize(target) {
      return target.set(844, 390);
    },
    getPixelRatio() {
      return 1.65;
    },
  };
  const mockPostUnopt = {
    params: {
      grade: {
        uMobileFastSample: { value: 0.0 },
        tDepth: { value: {} },
      },
    },
  };

  const camera = new THREE.PerspectiveCamera(60, 844 / 390, 0.1, 500);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 2, -10);

  // Verify both positional and options-object signatures
  const reportUnoptPos = evaluateMaliG68Frame(
    unoptScene,
    mockRendererUnopt,
    mockPostUnopt,
    camera
  );
  const reportUnoptObj = evaluateMaliG68Frame({
    scene: unoptScene,
    renderer: mockRendererUnopt,
    post: mockPostUnopt,
    camera,
  });

  assert.deepEqual(
    reportUnoptPos,
    reportUnoptObj,
    'Positional and options-object calls must return identical report'
  );
  assert.equal(reportUnoptObj.clockMhz, 550);
  assert.equal(reportUnoptObj.cores, 4);
  assert.equal(reportUnoptObj.totalDrawCalls, 5);
  assert.ok(
    reportUnoptObj.totalTrianglesSubmitted > 1400000,
    `Expected > 1.4M triangles, got ${reportUnoptObj.totalTrianglesSubmitted}`
  );
  assert.equal(reportUnoptObj.lateZDrawCalls, 2);
  assert.equal(reportUnoptObj.lateZDrawCallsWithManyTris, 2);
  assert.equal(reportUnoptObj.lateZOffenders.length, 2);
  assert.ok(
    reportUnoptObj.dramMegabytes > 180,
    `Expected unoptimized DRAM > 180 MB, got ${reportUnoptObj.dramMegabytes} MB`
  );
  assert.ok(
    reportUnoptObj.predictedFrameMs > 25,
    `Expected unoptimized predictedFrameMs > 25 ms, got ${reportUnoptObj.predictedFrameMs} ms`
  );
  assert.equal(reportUnoptObj.passes60FpsGate, false);
  console.log(
    `  [PASS] Unoptimized Scene: ${reportUnoptObj.totalTrianglesSubmitted.toLocaleString()} tris | ` +
      `Late-Z: ${reportUnoptObj.lateZDrawCallsWithManyTris} | DRAM: ${reportUnoptObj.dramMegabytes} MB | ` +
      `Predicted: ${reportUnoptObj.predictedFrameMs} ms (${reportUnoptObj.predictedFps} FPS) | Gate: ${reportUnoptObj.passes60FpsGate}`
  );

  console.log('=== 3. Synthetic Optimized Scene (< 250k Tris + Early-Z FPK + 1-Tap Post + Frustum Culling) ===');
  const optScene = new THREE.Scene();

  // 1) Forward-shifted ToroidalMeadow: 7,200 grass tufts (12 tris) + optimized wildflowers (~88k tris)
  const optMeadowGroup = new THREE.Group();
  optMeadowGroup.name = 'ToroidalMeadow';
  const optGrassMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vColor; void main() { vColor = position; gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }',
  });
  const optGrassInst = new THREE.InstancedMesh(
    makeIndexedBufferGeometry(18, 12),
    optGrassMat,
    7200 // 86,400 tris
  );
  optGrassInst.name = 'meadow_grassTuft_toroidal';
  optGrassInst.frustumCulled = false;
  optMeadowGroup.add(optGrassInst);

  const optFlowersInst = new THREE.InstancedMesh(
    makeIndexedBufferGeometry(48, 32),
    optGrassMat,
    2200 // 70,400 tris
  );
  optFlowersInst.name = 'meadow_flowers_toroidal';
  optFlowersInst.frustumCulled = false;
  optMeadowGroup.add(optFlowersInst);
  optScene.add(optMeadowGroup);

  // 2) BotanicalTrees: Early-Z (zero discard), 2 visible sectors + 6 off-frustum sectors
  const optTreesGroup = new THREE.Group();
  optTreesGroup.name = 'BotanicalTrees';
  const optTreeMat = new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    vertexShader: 'varying vec3 vNormal; void main() { vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vNormal; void main() { gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0); }',
  });

  // Visible sector in front of camera (z = -15)
  const visibleTreeSector = new THREE.Mesh(
    makeIndexedBufferGeometry(18000, 12000),
    optTreeMat
  );
  visibleTreeSector.name = 'trees-sector-0-visible';
  visibleTreeSector.frustumCulled = true;
  optTreesGroup.add(visibleTreeSector);

  // Off-frustum sector far behind camera (z = +250) -> must be culled by emulator!
  const behindTreeGeo = makeIndexedBufferGeometry(90000, 60000);
  behindTreeGeo.translate(0, 0, 250);
  behindTreeGeo.computeBoundingSphere();
  const culledTreeSector = new THREE.Mesh(behindTreeGeo, optTreeMat);
  culledTreeSector.name = 'trees-sector-1-behind-camera';
  culledTreeSector.frustumCulled = true;
  optTreesGroup.add(culledTreeSector);

  // Visible canopy puffs (Early-Z, thinned to ~42k tris)
  const optPuffs = new THREE.InstancedMesh(
    makeIndexedBufferGeometry(42, 28),
    optTreeMat,
    1500 // 42,000 tris
  );
  optPuffs.name = 'trees-canopy-puffs-instanced';
  optPuffs.frustumCulled = false;
  optTreesGroup.add(optPuffs);
  optScene.add(optTreesGroup);

  // 3) Decimated SacredStoneBase (3,500 tris) + Hidden Distant 3D Calligraphy LOD (`visible = false`)
  const optStoneGroup = new THREE.Group();
  optStoneGroup.name = 'SacredStoneCalligraphy';
  const optStoneBase = new THREE.Mesh(
    makeIndexedBufferGeometry(5200, 3500),
    optTreeMat
  );
  optStoneBase.name = 'UnifiedMonument_stone_plaza_base';
  optStoneGroup.add(optStoneBase);

  const hiddenCalligraphyGroup = new THREE.Group();
  hiddenCalligraphyGroup.visible = false; // Hidden beyond 20m!
  const heavyCalligraphyMesh = new THREE.Mesh(
    makeIndexedBufferGeometry(75000, 50000),
    optTreeMat
  );
  heavyCalligraphyMesh.name = 'UnifiedMonument_stone_plaza_calligraphy';
  hiddenCalligraphyGroup.add(heavyCalligraphyMesh);
  optStoneGroup.add(hiddenCalligraphyGroup);
  optScene.add(optStoneGroup);

  const mockRendererOpt = {
    getSize(target) {
      return target.set(844, 390);
    },
    getPixelRatio() {
      return 1.35;
    },
  };
  const mockPostOpt = {
    params: {
      grade: {
        uMobileFastSample: { value: 1.0 },
        tDepth: { value: {} },
      },
    },
  };

  const reportOpt = evaluateMaliG68Frame({
    scene: optScene,
    renderer: mockRendererOpt,
    post: mockPostOpt,
    camera,
  });

  // Verify off-frustum sector (60k tris) and hidden parent group (50k tris) were excluded!
  assert.equal(
    reportOpt.totalDrawCalls,
    5,
    'Off-frustum sector and visible=false parent group must be excluded from draw calls'
  );
  assert.equal(
    reportOpt.totalTrianglesSubmitted,
    86400 + 70400 + 12000 + 42000 + 3500,
    'Submitted triangles must match exact sum of visible in-frustum meshes (214,300)'
  );
  assert.equal(reportOpt.lateZDrawCalls, 0);
  assert.equal(reportOpt.lateZDrawCallsWithManyTris, 0);
  assert.ok(
    reportOpt.dramMegabytes <= 60.0,
    `Expected optimized DRAM <= 60.0 MB, got ${reportOpt.dramMegabytes} MB`
  );
  assert.ok(
    reportOpt.predictedFrameMs <= MALI_G68_SPECS.frameBudget60FpsMs,
    `Expected optimized predictedFrameMs <= 13.5 ms, got ${reportOpt.predictedFrameMs} ms`
  );
  assert.equal(reportOpt.predictedFps, 60);
  assert.equal(reportOpt.passes60FpsGate, true);
  assert.ok(reportOpt.groups.ToroidalMeadow, 'Named group lookup on report.groups must work');
  console.log(
    `  [PASS] Optimized Scene: ${reportOpt.totalTrianglesSubmitted.toLocaleString()} tris | ` +
      `Late-Z: ${reportOpt.lateZDrawCallsWithManyTris} | DRAM: ${reportOpt.dramMegabytes} MB | ` +
      `Predicted: ${reportOpt.predictedFrameMs} ms (${reportOpt.predictedFps} FPS) | Gate: ${reportOpt.passes60FpsGate}`
  );

  console.log('=== 4. Live HTTP Telemetry Endpoint (`POST` & `GET /api/mobile-telemetry`) ===');
  const prevFileExists = fs.existsSync(latestTelemetryFile);
  const prevFileContent = prevFileExists ? fs.readFileSync(latestTelemetryFile, 'utf8') : null;
  mobileTelemetryHistory.length = 0;

  const { server: testSrv, port } = await startServer(0, '127.0.0.1');
  const endpoint = `http://127.0.0.1:${port}/api/mobile-telemetry`;

  try {
    // 1. Initial GET when empty
    const initRes = await fetch(endpoint);
    assert.equal(initRes.status, 200);
    assert.equal(initRes.headers.get('access-control-allow-origin'), '*');
    const initJson = await initRes.json();
    assert.equal(initJson.ok, true);
    assert.equal(initJson.count, 0);
    assert.equal(initJson.latest, null);
    assert.deepEqual(initJson.history, []);

    // 2. Push 55 snapshots to verify the 50-snapshot ring-buffer cap + disk persistence
    for (let i = 1; i <= 55; i++) {
      const payload = {
        seq: i,
        ua: 'Mozilla/5.0 (Linux; Android 14; RMX3771 Realme 11 Pro)',
        viewport: { width: 844, height: 390 },
        dpr: 1.35,
        fps: 58 + (i % 3),
        avgFrameMs: 11.4,
        p95FrameMs: 13.1,
        maxFrameMs: 14.8,
        draws: 36,
        triangles: 214300,
        maliPredictedMs: reportOpt.predictedFrameMs,
      };
      const postRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(postRes.status, 200);
      const postJson = await postRes.json();
      assert.equal(postJson.ok, true);
      assert.equal(postJson.latest.seq, i);
    }

    // 3. Verify GET returns exactly the latest 50 snapshots (seq 6..55)
    const getRes = await fetch(endpoint);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.ok, true);
    assert.equal(getJson.count, 50, 'Telemetry history must cap at 50 snapshots');
    assert.equal(getJson.history.length, 50);
    assert.equal(getJson.history[0].seq, 6);
    assert.equal(getJson.latest.seq, 55);
    assert.equal(getJson.latest.triangles, 214300);

    // 4. Verify `world/shots/latest-mobile-telemetry.json` was written accurately
    assert.equal(
      fs.existsSync(latestTelemetryFile),
      true,
      'latest-mobile-telemetry.json must be written on POST'
    );
    const diskJson = JSON.parse(fs.readFileSync(latestTelemetryFile, 'utf8'));
    assert.equal(diskJson.seq, 55);
    assert.equal(diskJson.triangles, 214300);
    console.log('  [PASS] /api/mobile-telemetry GET/POST roundtrip, CORS, 50-item cap & JSON persistence');
  } finally {
    await new Promise((resolve) => testSrv.close(resolve));
    if (prevFileExists && prevFileContent !== null) {
      fs.writeFileSync(latestTelemetryFile, prevFileContent, 'utf8');
    } else if (fs.existsSync(latestTelemetryFile)) {
      fs.unlinkSync(latestTelemetryFile);
    }
  }

  console.log('\nALL MALI-G68 EMULATOR & TELEMETRY TESTS PASSED.');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
