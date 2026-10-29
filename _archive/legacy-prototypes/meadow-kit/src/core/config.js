// Settings resolution. One recipe in, one fully-resolved config out.
// Nothing downstream reads the raw JSON directly.

import recipeData from "../../data/meadow.recipe.json" with { type: "json" };
import paletteData from "../../data/meadow.palette.json" with { type: "json" };
import * as THREE from "three";
import { makeRng, makeNoise2D } from "./rng.js";

export const DEFAULT_RECIPE = recipeData;
export const DEFAULT_PALETTE = paletteData;

export const QUALITY_ORDER = ["low", "medium", "high", "ultra"];

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/**
 * @param {object} opts
 * @param {object} [opts.recipe]    partial recipe, deep-merged over the default
 * @param {object} [opts.palette]   partial palette override
 * @param {number} [opts.seed]
 * @param {number} [opts.area]      square side in metres, shorthand for area.width/depth
 * @param {string} [opts.quality]   "low" | "medium" | "high" | "ultra"
 */
export function resolveConfig(opts = {}) {
  const recipe = deepMerge(DEFAULT_RECIPE, opts.recipe || {});
  const palette = deepMerge(DEFAULT_PALETTE, opts.palette || {});

  if (opts.seed != null) recipe.seed = opts.seed;
  if (opts.area != null) recipe.area = { width: opts.area, depth: opts.area };

  const quality = QUALITY_ORDER.includes(opts.quality) ? opts.quality : recipe.quality;
  const tier = recipe.qualityTiers[quality] || recipe.qualityTiers.high;

  const seed = recipe.seed | 0;
  const [wx, wz] = recipe.wind.direction;
  const len = Math.hypot(wx, wz) || 1;

  const config = {
    recipe,
    palette,
    quality,
    tier,
    seed,
    area: recipe.area,
    densityScale: tier.density,
    lodDistance: tier.lodDistance,
    windDir: new THREE.Vector2(wx / len, wz / len),
    // Convenience handles so modules can read config.terrain.relief rather
    // than digging through config.recipe. Same objects, no copies.
    terrain: recipe.terrain,
    windRecipe: recipe.wind,
    scatterSettings: recipe.scatter,
    materials: null, // attached by createMeadow()
    rng: makeRng(seed),
    noise: makeNoise2D(seed ^ 0x9e3779b9),
    paths: (recipe.paths || []).map((p) => ({
      id: p.id,
      width: p.width,
      feather: p.feather,
      lift: p.lift ?? 0.01,
      points: p.points.map(([x, z]) => new THREE.Vector2(x, z)),
      curve: new THREE.CatmullRomCurve3(
        p.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        false,
        "catmullrom",
        0.5
      ),
    })),
  };

  return config;
}

/**
 * Per-species settings: recipe entry, scaled by the quality tier.
 * Species modules may declare their own defaults; the recipe wins.
 */
export function resolveSpeciesConfig(config, spec) {
  const base = config.recipe.species?.[spec.id] || {};
  const density = (base.density ?? spec.density ?? 0) * config.densityScale;
  return {
    density,
    scale: base.scale ?? spec.scale ?? [0.8, 1.2],
    clump: base.clump ?? spec.clump ?? 0.25,
    lod: base.lod ?? spec.lod ?? 1,
    ...base,
    density,
  };
}
