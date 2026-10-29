import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const $ = (id) => document.getElementById(id);
const listEl = $("list");
const qEl = $("q");
const kindEl = $("kind");
const styleEl = $("style");
const packEl = $("pack");
const countsEl = $("counts");
const nameEl = $("name");
const metaEl = $("meta");
const nowEl = $("now");
const stageEl = $("stage");

const deckTitleEl = $("deck-title");
const deckSubEl = $("deck-sub");
const clipQEl = $("clip-q");
const clipGroupsEl = $("clip-groups");
const prevBtn = $("prev");
const playBtn = $("play");
const nextBtn = $("next");
const scrubEl = $("scrub");
const timeEl = $("time");
const speedEl = $("speed");
const loopBtn = $("loop");
const tourBtn = $("tour");
const bonesBtn = $("bones");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1612);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
camera.position.set(2.4, 1.6, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stageEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff1d6, 0x3a2a18, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffd9a8, 0.7);
rim.position.set(-3.5, 3, -4);
scene.add(rim);
const ground = new THREE.GridHelper(8, 16, 0x4a3d2e, 0x2a241c);
scene.add(ground);

const loader = new GLTFLoader();
let catalog = { assets: [] };
let root = null;
let mixer = null;
let clock = new THREE.Clock();
let actions = [];
let current = null;
let activeClip = null;
let skeleton = null;
let clipList = [];
let visibleClips = [];
let clipButtons = new Map();
let rigById = new Map();

const state = { loop: true, speed: 1, playing: true, bones: false, tour: false, tourAccum: 0, scrubbing: false };

const CLIP_GROUPS = [
  [/^Idle/, "Idle"],
  [/^(Walking|Running)/, "Locomotion"],
  [/^Jump/, "Jump"],
  [/^Dodge/, "Dodge"],
  [/^1H_Melee/, "1H Melee"],
  [/^2H_Melee/, "2H Melee"],
  [/^Dualwield/, "Dualwield"],
  [/^(Unarmed_Melee|Unarmed_Idle|Unarmed_Pose)/, "Unarmed"],
  [/^1H_Ranged/, "1H Ranged"],
  [/^2H_Ranged/, "2H Ranged"],
  [/^Block/, "Block"],
  [/^(Spellcast)/, "Spellcasting"],
  [/^Hit_/, "Hit reactions"],
  [/^Death/, "Death"],
  [/^(Skeleton|Skeletons|Spawn)/, "Awaken / spawn"],
  [/^Sit_Chair/, "Sit \u2014 chair"],
  [/^Sit_Floor/, "Sit \u2014 floor"],
  [/^Lie/, "Lie down"],
  [/^Taunt/, "Taunt"],
  [/^(Cheer|Interact|PickUp|Throw|Use_Item|T-Pose)/, "Interactions"],
];
const GROUP_ORDER = [
  "Idle", "Locomotion", "Jump", "Dodge", "1H Melee", "2H Melee", "Dualwield", "Unarmed",
  "1H Ranged", "2H Ranged", "Block", "Spellcasting", "Hit reactions", "Death",
  "Awaken / spawn", "Taunt", "Interactions", "Sit \u2014 chair", "Sit \u2014 floor", "Lie down", "Other",
];

function groupOf(name) {
  for (const [re, label] of CLIP_GROUPS) if (re.test(name)) return label;
  return "Other";
}

function resize() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(stageEl);
window.addEventListener("resize", resize);

function frameObject(object, height) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z, 0.2);
  const tall = height > 1.2;
  camera.position.set(
    center.x + max * (tall ? 1.5 : 1.6),
    center.y + max * (tall ? 0.45 : 0.9),
    center.z + max * (tall ? 2.1 : 1.8)
  );
  controls.target.set(center.x, center.y + (tall ? max * 0.06 : 0), center.z);
  camera.near = Math.max(max / 60, 0.01);
  camera.far = max * 60;
  camera.updateProjectionMatrix();
  controls.update();
}

function disposeMaterial(material) {
  for (const value of Object.values(material)) {
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}

function clearRoot() {
  if (root) {
    scene.remove(root);
    root.traverse((n) => {
      n.geometry?.dispose?.();
      if (Array.isArray(n.material)) n.material.forEach(disposeMaterial);
      else if (n.material) disposeMaterial(n.material);
    });
  }
  if (skeleton) {
    scene.remove(skeleton);
    skeleton.dispose?.();
    skeleton = null;
  }
  mixer?.stopAllAction();
  mixer = null;
  actions = [];
  current = null;
  activeClip = null;
  root = null;
  clipList = [];
  visibleClips = [];
  clipButtons = new Map();
}

/* Some packs ship double extensions (banner_blue.gltf.glb), which the index
   script keeps as the display name. Trim them for the UI. */
function displayName(asset) {
  return asset.name.replace(/\.(gltf|glb)$/i, "");
}

/* ---------- clip deck ---------- */

function setDeckOpen(open) {
  document.body.classList.toggle("deck-open", open);
  requestAnimationFrame(resize);
}

function updateTransport() {
  const has = Boolean(activeClip);
  playBtn.disabled = !has;
  prevBtn.disabled = !has;
  nextBtn.disabled = !has;
  scrubEl.disabled = !has;
  clipQEl.disabled = !actions.length;
  playBtn.textContent = state.playing ? "Pause" : "Play";
  playBtn.classList.toggle("on", state.playing);
  loopBtn.classList.toggle("on", state.loop);
  tourBtn.classList.toggle("on", state.tour);
  bonesBtn.classList.toggle("on", state.bones);
  bonesBtn.disabled = !skeleton;
  for (const btn of speedEl.querySelectorAll("button")) {
    btn.classList.toggle("on", Number(btn.dataset.speed) === state.speed);
  }
  if (!has) {
    scrubEl.value = 0;
    timeEl.textContent = "0.00 / 0.00 s";
  }
  updatePlayhead();
}

function updatePlayhead() {
  if (!activeClip || !current) return;
  const dur = activeClip.duration || 1;
  const t = current.time % dur;
  if (!state.scrubbing) scrubEl.value = String(Math.round((t / dur) * 1000));
  timeEl.textContent = `${t.toFixed(2)} / ${dur.toFixed(2)} s`;
}

function renderDeck(clips) {
  clipGroupsEl.innerHTML = "";
  clipButtons = new Map();
  if (!clips.length) {
    clipQEl.disabled = true;
    return;
  }
  clipQEl.disabled = false;
  const q = clipQEl.value.trim().toLowerCase();
  const shown = clips.filter((c) => !q || c.name.toLowerCase().includes(q));
  visibleClips = shown.map((c) => c.name);
  const groups = new Map();
  for (const clip of shown) {
    const label = groupOf(clip.name);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(clip);
  }
  const labels = [...groups.keys()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const label of labels) {
    const items = groups.get(label);
    const wrap = document.createElement("details");
    wrap.className = "clip-group";
    wrap.open = true;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${label}</span><span class="n">${items.length}</span>`;
    wrap.appendChild(summary);
    for (const clip of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "clip";
      btn.innerHTML = `<span>${clip.name}</span><span class="d">${clip.duration.toFixed(2)}s</span>`;
      btn.addEventListener("click", () => selectClip(clip.name));
      clipButtons.set(clip.name, btn);
      wrap.appendChild(btn);
    }
    clipGroupsEl.appendChild(wrap);
  }
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "clip-empty";
    empty.textContent = `No clip matches "${clipQEl.value}".`;
    clipGroupsEl.appendChild(empty);
  }
  markActiveClip();
}

function markActiveClip() {
  for (const [name, btn] of clipButtons) btn.classList.toggle("active", name === activeClip?.name);
  const active = activeClip && clipButtons.get(activeClip.name);
  active?.scrollIntoView({ block: "nearest" });
  const idx = activeClip ? visibleClips.indexOf(activeClip.name) : -1;
  nowEl.textContent = activeClip
    ? (idx >= 0 ? `${activeClip.name} \u00b7 ${idx + 1}/${visibleClips.length}` : activeClip.name)
    : "";
}

function buildDeck(asset) {
  if (!clipList.length) {
    setDeckOpen(false);
    deckTitleEl.textContent = "Static prop";
    deckSubEl.textContent = `${displayName(asset)} \u2014 no skeleton, no clips`;
    nowEl.textContent = "static prop \u2014 nothing to play";
    return;
  }
  const rig = rigById.get(asset.id);
  setDeckOpen(true);
  deckTitleEl.textContent = displayName(asset);
  deckSubEl.textContent = [
    `${clipList.length} clips`,
    rig?.joints ? `${rig.joints} joints` : null,
    `${asset.pack}`,
  ].filter(Boolean).join(" \u00b7 ");
  clipQEl.value = "";
  renderDeck(clipList);
}

/* ---------- playback ---------- */

function applyActionSettings(action) {
  action.setEffectiveTimeScale(state.speed);
  action.setEffectiveWeight(1);
  action.setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, state.loop ? Infinity : 1);
  action.clampWhenFinished = !state.loop;
}

function playClip(name, { restart = false, fade = 0.15 } = {}) {
  const action = actions.find((a) => a.getClip().name === name);
  if (!action) return;
  if (current === action && !restart) return;
  const prev = current;
  action.reset();
  applyActionSettings(action);
  action.fadeIn(fade).play();
  if (prev && prev !== action) prev.fadeOut(fade);
  current = action;
  activeClip = action.getClip();
  state.playing = true;
  state.tourAccum = 0;
  markActiveClip();
  updateTransport();
}

function selectClip(name) {
  state.playing = true;
  playClip(name, { restart: true });
}

function step(delta) {
  if (!visibleClips.length || !activeClip) return;
  const idx = visibleClips.indexOf(activeClip.name);
  const next = visibleClips[(idx + delta + visibleClips.length) % visibleClips.length];
  playClip(next, { restart: true, fade: 0.08 });
}

function togglePlay() {
  if (!current) return;
  state.playing = !state.playing;
  current.paused = !state.playing;
  updateTransport();
}

function setSpeed(value) {
  state.speed = value;
  if (current) current.setEffectiveTimeScale(value);
  updateTransport();
}

function setLoop(value) {
  state.loop = value;
  if (current) {
    applyActionSettings(current);
    if (!value && current.time >= (activeClip?.duration ?? 0) - 1e-4) current.time = 0;
  }
  updateTransport();
}

function setBones(value) {
  state.bones = value;
  if (skeleton) skeleton.visible = value;
  updateTransport();
}

function setTour(value) {
  state.tour = value;
  state.tourAccum = 0;
  updateTransport();
}

playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => step(-1));
nextBtn.addEventListener("click", () => step(1));
loopBtn.addEventListener("click", () => setLoop(!state.loop));
tourBtn.addEventListener("click", () => setTour(!state.tour));
bonesBtn.addEventListener("click", () => setBones(!state.bones));
speedEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-speed]");
  if (btn) setSpeed(Number(btn.dataset.speed));
});
clipQEl.addEventListener("input", () => renderDeck(clipList));

scrubEl.addEventListener("pointerdown", () => { state.scrubbing = true; });
scrubEl.addEventListener("pointerup", () => { state.scrubbing = false; });
scrubEl.addEventListener("input", () => {
  if (!current || !activeClip) return;
  const dur = activeClip.duration || 1;
  current.time = (Number(scrubEl.value) / 1000) * dur;
  mixer.update(0);
  timeEl.textContent = `${current.time.toFixed(2)} / ${dur.toFixed(2)} s`;
});

window.addEventListener("keydown", (e) => {
  const target = e.target;
  const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "select" || tag === "textarea" || target?.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
  else if (e.key === " ") { togglePlay(); e.preventDefault(); }
  else if (e.key.toLowerCase() === "l") setLoop(!state.loop);
  else if (e.key.toLowerCase() === "b") setBones(!state.bones);
  else if (e.key === ",") setSpeed(Math.max(0.25, state.speed / 2));
  else if (e.key === ".") setSpeed(Math.min(2, state.speed * 2));
});

/* ---------- loading ---------- */

async function loadAsset(asset) {
  clearRoot();
  nameEl.textContent = displayName(asset);
  const bytes = `${Math.round(asset.bytes / 1024)} KB`;
  metaEl.innerHTML = "";
  const line = document.createElement("span");
  line.textContent = `${asset.pack} \u00b7 ${asset.kind} \u00b7 ${asset.author} \u00b7 ${asset.license} \u00b7 ${bytes}`;
  const path = document.createElement("code");
  path.textContent = `library/${asset.pack}/${asset.relPath}`;
  path.title = "Click to copy the on-disk path";
  path.addEventListener("click", () => navigator.clipboard?.writeText(path.textContent));
  metaEl.append(line, path);
  nowEl.textContent = "";
  deckTitleEl.textContent = displayName(asset);
  deckSubEl.textContent = "loading\u2026";
  clipGroupsEl.innerHTML = "";

  let gltf;
  try {
    gltf = await loader.loadAsync(asset.url);
  } catch (err) {
    setDeckOpen(true);
    deckSubEl.textContent = "failed to load";
    clipGroupsEl.innerHTML = `<p class="clip-empty">${err?.message || err}</p>`;
    metaEl.append(document.createTextNode(" \u2014 load failed"));
    updateTransport();
    return;
  }

  root = gltf.scene;
  root.traverse((n) => {
    if (n.isMesh) n.frustumCulled = false;
  });
  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const height = box.getSize(new THREE.Vector3()).y;
  frameObject(root, height);

  const clips = (gltf.animations || []).map((clip) => ({ name: clip.name, duration: clip.duration }));
  clipList = clips;
  visibleClips = clips.map((c) => c.name);

  if (clips.length) {
    mixer = new THREE.AnimationMixer(root);
    actions = gltf.animations.map((clip) => mixer.clipAction(clip));
    skeleton = new THREE.SkeletonHelper(root);
    skeleton.visible = state.bones;
    scene.add(skeleton);
    buildDeck(asset);
    const preferred = clips.find((c) => c.name === "Idle") || clips.find((c) => c.name === "Idle_B") || clips[0];
    playClip(preferred.name, { restart: true, fade: 0 });
  } else {
    buildDeck(asset);
  }
  updateTransport();
}

/* ---------- browser ---------- */

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

function activeKind() {
  return kindEl.querySelector("button.on")?.dataset.kind ?? "";
}

function filtered() {
  const q = qEl.value.trim().toLowerCase();
  const style = styleEl.value;
  const pack = packEl.value;
  const kind = activeKind();
  return catalog.assets.filter((a) => {
    if (kind === "kaykit" && !a.pack.startsWith("kaykit-")) return false;
    if (kind && kind !== "kaykit" && a.kind !== kind) return false;
    if (style && a.style !== style) return false;
    if (pack && a.pack !== pack) return false;
    if (!q) return true;
    return `${a.name} ${a.pack} ${a.kind} ${a.style}`.toLowerCase().includes(q);
  });
}

const CAP = 700;

function renderList() {
  const items = filtered();
  const total = catalog.assets.length;
  const shown = items.slice(0, CAP);
  countsEl.textContent = items.length === total
    ? `${total} meshes`
    : `${items.length} of ${total} meshes${items.length > CAP ? ` \u00b7 showing ${CAP}` : ""}`;
  listEl.innerHTML = "";
  for (const asset of shown) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isKayKit = asset.pack.startsWith("kaykit-");
    btn.innerHTML =
      `<span class="nm">${displayName(asset)}</span>` +
      (asset.rigged ? `<span class="clips">rigged</span>` : "") +
      `<span class="tag">${isKayKit ? "KayKit" : asset.style}</span>`;
    btn.title = `library/${asset.pack}/${asset.relPath}`;
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
kindEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-kind]");
  if (!btn) return;
  for (const b of kindEl.querySelectorAll("button")) b.classList.toggle("on", b === btn);
  renderList();
});

/* ---------- loop ---------- */

function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  if (mixer) {
    mixer.update(state.playing ? dt : 0);
    if (state.tour && state.playing && activeClip) {
      state.tourAccum += dt;
      const hold = (activeClip.duration || 1) + 0.35;
      if (state.tourAccum >= hold) {
        state.tourAccum = 0;
        step(1);
      }
    }
    updatePlayhead();
  }
  controls.update();
  renderer.render(scene, camera);
}
tick();

const data = await fetch("/catalog/index.json").then((r) => r.json());
catalog = data;
try {
  const rig = await fetch("/reports/rig-inspect.json").then((r) => r.json());
  rigById = new Map((rig.reports || []).map((entry) => [entry.id, entry]));
} catch {
  rigById = new Map();
}
fillFilters();
renderList();

const firstChar = catalog.assets.find((a) => a.pack.startsWith("kaykit-") && a.kind === "character");
if (firstChar) {
  const btn = [...listEl.querySelectorAll("button")].find((b) => b.textContent.includes(firstChar.name));
  btn?.classList.add("active");
  await loadAsset(firstChar);
}
