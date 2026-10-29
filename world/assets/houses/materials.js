import * as THREE from 'three';

/**
 * Shared 4-step cel-shaded MeshToonMaterial palette & view-space inverted-hull outlines.
 */

export const PALETTE = {
  ink: 0x2a1a12,
  stucco: 0xf4e7cc,
  timber: 0xb07a45,
  stone: 0xd9d4c6,
  roof: 0xe8542c,
  glass: 0x2f6fc4,
  shutter: 0x4b87c8,
  grass: 0x7cb35a,
};

export function makeGradientMap(steps = [0.36, 0.58, 0.8, 1.0]) {
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
 * View-space inverted-hull outline shader material.
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

export function addOutline(mesh, thickness = 0.02, color = PALETTE.ink) {
  if (!mesh || !mesh.geometry) return null;
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

  const glass = new THREE.MeshBasicMaterial({ map: tex.glass, toneMapped: false });
  glass.userData.noOutline = true;

  const glassDark = new THREE.MeshBasicMaterial({ color: 0x173a72, toneMapped: false });
  glassDark.userData.noOutline = true;

  const conservatoryGlass = new THREE.MeshBasicMaterial({
    color: 0x8fd0ff,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  conservatoryGlass.userData.noOutline = true;

  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffcf86, toneMapped: false });
  lampGlow.userData.noOutline = true;

  const emberHot = new THREE.MeshBasicMaterial({ color: 0xffd646, toneMapped: false });
  emberHot.userData.noOutline = true;

  const emberMid = new THREE.MeshBasicMaterial({ color: 0xff5a12, toneMapped: false });
  emberMid.userData.noOutline = true;

  const mats = {
    // Architecture
    stucco: toon({ map: tex.stucco }),
    stuccoWarm: toon({ map: tex.stucco, color: 0xf2e2c2 }),
    timber: toon({ map: tex.wood }),
    timberDark: toon({ map: tex.wood, color: 0xb9895f }),
    timberLight: toon({ map: tex.wood, color: 0xe3bd8d }),
    shutterBlue: toon({ map: tex.wood, color: 0x5c9be0 }),
    shutterBlueDark: toon({ map: tex.wood, color: 0x3f75b3 }),
    stone: toon({ map: tex.stone }),
    stoneTrim: toon({ map: tex.stoneLight }),
    stoneWarm: toon({ map: tex.stone, color: 0xeee6d6 }),
    stoneDark: toon({ map: tex.stone, color: 0xb8afa0 }),
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
    conservatoryGlass,
    interior: toon({ color: 0x241811 }),
    lampGlow,
    iron: toon({ color: 0x44454d }),
    ironLight: toon({ color: 0x626572 }),
    signGold: toon({ color: 0xf0be49 }),
    waterBlue: toon({ color: 0x3b88d4 }),

    // Botanical, soil, forge & props
    soil: toon({ color: 0x583c24 }),
    terracotta: toon({ color: 0xc85a32 }),
    coalDark: flat({ color: 0x281e1b }),
    emberHot,
    emberMid,
    leafDark: flat({ color: 0x468038 }),
    leafMid: flat({ color: 0x5fa248 }),
    leafLight: flat({ color: 0x80bf5a }),
    cabbageCore: flat({ color: 0xb7e082 }),
    flowerPink: flat({ color: 0xf48da8 }),
    flowerYellow: flat({ color: 0xf7d24c }),
    flowerWhite: flat({ color: 0xfdf6e4 }),
    flowerBlue: flat({ color: 0x7db0ea }),
    flowerPurple: flat({ color: 0xa67ee2 }),

    gradientMap,
    outline: (thickness = 0.02) => makeOutlineMaterial(thickness),
  };

  mats.stone.userData.outline = 0.012;
  mats.stoneTrim.userData.outline = 0.012;
  mats.stoneWarm.userData.outline = 0.012;
  mats.stoneDark.userData.outline = 0.012;
  mats.timber.userData.outline = 0.014;
  mats.timberDark.userData.outline = 0.014;
  mats.timberLight.userData.outline = 0.014;
  mats.shutterBlue.userData.outline = 0.012;
  mats.shutterBlueDark.userData.outline = 0.01;
  mats.stucco.userData.outline = 0.02;
  mats.stuccoWarm.userData.outline = 0.02;
  mats.roofBase.userData.outline = 0.02;
  mats.roofRidge.userData.outline = 0.012;
  mats.door.userData.outline = 0.014;
  mats.doorPlank.userData.outline = 0.014;
  mats.iron.userData.outline = 0.008;
  mats.ironLight.userData.outline = 0.008;
  mats.terracotta.userData.outline = 0.01;
  mats.soil.userData.outline = 0.008;
  mats.leafDark.userData.outline = 0.01;
  mats.leafMid.userData.outline = 0.01;
  mats.leafLight.userData.outline = 0.01;
  mats.cabbageCore.userData.outline = 0.008;
  mats.flowerPink.userData.outline = 0.007;
  mats.flowerYellow.userData.outline = 0.007;
  mats.flowerWhite.userData.outline = 0.007;
  mats.flowerBlue.userData.outline = 0.007;
  mats.flowerPurple.userData.outline = 0.007;

  return mats;
}
