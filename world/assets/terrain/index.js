import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  TERRAIN_SIZE,
  OUTER_EXTENT,
  WORLD_SIZE,
  ZONES,
  PATROL_CLEARINGS,
  INSCRIPTION_STONES,
  BOULDERS,
  DRY_STONE_WALLS,
  ROADSIDE_FENCES,
  BUILDINGS,
  BUILDING_LIST,
  BUILDINGS_BY_ID,
  ROADS,
  LANDMARKS,
  TREES,
  getBuildingDoorWorldPos,
  worldToBuildingLocal,
  buildingLocalToWorld,
  roadDistanceAt,
  streamCenterX,
  terrainHeightAt,
  terrainNormalAt,
  walkableHeightAt,
  heightAt,
  sampleWorld,
  createWorldMaskTexture,
  createWorldMaskTextureAsync,
} from './geography.js';
import {
  PALETTE,
  makeToonGradient,
  makeOutlineMaterial,
  createTimeSlicer,
  batchVertexColorGroup,
  batchVertexColorGroupAsync,
  getSharedBakedShadowAOTexture,
  sharedBakedShadowAOTex,
  getSharedMeadowCanvasTexture,
  getSharedMeadowCanvasTextureAsync,
  bakeWorldDataTextures,
  buildTreeShadowUniformArray,
  buildTerrainAndWater,
  buildTerrainAndWaterAsync,
} from './terrain-water.js';
import { buildLandmarks, buildLandmarksAsync } from './landmarks.js';
import {
  buildBotanicalTrees,
  buildBotanicalTreesAsync,
  buildSingleTreeGeometry,
  buildWisteriaTree,
  buildShrineTree,
} from './trees.js';

export {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  TERRAIN_SIZE,
  OUTER_EXTENT,
  WORLD_SIZE,
  ZONES,
  PATROL_CLEARINGS,
  INSCRIPTION_STONES,
  BOULDERS,
  DRY_STONE_WALLS,
  ROADSIDE_FENCES,
  BUILDINGS,
  BUILDING_LIST,
  BUILDINGS_BY_ID,
  ROADS,
  LANDMARKS,
  TREES,
  PALETTE,
  getBuildingDoorWorldPos,
  worldToBuildingLocal,
  buildingLocalToWorld,
  roadDistanceAt,
  streamCenterX,
  terrainHeightAt,
  terrainNormalAt,
  walkableHeightAt,
  heightAt,
  sampleWorld,
  createWorldMaskTexture,
  createWorldMaskTextureAsync,
  getSharedBakedShadowAOTexture,
  sharedBakedShadowAOTex,
  getSharedMeadowCanvasTexture,
  getSharedMeadowCanvasTextureAsync,
  bakeWorldDataTextures,
  makeToonGradient,
  makeOutlineMaterial,
  batchVertexColorGroup,
  batchVertexColorGroupAsync,
  buildTreeShadowUniformArray,
  buildTerrainAndWater,
  buildTerrainAndWaterAsync,
  buildLandmarks,
  buildLandmarksAsync,
  buildBotanicalTrees,
  buildBotanicalTreesAsync,
  buildSingleTreeGeometry,
  buildWisteriaTree,
  buildShrineTree,
};

function assembleTerrainKitResult(root, terrainSys, landmarksSys, treesSys, worldMaskTex, bakedShadowAOTex, colliders) {
  return {
    group: root,
    root,
    terrainGroup: terrainSys.terrainGroup,
    chunks: terrainSys.chunks,
    skirtMesh: terrainSys.skirtMesh,
    terrainMat: terrainSys.terrainMat,
    waterMat: terrainSys.waterMat,
    horizonGroup: terrainSys.horizonGroup,
    worldMaskTex,
    bakedShadowAOTex,
    maskBuildMs: terrainSys.maskBuildMs,
    landmarksGroup: landmarksSys.group,
    treesGroup: treesSys.group,
    treesSys,
    waterwheel: landmarksSys.waterwheel,
    colliders,
    update(
      dt,
      elapsed,
      sunDir = null,
      daylight = null,
      fogColor = null,
      lightTint = null,
      camera = null,
      profile = 'desktop'
    ) {
      terrainSys.update(dt, elapsed);
      landmarksSys.update(dt, elapsed);
      treesSys.update(dt, elapsed, sunDir, daylight, fogColor, lightTint, camera, profile);
    },
  };
}

/**
 * Assembles the complete Haru-machi Wave 1C Terrain, Water, Landmarks, Boulders & Volumetric 3D Trees kit
 * (`world/assets/terrain/index.js`).
 */
export function createTerrainAndLandmarks(renderer, opts = {}) {
  const root = new THREE.Group();
  root.name = 'terrain-water-landmarks-root';

  const colliders = [];
  const worldMaskTex = opts.worldMaskTex || createWorldMaskTexture(512);
  const bakedShadowAOTex = opts.bakedShadowAOTex || getSharedBakedShadowAOTexture();

  const terrainSys = buildTerrainAndWater(renderer, {
    ...opts,
    worldMaskTex,
    bakedShadowAOTex,
  });
  root.add(terrainSys.group);

  const landmarksSys = buildLandmarks({
    ...opts,
    colliders,
    shadowUniforms: terrainSys.terrainMat?.uniforms || null,
  });
  root.add(landmarksSys.group);

  const treesSys = buildBotanicalTrees({
    ...opts,
    colliders,
  });
  root.add(treesSys.group);

  return assembleTerrainKitResult(
    root,
    terrainSys,
    landmarksSys,
    treesSys,
    worldMaskTex,
    bakedShadowAOTex,
    colliders
  );
}

/**
 * Time-sliced async version of `createTerrainAndLandmarks` yielding via `opts.yieldFrame`
 * whenever elapsed work exceeds `opts.sliceBudgetMs`. Produces 100% identical geometry and state.
 */
export async function createTerrainAndLandmarksAsync(renderer, opts = {}) {
  const slicer = createTimeSlicer(opts);
  const root = new THREE.Group();
  root.name = 'terrain-water-landmarks-root';

  const colliders = [];
  const worldMaskTex =
    opts.worldMaskTex ||
    (await createWorldMaskTextureAsync(512, () => slicer.maybeYield()));
  await slicer.maybeYield();

  const bakedShadowAOTex = opts.bakedShadowAOTex || getSharedBakedShadowAOTexture();

  const terrainSys = await buildTerrainAndWaterAsync(renderer, {
    ...opts,
    worldMaskTex,
    bakedShadowAOTex,
    yieldFrame: slicer.yieldFrame,
    sliceBudgetMs: slicer.sliceBudgetMs,
  });
  root.add(terrainSys.group);
  await slicer.maybeYield();

  const landmarksSys = await buildLandmarksAsync({
    ...opts,
    colliders,
    shadowUniforms: terrainSys.terrainMat?.uniforms || null,
    yieldFrame: slicer.yieldFrame,
    sliceBudgetMs: slicer.sliceBudgetMs,
  });
  root.add(landmarksSys.group);
  await slicer.maybeYield();

  const treesSys = await buildBotanicalTreesAsync({
    ...opts,
    colliders,
    yieldFrame: slicer.yieldFrame,
    sliceBudgetMs: slicer.sliceBudgetMs,
  });
  root.add(treesSys.group);

  return assembleTerrainKitResult(
    root,
    terrainSys,
    landmarksSys,
    treesSys,
    worldMaskTex,
    bakedShadowAOTex,
    colliders
  );
}
