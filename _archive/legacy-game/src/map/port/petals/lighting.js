import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Optional light rig.
//
// The petal system deliberately does NOT own lighting - a game already has its
// own. But the petals were art-directed against this rig, so it ships as a
// drop-in group for demos and prototypes.
//
// Usage:
//   const lights = createLightRig();
//   scene.add(lights);
// ---------------------------------------------------------------------------
export function createLightRig(options = {}) {
  const {
    hemisphere = 0.42,
    ambient = 0.16,
    sun = 1.30,
    rim = 0.50,
    fill = 0.30,
    depth = 2.2,
    skyColor = 0xfff6e2,
    groundColor = 0xd98a18,
    sunColor = 0xfff1a8,
    rimColor = 0xffcb47,
    fillColor = 0xfff6f0,
    depthColor = 0xffd9a0
  } = options;

  const group = new THREE.Group();
  group.name = 'PetalLightRig';

  const hemi = new THREE.HemisphereLight(skyColor, groundColor, hemisphere);
  hemi.position.set(0, 35, 0);
  group.add(hemi);

  const amb = new THREE.AmbientLight(0xfff0e0, ambient);
  group.add(amb);

  // Warm sun from the depth of the shot
  const sunLight = new THREE.DirectionalLight(sunColor, sun);
  sunLight.position.set(0, 18, -110);
  group.add(sunLight);

  // Warm rim from the right
  const rimLight = new THREE.DirectionalLight(rimColor, rim);
  rimLight.position.set(8, 6, 22);
  group.add(rimLight);

  // Neutral fill from camera-left so pinks and reds keep their hue
  const fillLight = new THREE.DirectionalLight(fillColor, fill);
  fillLight.position.set(-6, 4, 18);
  group.add(fillLight);

  // Glow hanging in the depth of the shot
  const depthGlow = new THREE.PointLight(depthColor, depth, 140, 1.6);
  depthGlow.position.set(0, 5, -45);
  group.add(depthGlow);

  return group;
}
