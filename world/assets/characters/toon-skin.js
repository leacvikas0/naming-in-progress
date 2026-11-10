// ============================================================================
// world/assets/characters/toon-skin.js
//
// Stage 3 Pass 2: Cel-Shaded Toon Skinning, Smooth Normal Welding &
// Unified SkinnedMesh + Bone-Weighted Accessory/Weapon Merger
//
// Architectural upgrades in Pass 2:
// - Consolidates each character's 6-9 skinned body parts, rigid bone-parented
//   accessories (Helmet, Hat, Hood, Cape), and socketed weapons into:
//     1 single unified `THREE.SkinnedMesh` (body + accessories + weapons + eyes)
//     1 single unified outline `THREE.SkinnedMesh`
//   reducing character draw calls from 20 draws/character down to 2 draws/character!
// - Eliminates facial outline bleed-through (no vertex clip-space stretching;
//   front eye/nose triangles are filtered on CPU + biased safely in view-space -Z).
// - Eliminates low-poly facet banding on curved helmets/hats (`receiveShadow = false`
//   + 62-deg smooth normal welding on `normal`, while preserving 90-deg weapon edges).
// - Eliminates white rim-light halo on dark hair (`Mage` hair cell lifted to
//   rich dark plum-espresso + luminance-weighted Fresnel rim).
// ============================================================================

import * as THREE from 'three';

export const OUTLINE_INK_HEX = 0x1d1422;
export const CHARACTER_OUTLINE_THICKNESS = 0.012;
export const HEAD_OUTLINE_THICKNESS = 0.0095;
export const WEAPON_OUTLINE_THICKNESS = 0.009;
export const SKELETON_OUTLINE_THICKNESS = 0.009;

export const ROLE_STYLE_PRESETS = {
  knight: {
    rimColor: 0xb8e2ff,
    rimStrength: 0.20,
    saturationBoost: 1.14,
    valueBoost: 1.03,
    // Match `docs/refs/ref-target-trees.png`: vivid crimson cape/shield & crisp slate steel
    cellOverrides: {
      r1c0: [226, 28, 42], // Heroic crimson cape & plume
      r2c2: [212, 32, 46], // Crimson accent
      r1c5: [212, 32, 46], // Royal crimson shield emblem & sword grip accent
      r0c3: [122, 134, 145], // Crisp slate-steel helmet & armor
      r0c4: [72, 80, 90], // Dark steel visor trim
    },
  },
  mage: {
    rimColor: 0xf2c8ff,
    rimStrength: 0.22,
    saturationBoost: 1.18,
    valueBoost: 1.05,
    cellOverrides: {
      r0c1: [52, 38, 68], // Rich dark plum-espresso hair so hair bun shades cleanly without black void
    },
  },
  barbarian: {
    rimColor: 0xffd09b,
    rimStrength: 0.20,
    saturationBoost: 1.12,
    valueBoost: 1.03,
  },
  rogue: {
    rimColor: 0xa8f0d4,
    rimStrength: 0.20,
    saturationBoost: 1.12,
    valueBoost: 1.03,
  },
  rogue_hooded: {
    rimColor: 0xa8f0d4,
    rimStrength: 0.20,
    saturationBoost: 1.12,
    valueBoost: 1.03,
  },
  skeleton: {
    rimColor: 0x9cb8e8,
    rimStrength: 0.16,
    saturationBoost: 1.08,
    valueBoost: 1.02,
    cellOverrides: {
      r1c2: [124, 132, 142], // Skeleton dagger/blade inner steel
      r1c6: [88, 72, 62], // Skeleton dagger/weapon leather grip
    },
  },
};

let sharedToonGradient = null;
const flattenedTextureCache = new WeakMap();

/**
 * Builds the 4-band NearestFilter DataTexture toon gradient map for characters.
 */
export function makeCharacterToonGradient(steps = [0.46, 0.68, 0.86, 1.0]) {
  const data = new Uint8Array(steps.length * 4);
  for (let i = 0; i < steps.length; i++) {
    const v = Math.round(THREE.MathUtils.clamp(steps[i], 0, 1) * 255);
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function getSharedCharacterToonGradient() {
  if (!sharedToonGradient) {
    sharedToonGradient = makeCharacterToonGradient();
  }
  return sharedToonGradient;
}

function boostColorSaturationAndValue(r, g, b, satBoost = 1.1, valBoost = 1.02) {
  const col = new THREE.Color(r / 255, g / 255, b / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  hsl.s = THREE.MathUtils.clamp(hsl.s * satBoost, 0, 1);
  hsl.l = THREE.MathUtils.clamp(hsl.l * valBoost, 0, 1);
  col.setHSL(hsl.h, hsl.s, hsl.l);
  return [
    Math.round(THREE.MathUtils.clamp(col.r * 255, 0, 255)),
    Math.round(THREE.MathUtils.clamp(col.g * 255, 0, 255)),
    Math.round(THREE.MathUtils.clamp(col.b * 255, 0, 255)),
  ];
}

/**
 * Deterministically flattens a KayKit 8 columns x 4 rows gradient atlas texture
 * into 32 solid cel-shaded material zones.
 */
export function flattenPaletteTexture(sourceTexture, options = {}) {
  if (!sourceTexture || !sourceTexture.image) return sourceTexture;

  const overrideKeys = options.cellOverrides ? Object.keys(options.cellOverrides).sort().join(',') : '';
  const roleKey = `${(options.role || 'knight').toLowerCase()}${overrideKeys ? ':' + overrideKeys : ''}`;
  const baseRole = (options.role || 'knight').toLowerCase();
  const preset = ROLE_STYLE_PRESETS[baseRole] || ROLE_STYLE_PRESETS.knight;
  const satBoost = options.saturationBoost ?? preset.saturationBoost ?? 1.1;
  const valBoost = options.valueBoost ?? preset.valueBoost ?? 1.02;
  const cellOverrides = {
    ...(preset.cellOverrides || {}),
    ...(options.cellOverrides || {}),
  };

  let roleMap = flattenedTextureCache.get(sourceTexture);
  if (roleMap && roleMap.has(roleKey) && !options.forceNew) {
    return roleMap.get(roleKey);
  }

  const img = sourceTexture.image;
  const width = img.width || img.naturalWidth || 1024;
  const height = img.height || img.naturalHeight || 1024;

  if (typeof document === 'undefined') {
    return sourceTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const srcData = ctx.getImageData(0, 0, width, height).data;
  const cols = 8;
  const rows = 4;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);

  const cellSummary = {};

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellKey = `r${row}c${col}`;
      const x0 = col * cellW;
      const y0 = row * cellH;

      let rgb = cellOverrides[cellKey];
      if (!rgb) {
        const sxStart = x0 + Math.floor(cellW * 0.30);
        const sxEnd = x0 + Math.floor(cellW * 0.70);
        const syStart = y0 + Math.floor(cellH * 0.22);
        const syEnd = y0 + Math.floor(cellH * 0.40);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let y = syStart; y < syEnd; y += 2) {
          for (let x = sxStart; x < sxEnd; x += 2) {
            const idx = (y * width + x) * 4;
            rSum += srcData[idx + 0];
            gSum += srcData[idx + 1];
            bSum += srcData[idx + 2];
            count++;
          }
        }

        const rAvg = count > 0 ? rSum / count : 180;
        const gAvg = count > 0 ? gSum / count : 180;
        const bAvg = count > 0 ? bSum / count : 180;

        if (cellKey === 'r0c2') {
          rgb = [Math.round(rAvg), Math.round(gAvg), Math.round(bAvg)];
        } else if (cellKey === 'r0c0') {
          rgb = boostColorSaturationAndValue(rAvg, gAvg, bAvg, 1.05, 1.04);
        } else {
          rgb = boostColorSaturationAndValue(rAvg, gAvg, bAvg, satBoost, valBoost);
        }
      }

      cellSummary[cellKey] = rgb;
      ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      ctx.fillRect(x0, y0, cellW, cellH);
    }
  }

  const flatTex = new THREE.CanvasTexture(canvas);
  flatTex.name = `${sourceTexture.name || 'kaykit'}-flat-${roleKey}`;
  flatTex.colorSpace = THREE.SRGBColorSpace;
  flatTex.flipY = sourceTexture.flipY;
  flatTex.wrapS = sourceTexture.wrapS;
  flatTex.wrapT = sourceTexture.wrapT;
  flatTex.minFilter = THREE.NearestFilter;
  flatTex.magFilter = THREE.NearestFilter;
  flatTex.generateMipmaps = false;
  flatTex.userData = {
    isFlattenedPalette: true,
    gridCols: cols,
    gridRows: rows,
    roleKey: baseRole,
    cellSummary,
  };
  flatTex.needsUpdate = true;

  if (!roleMap) {
    roleMap = new Map();
    flattenedTextureCache.set(sourceTexture, roleMap);
  }
  roleMap.set(roleKey, flatTex);
  return flatTex;
}

/**
 * Computes welded smooth normals (`aOutlineNormal`) across hard-edged low-poly
 * vertices so inverted-hull extrusion expands cleanly without splitting at facet seams,
 * while avoiding cancellation between opposite sides of thin shells.
 */
export function ensureSmoothOutlineNormals(geometry) {
  if (!geometry || geometry.attributes.aOutlineNormal) return geometry;
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  if (!posAttr || !normAttr) return geometry;

  const count = posAttr.count;
  const buckets = new Map();

  for (let i = 0; i < count; i++) {
    const qx = Math.round(posAttr.getX(i) * 2000);
    const qy = Math.round(posAttr.getY(i) * 2000);
    const qz = Math.round(posAttr.getZ(i) * 2000);
    const key = `${qx},${qy},${qz}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push([normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)]);
  }

  const smoothArray = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const qx = Math.round(posAttr.getX(i) * 2000);
    const qy = Math.round(posAttr.getY(i) * 2000);
    const qz = Math.round(posAttr.getZ(i) * 2000);
    const key = `${qx},${qy},${qz}`;
    const list = buckets.get(key);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let j = 0; j < list.length; j++) {
      const other = list[j];
      const dot = nx * other[0] + ny * other[1] + nz * other[2];
      // Weld hard edges (up to ~110 deg) without canceling opposite faces (-180 deg)
      if (dot > -0.35) {
        sx += other[0];
        sy += other[1];
        sz += other[2];
      }
    }
    const len = Math.hypot(sx, sy, sz);
    if (len > 1e-4) {
      smoothArray[i * 3 + 0] = sx / len;
      smoothArray[i * 3 + 1] = sy / len;
      smoothArray[i * 3 + 2] = sz / len;
    } else {
      smoothArray[i * 3 + 0] = nx;
      smoothArray[i * 3 + 1] = ny;
      smoothArray[i * 3 + 2] = nz;
    }
  }

  geometry.setAttribute('aOutlineNormal', new THREE.BufferAttribute(smoothArray, 3));
  return geometry;
}

/**
 * Smooths vertex shading normals across curved low-poly surfaces (helmets, hats,
 * heads, limbs, capes) where adjacent faces meet at `< ~62 deg` (`cosThreshold = 0.46`),
 * while preserving crisp 90-degree edges on swords, shields, and spellbooks.
 */
export function computeSmoothShadingNormals(geometry, cosThreshold = 0.46) {
  if (!geometry || geometry.userData?.hasSmoothShadingNormals) return geometry;
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  if (!posAttr || !normAttr) return geometry;

  const count = posAttr.count;
  const buckets = new Map();

  for (let i = 0; i < count; i++) {
    const qx = Math.round(posAttr.getX(i) * 2000);
    const qy = Math.round(posAttr.getY(i) * 2000);
    const qz = Math.round(posAttr.getZ(i) * 2000);
    const key = `${qx},${qy},${qz}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push([normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)]);
  }

  const shadedArray = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const qx = Math.round(posAttr.getX(i) * 2000);
    const qy = Math.round(posAttr.getY(i) * 2000);
    const qz = Math.round(posAttr.getZ(i) * 2000);
    const key = `${qx},${qy},${qz}`;
    const list = buckets.get(key);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let j = 0; j < list.length; j++) {
      const other = list[j];
      const dot = nx * other[0] + ny * other[1] + nz * other[2];
      if (dot >= cosThreshold) {
        sx += other[0];
        sy += other[1];
        sz += other[2];
      }
    }
    const len = Math.hypot(sx, sy, sz);
    if (len > 1e-4) {
      shadedArray[i * 3 + 0] = sx / len;
      shadedArray[i * 3 + 1] = sy / len;
      shadedArray[i * 3 + 2] = sz / len;
    } else {
      shadedArray[i * 3 + 0] = nx;
      shadedArray[i * 3 + 1] = ny;
      shadedArray[i * 3 + 2] = nz;
    }
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(shadedArray, 3));
  geometry.userData.hasSmoothShadingNormals = true;
  return geometry;
}

/**
 * Creates a view-space inverted-hull outline material that supports both
 * unified per-vertex `aOutlineParams` (`[thickness, depthBias, sheetMode]`)
 * and single-mesh uniforms.
 */
export function makeSkinnedOutlineMaterial({
  thickness = CHARACTER_OUTLINE_THICKNESS,
  color = OUTLINE_INK_HEX,
  depthBias = 0.0035,
  suppressEyeUv = false,
  sheetMode = false,
  useVertexParams = false,
} = {}) {
  const verdictUniforms = {
    uGroundClipY: { value: -9999.0 },
    uDissolveProgress: { value: 0.0 },
    uDissolveBaseY: { value: 0.0 },
    uMonochromeOverride: { value: 0.0 },
  };

  const mat = new THREE.ShaderMaterial({
    name: 'CharacterSkinnedOutlineMaterial',
    uniforms: {
      uOutlineThickness: { value: thickness },
      uOutlineColor: { value: new THREE.Color(color) },
      uOutlineDepthBias: { value: depthBias },
      uSuppressEyeUv: { value: suppressEyeUv ? 1.0 : 0.0 },
      uSheetMode: { value: sheetMode ? 1.0 : 0.0 },
      uUseVertexParams: { value: useVertexParams ? 1.0 : 0.0 },
      uGroundClipY: verdictUniforms.uGroundClipY,
      uDissolveProgress: verdictUniforms.uDissolveProgress,
      uDissolveBaseY: verdictUniforms.uDissolveBaseY,
      uMonochromeOverride: verdictUniforms.uMonochromeOverride,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <uv_pars_vertex>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>

      attribute vec3 aOutlineNormal;
      attribute vec3 aOutlineParams;
      uniform float uOutlineThickness;
      uniform float uOutlineDepthBias;
      uniform float uSuppressEyeUv;
      uniform float uSheetMode;
      uniform float uUseVertexParams;

      varying vec3 vVerdictWorldPos;
      varying float vVerdictScreenX;

      void main() {
        #include <uv_vertex>
        vec3 objectNormal = length(aOutlineNormal) > 0.001 ? aOutlineNormal : vec3(normal);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>

        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>

        vVerdictWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 charRootWorld = modelMatrix[3].xyz;
        vec3 camRightWorld = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vVerdictScreenX = dot(vVerdictWorldPos - charRootWorld, camRightWorld);

        float t = uUseVertexParams > 0.5 ? aOutlineParams.x : uOutlineThickness;
        float zBias = uUseVertexParams > 0.5 ? aOutlineParams.y : uOutlineDepthBias;
        float sheet = uUseVertexParams > 0.5 ? aOutlineParams.z : uSheetMode;

        if (uUseVertexParams < 0.5 && uSuppressEyeUv > 0.5) {
          bool isEyeFeature = (uv.x >= 0.24 && uv.x <= 0.38 && uv.y <= 0.26 && position.z > 0.15);
          bool isCenterNose = (abs(position.x) < 0.16 && position.z > 0.42 && position.y > 1.42 && position.y < 1.80);
          if (isEyeFeature || isCenterNose) {
            t = 0.0;
            zBias = 0.03;
          }
        }

        if (sheet > 0.5) {
          // Single-sheet cape mesh: objectNormal carries the skinned local silhouette
          // expansion vector (1.45*x, 1.25*(y+0.55), 0) in Rig space, and view-space -Z
          // pushes the outline behind the cape from both front and rear cameras.
          vec4 mvPosition;
          if (uUseVertexParams > 0.5) {
            mvPosition = modelViewMatrix * vec4(transformed + objectNormal * t, 1.0);
          } else {
            transformed.x *= (1.0 + t * 1.45);
            transformed.y = (transformed.y + 0.55) * (1.0 + t * 1.25) - 0.55;
            mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          }
          mvPosition.z -= (t * 0.95 + zBias);
          gl_Position = projectionMatrix * mvPosition;
        } else {
          // Do NOT use <defaultnormal_vertex> because FLIP_SIDED (BackSide) negates transformedNormal!
          vec3 outwardViewNormal = normalize(normalMatrix * objectNormal);
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          mvPosition.xyz += outwardViewNormal * t;
          mvPosition.z -= zBias;
          gl_Position = projectionMatrix * mvPosition;
        }
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uOutlineColor;
      uniform float uGroundClipY;
      uniform float uDissolveProgress;
      uniform float uDissolveBaseY;
      uniform float uMonochromeOverride;
      varying vec3 vVerdictWorldPos;
      varying float vVerdictScreenX;

      float hashVerdict31(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float smoothNoiseVerdict31(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(hashVerdict31(i + vec3(0, 0, 0)), hashVerdict31(i + vec3(1, 0, 0)), u.x),
            mix(hashVerdict31(i + vec3(0, 1, 0)), hashVerdict31(i + vec3(1, 1, 0)), u.x),
            u.y
          ),
          mix(
            mix(hashVerdict31(i + vec3(0, 0, 1)), hashVerdict31(i + vec3(1, 0, 1)), u.x),
            mix(hashVerdict31(i + vec3(0, 1, 1)), hashVerdict31(i + vec3(1, 1, 1)), u.x),
            u.y
          ),
          u.z
        );
      }

      void main() {
        if (vVerdictWorldPos.y < uGroundClipY) discard;

        vec3 outCol = uOutlineColor;
        if (uDissolveProgress > 0.001) {
          float hNorm = clamp((vVerdictWorldPos.y - uDissolveBaseY) / 1.72, 0.0, 1.0);
          float leftToRight = clamp((vVerdictScreenX + 0.82) / 1.54, 0.0, 1.0);
          vec3 samplePos = vec3(vVerdictScreenX * 2.4, vVerdictWorldPos.y * 5.2, vVerdictWorldPos.z * 3.2);
          float n1 = smoothNoiseVerdict31(samplePos);
          float n2 = smoothNoiseVerdict31(samplePos * 2.3 + vec3(3.7, 1.9, 5.1));
          float noiseVal = n1 * 0.65 + n2 * 0.35;
          float erodeVal = leftToRight * 0.78 + (1.0 - hNorm) * 0.08 + noiseVal * 0.14;
          if (erodeVal < uDissolveProgress * 1.06) discard;
          if (erodeVal < uDissolveProgress * 1.06 + 0.14) {
            outCol = vec3(0.78, 0.008, 0.036);
          } else {
            float l = dot(outCol, vec3(0.2126, 0.7152, 0.0722));
            outCol = vec3(l);
          }
        } else if (uMonochromeOverride > 0.001) {
          float l = dot(outCol, vec3(0.2126, 0.7152, 0.0722));
          outCol = mix(outCol, vec3(l), clamp(uMonochromeOverride, 0.0, 1.0));
        }
        gl_FragColor = vec4(outCol, 1.0);
      }
    `,
    side: sheetMode && !useVertexParams ? THREE.DoubleSide : THREE.BackSide,
    depthWrite: true,
    transparent: false,
    fog: false,
  });

  mat.defines = { USE_UV: '' };
  mat.userData.isOutlineMaterial = true;
  mat.userData.verdictUniforms = verdictUniforms;
  return mat;
}

/**
 * Creates a synchronized inverted-hull outline mesh (`THREE.SkinnedMesh` or `THREE.Mesh`)
 * for a single character or weapon mesh when used standalone.
 */
export function createSkinnedOutlineMesh(mesh, options = {}) {
  if (!mesh || !mesh.geometry || mesh.userData?.isOutline) return null;

  const name = mesh.name || '';
  if (/Eyes/i.test(name) || mesh.material?.name === 'Glow') {
    return null;
  }

  for (let i = mesh.children.length - 1; i >= 0; i--) {
    if (mesh.children[i].userData?.isOutline) {
      mesh.remove(mesh.children[i]);
    }
  }

  ensureSmoothOutlineNormals(mesh.geometry);
  computeSmoothShadingNormals(mesh.geometry);

  const isHead = /Head|Skull/i.test(name) || /Head/i.test(mesh.parent?.name || '');
  const isSheetCape = /_Cape$/i.test(name) || /^Plane\./i.test(mesh.geometry?.name || '');
  const baseThickness = options.thickness ?? (isHead ? HEAD_OUTLINE_THICKNESS : CHARACTER_OUTLINE_THICKNESS);

  const outlineMat = makeSkinnedOutlineMaterial({
    thickness: baseThickness,
    color: options.color ?? OUTLINE_INK_HEX,
    depthBias: isHead ? 0.005 : 0.0035,
    suppressEyeUv: options.isAdventurer !== false,
    sheetMode: isSheetCape,
  });

  let outlineMesh;
  if (mesh.isSkinnedMesh && mesh.skeleton) {
    outlineMesh = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
    outlineMesh.bind(mesh.skeleton, mesh.bindMatrix);
    outlineMesh.frustumCulled = false;
  } else {
    outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  }

  outlineMesh.name = `${name || 'mesh'}-outline`;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  outlineMesh.userData.isOutline = true;
  outlineMesh.userData.outlineThickness = baseThickness;
  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Creates a cel-shaded `MeshToonMaterial` with 4-step gradient map, flattened 8x4
 * palette texture, anime face shadow lift (`r0c0`), unlit skeleton eye glow support
 * (`vMapUv.x < -0.5`), and luminance-weighted role Fresnel rim highlight.
 */
export function createCharacterToonMaterial(sourceMaterial, options = {}) {
  const roleKey = (options.role || 'knight').toLowerCase();
  const preset = ROLE_STYLE_PRESETS[roleKey] || ROLE_STYLE_PRESETS.knight;
  const gradientMap = options.gradientMap || getSharedCharacterToonGradient();

  if (sourceMaterial?.name === 'Glow' || options.isEyeGlow) {
    const glowMat = new THREE.MeshBasicMaterial({
      name: 'SkeletonEyeGlow',
      color: new THREE.Color(0xffe85c),
      toneMapped: false,
    });
    glowMat.userData.noOutline = true;
    glowMat.userData.isToonUpgraded = true;
    return glowMat;
  }

  const flatMap = sourceMaterial?.map
    ? flattenPaletteTexture(sourceMaterial.map, {
        role: roleKey,
        cellOverrides: options.cellOverrides,
      })
    : null;

  const isSheetCape = !!options.isSheetCape;
  const toonMat = new THREE.MeshToonMaterial({
    name: `${sourceMaterial?.name || roleKey}-toon`,
    map: flatMap,
    color: sourceMaterial?.color ? sourceMaterial.color.clone() : new THREE.Color(0xffffff),
    gradientMap,
    side: isSheetCape || sourceMaterial?.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });

  const rimColor = new THREE.Color(options.rimColor ?? preset.rimColor ?? 0xb8e2ff);
  const rimStrength = options.rimStrength ?? preset.rimStrength ?? 0.20;
  const isAdventurer = options.isAdventurer !== false && roleKey !== 'skeleton';

  const verdictUniforms = {
    uGroundClipY: { value: -9999.0 },
    uDissolveProgress: { value: 0.0 },
    uDissolveBaseY: { value: 0.0 },
    uMonochromeOverride: { value: 0.0 },
  };

  toonMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uIsAdventurer = { value: isAdventurer ? 1.0 : 0.0 };
    shader.uniforms.uGroundClipY = verdictUniforms.uGroundClipY;
    shader.uniforms.uDissolveProgress = verdictUniforms.uDissolveProgress;
    shader.uniforms.uDissolveBaseY = verdictUniforms.uDissolveBaseY;
    shader.uniforms.uMonochromeOverride = verdictUniforms.uMonochromeOverride;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vVerdictWorldPos;
        varying float vVerdictScreenX;
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        #include <project_vertex>
        vVerdictWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 charRootWorld = modelMatrix[3].xyz;
        vec3 camRightWorld = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vVerdictScreenX = dot(vVerdictWorldPos - charRootWorld, camRightWorld);
        `
      );

    shader.fragmentShader =
      /* glsl */ `
      uniform vec3 uRimColor;
      uniform float uRimStrength;
      uniform float uIsAdventurer;
      uniform float uGroundClipY;
      uniform float uDissolveProgress;
      uniform float uDissolveBaseY;
      uniform float uMonochromeOverride;
      varying vec3 vVerdictWorldPos;
      varying float vVerdictScreenX;

      float hashVerdictToon31(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float smoothNoiseVerdictToon31(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(hashVerdictToon31(i + vec3(0, 0, 0)), hashVerdictToon31(i + vec3(1, 0, 0)), u.x),
            mix(hashVerdictToon31(i + vec3(0, 1, 0)), hashVerdictToon31(i + vec3(1, 1, 0)), u.x),
            u.y
          ),
          mix(
            mix(hashVerdictToon31(i + vec3(0, 0, 1)), hashVerdictToon31(i + vec3(1, 0, 1)), u.x),
            mix(hashVerdictToon31(i + vec3(0, 1, 1)), hashVerdictToon31(i + vec3(1, 1, 1)), u.x),
            u.y
          ),
          u.z
        );
      }
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      if (vVerdictWorldPos.y < uGroundClipY) discard;

      float verdictDissolveRim = 0.0;
      if (uDissolveProgress > 0.001) {
        // Left-to-Right Wind Petal Erosion: wind sweeps from screen-left (vVerdictScreenX < 0) to screen-right (vVerdictScreenX > 0),
        // turning the character's body into crimson rose petals along a sweeping wind-streaked front!
        float hNorm = clamp((vVerdictWorldPos.y - uDissolveBaseY) / 1.72, 0.0, 1.0);
        float leftToRight = clamp((vVerdictScreenX + 0.82) / 1.54, 0.0, 1.0);
        vec3 samplePos = vec3(vVerdictScreenX * 2.4, vVerdictWorldPos.y * 5.2, vVerdictWorldPos.z * 3.2);
        float n1 = smoothNoiseVerdictToon31(samplePos);
        float n2 = smoothNoiseVerdictToon31(samplePos * 2.3 + vec3(3.7, 1.9, 5.1));
        float noiseVal = n1 * 0.65 + n2 * 0.35;
        float erodeVal = leftToRight * 0.78 + (1.0 - hNorm) * 0.08 + noiseVal * 0.14;
        if (erodeVal < uDissolveProgress * 1.06) discard;
        verdictDissolveRim = 1.0 - smoothstep(uDissolveProgress * 1.06, uDissolveProgress * 1.06 + 0.14, erodeVal);
      }

      #ifdef USE_MAP
        // Unlit glowing yellow eyes for Skeletons merged into the unified SkinnedMesh
        if (vMapUv.x < -0.5) {
          gl_FragColor = vec4(1.0, 0.91, 0.36, 1.0);
          return;
        }
        // Keep anime face skin (cell r0c0) warm and clean so harsh shadows never muddy the face
        if (uIsAdventurer > 0.5 && vMapUv.x < 0.125 && vMapUv.y < 0.25) {
          outgoingLight = max(outgoingLight, diffuseColor.rgb * 0.80);
        }
      #endif
      // Luminance-modulated view-space Fresnel rim light so dark hair/iron never gets a stark white halo
      vec3 viewDir = normalize(vViewPosition);
      float rim = pow(1.0 - clamp(abs(dot(normal, viewDir)), 0.0, 1.0), 3.2);
      float baseLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float lumaMask = smoothstep(0.015, 0.18, baseLuma);
      vec3 tintedRim = mix(diffuseColor.rgb * 1.45, uRimColor, 0.55);
      outgoingLight += tintedRim * (rim * uRimStrength * (0.25 + 0.75 * lumaMask));

      if (uDissolveProgress > 0.001) {
        // Keep the dying character's remaining body stark B&W monochrome (so red cape/shield don't glow red),
        // and ignite the active left-to-right wind transformation seam in vivid blood-crimson!
        float lumaD = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        vec3 starkBwBody = vec3(lumaD);
        vec3 rubyRim = vec3(0.84, 0.008, 0.038);
        outgoingLight = mix(starkBwBody, rubyRim, verdictDissolveRim);
      } else if (uMonochromeOverride > 0.001) {
        float monoOut = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        outgoingLight = mix(outgoingLight, vec3(monoOut), clamp(uMonochromeOverride, 0.0, 1.0));
      }
      #include <opaque_fragment>
      `
    );
  };
  toonMat.customProgramCacheKey = () => `char-toon-v4-lr-wind-${roleKey}-${isAdventurer ? 1 : 0}`;

  toonMat.userData.isToonUpgraded = true;
  toonMat.userData.roleKey = roleKey;
  toonMat.userData.flattenedMap = flatMap;
  toonMat.userData.verdictUniforms = verdictUniforms;
  return toonMat;
}

/**
 * Updates Divine Verdict ground-plane clip (`uGroundClipY`), upward petal dissolve
 * (`uDissolveProgress`, `uDissolveBaseY`), and Smite survivor monochrome override
 * (`uMonochromeOverride`) across all toon & outline materials on a character root or instance.
 */
export function setCharacterVerdictShaderState(
  rootOrChar,
  {
    groundClipY = -9999.0,
    dissolveProgress = 0.0,
    dissolveBaseY = 0.0,
    monochromeOverride = 0.0,
  } = {}
) {
  const root = rootOrChar?.group || rootOrChar?.modelRoot || rootOrChar;
  if (!root || typeof root.traverse !== 'function') return;

  const clipY = Number.isFinite(groundClipY) ? groundClipY : -9999.0;
  const dissP = THREE.MathUtils.clamp(Number(dissolveProgress) || 0, 0, 1);
  const dissBaseY = Number.isFinite(dissolveBaseY) ? dissolveBaseY : 0.0;
  const mono = THREE.MathUtils.clamp(Number(monochromeOverride) || 0, 0, 1);

  const applyToMat = (mat) => {
    if (!mat) return;
    const vu = mat.userData?.verdictUniforms || mat.uniforms;
    if (!vu) return;
    if (vu.uGroundClipY) vu.uGroundClipY.value = clipY;
    if (vu.uDissolveProgress) vu.uDissolveProgress.value = dissP;
    if (vu.uDissolveBaseY) vu.uDissolveBaseY.value = dissBaseY;
    if (vu.uMonochromeOverride) vu.uMonochromeOverride.value = mono;
  };

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    if (Array.isArray(obj.material)) {
      obj.material.forEach(applyToMat);
    } else {
      applyToMat(obj.material);
    }
  });
}

/**
 * Applies a brief emissive hit-flash across all cel-shaded toon materials on a
 * character or enemy root (`weight` in `[0, 1]`).
 */
export function setCharacterHitFlash(
  rootOrChar,
  weight = 0.0,
  flashColorHex = 0xff3b5c
) {
  const root = rootOrChar?.group || rootOrChar?.modelRoot || rootOrChar;
  if (!root || typeof root.traverse !== 'function') return;

  const w = THREE.MathUtils.clamp(Number(weight) || 0, 0, 1);
  const applyFlash = (mat) => {
    if (!mat || mat.userData?.isOutlineMaterial || !mat.emissive) return;
    if (w > 0.001) {
      mat.emissive.setHex(flashColorHex);
      mat.emissiveIntensity = w * 1.15;
    } else if (mat.emissiveIntensity !== 0) {
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveIntensity = 0;
    }
  };

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material || obj.userData?.isOutline) return;
    if (Array.isArray(obj.material)) {
      obj.material.forEach(applyFlash);
    } else {
      applyFlash(obj.material);
    }
  });
}

/**
 * Upgrades all meshes inside a loaded character or weapon root to cel-shaded
 * `MeshToonMaterial` + skinned view-space inverted-hull outlines.
 */
export function upgradeCharacterToToon(root, options = {}) {
  if (!root) return { upgradedMeshes: 0, outlineMeshes: 0 };

  const roleKey = (options.role || 'knight').toLowerCase();
  const isWeapon = !!options.isWeapon;
  const skipOutlines = !!options.skipOutlines;
  const outlineThickness =
    options.outlineThickness ?? (isWeapon ? WEAPON_OUTLINE_THICKNESS : CHARACTER_OUTLINE_THICKNESS);
  const outlineColor = options.outlineColor ?? OUTLINE_INK_HEX;
  const gradientMap = options.gradientMap || getSharedCharacterToonGradient();

  const targets = [];
  root.traverse((obj) => {
    if (obj.isMesh && !obj.userData?.isOutline) {
      targets.push(obj);
    }
  });

  const materialCache = new Map();
  let upgradedMeshes = 0;
  let outlineMeshes = 0;

  for (const mesh of targets) {
    if (mesh.isSkinnedMesh) {
      mesh.frustumCulled = false;
    }
    mesh.castShadow = true;
    // Disable self-shadowing on low-poly toon characters to prevent jagged shadow-map facet bands
    mesh.receiveShadow = false;

    ensureSmoothOutlineNormals(mesh.geometry);
    computeSmoothShadingNormals(mesh.geometry, isWeapon ? 0.55 : 0.45);

    const isSheetCape = /_Cape$/i.test(mesh.name || '');
    const isEyes = /Eyes/i.test(mesh.name || '');

    const upgradeMat = (srcMat) => {
      if (!srcMat) return srcMat;
      const cacheKey = `${srcMat.uuid}|${isSheetCape ? 'sheet' : 'solid'}|${isEyes ? 'eyes' : 'body'}`;
      if (materialCache.has(cacheKey)) {
        return materialCache.get(cacheKey);
      }
      const nextMat = createCharacterToonMaterial(srcMat, {
        ...options,
        role: roleKey,
        gradientMap,
        isSheetCape,
        isEyeGlow: isEyes || srcMat.name === 'Glow',
      });
      materialCache.set(cacheKey, nextMat);
      return nextMat;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(upgradeMat);
    } else if (mesh.material) {
      mesh.material = upgradeMat(mesh.material);
    }
    upgradedMeshes++;

    if (!skipOutlines && mesh.visible && !isEyes && !mesh.material?.userData?.noOutline) {
      const outline = createSkinnedOutlineMesh(mesh, {
        thickness: isWeapon ? WEAPON_OUTLINE_THICKNESS : outlineThickness,
        color: outlineColor,
        isAdventurer: roleKey !== 'skeleton',
      });
      if (outline) outlineMeshes++;
    }
  }

  return { upgradedMeshes, outlineMeshes };
}

/**
 * Helper to find the nearest ancestor bone in `skeleton.bones` for a rigid mesh.
 */
function findAncestorBoneIndex(obj, boneIndexMap) {
  let curr = obj.parent;
  while (curr) {
    if (boneIndexMap.has(curr)) {
      return { bone: curr, boneIdx: boneIndexMap.get(curr) };
    }
    curr = curr.parent;
  }
  return null;
}

/**
 * Prepares a cloned character `modelRoot` for unified SkinnedMesh merging by
 * capturing all bind-pose skinned body sub-meshes and rigid bone-attached
 * accessories (`Helmet`, `Hat`, `Hood`, `Cape`) once before animations run.
 */
export function prepareUnifiedCharacterSource(modelRoot, options = {}) {
  if (!modelRoot) return null;
  if (modelRoot.userData.__unifiedSource) return modelRoot.userData.__unifiedSource;

  modelRoot.updateMatrixWorld(true);

  const roleKey = (options.role || 'knight').toLowerCase();
  const isAdventurer = roleKey !== 'skeleton';

  let primarySkinned = null;
  const rawSkinnedMeshes = [];
  const rawRigidMeshes = [];

  modelRoot.traverse((obj) => {
    if (!obj.isMesh || obj.userData?.isOutline || obj.userData?.isUnifiedMesh) return;
    if (obj.isSkinnedMesh && obj.skeleton) {
      if (!primarySkinned) primarySkinned = obj;
      rawSkinnedMeshes.push(obj);
    } else {
      rawRigidMeshes.push(obj);
    }
  });

  if (!primarySkinned || !primarySkinned.skeleton) {
    return null;
  }

  const skeleton = primarySkinned.skeleton;
  const baseBindMatrix = primarySkinned.bindMatrix.clone();
  const baseBindMatrixInverse = baseBindMatrix.clone().invert();
  const meshParent = primarySkinned.parent || modelRoot;

  const boneIndexMap = new Map();
  skeleton.bones.forEach((b, idx) => {
    boneIndexMap.set(b, idx);
  });

  // Extract a primary toon material from the body mesh
  let unifiedToonMaterial = null;
  for (const sm of rawSkinnedMeshes) {
    const isEyes = /Eyes/i.test(sm.name || '') || sm.material?.name === 'Glow';
    if (!isEyes && sm.material) {
      const srcMat = Array.isArray(sm.material) ? sm.material[0] : sm.material;
      unifiedToonMaterial = srcMat?.userData?.isToonUpgraded
        ? srcMat
        : createCharacterToonMaterial(srcMat, {
            ...options,
            role: roleKey,
            isSheetCape: false,
            isEyeGlow: false,
          });
      break;
    }
  }

  const skinnedParts = [];
  for (const sm of rawSkinnedMeshes) {
    const geom = sm.geometry.clone();
    ensureSmoothOutlineNormals(geom);
    computeSmoothShadingNormals(geom, 0.45);
    const isEyes = /Eyes/i.test(sm.name || '') || sm.material?.name === 'Glow';
    const isHead = /Head|Skull|Jaw/i.test(sm.name || '');

    skinnedParts.push({
      name: sm.name || 'SkinnedPart',
      geometry: geom,
      isEyes,
      isHead,
      isSheetCape: false,
      isWeapon: false,
    });

    if (sm.parent) sm.parent.remove(sm);
  }

  const accessoryParts = [];
  for (const rm of rawRigidMeshes) {
    const found = findAncestorBoneIndex(rm, boneIndexMap);
    if (!found) continue;
    const { bone, boneIdx } = found;

    const geom = rm.geometry.clone();
    ensureSmoothOutlineNormals(geom);
    computeSmoothShadingNormals(geom, 0.45);

    const T_B_from_M = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(rm.matrixWorld);
    const B_bind = new THREE.Matrix4().copy(skeleton.boneInverses[boneIdx]).invert();
    const M_toBind = new THREE.Matrix4().copy(baseBindMatrixInverse).multiply(B_bind).multiply(T_B_from_M);

    const isSheetCape = /_Cape$/i.test(rm.name || '') || /^Plane\./i.test(rm.geometry?.name || '');
    const isHead = /Helmet|Hat|Hood|Head/i.test(rm.name || '') || (bone.name || '').toLowerCase() === 'head';

    accessoryParts.push({
      name: rm.name || 'AccessoryPart',
      geometry: geom,
      boneIdx,
      M_toBind,
      isEyes: false,
      isHead,
      isSheetCape,
      isWeapon: false,
    });

    if (rm.parent) rm.parent.remove(rm);
  }

  const sourceInfo = {
    roleKey,
    isAdventurer,
    skeleton,
    baseBindMatrix,
    baseBindMatrixInverse,
    boneIndexMap,
    meshParent,
    unifiedToonMaterial,
    skinnedParts,
    accessoryParts,
    unifiedSkinMesh: null,
    unifiedOutlineMesh: null,
  };

  modelRoot.userData.__unifiedSource = sourceInfo;
  return sourceInfo;
}

/**
 * Transforms a rigid part's geometry into the unified `SkinnedMesh` bind space
 * with `skinIndex = [boneIdx, 0, 0, 0]` and `skinWeight = [1, 0, 0, 0]`.
 */
function buildBindSpacePartBuffers(part, sourceInfo, options = {}) {
  const { geometry, isEyes, isHead, isSheetCape, isWeapon } = part;
  const { isAdventurer } = sourceInfo;

  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  const outNormAttr = geometry.attributes.aOutlineNormal || normAttr;
  const vCount = posAttr.count;

  const hasExistingSkin = !!geometry.attributes.skinIndex && !!geometry.attributes.skinWeight;
  const M_toBind = part.M_toBind || null;
  const normalMat = M_toBind ? new THREE.Matrix3().getNormalMatrix(M_toBind) : null;
  const linearMat = M_toBind ? new THREE.Matrix3().setFromMatrix4(M_toBind) : null;

  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const outlineNormals = new Float32Array(vCount * 3);
  const outlineParams = new Float32Array(vCount * 3);
  const skinIndices = new Uint16Array(vCount * 4);
  const skinWeights = new Float32Array(vCount * 4);

  const tmpPos = new THREE.Vector3();
  const tmpNorm = new THREE.Vector3();
  const tmpOutNorm = new THREE.Vector3();

  const bodyThick = isAdventurer
    ? options.outlineThickness ?? CHARACTER_OUTLINE_THICKNESS
    : SKELETON_OUTLINE_THICKNESS;
  const headThick = isAdventurer ? HEAD_OUTLINE_THICKNESS : SKELETON_OUTLINE_THICKNESS;
  const wepThick = WEAPON_OUTLINE_THICKNESS;

  const partThickness = isWeapon ? wepThick : isHead ? headThick : bodyThick;
  const partDepthBias = !isAdventurer ? 0.006 : isHead ? 0.005 : 0.0035;

  const suppressedVertexMask = new Uint8Array(vCount);

  for (let i = 0; i < vCount; i++) {
    const lx = posAttr.getX(i);
    const ly = posAttr.getY(i);
    const lz = posAttr.getZ(i);

    tmpPos.set(lx, ly, lz);
    tmpNorm.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));

    if (isSheetCape) {
      // Exact local radial silhouette expansion vector from Pass 1 `uSheetMode`
      tmpOutNorm.set(lx * 1.45, (ly + 0.55) * 1.25, 0.0);
    } else {
      tmpOutNorm.set(outNormAttr.getX(i), outNormAttr.getY(i), outNormAttr.getZ(i));
    }

    if (M_toBind) {
      tmpPos.applyMatrix4(M_toBind);
      tmpNorm.applyMatrix3(normalMat).normalize();
      if (isSheetCape) {
        tmpOutNorm.applyMatrix3(linearMat);
      } else {
        tmpOutNorm.applyMatrix3(normalMat).normalize();
      }
    }

    positions[i * 3 + 0] = tmpPos.x;
    positions[i * 3 + 1] = tmpPos.y;
    positions[i * 3 + 2] = tmpPos.z;

    normals[i * 3 + 0] = tmpNorm.x;
    normals[i * 3 + 1] = tmpNorm.y;
    normals[i * 3 + 2] = tmpNorm.z;

    outlineNormals[i * 3 + 0] = tmpOutNorm.x;
    outlineNormals[i * 3 + 1] = tmpOutNorm.y;
    outlineNormals[i * 3 + 2] = tmpOutNorm.z;

    let u = uvAttr ? uvAttr.getX(i) : 0.0;
    let v = uvAttr ? uvAttr.getY(i) : 0.0;
    if (isEyes) {
      u = -1.0;
      v = -1.0;
    }
    uvs[i * 2 + 0] = u;
    uvs[i * 2 + 1] = v;

    let vThick = partThickness;
    let vBias = partDepthBias;

    if (isAdventurer && isHead && !M_toBind) {
      const isEyeFeature = u >= 0.24 && u <= 0.38 && v <= 0.26 && tmpPos.z > 0.12;
      const isCenterNose =
        Math.abs(tmpPos.x) < 0.17 && tmpPos.z > 0.39 && tmpPos.y > 1.38 && tmpPos.y < 1.82;
      if (isEyeFeature || isCenterNose) {
        vThick = 0.0;
        vBias = 0.03;
        suppressedVertexMask[i] = 1;
      }
    }

    outlineParams[i * 3 + 0] = vThick;
    outlineParams[i * 3 + 1] = vBias;
    outlineParams[i * 3 + 2] = isSheetCape ? 1.0 : 0.0;

    if (hasExistingSkin) {
      const si = geometry.attributes.skinIndex;
      const sw = geometry.attributes.skinWeight;
      skinIndices[i * 4 + 0] = si.getX(i);
      skinIndices[i * 4 + 1] = si.getY(i);
      skinIndices[i * 4 + 2] = si.getZ(i);
      skinIndices[i * 4 + 3] = si.getW(i);

      skinWeights[i * 4 + 0] = sw.getX(i);
      skinWeights[i * 4 + 1] = sw.getY(i);
      skinWeights[i * 4 + 2] = sw.getZ(i);
      skinWeights[i * 4 + 3] = sw.getW(i);
    } else {
      const bIdx = part.boneIdx ?? 0;
      skinIndices[i * 4 + 0] = bIdx;
      skinIndices[i * 4 + 1] = 0;
      skinIndices[i * 4 + 2] = 0;
      skinIndices[i * 4 + 3] = 0;

      skinWeights[i * 4 + 0] = 1.0;
      skinWeights[i * 4 + 1] = 0.0;
      skinWeights[i * 4 + 2] = 0.0;
      skinWeights[i * 4 + 3] = 0.0;
    }
  }

  const rawIndex = geometry.index ? geometry.index.array : null;
  const iCount = rawIndex ? rawIndex.length : vCount;
  const indices = new Uint32Array(iCount);
  if (rawIndex) {
    for (let i = 0; i < iCount; i++) indices[i] = rawIndex[i];
  } else {
    for (let i = 0; i < iCount; i++) indices[i] = i;
  }

  return {
    vCount,
    positions,
    normals,
    uvs,
    outlineNormals,
    outlineParams,
    skinIndices,
    skinWeights,
    indices,
    suppressedVertexMask,
    isEyes,
    isSheetCape,
  };
}

/**
 * Rebuilds the character's unified `SkinnedMesh` and unified outline `SkinnedMesh`
 * by combining all body parts, accessories, and currently attached socket weapons
 * into 2 total draw calls (`1` character skin + `1` character outline).
 */
export function rebuildUnifiedCharacterSkin(modelRoot, sockets = {}, options = {}) {
  const sourceInfo = prepareUnifiedCharacterSource(modelRoot, options);
  if (!sourceInfo) return null;

  modelRoot.updateMatrixWorld(true);

  const {
    roleKey,
    isAdventurer,
    skeleton,
    baseBindMatrix,
    baseBindMatrixInverse,
    boneIndexMap,
    meshParent,
    unifiedToonMaterial,
    skinnedParts,
    accessoryParts,
  } = sourceInfo;

  // Collect any currently equipped weapon meshes inside `handSlot.r` and `handSlot.l`
  const weaponParts = [];
  for (const slotKey of ['handSlot.r', 'handSlot.l']) {
    const slotNode = sockets[slotKey];
    if (!slotNode) continue;
    slotNode.updateMatrixWorld(true);

    slotNode.traverse((obj) => {
      if (!obj.isMesh || obj.userData?.isOutline || obj.userData?.isVfx) return;
      // Hide individual weapon mesh so only the unified SkinnedMesh renders
      obj.visible = false;

      const found = findAncestorBoneIndex(obj, boneIndexMap);
      if (!found) return;
      const { bone, boneIdx } = found;

      const geom = obj.geometry.clone();
      ensureSmoothOutlineNormals(geom);
      computeSmoothShadingNormals(geom, 0.55);

      const T_B_from_M = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(obj.matrixWorld);
      const B_bind = new THREE.Matrix4().copy(skeleton.boneInverses[boneIdx]).invert();
      const M_toBind = new THREE.Matrix4().copy(baseBindMatrixInverse).multiply(B_bind).multiply(T_B_from_M);

      weaponParts.push({
        name: obj.name || slotKey,
        geometry: geom,
        boneIdx,
        M_toBind,
        isEyes: false,
        isHead: false,
        isSheetCape: false,
        isWeapon: true,
      });
    });
  }

  const allParts = [...skinnedParts, ...accessoryParts, ...weaponParts];
  const builtParts = allParts.map((p) => buildBindSpacePartBuffers(p, sourceInfo, options));

  // Calculate total vertex and index counts for:
  // 1) Main unified SkinnedMesh (single-sheet capes emit front + reversed back face so FrontSide works everywhere)
  // 2) Unified Outline SkinnedMesh (excludes `isEyes`; single-sheet capes emit both windings so BackSide catches both views)
  let mainVertTotal = 0;
  let mainIndexTotal = 0;
  let outlineVertTotal = 0;
  let outlineIndexTotal = 0;

  for (const bp of builtParts) {
    if (bp.isSheetCape) {
      mainVertTotal += bp.vCount * 2;
      mainIndexTotal += bp.indices.length * 2;
    } else {
      mainVertTotal += bp.vCount;
      mainIndexTotal += bp.indices.length;
    }

    if (!bp.isEyes) {
      outlineVertTotal += bp.vCount;
      if (bp.isSheetCape) {
        outlineIndexTotal += bp.indices.length * 2;
      } else {
        outlineIndexTotal += bp.indices.length;
      }
    }
  }

  // Assemble Main Unified Geometry
  const mainPos = new Float32Array(mainVertTotal * 3);
  const mainNorm = new Float32Array(mainVertTotal * 3);
  const mainUv = new Float32Array(mainVertTotal * 2);
  const mainSkinIdx = new Uint16Array(mainVertTotal * 4);
  const mainSkinWgt = new Float32Array(mainVertTotal * 4);
  const mainIndices = new Uint32Array(mainIndexTotal);

  let mVOff = 0;
  let mIOff = 0;

  for (const bp of builtParts) {
    const vc = bp.vCount;
    mainPos.set(bp.positions, mVOff * 3);
    mainNorm.set(bp.normals, mVOff * 3);
    mainUv.set(bp.uvs, mVOff * 2);
    mainSkinIdx.set(bp.skinIndices, mVOff * 4);
    mainSkinWgt.set(bp.skinWeights, mVOff * 4);

    for (let i = 0; i < bp.indices.length; i++) {
      mainIndices[mIOff + i] = bp.indices[i] + mVOff;
    }
    mVOff += vc;
    mIOff += bp.indices.length;

    if (bp.isSheetCape) {
      // Emit reversed-winding inner cape shell shifted 1.5mm along -normal so FrontSide renders both sides cleanly
      for (let i = 0; i < vc; i++) {
        const nx = bp.normals[i * 3 + 0];
        const ny = bp.normals[i * 3 + 1];
        const nz = bp.normals[i * 3 + 2];
        mainPos[(mVOff + i) * 3 + 0] = bp.positions[i * 3 + 0] - nx * 0.0015;
        mainPos[(mVOff + i) * 3 + 1] = bp.positions[i * 3 + 1] - ny * 0.0015;
        mainPos[(mVOff + i) * 3 + 2] = bp.positions[i * 3 + 2] - nz * 0.0015;

        mainNorm[(mVOff + i) * 3 + 0] = -nx;
        mainNorm[(mVOff + i) * 3 + 1] = -ny;
        mainNorm[(mVOff + i) * 3 + 2] = -nz;
      }
      mainUv.set(bp.uvs, mVOff * 2);
      mainSkinIdx.set(bp.skinIndices, mVOff * 4);
      mainSkinWgt.set(bp.skinWeights, mVOff * 4);

      for (let i = 0; i < bp.indices.length; i += 3) {
        mainIndices[mIOff + i + 0] = bp.indices[i + 0] + mVOff;
        mainIndices[mIOff + i + 1] = bp.indices[i + 2] + mVOff;
        mainIndices[mIOff + i + 2] = bp.indices[i + 1] + mVOff;
      }
      mVOff += vc;
      mIOff += bp.indices.length;
    }
  }

  const mainGeom = new THREE.BufferGeometry();
  mainGeom.setAttribute('position', new THREE.BufferAttribute(mainPos, 3));
  mainGeom.setAttribute('normal', new THREE.BufferAttribute(mainNorm, 3));
  mainGeom.setAttribute('uv', new THREE.BufferAttribute(mainUv, 2));
  mainGeom.setAttribute('skinIndex', new THREE.BufferAttribute(mainSkinIdx, 4));
  mainGeom.setAttribute('skinWeight', new THREE.BufferAttribute(mainSkinWgt, 4));
  mainGeom.setIndex(new THREE.BufferAttribute(mainIndices, 1));
  mainGeom.computeBoundingSphere();

  // Assemble Unified Outline Geometry
  const outPos = new Float32Array(outlineVertTotal * 3);
  const outNorm = new Float32Array(outlineVertTotal * 3);
  const outUv = new Float32Array(outlineVertTotal * 2);
  const outSmoothNorm = new Float32Array(outlineVertTotal * 3);
  const outParams = new Float32Array(outlineVertTotal * 3);
  const outSkinIdx = new Uint16Array(outlineVertTotal * 4);
  const outSkinWgt = new Float32Array(outlineVertTotal * 4);
  const outIndicesTemp = new Uint32Array(outlineIndexTotal);

  let oVOff = 0;
  let oIOff = 0;

  for (const bp of builtParts) {
    if (bp.isEyes) continue;
    const vc = bp.vCount;
    outPos.set(bp.positions, oVOff * 3);
    outNorm.set(bp.normals, oVOff * 3);
    outUv.set(bp.uvs, oVOff * 2);
    outSmoothNorm.set(bp.outlineNormals, oVOff * 3);
    outParams.set(bp.outlineParams, oVOff * 3);
    outSkinIdx.set(bp.skinIndices, oVOff * 4);
    outSkinWgt.set(bp.skinWeights, oVOff * 4);

    for (let i = 0; i < bp.indices.length; i += 3) {
      const i0 = bp.indices[i + 0];
      const i1 = bp.indices[i + 1];
      const i2 = bp.indices[i + 2];
      // Skip front-face eye/nose triangles completely on the CPU so they never rasterize in the outline pass
      if (bp.suppressedVertexMask[i0] && bp.suppressedVertexMask[i1] && bp.suppressedVertexMask[i2]) {
        continue;
      }
      outIndicesTemp[oIOff++] = i0 + oVOff;
      outIndicesTemp[oIOff++] = i1 + oVOff;
      outIndicesTemp[oIOff++] = i2 + oVOff;
    }

    if (bp.isSheetCape) {
      // Emit reversed winding for single-sheet cape so BackSide outline pass renders from both front & rear
      for (let i = 0; i < bp.indices.length; i += 3) {
        outIndicesTemp[oIOff++] = bp.indices[i + 0] + oVOff;
        outIndicesTemp[oIOff++] = bp.indices[i + 2] + oVOff;
        outIndicesTemp[oIOff++] = bp.indices[i + 1] + oVOff;
      }
    }

    oVOff += vc;
  }

  const outIndices = outIndicesTemp.subarray(0, oIOff);
  const outGeom = new THREE.BufferGeometry();
  outGeom.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  outGeom.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  outGeom.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  outGeom.setAttribute('aOutlineNormal', new THREE.BufferAttribute(outSmoothNorm, 3));
  outGeom.setAttribute('aOutlineParams', new THREE.BufferAttribute(outParams, 3));
  outGeom.setAttribute('skinIndex', new THREE.BufferAttribute(outSkinIdx, 4));
  outGeom.setAttribute('skinWeight', new THREE.BufferAttribute(outSkinWgt, 4));
  outGeom.setIndex(new THREE.BufferAttribute(outIndices, 1));
  outGeom.computeBoundingSphere();

  // Remove previous unified meshes if rebuilding after a weapon swap
  if (sourceInfo.unifiedSkinMesh && sourceInfo.unifiedSkinMesh.parent) {
    sourceInfo.unifiedSkinMesh.parent.remove(sourceInfo.unifiedSkinMesh);
  }
  if (sourceInfo.unifiedOutlineMesh && sourceInfo.unifiedOutlineMesh.parent) {
    sourceInfo.unifiedOutlineMesh.parent.remove(sourceInfo.unifiedOutlineMesh);
  }

  const skinMesh = new THREE.SkinnedMesh(mainGeom, unifiedToonMaterial);
  skinMesh.name = `${roleKey}-unified-skin`;
  skinMesh.castShadow = true;
  skinMesh.receiveShadow = false;
  skinMesh.frustumCulled = false;
  skinMesh.userData.isUnifiedMesh = true;
  skinMesh.bind(skeleton, baseBindMatrix);

  const outlineMat = makeSkinnedOutlineMaterial({
    thickness: options.outlineThickness ?? CHARACTER_OUTLINE_THICKNESS,
    color: options.outlineColor ?? OUTLINE_INK_HEX,
    suppressEyeUv: isAdventurer,
    useVertexParams: true,
  });

  const outlineMesh = new THREE.SkinnedMesh(outGeom, outlineMat);
  outlineMesh.name = `${roleKey}-unified-outline`;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  outlineMesh.frustumCulled = false;
  outlineMesh.userData.isOutline = true;
  outlineMesh.userData.isUnifiedMesh = true;
  outlineMesh.bind(skeleton, baseBindMatrix);

  meshParent.add(skinMesh);
  meshParent.add(outlineMesh);

  sourceInfo.unifiedSkinMesh = skinMesh;
  sourceInfo.unifiedOutlineMesh = outlineMesh;

  return {
    skinMesh,
    outlineMesh,
    upgradedMeshes: 1,
    outlineMeshes: 1,
  };
}
