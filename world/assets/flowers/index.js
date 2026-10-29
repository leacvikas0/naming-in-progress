import * as THREE from 'three';
import {
  SPECIES_SPECS,
  buildGrassTuft,
  buildBellflower,
  buildDaisy,
  buildLupine,
  buildCosmos,
  buildToonShrub,
  createSpeciesGeometries,
} from './species.js';
import {
  MEADOW_PROFILES,
  defaultSampleHeight,
  createDefaultWorldMaskTexture,
  createGouacheMaterial,
  createToroidalMeadow,
  createMeadowDriftDemo,
} from './meadow.js';

export const createFlowerSpeciesGeometries = createSpeciesGeometries;

export function createBotanicalPack() {
  const geometries = createSpeciesGeometries();
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
    const tris = geo.attributes.position.count / 3;
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

export {
  SPECIES_SPECS,
  buildGrassTuft,
  buildBellflower,
  buildDaisy,
  buildLupine,
  buildCosmos,
  buildToonShrub,
  createSpeciesGeometries,
  MEADOW_PROFILES,
  defaultSampleHeight,
  createDefaultWorldMaskTexture,
  createGouacheMaterial,
  createToroidalMeadow,
  createMeadowDriftDemo,
};
