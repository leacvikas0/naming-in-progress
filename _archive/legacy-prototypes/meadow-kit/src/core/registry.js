// Species registry. A plant is just an object with this shape:
//
//   {
//     id:       "daisy",            unique
//     label:    "Field daisy",
//     layer:    "flower",           "grass" | "flower" | "ground" | "fx"
//     material: "petal",            any kind from materials.js
//     density:  3.1,                instances per m² at quality "high"
//     scale:    [0.2, 0.32],        ACTUAL HEIGHT IN METRES
//     clump:    0.2,                0 = even spread, 1 = strong drifts
//     build(ctx) -> BufferGeometry  unit height, base at origin, +Y up
//   }
//
// build() receives { seed, config, materials, palette, species } and must be
// deterministic for a given seed.

const REQUIRED = ["id", "label", "layer", "material", "build"];

export function validateSpecies(spec) {
  if (!spec || typeof spec !== "object") throw new Error("species: expected an object");
  for (const key of REQUIRED) {
    if (spec[key] == null) throw new Error(`species "${spec.id || "?"}": missing "${key}"`);
  }
  if (typeof spec.build !== "function") {
    throw new Error(`species "${spec.id}": build must be a function`);
  }
  if (!Array.isArray(spec.scale) || spec.scale.length !== 2) {
    throw new Error(`species "${spec.id}": scale must be [minMetres, maxMetres]`);
  }
  if (spec.scale[0] <= 0 || spec.scale[1] < spec.scale[0]) {
    throw new Error(`species "${spec.id}": scale must be positive and ordered`);
  }
  return spec;
}

export function registerSpecies(spec) {
  validateSpecies(spec);
  return spec;
}

export function describeSpecies(spec) {
  return `${spec.id.padEnd(14)} ${String(spec.layer).padEnd(7)} ${String(spec.density).padStart(5)}/m²  ${spec.scale[0]}-${spec.scale[1]}m`;
}
