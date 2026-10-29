import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  OUTER_EXTENT,
  WORLD_SIZE,
  ZONES,
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
  buildTerrainAndWater,
} from './terrain-water.js';
import { buildLandmarks } from './landmarks.js';
import { buildBotanicalTrees } from './trees.js';

export {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  OUTER_EXTENT,
  WORLD_SIZE,
  ZONES,
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
  makeToonGradient,
  makeOutlineMaterial,
  batchVertexColorGroup,
  buildTerrainAndWater,
  buildLandmarks,
  buildBotanicalTrees,
};

/**
 * Assembles the complete Haru-machi v7 Terrain, Water, Landmarks & Botanical Trees asset kit
 * (`world/assets/terrain/index.js`).
 *
 * Engineered for a locked 144 FPS within `< 55,000` total triangles and `<= 22` total draw calls:
 * - 4x4 Frustum-Culled Terrain Chunks (`70m x 70m` at `36x36` segs = 2,592 tris/chunk, 41,472 tris total)
 * - Low-Poly Outer Valley Skirt (`40x40` grid with inner `±140m` hole omitted = 2,552 tris) + Alpine Horizon Ring
 * - Fast `512x512` `uWorldMask` DataTexture (`< 30ms` CPU generation) + Gouache Terrain Shader
 * - Merged v7 Landmarks (`landmarks.js` <= 5 draw calls)
 * - Merged Botanical Hero & Valley Trees (`trees.js` <= 2 draw calls, <= 1,200 tris/hero tree)
 */
export function createTerrainAndLandmarks(renderer, opts = {}) {
  const root = new THREE.Group();
  root.name = 'terrain-water-landmarks-root';

  const colliders = [];
  const worldMaskTex = opts.worldMaskTex || createWorldMaskTexture(512);

  const terrainSys = buildTerrainAndWater(renderer, {
    ...opts,
    worldMaskTex,
  });
  root.add(terrainSys.group);

  const landmarksSys = buildLandmarks({
    ...opts,
    colliders,
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
    maskBuildMs: terrainSys.maskBuildMs,
    landmarksGroup: landmarksSys.group,
    treesGroup: treesSys.group,
    treesSys,
    waterwheel: landmarksSys.waterwheel,
    colliders,
    update(dt, elapsed, sunDir = null, daylight = null, fogColor = null, lightTint = null) {
      terrainSys.update(dt, elapsed);
      landmarksSys.update(dt, elapsed);
      treesSys.update(dt, elapsed, sunDir, daylight, fogColor, lightTint);
    },
  };
}
