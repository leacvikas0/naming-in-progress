// One wind system for every plant in the pack.
//
// The sway lives in the vertex shader and is driven by a single time uniform,
// so animating a 10,000-instance meadow costs one float write per frame — the
// same approach already proven in game/src/vale-scenery.js.
//
// Every vertex carries an `aSway` attribute (0 at the base, 1 at the tip) that
// the species author sets through mergeParts(). That is the only coupling
// between a plant and the wind.

import * as THREE from "three";

const SWAY_DECLARATIONS = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform float uSwayAmount;
uniform float uFlutter;
attribute float aSway;
`;

const BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  float phase = 0.0;
  #ifdef USE_INSTANCING
    phase = dot(instanceMatrix[3].xz, vec2(0.37, 0.29));
  #endif

  float t = uTime * uWindSpeed;

  // Two slow bands plus a fast micro-flutter. Three frequencies is enough to
  // stop the field looking like one sine wave breathing in unison.
  float gust =
      sin(t * 1.31 + phase) * 0.60
    + sin(t * 2.87 + phase * 1.73) * 0.26
    + sin(t * 0.61 + phase * 0.47) * 0.14;

  float flutter = sin(t * 6.3 * uFlutter + phase * 3.1) * 0.09 * uFlutter;

  float amount = aSway * uSwayAmount * uWindStrength;
  transformed.xz += uWindDir * (gust + flutter) * amount;
  transformed.y -= abs(gust) * amount * 0.10;
}
`;

export function createWind(config) {
  const w = config.recipe.wind;
  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: config.windDir.clone() },
    uWindStrength: { value: w.strength ?? 1 },
    uWindSpeed: { value: w.speed ?? 1 },
  };

  return {
    uniforms,
    update(time) {
      uniforms.uTime.value = time;
    },
    setStrength(v) {
      uniforms.uWindStrength.value = v;
    },
    setDirection(x, z) {
      const len = Math.hypot(x, z) || 1;
      uniforms.uWindDir.value.set(x / len, z / len);
    },
  };
}

/**
 * Inject the sway into a material's vertex shader.
 * @param {THREE.Material} material
 * @param {object} wind        from createWind()
 * @param {object} [opts]
 * @param {number} [opts.amount]  world-metres of lean at the tip
 * @param {number} [opts.flutter] extra high-frequency wobble
 */
export function applySway(material, wind, { amount = 0.16, flutter = 1 } = {}) {
  const local = {
    uSwayAmount: { value: amount },
    uFlutter: { value: flutter },
  };

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (previous) previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, wind.uniforms, local);
    shader.vertexShader = SWAY_DECLARATIONS + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      BEGIN_VERTEX
    );
  };
  material.customProgramCacheKey = () => "meadow-sway";
  material.userData.meadowSway = { amount, flutter };
  return material;
}
