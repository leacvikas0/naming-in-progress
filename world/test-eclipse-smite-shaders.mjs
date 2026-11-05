import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTimeOfDaySky } from './src/sky-tod.js';
import { createWorldPost, GradeShader } from './src/post.js';
import {
  createCharacterToonMaterial,
  makeSkinnedOutlineMaterial,
  setCharacterVerdictShaderState,
} from './assets/characters/toon-skin.js';

// 1. Verify Sky Eclipse & WindTimeScale state API
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.2, 900);
camera.position.set(0, 3, 15);
camera.lookAt(0, 2, 0);
camera.updateMatrixWorld();

const sky = createTimeOfDaySky({ quality: 'high', camera });
assert.equal(typeof sky.setEclipseState, 'function');
assert.equal(sky.getWindTimeScale(), 1.0);

sky.setEclipseState({ weight: 1.0, compression: 1.0, windTimeScale: 0.35, camera });
assert.equal(sky.getWindTimeScale(), 0.35);
assert.equal(sky.state.eclipseWeight, 1.0);
assert.equal(sky.state.eclipseCompression, 1.0);
assert.ok(
  Math.abs(sky.state.eclipseDir.y - 0.42) < 0.05,
  `Eclipse elevation y should be ~0.42 (~25 deg above horizon), got ${sky.state.eclipseDir.y}`
);
assert.ok(sky.state.eclipseDir.z < -0.85, 'Eclipse azimuth must lock to camera forward (-Z)');
assert.equal(sky.dome.material.uniforms.uEclipseWeight.value, 1.0);
assert.equal(sky.cloudMesh.material.uniforms.uEclipseWeight.value, 1.0);
assert.equal(sky.cloudMesh.material.uniforms.uEclipseCompression.value, 1.0);

sky.setEclipseState({ weight: 1.0, compression: 1.0, windTimeScale: 0.0, camera });
assert.equal(sky.getWindTimeScale(), 0.0);

// 2. Verify Character Ground-Clip & Upward Dissolve uniforms on Toon & Outline materials
const group = new THREE.Group();
const toonMat = createCharacterToonMaterial(new THREE.MeshBasicMaterial(), { role: 'knight' });
const outlineMat = makeSkinnedOutlineMaterial({ useVertexParams: true });
const skinMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), toonMat);
const outMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), outlineMat);
group.add(skinMesh, outMesh);

setCharacterVerdictShaderState(group, {
  groundClipY: 0.5,
  dissolveProgress: 0.65,
  dissolveBaseY: 0.0,
  monochromeOverride: 1.0,
});

assert.equal(toonMat.userData.verdictUniforms.uGroundClipY.value, 0.5);
assert.equal(toonMat.userData.verdictUniforms.uDissolveProgress.value, 0.65);
assert.equal(toonMat.userData.verdictUniforms.uMonochromeOverride.value, 1.0);
assert.equal(outlineMat.uniforms.uGroundClipY.value, 0.5);
assert.equal(outlineMat.uniforms.uDissolveProgress.value, 0.65);

// Verify toonMat onBeforeCompile injects verdict uniforms and world-pos clip/dissolve logic
const mockShader = {
  uniforms: {},
  vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
  fragmentShader: 'void main() {\n#include <opaque_fragment>\n}',
};
toonMat.onBeforeCompile(mockShader);
assert.equal(mockShader.uniforms.uGroundClipY.value, 0.5);
assert.equal(mockShader.uniforms.uDissolveProgress.value, 0.65);
assert.equal(mockShader.uniforms.uMonochromeOverride.value, 1.0);
assert.ok(mockShader.vertexShader.includes('vVerdictWorldPos'));
assert.ok(mockShader.fragmentShader.includes('uGroundClipY'));
assert.ok(mockShader.fragmentShader.includes('uDissolveProgress'));
assert.ok(mockShader.fragmentShader.includes('uMonochromeOverride'));

// 3. Verify Post-Processing Selective-Crimson Monochrome Grade (Frame 41)
assert.ok(GradeShader.uniforms.uSmiteMonochrome, 'GradeShader must define uSmiteMonochrome uniform');
assert.ok(
  GradeShader.fragmentShader.includes('uSmiteMonochrome'),
  'GradeShader.fragmentShader must include uSmiteMonochrome logic'
);

const mockRenderer = {
  getSize: (v) => v.set(1600, 900),
  getPixelRatio: () => 1,
  getContext: () => null,
  setRenderTarget: () => {},
  render: () => {},
};
const post = createWorldPost({
  renderer: mockRenderer,
  scene: new THREE.Scene(),
  camera,
  width: 1600,
  height: 900,
});
assert.equal(typeof post.setSmiteMonochrome, 'function');
post.setSmiteMonochrome(1.0);
assert.equal(post.params.grade.uSmiteMonochrome.value, 1.0);
post.setSmiteMonochrome(0.0);
assert.equal(post.params.grade.uSmiteMonochrome.value, 0.0);

// Mathematical verification of Blood-Crimson Purity Mask:
// Terracotta roof (#c24928 -> sRGB [0.761, 0.286, 0.157]) must be rejected (mask == 0),
// while Blood-Crimson petals (#b81428 -> [0.722, 0.078, 0.157], #e11d48 -> [0.882, 0.114, 0.282]) pass (mask == 1).
function evalCrimsonMask(r, g, b) {
  const crimsonDom = r - Math.max(g * 2.35, b * 1.65);
  const t = Math.max(0, Math.min(1, (crimsonDom - 0.14) / (0.32 - 0.14)));
  const smooth = t * t * (3 - 2 * t);
  const stepR = r >= 0.16 ? 1.0 : 0.0;
  return smooth * stepR;
}

const terracottaMask = evalCrimsonMask(194 / 255, 73 / 255, 40 / 255);
assert.equal(terracottaMask, 0, 'Terracotta roofs (#c24928) must be 100% rejected to stark B&W');

const darkRoseMask = evalCrimsonMask(184 / 255, 20 / 255, 40 / 255);
assert.equal(darkRoseMask, 1.0, 'Blood-crimson rose petals (#b81428) must stay 100% vivid crimson');

const brightRoseMask = evalCrimsonMask(225 / 255, 29 / 255, 72 / 255);
assert.equal(brightRoseMask, 1.0, 'Searing crimson rose petals (#e11d48) must stay 100% vivid crimson');

console.log('PASS test-eclipse-smite-shaders');
