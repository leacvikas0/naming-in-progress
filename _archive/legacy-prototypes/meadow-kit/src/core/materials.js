// Shared materials. Six independently built plants still read as one scene
// because they all come through this factory.
//
// The look Vikas picked: a SOFT TOON RAMP. Eight steps with wide transitions —
// enough banding to give a petal form, never enough to draw a hard line. It is
// the cheapest of the four softness techniques and the most controllable.

import * as THREE from "three";
import { applySway } from "./wind.js";
import { col } from "./palette.js";

export const MATERIAL_KINDS = ["petal", "leaf", "grass", "stem", "earth", "mote", "wing"];

const gradientCache = new Map();

/** Steps array -> a 1D NearestFilter DataTexture for MeshToonMaterial. */
export function makeGradientMap(steps) {
  const key = steps.join(",");
  let tex = gradientCache.get(key);
  if (tex) return tex;

  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    const c = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
    data[i * 4] = c;
    data[i * 4 + 1] = c;
    data[i * 4 + 2] = c;
    data[i * 4 + 3] = 255;
  });
  tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientCache.set(key, tex);
  return tex;
}

export function createMaterialFactory({ config, wind }) {
  const cache = new Map();
  const flowerSway = config.recipe.wind.flowerSway ?? 0.075;
  const grassSway = config.recipe.wind.grassSway ?? 0.17;
  const flutterBase = config.recipe.wind.flutter ?? 1.35;
  const steps = config.palette.look?.toonSteps ?? [0.16, 0.24, 0.34, 0.46, 0.6, 0.76, 0.91, 1.0];
  const gradientMap = makeGradientMap(steps);

  function toon(opts) {
    const m = new THREE.MeshToonMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      gradientMap,
      dithering: true,
    });
    return applySway(m, wind, {
      amount: opts.sway,
      flutter: opts.flutter,
    });
  }

  function build(kind, opts) {
    switch (kind) {
      case "petal":
        return toon({ sway: opts.sway ?? flowerSway, flutter: opts.flutter ?? flutterBase });

      case "leaf":
        return toon({ sway: opts.sway ?? flowerSway * 0.85, flutter: opts.flutter ?? flutterBase * 0.55 });

      case "grass":
        return toon({ sway: opts.sway ?? grassSway, flutter: opts.flutter ?? flutterBase * 0.8 });

      case "stem":
        return toon({ sway: opts.sway ?? flowerSway * 0.55, flutter: opts.flutter ?? flutterBase * 0.3 });

      case "earth":
        // Ground stays smooth: a toon ramp across a large plane bands badly.
        return new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.FrontSide,
          dithering: true,
        });

      case "mote":
        return new THREE.MeshBasicMaterial({
          color: opts.color != null ? col(opts.color) : col(0xfff6e0),
          transparent: true,
          opacity: opts.opacity ?? 0.5,
          depthWrite: false,
          blending: THREE.NormalBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        });

      case "wing":
        return toon({ sway: 0.12, flutter: 2.4 });

      default:
        throw new Error(`materials: unknown kind "${kind}"`);
    }
  }

  return {
    /** Cached material by kind + options. */
    get(kind, opts = {}) {
      if (!MATERIAL_KINDS.includes(kind)) {
        throw new Error(`materials: unknown kind "${kind}"`);
      }
      const key = `${kind}:${JSON.stringify(opts)}`;
      let m = cache.get(key);
      if (!m) {
        m = build(kind, opts);
        cache.set(key, m);
      }
      return m;
    },
    gradientMap,
    toonSteps: steps,
    dispose() {
      for (const m of cache.values()) m.dispose();
      cache.clear();
    },
  };
}
