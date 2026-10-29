// Public surface of the petal system.
//
// Everything is tree-shakeable ESM. `three` is a peer dependency, so the
// package never bundles its own copy.

export { PetalSystem } from './PetalSystem.js';

export {
  PETAL_TYPES,
  registerPetalType,
  getPetalType,
  getPetalTypes
} from './petalTypes.js';

export {
  PALETTES,
  createPetalMaterial,
  createGlowTexture
} from './materials.js';

export {
  createGinkgoGeometry,
  createMapleGeometry,
  createBlossomGeometry
} from './geometry.js';

export { createLightRig } from './lighting.js';

export { BokehField, HaloField } from './bokeh.js';

export { createRng, range, clamp01, smoothstep } from './rng.js';
