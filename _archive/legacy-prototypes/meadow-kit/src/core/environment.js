// Scene environment: sun, sky fill, fog, background, tone mapping.
//
// Optional — the plants work under any lighting. But this is the rig the
// meadow was art-directed against, so it is what makes the palette land.

import * as THREE from "three";
import { lightCol } from "./palette.js";

export function createEnvironment(config) {
  const L = config.palette.light;

  const el = THREE.MathUtils.degToRad(L.sunElevation);
  const az = THREE.MathUtils.degToRad(L.sunAzimuth);
  const dir = new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az)
  ).normalize();

  const sun = new THREE.DirectionalLight(lightCol("sun"), L.sunIntensity);
  sun.position.copy(dir).multiplyScalar(24);
  sun.name = "meadow:sun";

  const hemi = new THREE.HemisphereLight(lightCol("sky"), lightCol("groundBounce"), L.hemiIntensity);
  hemi.name = "meadow:hemi";

  const ambient = new THREE.AmbientLight(lightCol("ambient"), L.ambientIntensity);
  ambient.name = "meadow:ambient";

  const fog = new THREE.Fog(lightCol("fog"), L.fogNear, L.fogFar);
  const background = lightCol("background");

  return {
    sun,
    hemi,
    ambient,
    fog,
    background,
    direction: dir,
    /** Add the lights to a scene and adopt the background/fog. */
    apply(scene) {
      scene.add(sun, hemi, ambient);
      scene.background = background;
      scene.fog = fog;
      return scene;
    },
    /** Configure a renderer to match the art direction. */
    configureRenderer(renderer) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = L.exposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return renderer;
    },
    dispose() {
      sun.dispose?.();
      hemi.dispose?.();
      ambient.dispose?.();
    },
  };
}
