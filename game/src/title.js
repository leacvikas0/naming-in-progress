import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CHARACTERS } from "./balance.js";
import { pxUrl } from "./assets.js";

const TARGET_HEIGHT = 1.9;
const IDLE_CLIPS = ["Idle", "Unarmed_Idle", "T-Pose"];
const STAGE = { x: 0.55, z: 13.5 };
const CAM_BASE = new THREE.Vector3(0, 1.62, 18.9);
const CAM_LOOK = new THREE.Vector3(0, 1.05, STAGE.z);
const SWAY = 0.34;
const SWAY_SPEED = 0.42;
const FACE_YAW = 0;
const RISE_FROM = -1.15;
const RISE_TIME = 0.5;
const DUST_COUNT = 54;
const SPOTLIGHT = 0xffc27a;
// Seconds of no interaction before the hero on the dais shows off. Flat and
// deterministic: a random window with a random chance read as "sometimes it
// never happens" rather than as personality.
const IDLE_FLOURISH = 8;

function boundsOf(meshes) {
  const box = new THREE.Box3();
  let found = false;
  for (const mesh of meshes) {
    if (!mesh || !mesh.geometry) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) continue;
    mesh.updateWorldMatrix(true, false);
    box.union(bb.clone().applyMatrix4(mesh.matrixWorld));
    found = true;
  }
  return found ? box : null;
}

function cleanGltf(gltf, keep) {
  const root = gltf && gltf.scene ? gltf.scene : null;
  if (!root) throw new Error("title: gltf has no scene");
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const skinned = [];
  const rigid = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
    else if (o.isMesh) rigid.push(o);
  });

  const keepList = Array.isArray(keep) ? keep.filter(Boolean) : [];
  const keepMatch = (name) => !!name && keepList.some((k) => name === k);
  const firstSkin = skinned.length ? skinned[0].skeleton : null;

  for (const mesh of skinned) {
    mesh.frustumCulled = false;
    if (firstSkin && mesh.skeleton && mesh.skeleton !== firstSkin) mesh.visible = false;
  }
  for (const mesh of rigid) {
    const parentName = mesh.parent ? mesh.parent.name : "";
    mesh.visible = keepMatch(mesh.name) || keepMatch(parentName);
  }

  const source = skinned.length ? skinned : rigid;
  const box = boundsOf(source);
  if (box && box.max.y - box.min.y > 1e-4) {
    const scale = TARGET_HEIGHT / (box.max.y - box.min.y);
    root.scale.setScalar(scale);
    root.position.y = -box.min.y * scale;
  }
  root.updateMatrixWorld(true);

  return { scene: root, animations: Array.isArray(gltf.animations) ? gltf.animations : [] };
}

function loadGltf(loader, url) {
  if (loader && typeof loader.loadAsync === "function") return Promise.resolve(loader.loadAsync(url));
  if (loader && typeof loader.load === "function") {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }
  return Promise.reject(new Error(`title: no usable loader for ${url}`));
}

function easeOutCubic(t) {
  const c = 1 - Math.min(1, Math.max(0, t));
  return 1 - c * c * c;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 186, 110, 0.55)");
  grad.addColorStop(0.45, "rgba(255, 150, 80, 0.2)");
  grad.addColorStop(1, "rgba(255, 140, 70, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBackdropTexture() {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(w / 2, h * 0.62, 20, w / 2, h * 0.62, w * 0.55);
  grad.addColorStop(0, "rgba(56, 38, 24, 0.9)");
  grad.addColorStop(0.5, "rgba(28, 19, 12, 0.72)");
  grad.addColorStop(1, "rgba(8, 6, 4, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTitle(options = {}) {
  const { scene, camera, events, loader = new GLTFLoader(), characters = CHARACTERS } = options;
  const bus = events && typeof events === "object" ? events : null;
  const list = characters && typeof characters === "object" ? Object.values(characters) : [];

  const group = new THREE.Group();
  group.name = "titleStage";
  group.visible = false;
  if (scene && typeof scene.add === "function") scene.add(group);

  const hemi = new THREE.HemisphereLight(0xffe2bd, 0x2a1c14, 1.15);
  group.add(hemi);

  const ambient = new THREE.AmbientLight(0x3a2c20, 1.4);
  group.add(ambient);

  const keyLight = new THREE.PointLight(SPOTLIGHT, 64, 17, 2);
  keyLight.position.set(STAGE.x + 0.8, 3.2, STAGE.z + 3.0);
  group.add(keyLight);

  const rimLight = new THREE.PointLight(0xff9a50, 30, 14, 2);
  rimLight.position.set(STAGE.x - 1.4, 2.5, STAGE.z - 2.2);
  group.add(rimLight);

  const fillLight = new THREE.PointLight(0xa8c8ff, 18, 14, 2);
  fillLight.position.set(STAGE.x - 2.4, 1.9, STAGE.z + 2.6);
  group.add(fillLight);

  const platformMat = new THREE.MeshStandardMaterial({ color: 0x4d463c, roughness: 0.94, metalness: 0.04 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 2.0, 0.22, 30), platformMat);
  platform.position.set(STAGE.x, -0.11, STAGE.z);
  group.add(platform);

  const platformTopMat = new THREE.MeshStandardMaterial({ color: 0x5c554a, roughness: 0.9, metalness: 0.05 });
  const platformTop = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.66, 0.05, 30), platformTopMat);
  platformTop.position.set(STAGE.x, 0.025, STAGE.z);
  group.add(platformTop);

  const backdropMat = new THREE.MeshBasicMaterial({
    map: makeBackdropTexture(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), backdropMat);
  backdrop.position.set(STAGE.x, 4.4, STAGE.z - 6.4);
  group.add(backdrop);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe8c169,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.3, 56), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(STAGE.x, 0.062, STAGE.z);
  group.add(ring);

  const glowMat = new THREE.MeshBasicMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 5.2), glowMat);
  glow.position.set(STAGE.x, 1.55, STAGE.z + 3.1);
  group.add(glow);

  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustSeeds = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const x = STAGE.x + (Math.random() - 0.5) * 5.2;
    const y = Math.random() * 3.4;
    const z = STAGE.z + (Math.random() - 0.5) * 3.4;
    dustPositions[i * 3] = x;
    dustPositions[i * 3 + 1] = y;
    dustPositions[i * 3 + 2] = z;
    dustSeeds.push({
      x,
      z,
      speed: 0.09 + Math.random() * 0.14,
      phase: Math.random() * Math.PI * 2,
      drift: 0.14 + Math.random() * 0.2,
    });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffbf80,
    size: 0.045,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const rosterHost = typeof document !== "undefined" ? document.getElementById("hero-list") : null;
  const detailHost = typeof document !== "undefined" ? document.getElementById("hero-detail") : null;
  const startBtn = typeof document !== "undefined" ? document.getElementById("start-btn") : null;

  const heroes = [];
  const byId = new Map();
  const bars = new Map();
  const badges = new Map();
  const party = [];
  let active = null;
  let selectedId = null;
  let time = 0;
  let visible = false;
  let built = false;
  let keyHandler = null;

  function emit(name, payload) {
    if (bus && typeof bus.emit === "function") bus.emit(name, payload);
  }

  function heroId(def, index) {
    return (def && (def.id || def.name)) || String(index);
  }

  function heroHex(def) {
    const color = def && Number.isFinite(def.color) ? def.color >>> 0 : 0xffffff;
    return "#" + color.toString(16).padStart(6, "0");
  }

  function playIdle(h) {
    if (!h.mixer || !h.actions) return;
    let action = null;
    for (const name of IDLE_CLIPS) {
      const found = h.actions.get(name);
      if (found) {
        action = found;
        break;
      }
    }
    if (!action) return;
    if (h.current === action && action.isRunning()) return;
    const prev = h.current;
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.reset();
    action.fadeIn(0.18);
    action.play();
    if (prev && prev !== action) prev.fadeOut(0.18);
    h.current = action;
    h.idleT = IDLE_FLOURISH;
  }

  // Each hero flourishes with a move that matches its weapon and temperament.
  // The per-hero clip is `pose` in balance.js. If a hero has no `pose`, fall
  // back to its own first combo move (weapon-appropriate by construction)
  // before ever reaching for the shared Cheer — an identical flourish for
  // every hero is the thing this exists to avoid.
  function flourishClip(h) {
    const def = h.def || {};
    const tries = [def.pose, ...(Array.isArray(def.combo) ? def.combo : []), "Cheer"];
    for (const name of tries) {
      if (!name) continue;
      const action = h.actions.get(name);
      if (action) return action;
    }
    return null;
  }

  function flourish(h) {
    if (!h.mixer || !h.actions) return;
    const action = flourishClip(h);
    if (!action) {
      playIdle(h);
      return;
    }
    if (action === h.current) action.stop();
    const prev = h.current;
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    // Hold the final pose at full weight until the finished handler has faded
    // the idle clip in. With clampWhenFinished = false three.js disables the
    // action the instant it ends (weight -> 0) and only then fires "finished",
    // so nothing drives the skeleton for a frame or two and the remainder
    // blends toward the bind pose: the hero's arms snap to its sides.
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.reset();
    action.fadeIn(0.1);
    action.play();
    if (prev && prev !== action) prev.fadeOut(0.12);
    h.current = action;
  }

  function setBarState() {
    for (const [id, bar] of bars) {
      bar.classList.toggle("selected", id === selectedId);
      const slot = party.indexOf(id);
      const picked = slot >= 0;
      bar.setAttribute("aria-pressed", picked ? "true" : "false");
      const badge = badges.get(id);
      if (!badge) continue;
      badge.textContent = picked ? String(slot + 1) : "";
      badge.style.display = picked ? "" : "none";
      badge.classList.toggle("hot", picked);
    }
  }

  function renderDetail() {
    if (!detailHost) return;
    const h = byId.get(selectedId);
    detailHost.innerHTML = "";
    if (!h) {
      detailHost.appendChild(el("p", "detail-empty", "Pick a hero from the line-up"));
      return;
    }
    const def = h.def || {};
    detailHost.style.setProperty("--hero-accent", heroHex(def));

    const head = el("div", "detail-head");
    const sigil = document.createElement("img");
    sigil.className = "detail-sigil";
    sigil.src = pxUrl(`sigil-${h.id}`);
    sigil.alt = "";
    sigil.width = 32;
    sigil.height = 32;
    head.appendChild(sigil);

    const headText = el("div", "detail-head-text");
    headText.appendChild(el("div", "detail-name", def.name || h.id));
    headText.appendChild(el("div", "detail-role", def.role || ""));
    head.appendChild(headText);
    detailHost.appendChild(head);

    detailHost.appendChild(el("p", "detail-blurb", def.blurb || ""));

    const stats = el("div", "detail-stats");
    const rows = [
      [def.hp, "HP", "hp"],
      [def.damage, "DMG", "dmg"],
      [def.moveSpeed, "SPD", "spd"],
    ];
    for (const [value, label, icon] of rows) {
      const stat = el("div", "detail-stat");
      const img = document.createElement("img");
      img.src = pxUrl(`icon-${icon}`);
      img.alt = "";
      img.width = 16;
      img.height = 16;
      stat.appendChild(img);
      const text = el("div", "detail-stat-text");
      text.appendChild(el("b", null, value === undefined || value === null ? "-" : String(value)));
      text.appendChild(el("span", null, label));
      stat.appendChild(text);
      stats.appendChild(stat);
    }
    detailHost.appendChild(stats);
  }

  function partyComplete() {
    return party.length === 2;
  }

  function setStartEnabled(enabled) {
    if (!startBtn) return;
    startBtn.disabled = !enabled;
    if (!enabled) startBtn.textContent = "Choose " + (2 - party.length) + " more";
    else startBtn.textContent = "Descend";
  }

  function emitParty() {
    emit("party-selected", { heroes: party.slice() });
  }

  // Two-slot pick: an unpicked hero fills the next empty slot, a picked hero
  // drops out. The dais always follows the focused hero; the party is
  // independent of focus so browsing the roster never changes the picks.
  function togglePick(id) {
    const slot = party.indexOf(id);
    if (slot >= 0) {
      party.splice(slot, 1);
      setBarState();
      setStartEnabled(partyComplete());
      emitParty();
      return;
    }
    if (party.length >= 2) return;
    party.push(id);
    setBarState();
    setStartEnabled(partyComplete());
    emitParty();
  }

  // `emote` distinguishes the two callers: switching to a hero (click, arrow
  // keys) makes it show off, while the initial auto-select at boot just stands
  // the hero up. Without that flag the first thing on screen is the knight
  // mid-swing before the player has touched anything.
  function selectHero(id, notify, emote) {
    if (!id || !byId.has(id)) return;
    selectedId = id;
    const h = byId.get(id);
    if (h !== active) {
      if (active) active.root.visible = false;
      h.root.visible = true;
      h.riseT = 0;
      h.root.position.set(STAGE.x, RISE_FROM, STAGE.z);
      active = h;
    }
    setBarState();
    renderDetail();
    setStartEnabled(partyComplete());
    if (emote) flourish(h);
    else if (h.current && IDLE_CLIPS.includes(h.current.getClip().name)) h.idleT = IDLE_FLOURISH;
    if (notify) emit("hero-selected", { id });
  }

  function barFor(h) {
    const def = h.def || {};
    const bar = el("button", "hero-bar px-roster");
    bar.type = "button";
    bar.style.setProperty("--hero-accent", heroHex(def));

    const sigil = document.createElement("img");
    sigil.className = "bar-sigil";
    sigil.src = pxUrl(`sigil-${h.id}`);
    sigil.alt = "";
    sigil.width = 32;
    sigil.height = 32;
    bar.appendChild(sigil);

    const text = el("span", "bar-text");
    text.appendChild(el("span", "bar-name", def.name || h.id));
    text.appendChild(el("span", "bar-role", def.role || ""));
    bar.appendChild(text);

    const badge = el("span", "bar-badge px-keycap");
    badge.setAttribute("aria-hidden", "true");
    // style.css is not ours to touch in this task, so the badge's corner
    // placement lives here next to the element it belongs to.
    badge.style.position = "absolute";
    badge.style.top = "-7px";
    badge.style.right = "-6px";
    badge.style.minWidth = "20px";
    badge.style.padding = "2px 4px 3px";
    badge.style.fontSize = "10px";
    badge.style.textAlign = "center";
    badge.style.pointerEvents = "none";
    badge.style.display = "none";
    bar.appendChild(badge);
    badges.set(h.id, badge);

    bar.addEventListener("click", () => {
      selectHero(h.id, true, true);
      togglePick(h.id);
      emit("sfx", { name: "ui-click" });
    });
    return bar;
  }

  async function build() {
    if (built) return;
    built = true;
    const results = await Promise.all(
      list.map(async (def, index) => {
        const id = heroId(def, index);
        try {
          const gltf = await loadGltf(loader, def.glb);
          return { id, def, clean: cleanGltf(gltf, def.keep) };
        } catch (err) {
          console.warn(`[title] failed to load ${def && def.glb}`, err);
          return { id, def, clean: null };
        }
      })
    );

    for (const entry of results) {
      const { id, def, clean } = entry;
      if (!clean) continue;
      const root = clean.scene;
      root.position.set(STAGE.x, RISE_FROM, STAGE.z);
      root.rotation.y = FACE_YAW;
      root.visible = false;
      group.add(root);

      const h = {
        id,
        def,
        root,
        mixer: null,
        actions: null,
        current: null,
        riseT: RISE_TIME,
        idleT: 7,
      };

      const clips = Array.isArray(clean.animations) ? clean.animations : [];
      if (clips.length) {
        h.mixer = new THREE.AnimationMixer(root);
        h.actions = new Map();
        for (const clip of clips) {
          if (clip && clip.name && !h.actions.has(clip.name)) {
            h.actions.set(clip.name, h.mixer.clipAction(clip));
          }
        }
        h.mixer.addEventListener("finished", (event) => {
          if (event.action === h.current) playIdle(h);
        });
        playIdle(h);
      }

      heroes.push(h);
      byId.set(id, h);

      if (rosterHost) {
        const bar = barFor(h);
        rosterHost.appendChild(bar);
        bars.set(id, bar);
      }
    }

    if (heroes.length) selectHero(heroes[0].id, false, false);
    setBarState();
    renderDetail();
    setStartEnabled(partyComplete());
  }

  function show() {
    visible = true;
    group.visible = true;
    time = 0;
    if (active) {
      active.riseT = 0;
      active.root.position.set(STAGE.x, RISE_FROM, STAGE.z);
    }
    if (typeof window !== "undefined" && !keyHandler) {
      keyHandler = (e) => {
        if (!visible || !heroes.length) return;
        const idx = heroes.findIndex((h) => h.id === selectedId);
        if (e.key === "ArrowRight" || e.key === "d") {
          selectHero(heroes[(idx + 1 + heroes.length) % heroes.length].id, true, true);
        } else if (e.key === "ArrowLeft" || e.key === "a") {
          selectHero(heroes[(idx - 1 + heroes.length) % heroes.length].id, true, true);
        } else if (e.key === "Enter" && selectedId) {
          // Enter descends when the party is full, otherwise it picks or
          // unpicks the focused hero. preventDefault stops a focused roster
          // bar / the start button from also firing its native activation,
          // which would toggle the same hero a second time.
          e.preventDefault();
          if (partyComplete()) emit("start-run", {});
          else togglePick(selectedId);
        }
      };
      window.addEventListener("keydown", keyHandler);
    }
  }

  function hide() {
    visible = false;
    group.visible = false;
  }

  function updateDust(step) {
    const positions = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST_COUNT; i++) {
      const seed = dustSeeds[i];
      let y = positions[i * 3 + 1] + seed.speed * step;
      if (y > 3.5) y -= 3.5;
      positions[i * 3] = seed.x + Math.sin(time * 0.5 + seed.phase) * seed.drift;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = seed.z + Math.cos(time * 0.4 + seed.phase) * seed.drift * 0.6;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    if (!visible) return;
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    time += step;

    if (active) {
      active.riseT = Math.min(RISE_TIME, active.riseT + step);
      const t = active.riseT / RISE_TIME;
      const y = RISE_FROM * (1 - easeOutCubic(t));
      active.root.position.set(STAGE.x, y, STAGE.z);
      active.root.rotation.y = FACE_YAW + Math.sin(time * SWAY_SPEED) * SWAY;
      if (active.mixer) active.mixer.update(step);

      if (active.current && IDLE_CLIPS.includes(active.current.getClip().name)) {
        active.idleT -= step;
        if (active.idleT <= 0) {
          active.idleT = IDLE_FLOURISH;
          flourish(active);
        }
      }
    }

    ringMat.opacity = 0.34 + 0.14 * Math.sin(time * 2.1);
    const s = 1 + 0.02 * Math.sin(time * 2.1);
    ring.scale.set(s, s, 1);
    glowMat.opacity = 0.46 + 0.06 * Math.sin(time * 1.3);
    updateDust(step);

    if (camera) {
      camera.position.set(
        CAM_BASE.x + Math.sin(time * 0.21) * 0.1,
        CAM_BASE.y + Math.sin(time * 0.33) * 0.05,
        CAM_BASE.z + Math.sin(time * 0.17) * 0.1
      );
      camera.lookAt(CAM_LOOK);
    }
  }

  if (startBtn && typeof startBtn.addEventListener === "function") {
    startBtn.addEventListener("click", () => {
      if (startBtn.disabled || !partyComplete()) return;
      emit("start-run", {});
      emit("sfx", { name: "ui-click" });
    });
  }

  return {
    group,
    build,
    show,
    hide,
    update,
    selectHero,
    get selectedId() {
      return selectedId;
    },
    get party() {
      return party.slice();
    },
    get visible() {
      return visible;
    },
  };
}
