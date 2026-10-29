// Placement. Turns "density 3 per m²" into actual positions, with three
// behaviours that make a field read as grown rather than sprinkled:
//
//   1. patches   - low-frequency noise gates each species into drifts
//   2. edge bias - flowers crowd the path margins, as they do in the reference
//   3. variation - a second noise thins the field unevenly
//
// Density is exact: we reject-sample until the target instance count is met,
// so "3 per m²" really is 3 per m² no matter how the masks fall.

import { fbm2D } from "./rng.js";

const TAU = Math.PI * 2;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createScatter(config) {
  const { area, paths, recipe, noise, rng } = config;
  const s = recipe.scatter;
  const halfW = area.width / 2;
  const halfD = area.depth / 2;

  // One sample table per path, with a padded bbox so most points skip the
  // distance loop entirely.
  const pathTables = paths.map((p) => {
    const len = p.curve.getLength();
    const n = Math.max(12, Math.ceil(len / 0.4));
    const pts = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i <= n; i++) {
      const pt = p.curve.getPointAt(i / n);
      pts.push({ x: pt.x, z: pt.z });
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.z > maxZ) maxZ = pt.z;
    }
    const pad = p.width / 2 + p.feather + s.edgeBiasRange + 1;
    return {
      half: p.width / 2,
      pts,
      bbox: { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad },
    };
  });

  function pathEdgeDistance(x, z) {
    let best = Infinity;
    for (let t = 0; t < pathTables.length; t++) {
      const table = pathTables[t];
      const bb = table.bbox;
      if (x < bb.minX || x > bb.maxX || z < bb.minZ || z > bb.maxZ) continue;
      const pts = table.pts;
      for (let i = 0; i < pts.length; i++) {
        const dx = x - pts[i].x;
        const dz = z - pts[i].z;
        const d = Math.sqrt(dx * dx + dz * dz) - table.half;
        if (d < best) best = d;
      }
    }
    return best;
  }

  /** 0 = never place here, 1 = place freely. */
  function acceptance(x, z, specCfg) {
    const edgeDist = pathEdgeDistance(x, z);
    if (edgeDist < s.pathMargin) return 0;

    const patchNoise = fbm2D(noise, x / s.clumpScale + 11.3, z / s.clumpScale - 4.7, 2);
    const threshold = 0.62 - specCfg.clump * 0.55;
    const patch = smoothstep(threshold, threshold + 0.4, patchNoise);

    const variation = 0.55 + 0.9 * noise(x / 3.4 + 51.1, z / 3.4 + 17.3);

    let boost = 1;
    if (edgeDist < s.edgeBiasRange) {
      boost = 1 + (s.edgeBias - 1) * (1 - edgeDist / s.edgeBiasRange);
    }

    // The floor matters. A hard 0 here starves whole regions and, because we
    // reject-sample to a fixed count, the plants all pile into the accepted
    // patches and leave the rest of the field visibly bald. 0.25 keeps every
    // square metre populated while still letting the noise create drifts.
    return Math.min(1, (0.25 + 0.75 * patch) * variation * boost);
  }

  function makeInstance(x, z, specCfg, heightAt) {
    const h = rng.range(specCfg.scale[0], specCfg.scale[1]);
    const width = h * rng.range(0.88, 1.12);
    const tint = 1 + rng.gauss() * 0.055;
    const warm = rng.gauss() * 0.045;
    return {
      x,
      z,
      y: heightAt(x, z),
      rot: rng.range(0, TAU),
      sx: width,
      sy: h,
      sz: width,
      r: tint * (1 + warm),
      g: tint,
      b: tint * (1 - warm),
    };
  }

  return {
    /** @returns {Array} instances for one species */
    sampleSpecies(specCfg, heightAt) {
      const target = Math.round(specCfg.density * area.width * area.depth);
      const maxTries = target * 9 + 400;
      const out = [];
      let tries = 0;
      while (out.length < target && tries < maxTries) {
        tries++;
        const x = rng.range(-halfW, halfW);
        const z = rng.range(-halfD, halfD);
        const p = acceptance(x, z, specCfg);
        if (p <= 0) continue;
        if (rng.next() > p) continue;
        out.push(makeInstance(x, z, specCfg, heightAt));
      }
      return { instances: out, target, tries };
    },

    /** Free-floating positions for motes and butterflies. */
    samplePoints(count, { minY = 0.3, maxY = 2.5, heightAt = () => 0 } = {}) {
      const out = [];
      for (let i = 0; i < count; i++) {
        const x = rng.range(-halfW * 0.96, halfW * 0.96);
        const z = rng.range(-halfD * 0.96, halfD * 0.96);
        out.push({
          x,
          z,
          y: heightAt(x, z) + rng.range(minY, maxY),
          phase: rng.range(0, TAU),
          speed: rng.range(0.4, 1.1),
          drift: rng.range(0.15, 0.5),
        });
      }
      return out;
    },

    pathEdgeDistance,
    acceptance,
  };
}
