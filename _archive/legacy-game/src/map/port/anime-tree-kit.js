// Anime hero tree — ez-tree branch skeleton + painted anime foliage.
//
// The geometry (branch graph, leaves attached per branch, wind, LOD) comes from
// ez-tree (MIT, https://github.com/dgreenheck/ez-tree). This module only swaps
// the *look*: the realistic oak/ash leaf atlas becomes a painted anime leaf
// cluster, the photoreal bark becomes a warm stylised bark, and the palette is
// authored for the Sunpetal Vale meadow.
//
// Why this split: the previous hand-built attempts failed on construction (a
// canopy shell with leaves sprinkled on it), not on colour. ez-tree already
// solves construction, so this file never touches the skeleton.

import * as THREE from "three";
import { Tree } from "@dgreenheck/ez-tree";

/* -------------------------------------------------------------------------- */
/* palettes                                                                   */
/* -------------------------------------------------------------------------- */

export const ANIME_TREE_PALETTES = {
  // Summer matches the meadow's own tree palette (game/src/map/palette.js):
  // canopyLight / canopyMid / canopyDark, trunk / trunkDark. The hero tree has to
  // sit in the same light as the ported trees, not next to them.
  summer: {
    // Saturated mid green with a pale sun tip. Hundreds of small cards average
    // out to this; the tip colour is what reads as light on the canopy.
    leaf: {
      base: "#86c05a",
      tip: "#d8ef9a",
      deep: "#4f8548",
      light: "#eaf9c0",
      vein: "#a8d46e",
    },
    bark: {
      base: "#6f5442",
      light: "#8f6f56",
      dark: "#4a3628",
      groove: "#352619",
    },
  },
  summerLight: {
    leaf: {
      base: "#cbe6a2",
      tip: "#f2fdd4",
      deep: "#a5cf8c",
      light: "#fbffe8",
      vein: "#dcefb4",
    },
    bark: {
      base: "#96674a",
      light: "#c69568",
      dark: "#5f4230",
      groove: "#433024",
    },
  },
  summerDeep: {
    leaf: {
      base: "#5f9e46",
      tip: "#9cc86a",
      deep: "#356b46",
      light: "#b8dc84",
      vein: "#6fa84e",
    },
    bark: {
      base: "#7f5540",
      light: "#b07d5a",
      dark: "#513628",
      groove: "#39261c",
    },
  },
  autumn: {
    leaf: {
      base: "#d99a2e",
      tip: "#f2c25a",
      deep: "#a86a1e",
      light: "#ffdd86",
      vein: "#c98a2e",
    },
    bark: {
      base: "#9c6b47",
      light: "#bd8a5e",
      dark: "#63412c",
      groove: "#442b1d",
    },
  },
  blossom: {
    leaf: {
      base: "#d98fae",
      tip: "#f2c3d4",
      deep: "#a86383",
      light: "#ffe3ef",
      vein: "#c07a96",
    },
    bark: {
      base: "#9a7059",
      light: "#bd9278",
      dark: "#614434",
      groove: "#422c22",
    },
  },
};

/* -------------------------------------------------------------------------- */
/* painted leaf (one card = one leaf; the canopy is built from overlap)       */
/* -------------------------------------------------------------------------- */

function createAnimeLeafTexture(palette, seed = 1) {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");

  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const clump = document.createElement("canvas");
  clump.width = S;
  clump.height = S;
  const c = clump.getContext("2d");

  // One card = a dense clump of ~34 overlapping leaves in three rings. Painted
  // entirely in code: flat two-tone leaves, pale sun tips, deep cool undersides.
  const rings = [
    { count: 15, len: 0.2, width: 0.62, offset: 0.0 },
    { count: 12, len: 0.15, width: 0.68, offset: 0.42 },
    { count: 8, len: 0.1, width: 0.74, offset: 0.9 },
  ];

  // Soft dark base so the clump has weight where leaves overlap.
  const base = c.createRadialGradient(S * 0.5, S * 0.55, 8, S * 0.5, S * 0.55, S * 0.4);
  base.addColorStop(0, "rgba(58,92,58,0.22)");
  base.addColorStop(1, "rgba(58,92,58,0)");
  c.fillStyle = base;
  c.fillRect(0, 0, S, S);

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + ring.offset + (rng() - 0.5) * 0.3;
      const len = S * ring.len * (0.85 + rng() * 0.28);
      const width = len * ring.width;
      const sunDot = Math.cos(angle) * -0.707 + Math.sin(angle) * -0.707;
      const lit = sunDot > 0.1;
      const mid = sunDot > -0.45;

      const grad = c.createLinearGradient(0, 0, 0, -len);
      if (lit) {
        grad.addColorStop(0, palette.leaf.base);
        grad.addColorStop(1, palette.leaf.tip);
      } else if (mid) {
        grad.addColorStop(0, palette.leaf.deep);
        grad.addColorStop(1, palette.leaf.base);
      } else {
        grad.addColorStop(0, palette.leaf.deep);
        grad.addColorStop(1, palette.leaf.deep);
      }

      c.save();
      c.translate(S / 2, S / 2);
      c.rotate(angle + Math.PI / 2);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(width, -len * 0.24, width * 0.9, -len * 0.72, 0, -len);
      c.bezierCurveTo(-width * 0.9, -len * 0.72, -width, -len * 0.24, 0, 0);
      c.closePath();
      c.fillStyle = grad;
      c.fill();
      c.restore();
    }
  }

  // Warm light wash on the sun side of the clump.
  const wash = c.createRadialGradient(S * 0.36, S * 0.32, 10, S * 0.36, S * 0.32, S * 0.6);
  wash.addColorStop(0, "rgba(255,252,214,0.16)");
  wash.addColorStop(1, "rgba(255,252,214,0)");
  c.fillStyle = wash;
  c.fillRect(0, 0, S, S);

  // Feathered edges so the card silhouette is soft.
  ctx.filter = "blur(1.4px)";
  ctx.drawImage(clump, 0, 0);
  ctx.filter = "none";

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* -------------------------------------------------------------------------- */
/* stylised bark                                                              */
/* -------------------------------------------------------------------------- */

function createAnimeBarkTexture(palette, seed = 1) {
  const W = 256;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  let s = seed >>> 0;
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  ctx.fillStyle = palette.bark.base;
  ctx.fillRect(0, 0, W, H);

  // Vertical ridges, warm light on the left, dark grooves on the right.
  for (let i = 0; i < 90; i++) {
    const x = rng() * W;
    const w = 2 + rng() * 9;
    const light = rng() > 0.45;
    ctx.fillStyle = light ? palette.bark.light : palette.bark.dark;
    ctx.globalAlpha = 0.18 + rng() * 0.3;
    ctx.fillRect(x, -20, w, H + 40);
  }

  // Deep grooves.
  for (let i = 0; i < 26; i++) {
    const x = rng() * W;
    ctx.strokeStyle = palette.bark.groove;
    ctx.globalAlpha = 0.22 + rng() * 0.28;
    ctx.lineWidth = 1 + rng() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    for (let y = 0; y < H + 20; y += 24) {
      ctx.lineTo(x + Math.sin(y * 0.02 + i) * 3.5, y);
    }
    ctx.stroke();
  }

  // A couple of knots.
  for (let i = 0; i < 3; i++) {
    const x = W * (0.2 + rng() * 0.6);
    const y = H * (0.15 + rng() * 0.7);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.bark.groove;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + rng() * 5, 10 + rng() * 8, rng() * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* -------------------------------------------------------------------------- */
/* tree factory                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build one anime hero tree.
 *
 * options:
 *   seed        deterministic ez-tree seed
 *   preset      ez-tree preset name ("Oak Medium", "Ash Large", ...)
 *   palette     "summer" | "autumn" | "blossom" | custom palette object
 *   height      target tree height in metres (default 12)
 *   leafSize    ez-tree leaf card size multiplier (default 1)
 *   leafCount   leaves per branch (default: preset value)
 *   lean        rotation around Z in radians (default 0 = upright)
 */
export function createAnimeTree(options = {}) {
  const {
    seed = 7,
    preset = "Oak Medium",
    palette = "summer",
    height = 12,
    leafSize = 1,
    leafCount = null,
    lean = 0,
    crown = "hero",
    billboard = null, // "single" | "double" — single halves leaf triangles
    branchDetail = 1, // multiplier on branch sections/segments (LOD)
    leafTexture = null, // optional pre-painted card (THREE.Texture) overrides the painter
  } = options;

  const pal = typeof palette === "string" ? ANIME_TREE_PALETTES[palette] : palette;
  if (!pal) throw new Error(`[anime-tree] unknown palette: ${palette}`);

  const group = new THREE.Group();
  group.name = "animeTree";

  const tree = new Tree();
  tree.loadPreset(preset);
  tree.options.seed = seed;
  if (leafCount != null) tree.options.leaves.count = leafCount;
  tree.options.leaves.size *= leafSize;
  if (billboard) tree.options.leaves.billboard = billboard;
  if (branchDetail !== 1 && tree.options.branch) {
    for (const key of ["sections", "segments"]) {
      const src = tree.options.branch[key];
      if (!src) continue;
      for (const k of Object.keys(src)) {
        src[k] = Math.max(1, Math.round(src[k] * branchDetail));
      }
    }
  }

  // Hero crown: split lower, spread wider, shorter trunk. The reference tree is
  // wider than it is tall with the first boughs at ~1/3 height; ez-tree's oak
  // preset splits at half height and reads tall/narrow.
  // Hero crown: a wide, low-splitting broadleaf, not ez-tree's tall oak.
  // The reference tree splits at ~1/3 height into 4-5 long boughs and carries a
  // crown wider than it is tall. These are ez-tree's own branch parameters.
  if (crown === "hero") {
    tree.options.branch = {
      levels: 3,
      angle: { 1: 58, 2: 54, 3: 30 },
      children: { 0: 5, 1: 4, 2: 3 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.012 },
      gnarliness: { 0: 0.02, 1: 0.08, 2: 0.12, 3: 0.05 },
      length: { 0: 22, 1: 14, 2: 11, 3: 6 },
      radius: { 0: 1.6, 1: 1.05, 2: 0.62, 3: 0.38 },
      sections: { 0: 8, 1: 5, 2: 3, 3: 1 },
      segments: { 0: 8, 1: 5, 2: 3, 3: 3 },
      start: { 1: 0.28, 2: 0.16, 3: 0.1 },
      taper: { 0: 0.72, 1: 0.55, 2: 0.6, 3: 0.72 },
      twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
    };
    // Foliage only on the outer part of each branch: keeps the crown shell airy
    // and lets the boughs read through it, like the reference.
    if (tree.options.leaves) tree.options.leaves.start = Math.max(tree.options.leaves.start, 0.22);
  }

  tree.generate();

  // Scale to the requested height (ez-tree presets are ~37 units tall).
  const box = new THREE.Box3().setFromObject(tree);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(0.001, size.y);
  tree.scale.setScalar(s);
  tree.rotation.z = lean;

  /* ---- restyle: self-lit painted foliage, matching the meadow's ported trees ---- */

  // The meadow's own trees are self-lit (a painted two-tone material, no scene
  // lighting). A Phong-lit tree next to them reads washed and grey. So the leaves
  // switch to an unlit material that carries the painted card exactly, while
  // ez-tree's wind shader is transplanted so the canopy still moves.
  const leafTex = leafTexture ?? createAnimeLeafTexture(pal, seed * 13 + 7);
  const srcLeafMat = tree.leavesMesh.material;
  const windCompile = srcLeafMat.onBeforeCompile;
  const leafMat = new THREE.MeshBasicMaterial({
    map: leafTex,
    vertexColors: true,
    side: THREE.DoubleSide,
    alphaTest: 0.35,
    fog: true,
  });
  leafMat.onBeforeCompile = (shader, renderer) => {
    if (typeof windCompile === "function") windCompile.call(leafMat, shader, renderer);
    // ez-tree's wind block rebuilds mvPosition without the instance matrix, so
    // an InstancedMesh would collapse every tree onto the origin. Re-apply it.
    shader.vertexShader = shader.vertexShader.replace(
      "vec4 mvPosition = vec4(transformed, 1.0);",
      `vec4 mvPosition = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         mvPosition = instanceMatrix * mvPosition;
       #endif`
    );
    // ez-tree's Tree.update() reads the shader off the material it sees.
    leafMat.userData.shader = shader;
  };
  tree.leavesMesh.material = leafMat;
  srcLeafMat.dispose();

  // Per-vertex canopy gradient: warm/lit toward the top, cool shade underneath.
  // This is the "anime canopy" cue — the crown reads as a lit mass instead of a
  // uniformly painted shell.
  const leafGeo = tree.leavesMesh.geometry;
  if (leafGeo?.attributes?.position) {
    leafGeo.computeBoundingBox();
    const bb = leafGeo.boundingBox;
    const pos = leafGeo.attributes.position;
    const spanY = Math.max(0.001, bb.max.y - bb.min.y);
    const spanX = Math.max(0.001, bb.max.x - bb.min.x);
    const quadCount = Math.max(1, leafGeo.index.count / 6);
    const vertsPerQuad = Math.max(1, Math.round(pos.count / quadCount));
    const colors = new Float32Array(pos.count * 3);
    const sun = new THREE.Color(0xffffff);
    // Dreamy: the canopy gradient only lifts the top and settles the underside a
    // little — no strong shading anywhere.
    const shade = new THREE.Color(pal.leaf.deep).lerp(new THREE.Color(0xffffff), 0.45);
    const c = new THREE.Color();
    const fract = (v) => v - Math.floor(v);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h = (y - bb.min.y) / spanY;
      const side = (x - bb.min.x) / spanX;
      const lit = THREE.MathUtils.clamp(h * 0.78 + side * 0.22, 0, 1);
      // Per-clump brightness jitter keeps neighbouring clumps from fusing into
      // one flat mass — the variation is clump-scale, not leaf-scale.
      const quad = Math.floor(i / vertsPerQuad);
      const jitter = 0.9 + fract(Math.sin(quad * 12.9898) * 43758.5453) * 0.16;
      c.copy(shade).lerp(sun, Math.pow(lit, 0.85)).multiplyScalar(jitter);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    leafGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    leafMat.vertexColors = true;
  }

  const barkTex = createAnimeBarkTexture(pal, seed * 7 + 3);
  const srcBarkMat = tree.branchesMesh.material;
  const barkMat = new THREE.MeshBasicMaterial({ map: barkTex, fog: true });
  tree.branchesMesh.material = barkMat;
  srcBarkMat.dispose();

  group.add(tree);

  // Bounds after scaling, for placement sanity checks.
  group.updateMatrixWorld(true);
  const worldBox = new THREE.Box3().setFromObject(group);
  const worldSize = worldBox.getSize(new THREE.Vector3());

  function update(elapsed) {
    tree.update(elapsed);
  }

  return {
    group,
    tree,
    update,
    stats: {
      height: worldSize.y,
      width: worldSize.x,
      scale: s,
      leaves: tree.options.leaves.count,
      triangles: Math.round(
        (tree.branchesMesh.geometry.index?.count ?? 0) / 3 +
        (tree.leavesMesh.geometry.index?.count ?? 0) / 3
      ),
      draws: 2,
    },
  };
}

export default createAnimeTree;
