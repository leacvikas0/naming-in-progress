import * as THREE from 'three';
import {
  SPECIES_SPECS,
  buildGrassTuft,
  buildBellflower,
  buildDaisy,
  buildLupine,
  buildCosmos,
  buildCrimsonRose,
  buildCrimsonRoseAsync,
  buildToonShrub,
  createSpeciesGeometries,
  createSpeciesGeometriesAsync,
} from './species.js';
import {
  MEADOW_PROFILES,
  SACRED_ROSE_ANCHORS,
  defaultSampleHeight,
  createDefaultWorldMaskTexture,
  createDefaultWorldMaskTextureAsync,
  createGouacheMaterial,
  createToroidalMeadow,
  createToroidalMeadowAsync,
  createMeadowDriftDemo,
  createMeadowDriftDemoAsync,
} from './meadow.js';

export const createFlowerSpeciesGeometries = createSpeciesGeometries;
export const createFlowerSpeciesGeometriesAsync = createSpeciesGeometriesAsync;

function assembleBotanicalPack(geometries) {
  const sharedUniforms = {
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0.58, 0.76, 0.30).normalize() },
  };
  const materials = {};
  const meshes = {};
  const stats = {};

  for (const key of Object.keys(SPECIES_SPECS)) {
    const geo = geometries[key];
    const spec = SPECIES_SPECS[key];
    const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    const mat = createGouacheMaterial({
      isToroidal: false,
      fadeRadius: 500,
      windFlex: spec.flex,
      sharedUniforms,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = key;
    materials[key] = mat;
    meshes[key] = mesh;
    stats[key] = {
      id: key,
      name: spec.name,
      triangles: tris,
      budget: spec.budget,
      withinBudget: tris <= spec.budget,
    };
  }

  return {
    specs: SPECIES_SPECS,
    geometries,
    materials,
    meshes,
    stats,
    createMesh(key) {
      if (!geometries[key]) throw new Error(`Unknown botanical species: ${key}`);
      return new THREE.Mesh(geometries[key], materials[key]);
    },
    update(elapsedTime = 0) {
      sharedUniforms.uTime.value = elapsedTime;
    },
    dispose() {
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}

export function createBotanicalPack(opts = {}) {
  return assembleBotanicalPack(createSpeciesGeometries(opts));
}

export async function createBotanicalPackAsync(opts = {}) {
  const geometries = await createSpeciesGeometriesAsync(opts);
  return assembleBotanicalPack(geometries);
}

export {
  SPECIES_SPECS,
  buildGrassTuft,
  buildBellflower,
  buildDaisy,
  buildLupine,
  buildCosmos,
  buildCrimsonRose,
  buildCrimsonRoseAsync,
  buildToonShrub,
  createSpeciesGeometries,
  createSpeciesGeometriesAsync,
  MEADOW_PROFILES,
  SACRED_ROSE_ANCHORS,
  defaultSampleHeight,
  createDefaultWorldMaskTexture,
  createDefaultWorldMaskTextureAsync,
  createGouacheMaterial,
  createToroidalMeadow,
  createToroidalMeadowAsync,
  createMeadowDriftDemo,
  createMeadowDriftDemoAsync,
};
