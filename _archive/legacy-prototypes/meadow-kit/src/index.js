// Public API. One call builds the whole meadow.
//
//   import { createMeadow, createEnvironment } from "./meadow-kit/src/index.js";
//
//   const meadow = await createMeadow({ seed: 7, area: 26, quality: "high" });
//   createEnvironment(meadow.config).apply(scene);
//   scene.add(meadow.group);
//
//   // every frame
//   meadow.update(clock.getElapsedTime(), camera);
//
// Everything is instanced and shares one wind uniform, so the per-frame cost
// is a handful of float writes regardless of instance count.

import * as THREE from "three";
import { resolveConfig, resolveSpeciesConfig } from "./core/config.js";
import { createWind } from "./core/wind.js";
import { createMaterialFactory } from "./core/materials.js";
import { createScatter } from "./core/scatter.js";
import { buildInstancedSpecies } from "./core/instancing.js";
import { finalizeGeometry, triangleCount } from "./core/geom.js";
import { createTerrain } from "./ground/terrain.js";
import { createPath } from "./ground/path.js";

/**
 * @param {object} [options]
 * @param {THREE.Scene} [options.scene]     if given, the group is added to it
 * @param {number} [options.seed]
 * @param {number} [options.area]           square side in metres
 * @param {string} [options.quality]        "low" | "medium" | "high" | "ultra"
 * @param {object} [options.recipe]         partial recipe override
 * @param {object} [options.palette]        partial palette override
 * @param {Array}  [options.species]        explicit species list (skips the barrel)
 * @param {boolean} [options.fx=true]       include motes + butterflies
 */
export async function createMeadow(options = {}) {
  const config = resolveConfig(options);
  const wind = createWind(config);
  const materials = createMaterialFactory({ config, wind });
  config.materials = materials;

  const group = new THREE.Group();
  group.name = "meadow";

  // --- ground ---------------------------------------------------------
  const terrain = createTerrain(config);
  group.add(terrain.mesh);

  const path = createPath(config, terrain.heightAt);
  group.add(path.group);

  // --- plants ---------------------------------------------------------
  const scatter = createScatter(config);
  let speciesList = options.species;
  if (!speciesList) {
    const barrel = await import("./foliage/index.js");
    speciesList = barrel.SPECIES;
  }

  const lodUpdaters = [];
  const speciesStats = [];
  let totalTriangles = triangleCount(terrain.mesh.geometry) + (path.triangles || 0);
  let totalInstances = 0;
  let drawCalls = 1 + (path.meshes?.length || 0);

  for (const spec of speciesList) {
    const specCfg = resolveSpeciesConfig(config, spec);
    const geometry = finalizeGeometry(
      spec.build({ seed: config.seed, config, materials, species: specCfg })
    );
    const material = materials.get(spec.material, {});
    const { instances } = scatter.sampleSpecies(specCfg, terrain.heightAt);

    const built = buildInstancedSpecies({
      id: spec.id,
      geometry,
      material,
      instances,
      cellSize: config.recipe.scatter.cellSize || 0,
      lodDistance: config.lodDistance * (specCfg.lod ?? 1),
      lodStride: 3,
    });

    group.add(built.group);
    lodUpdaters.push(built);

    totalTriangles += built.triangles;
    totalInstances += built.count;
    drawCalls += built.group.children.length;

    speciesStats.push({
      id: spec.id,
      label: spec.label,
      instances: built.count,
      triangles: built.triangles,
      trisPerInstance: Math.round(built.triangles / Math.max(1, built.count)),
    });
  }

  // --- atmosphere -----------------------------------------------------
  let motes = null;
  let butterflies = null;
  if (options.fx !== false) {
    try {
      const { createMotes } = await import("./fx/motes.js");
      motes = createMotes({ config, scatter, heightAt: terrain.heightAt, materials });
      group.add(motes.group);
    } catch (err) {
      console.warn("meadow: motes unavailable —", err.message);
    }
    try {
      const { createButterflies } = await import("./fx/butterflies.js");
      butterflies = createButterflies({ config, scatter, heightAt: terrain.heightAt, materials });
      group.add(butterflies.group);
    } catch (err) {
      console.warn("meadow: butterflies unavailable —", err.message);
    }
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-config.area.width / 2, 0, -config.area.depth / 2),
    new THREE.Vector3(config.area.width / 2, 1.2, config.area.depth / 2)
  );
  const centre = bounds.getCenter(new THREE.Vector3());

  const meadow = {
    group,
    config,
    terrain,
    wind,
    materials,
    scatter,
    bounds,
    heightAt: terrain.heightAt,

    /** Call once per frame. `camera` enables distance LOD. */
    update(time, camera) {
      wind.update(time);
      if (camera) {
        const d = camera.position.distanceTo(centre);
        for (const u of lodUpdaters) u.update(d);
      }
      if (motes) motes.update(time);
      if (butterflies) butterflies.update(time);
    },

    stats() {
      return {
        quality: config.quality,
        seed: config.seed,
        area: config.area,
        species: speciesStats,
        instances: totalInstances,
        triangles: totalTriangles,
        drawCalls,
      };
    },

    dispose() {
      for (const u of lodUpdaters) u.dispose();
      terrain.dispose?.();
      path.dispose?.();
      motes?.dispose?.();
      butterflies?.dispose?.();
      materials.dispose();
      group.removeFromParent();
    },
  };

  if (options.scene) options.scene.add(group);

  return meadow;
}
