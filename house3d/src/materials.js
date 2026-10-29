import * as THREE from 'three';

/**
 * Shared palette + cel-shading materials.
 *
 * Everything is a MeshToonMaterial driven by one 4-step luminance ramp, so the
 * whole scene shares a single lighting language. Textures are hand-painted in
 * `textures.js`; geometry owns its own UV scale (1 uv unit = 1 texture tile),
 * which is why every map keeps `repeat = 1`.
 */

export const PALETTE = {
  ink: 0x2a1a12,
  stucco: 0xf4e7cc,
  timber: 0xb07a45,
  stone: 0xd9d4c6,
  roof: 0xe8542c,
  glass: 0x2f6fc4,
  grass: 0x7cb35a,
};

/** 4-step luminance ramp — the heart of the toon look. */
function makeGradientMap(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((s, i) => {
    const v = Math.round(THREE.MathUtils.clamp(s, 0, 1) * 255);
    data.set([v, v, v, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Inverted-hull outline. Vertex normals are pushed in *view* space so the line
 * keeps a roughly constant world thickness no matter how a mesh is scaled.
 */
export function makeOutlineMaterial(thickness = 0.02, color = PALETTE.ink) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz += n * uThickness;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: THREE.BackSide,
    fog: false,
  });
}

/**
 * Attach an inverted-hull outline to a mesh. The outline is a child, so it
 * inherits the mesh's transform and can be hidden scene-wide with
 * `userData.isOutline`.
 */
export function addOutline(mesh, thickness = 0.02, color = PALETTE.ink) {
  const outline = new THREE.Mesh(mesh.geometry, makeOutlineMaterial(thickness, color));
  outline.name = `${mesh.name || 'mesh'}-outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.userData.isOutline = true;
  mesh.add(outline);
  return outline;
}

export function createMaterials(tex) {
  const gradientMap = makeGradientMap([0.36, 0.58, 0.8, 1.0]);
  const toon = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap, ...opts });
  const flat = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap, flatShading: true, ...opts });

  // Flat surfaces that should not receive an inverted-hull outline.
  const glass = new THREE.MeshBasicMaterial({ map: tex.glass, toneMapped: false });
  glass.userData.noOutline = true;
  const glassDark = new THREE.MeshBasicMaterial({ color: 0x173a72, toneMapped: false });
  glassDark.userData.noOutline = true;
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffcf86, toneMapped: false });
  lampGlow.userData.noOutline = true;

  const mats = {
    // ---- architecture -----------------------------------------------------
    stucco: toon({ map: tex.stucco }),
    stuccoWarm: toon({ map: tex.stucco, color: 0xf2e2c2 }),
    timber: toon({ map: tex.wood }),
    timberDark: toon({ map: tex.wood, color: 0xb9895f }),
    timberLight: toon({ map: tex.wood, color: 0xe3bd8d }),
    stone: toon({ map: tex.stone }),
    stoneTrim: toon({ map: tex.stoneLight }),
    stoneWarm: toon({ map: tex.stone, color: 0xeee6d6 }),
    roof: toon({ map: tex.roof }),
    roofTiles: [
      toon({ color: 0xd94722 }),
      toon({ color: 0xe85a2c }),
      toon({ color: 0xc93c1c }),
      toon({ color: 0xf06a34 }),
      toon({ color: 0xd24a28 }),
      toon({ color: 0xdd5326 }),
    ],
    roofBase: toon({ color: 0x8e2f1c }),
    roofRidge: toon({ color: 0xd64526 }),
    roofSoffit: toon({ color: 0x7c4f2d }),
    door: toon({ map: tex.doorWood }),
    doorPlank: toon({ map: tex.doorWood, color: 0xc79a6e }),
    glass,
    glassDark,
    interior: toon({ color: 0x241811 }),
    lampGlow,
    iron: toon({ color: 0x44454d }),
    ironLight: toon({ color: 0x5c5e68 }),

    // ---- landscape --------------------------------------------------------
    grass: toon({ map: tex.grass }),
    path: toon({ map: tex.path }),
    dirt: toon({ color: 0x9b7a54 }),
    bark: toon({ map: tex.bark }),
    leafA: flat({ color: 0x5f9e4a }),
    leafB: flat({ color: 0x79b85a }),
    leafC: flat({ color: 0x4c8740 }),
    bushA: flat({ color: 0x6aa84f }),
    bushB: flat({ color: 0x81b95d }),
    flowerWhite: flat({ color: 0xfdf6e3 }),
    flowerPink: flat({ color: 0xf2a7b8 }),
    flowerYellow: flat({ color: 0xf6d35c }),
    flowerBlue: flat({ color: 0x8fb8e8 }),
    cloud: toon({ color: 0xffffff, emissive: 0xb9d8ec, emissiveIntensity: 0.32 }),
    hillNear: flat({ color: 0x87b26a }),
    hillMid: flat({ color: 0x93bdb0 }),
    hillFar: flat({ color: 0xa9cbc9 }),

    // ---- shared helpers ---------------------------------------------------
    gradientMap,
    outline: (thickness = 0.02) => makeOutlineMaterial(thickness),
  };

  // Per-material inverted-hull line weight: stone wants a whisper, stucco a
  // confident comic line. `mergeStatic` reads this when it rebuilds the house.
  mats.stone.userData.outline = 0.01;
  mats.stoneTrim.userData.outline = 0.01;
  mats.stoneWarm.userData.outline = 0.01;
  mats.timber.userData.outline = 0.014;
  mats.timberDark.userData.outline = 0.014;
  mats.stucco.userData.outline = 0.02;
  mats.stuccoWarm.userData.outline = 0.02;
  mats.roofBase.userData.outline = 0.02;
  mats.roofRidge.userData.outline = 0.012;
  mats.door.userData.outline = 0.014;
  mats.iron.userData.outline = 0.008;

  return mats;
}
