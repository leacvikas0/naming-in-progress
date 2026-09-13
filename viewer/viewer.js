import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const listEl = document.getElementById("list");
const qEl = document.getElementById("q");
const styleEl = document.getElementById("style");
const packEl = document.getElementById("pack");
const countsEl = document.getElementById("counts");
const nameEl = document.getElementById("name");
const metaEl = document.getElementById("meta");
const clipEl = document.getElementById("clip");
const stageEl = document.getElementById("stage");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1612);
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
camera.position.set(2.4, 1.6, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stageEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff1d6, 0x3a2a18, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 6, 4);
scene.add(key);
const ground = new THREE.GridHelper(8, 16, 0x4a3d2e, 0x2a241c);
scene.add(ground);

const loader = new GLTFLoader();
let catalog = { assets: [] };
let root = null;
let mixer = null;
let clock = new THREE.Clock();
let actions = [];

function resize() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
resize();

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z, 0.2);
  camera.position.set(center.x + max * 1.6, center.y + max * 0.9, center.z + max * 1.8);
  controls.target.copy(center);
  camera.near = max / 40;
  camera.far = max * 40;
  camera.updateProjectionMatrix();
}

function clearRoot() {
  if (root) {
    scene.remove(root);
    root.traverse((n) => {
      if (n.geometry) n.geometry.dispose?.();
    });
  }
  mixer = null;
  actions = [];
  root = null;
}

function fillClips(clips) {
  clipEl.innerHTML = "";
  if (!clips.length) {
    clipEl.disabled = true;
    clipEl.innerHTML = "<option>no clips (static prop)</option>";
    return;
  }
  clipEl.disabled = false;
  for (const clip of clips) {
    const opt = document.createElement("option");
    opt.value = clip.name;
    opt.textContent = clip.name;
    clipEl.appendChild(opt);
  }
}

function playClip(name) {
  if (!mixer) return;
  mixer.stopAllAction();
  const action = actions.find((a) => a.getClip().name === name);
  if (action) {
    action.reset().fadeIn(0.15).play();
  }
}

clipEl.addEventListener("change", () => playClip(clipEl.value));

async function loadAsset(asset) {
  clearRoot();
  nameEl.textContent = asset.name;
  metaEl.textContent = `${asset.pack} · ${asset.kind} · ${asset.license} · ${Math.round(asset.bytes / 1024)} KB`;
  const gltf = await loader.loadAsync(asset.url);
  root = gltf.scene;
  scene.add(root);
  frameObject(root);

  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(root);
    actions = gltf.animations.map((clip) => mixer.clipAction(clip));
    fillClips(gltf.animations);
    playClip(gltf.animations[0].name);
  } else {
    fillClips([]);
  }
}

function fillFilters() {
  const styles = [...new Set(catalog.assets.map((a) => a.style))].sort();
  const packs = [...new Set(catalog.assets.map((a) => a.pack))].sort();
  for (const s of styles) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    styleEl.appendChild(opt);
  }
  for (const p of packs) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    packEl.appendChild(opt);
  }
}

function renderList() {
  const q = qEl.value.trim().toLowerCase();
  const style = styleEl.value;
  const pack = packEl.value;
  const items = catalog.assets.filter((a) => {
    if (style && a.style !== style) return false;
    if (pack && a.pack !== pack) return false;
    if (!q) return true;
    return `${a.name} ${a.pack} ${a.kind} ${a.style}`.toLowerCase().includes(q);
  });
  countsEl.textContent = `${items.length} / ${catalog.assets.length} meshes`;
  listEl.innerHTML = "";
  for (const asset of items.slice(0, 800)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `${asset.name}<span class="tag">${asset.style}</span>`;
    btn.addEventListener("click", () => {
      for (const b of listEl.querySelectorAll("button")) b.classList.remove("active");
      btn.classList.add("active");
      loadAsset(asset).catch((err) => {
        metaEl.textContent = String(err);
      });
    });
    listEl.appendChild(btn);
  }
}

qEl.addEventListener("input", renderList);
styleEl.addEventListener("change", renderList);
packEl.addEventListener("change", renderList);

function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  mixer?.update(dt);
  controls.update();
  renderer.render(scene, camera);
}
tick();

const data = await fetch("/catalog/index.json").then((r) => r.json());
catalog = data;
fillFilters();
renderList();
const firstChar = catalog.assets.find((a) => a.kind === "character") || catalog.assets[0];
if (firstChar) {
  const btn = [...listEl.querySelectorAll("button")].find((b) =>
    b.textContent.includes(firstChar.name)
  );
  btn?.classList.add("active");
  await loadAsset(firstChar);
}
