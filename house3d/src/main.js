import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTextures } from './textures.js';
import { createMaterials } from './materials.js';
import { buildHouse } from './house.js';
import { buildEnvironment } from './env.js';

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');

/* ------------------------------------------------------------------ renderer */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* --------------------------------------------------------------------- scene */
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9edf8, 55, 145);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(16.5, 10.6, 22.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 4.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minPolarAngle = 0.16;
controls.autoRotateSpeed = 0.55;
controls.update();

/* --------------------------------------------------------------------- build */
const textures = createTextures(renderer);
const materials = createMaterials(textures);

const house = buildHouse(materials);
house.name = 'house';
scene.add(house);

const environment = buildEnvironment(materials, textures);
environment.name = 'environment';
scene.add(environment);

scene.add(buildSky());
addLights();

/* ---------------------------------------------------------------------- sky */
function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(170, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x4a9fe4) },
        uMid: { value: new THREE.Color(0x9ed5f3) },
        uHorizon: { value: new THREE.Color(0xe9f7ff) },
        uSun: { value: new THREE.Vector3(-0.42, 0.52, 0.74).normalize() },
        uSunColor: { value: new THREE.Color(0xfff3d0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uMid, uHorizon, uSunColor;
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
          float sun = pow(max(dot(vDir, uSun), 0.0), 220.0);
          float halo = pow(max(dot(vDir, uSun), 0.0), 8.0);
          col += uSunColor * sun * 0.85;
          col += uSunColor * halo * 0.10;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

/* ------------------------------------------------------------------- lights */
function addLights() {
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x8f7c5a, 1.05));

  const key = new THREE.DirectionalLight(0xfff0d4, 2.5);
  key.position.set(-9, 16, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -19;
  key.shadow.camera.right = 19;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -14;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.7);
  fill.position.set(14, 7, -10);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd6a6, 0.55);
  rim.position.set(2, 5, -16);
  scene.add(rim);
}

/* ------------------------------------------------------------------- views */
const VIEWS = {
  hero: { pos: [16.5, 10.6, 22.5], target: [0, 4.8, 0] },
  front: { pos: [0, 5.6, 27], target: [0, 4.9, 0] },
  right: { pos: [24, 7.6, 10], target: [0, 4.4, 0] },
  left: { pos: [-24, 7.6, 10], target: [0, 4.4, 0] },
  back: { pos: [-11, 9, -24], target: [0, 4.2, 0] },
  top: { pos: [8, 25, 18], target: [0, 3.8, 0] },
  door: { pos: [2.7, 2.7, 11], target: [0, 2.5, 5.1] },
};

const tween = { active: false, t: 0, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3() };

function setView(name) {
  const view = VIEWS[name] || VIEWS.hero;
  tween.active = true;
  tween.t = 0;
  tween.fromPos.copy(camera.position);
  tween.toPos.set(...view.pos);
  tween.fromTarget.copy(controls.target);
  tween.toTarget.set(...view.target);
}

controls.addEventListener('start', () => {
  tween.active = false;
});

/* --------------------------------------------------------------------- UI */
const turntableBtn = document.getElementById('turntable');
const outlinesBtn = document.getElementById('outlines');

turntableBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  turntableBtn.setAttribute('aria-pressed', String(controls.autoRotate));
});

let outlinesOn = true;
outlinesBtn.addEventListener('click', () => {
  outlinesOn = !outlinesOn;
  outlinesBtn.setAttribute('aria-pressed', String(outlinesOn));
  scene.traverse((obj) => {
    if (obj.userData.isOutline) obj.visible = outlinesOn;
  });
});

const keyViews = ['hero', 'front', 'right', 'left', 'back', 'top'];
window.addEventListener('keydown', (event) => {
  const index = Number(event.key) - 1;
  if (index >= 0 && index < keyViews.length) setView(keyViews[index]);
  if (event.key.toLowerCase() === 'o') outlinesBtn.click();
  if (event.key.toLowerCase() === 'r') turntableBtn.click();
});

/* ------------------------------------------------------------------- resize */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* --------------------------------------------------------------------- loop */
const clock = new THREE.Clock();
let firstFrame = true;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (tween.active) {
    tween.t = Math.min(tween.t + dt / 0.9, 1);
    const k = easeInOutCubic(tween.t);
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
    if (tween.t >= 1) tween.active = false;
  }

  controls.update();
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    window.__ready = true;
    requestAnimationFrame(() => loading.classList.add('done'));
  }
});

/* -------------------------------------------------------------------- debug */
window.__house = { scene, camera, controls, renderer, materials, textures, setView, VIEWS };

window.addEventListener('error', (event) => {
  const fatal = document.getElementById('fatal');
  fatal.style.display = 'grid';
  fatal.textContent = `Something failed to build: ${event.message}`;
});
