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
} from './geography.js';
import {
  PALETTE,
  makeToonGradient,
  makeOutlineMaterial,
  batchVertexColorGroup,
  getSharedBakedShadowAOTexture,
  sharedBakedShadowAOTex,
  getSharedMeadowCanvasTexture,
  bakeWorldDataTextures,
  buildTreeShadowUniformArray,
  buildTerrainAndWater,
} from './terrain-water.js';
import { buildLandmarks } from './landmarks.js';
import {
  buildBotanicalTrees,
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
  getSharedBakedShadowAOTexture,
  sharedBakedShadowAOTex,
  getSharedMeadowCanvasTexture,
  bakeWorldDataTextures,
  makeToonGradient,
  makeOutlineMaterial,
  batchVertexColorGroup,
  buildTreeShadowUniformArray,
  buildTerrainAndWater,
  buildLandmarks,
  buildBotanicalTrees,
  buildSingleTreeGeometry,
  buildWisteriaTree,
  buildShrineTree,
};

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
