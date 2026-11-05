import * as THREE from 'three';

/**
 * Shared 4-step cel-shaded MeshToonMaterial palette & view-space inverted-hull outlines.
 */

export const PALETTE = {
  ink: 0x342318,
  stucco: 0xefe2c6,
  timber: 0x9c6838,
  stone: 0xd4cec0,
  roof: 0xc24928,
  glass: 0x2f6fc4,
  shutter: 0x467cb8,
  grass: 0x72a850,
};

export const ROOF_TILE_HEX = [
  0xb84222,
  0xc64e2c,
  0xa4361c,
  0xcf5632,
  0xb23e24,
  0xc04926,
];

export function makeGradientMap(steps = [0.32, 0.56, 0.80, 1.0]) {
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
 * Supports per-vertex `aOutline` thickness when static hulls are merged.
 */
export function makeOutlineMaterial(thickness = 0.012, color = PALETTE.ink) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      attribute float aOutline;
      void main() {
        float t = aOutline > 0.0 ? aOutline : uThickness;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz += n * t;
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

export function addOutline(mesh, thickness = 0.012, color = PALETTE.ink) {
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
  const gradientMap = makeGradientMap([0.32, 0.56, 0.80, 1.0]);
  const toon = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap, ...opts });
  const flat = (opts = {}) => new THREE.MeshToonMaterial({ gradientMap, ...opts });

  const glass = toon({
    map: tex.glass,
    color: 0xffffff,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.0,
  });
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

  const attachHouseChiaroscuro = (mat, isRoofOrSolid = false) => {
    mat.customProgramCacheKey = () => (isRoofOrSolid ? 'house-roof-v2' : 'house-wall-v2');
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vHouseWorldPos;
          varying vec3 vHouseWorldNormal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 hwPos = modelMatrix * vec4(position, 1.0);
          vHouseWorldPos = hwPos.xyz;
          vHouseWorldNormal = normalize(mat3(modelMatrix) * normal);`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vHouseWorldPos;
          varying vec3 vHouseWorldNormal;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 hwp = vHouseWorldPos;
            vec3 hwn = normalize(vHouseWorldNormal);
            vec3 sunD = normalize(vec3(-0.62, 0.72, -0.31));
            float ndl = dot(hwn, sunD) * 0.5 + 0.5;
            float isWall = 1.0 - smoothstep(0.45, 0.75, abs(hwn.y));
            // Crisp directional wall chiaroscuro (sunlit West/North faces warm, shaded East/South faces cool slate-umber)
            vec3 dirTint = mix(vec3(0.76, 0.78, 0.88), vec3(1.04, 1.02, 0.98), smoothstep(0.32, 0.64, ndl));
            diffuseColor.rgb *= mix(vec3(1.0), dirTint, isWall * 0.85);
            ${
              isRoofOrSolid
                ? ''
                : `// Ground-plinth contact AO & crisp roof-eave overhang shadow band under 1st/2nd-story eaves
            float groundAO = mix(0.74, 1.0, smoothstep(0.0, 0.68, hwp.y));
            float eaveBand1 = smoothstep(2.65, 3.25, hwp.y) * (1.0 - smoothstep(3.38, 3.65, hwp.y)) * isWall;
            float eaveBand2 = smoothstep(4.75, 5.35, hwp.y) * (1.0 - smoothstep(5.48, 5.75, hwp.y)) * isWall;
            float eaveShd = max(eaveBand1, eaveBand2) * mix(0.42, 0.24, smoothstep(0.4, 0.7, ndl));
            diffuseColor.rgb *= groundAO;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.56, 0.58, 0.70), eaveShd);`
            }
          }`
        );
    };
    return mat;
  };

  // Consolidated vertex-color bucket materials so an entire building (or 5-building village)
  // batches into <= 12 draw calls total.
  const buckets = {
    stucco: attachHouseChiaroscuro(toon({ map: tex.stucco, color: 0xffffff, vertexColors: true }), false),
    stone: attachHouseChiaroscuro(toon({ map: tex.stone, color: 0xffffff, vertexColors: true }), false),
    stoneLight: attachHouseChiaroscuro(toon({ map: tex.stoneLight, color: 0xffffff, vertexColors: true }), false),
    wood: attachHouseChiaroscuro(toon({ map: tex.wood, color: 0xffffff, vertexColors: true }), false),
    doorWood: attachHouseChiaroscuro(toon({ map: tex.doorWood, color: 0xffffff, vertexColors: true }), false),
    solidToon: attachHouseChiaroscuro(toon({ color: 0xffffff, vertexColors: true }), true),
    glass,
    conservatoryGlass,
    solidBasic: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }),
  };
  for (const bMat of Object.values(buckets)) {
    bMat.userData.bucketMat = bMat;
  }

  const bindBucket = (mat, bucketMat) => {
    mat.userData.bucketMat = bucketMat;
    return mat;
  };

  const sharedOutline = makeOutlineMaterial(0.018, PALETTE.ink);
  const roofTileInstanced = toon({ color: 0xffffff });
  const roofTileColors = ROOF_TILE_HEX.map((hex) => new THREE.Color(hex));

  const mats = {
    // Architecture
    stucco: bindBucket(toon({ map: tex.stucco }), buckets.stucco),
    stuccoWarm: bindBucket(toon({ map: tex.stucco, color: 0xf2e2c2 }), buckets.stucco),
    timber: bindBucket(toon({ map: tex.wood }), buckets.wood),
    timberDark: bindBucket(toon({ map: tex.wood, color: 0xb9895f }), buckets.wood),
    timberLight: bindBucket(toon({ map: tex.wood, color: 0xe3bd8d }), buckets.wood),
    sailCanvas: bindBucket(toon({ map: tex.stucco, color: 0xfffdf6 }), buckets.stucco),
    shutterBlue: bindBucket(toon({ color: 0x4b87c8 }), buckets.solidToon),
    shutterBlueDark: bindBucket(toon({ color: 0x3568a2 }), buckets.solidToon),
    stone: bindBucket(toon({ map: tex.stone }), buckets.stone),
    stoneTrim: bindBucket(toon({ map: tex.stoneLight }), buckets.stoneLight),
    stoneWarm: bindBucket(toon({ map: tex.stone, color: 0xeee6d6 }), buckets.stone),
    stoneDark: bindBucket(toon({ map: tex.stone, color: 0xb8afa0 }), buckets.stone),
    roof: bindBucket(toon({ map: tex.roof }), buckets.solidToon),
    roofTiles: ROOF_TILE_HEX.map((color) => toon({ color })),
    roofTileInstanced,
    roofTileColors,
    roofBase: bindBucket(toon({ color: 0x8e2f1c }), buckets.solidToon),
    roofRidge: bindBucket(toon({ color: 0xd64526 }), buckets.solidToon),
    roofSoffit: bindBucket(toon({ color: 0x7c4f2d }), buckets.solidToon),
    door: bindBucket(toon({ map: tex.doorWood }), buckets.doorWood),
    doorPlank: bindBucket(toon({ map: tex.doorWood, color: 0xc79a6e }), buckets.doorWood),
    glass,
    glassDark: bindBucket(glassDark, buckets.solidBasic),
    conservatoryGlass,
    interior: bindBucket(toon({ color: 0x241811 }), buckets.solidToon),
    lampGlow: bindBucket(lampGlow, buckets.solidBasic),
    iron: bindBucket(toon({ color: 0x44454d }), buckets.solidToon),
    ironLight: bindBucket(toon({ color: 0x626572 }), buckets.solidToon),
    signGold: bindBucket(toon({ color: 0xf0be49 }), buckets.solidToon),
    waterBlue: bindBucket(toon({ color: 0x3b88d4 }), buckets.solidToon),

    // Botanical, soil, forge & props
    soil: bindBucket(toon({ color: 0x583c24 }), buckets.solidToon),
    terracotta: bindBucket(toon({ color: 0xc85a32 }), buckets.solidToon),
    coalDark: bindBucket(flat({ color: 0x281e1b }), buckets.solidToon),
    emberHot: bindBucket(emberHot, buckets.solidBasic),
    emberMid: bindBucket(emberMid, buckets.solidBasic),
    leafDark: bindBucket(flat({ color: 0x468038 }), buckets.solidToon),
    leafMid: bindBucket(flat({ color: 0x5fa248 }), buckets.solidToon),
    leafLight: bindBucket(flat({ color: 0x80bf5a }), buckets.solidToon),
    cabbageCore: bindBucket(flat({ color: 0xb7e082 }), buckets.solidToon),
    flowerPink: bindBucket(flat({ color: 0xf48da8 }), buckets.solidToon),
    flowerYellow: bindBucket(flat({ color: 0xf7d24c }), buckets.solidToon),
    flowerWhite: bindBucket(flat({ color: 0xfdf6e4 }), buckets.solidToon),
    flowerBlue: bindBucket(flat({ color: 0x7db0ea }), buckets.solidToon),
    flowerPurple: bindBucket(flat({ color: 0xa67ee2 }), buckets.solidToon),

    buckets,
    sharedOutline,
    gradientMap,
    outline: (thickness = 0.018) => makeOutlineMaterial(thickness),
  };

  return mats;
}
