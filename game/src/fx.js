import * as THREE from "three";
import { PALETTE, CONFIG, clamp, damp } from "./balance.js";

// fx.js — pooled combat feel: damage numbers, hit sparks, slash arcs, ground rings,
// physical coins, hitstop / slow-motion and camera shake.
//
// Frame contract with main.js:
//   - gameplay advances with `dt * fx.timeScale`; fx.update always receives the RAW dt.
//   - call fx.update(rawDt, player) LAST in the frame, after main positions the camera.
//     fx removes its previous shake offset (tracked in camera.userData.fx), re-bases if
//     main moved the camera, then applies the new offset — main's camera logic is safe.
//
// update() allocates nothing: pools, typed arrays and scratch objects live in createFX.

const MAX_NUMBERS = 48;
const MAX_BURSTS = 8;
const BURST_PARTICLES = 32;
const MAX_ARCS = 8;
const MAX_RINGS = 8;
const MAX_COINS = 64;
const COIN_LIFE = CONFIG.combat.coinLifetime;
const COIN_MAGNET_SQ = CONFIG.combat.coinMagnet * CONFIG.combat.coinMagnet;
const COIN_PICKUP_SQ = 0.8 * 0.8;
const TWO_PI = Math.PI * 2;

const BURST_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const BURST_FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.12, r) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

// Headless (node) canvas stub: no 2D context exists, but the texture is never
// uploaded without a renderer, so a recording no-op surface is enough.
function stubCanvas(w, h) {
  const canvas = { width: w, height: h, style: {} };
  const ctx = new Proxy(
    { canvas, measureText: () => ({ width: 0 }) },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => undefined;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
  canvas.getContext = () => ctx;
  return canvas;
}

function createCanvas(w, h) {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return stubCanvas(w, h);
}

function cssColor(c) {
  if (typeof c === "number") return `#${(c >>> 0).toString(16).padStart(6, "0")}`;
  if (typeof c === "string") return c;
  return "#f4efe6";
}

export function createFX({ scene, camera, events, rng, world } = {}) {
  const rand = typeof rng === "function" ? rng : Math.random;
  const cam = camera || null;

  const group = new THREE.Group();
  group.name = "fx";
  if (scene) scene.add(group);

  const tmpColor = new THREE.Color();
  const tmpBox = new THREE.Box3();
  const tmpVec = new THREE.Vector3();
  const lastPlayer = new THREE.Vector3();
  let hasPlayer = false;

  // ---- time scaling -------------------------------------------------------
  let timeScale = 1;
  let hitstopT = 0;
  let slowT = 0;
  let slowScale = 0.35;

  // ---- shake --------------------------------------------------------------
  let trauma = 0;
  let shakeTime = 0;
  const phase = new Float32Array(8);
  for (let i = 0; i < 8; i++) phase[i] = rand() * TWO_PI;

  let camApplied = false;
  let camBaseX = 0;
  let camBaseY = 0;
  let camBaseZ = 0;
  let camBaseRoll = 0;
  let camOffX = 0;
  let camOffY = 0;
  let camOffZ = 0;
  let camOffRoll = 0;
  const camData = cam
    ? (cam.userData.fx = cam.userData.fx || { offset: { x: 0, y: 0, z: 0, roll: 0 }, applied: false })
    : null;

  // ---- damage numbers -----------------------------------------------------
  const numbers = [];
  for (let i = 0; i < MAX_NUMBERS; i++) {
    const canvas = createCanvas(192, 96);
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 30;
    sprite.userData.fxKind = "number";
    group.add(sprite);
    numbers.push({
      sprite,
      ctx,
      texture,
      active: false,
      age: 0,
      life: 0.8,
      rise: 1.5,
      driftX: 0,
      driftZ: 0,
      baseScale: 1,
    });
  }

  function drawNumber(slot, text, color, crit) {
    const ctx = slot.ctx;
    const w = 192;
    const h = 96;
    ctx.clearRect(0, 0, w, h);
    ctx.font = `900 ${crit ? 62 : 56}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(8, 6, 8, 0.9)";
    ctx.strokeText(text, w / 2, h / 2 + 2);
    ctx.fillStyle = cssColor(color);
    ctx.fillText(text, w / 2, h / 2 + 2);
    slot.texture.needsUpdate = true;
  }

  function damageNumber(pos, amount, opts) {
    if (!pos) return;
    const o = opts || {};
    const crit = !!o.crit;
    const heal = !!o.heal;
    const raw = Number.isFinite(amount) ? amount : 0;
    const n = Math.max(1, Math.round(raw));
    const color = o.color != null ? o.color : heal ? 0x7fe0a0 : crit ? PALETTE.gold : 0xf4efe6;
    const text = (heal ? "+" : "") + n + (crit ? "!" : "");

    let slot = null;
    for (let i = 0; i < MAX_NUMBERS; i++) {
      if (!numbers[i].active) {
        slot = numbers[i];
        break;
      }
    }
    if (!slot) {
      slot = numbers[0];
      for (let i = 1; i < MAX_NUMBERS; i++) {
        if (numbers[i].age > slot.age) slot = numbers[i];
      }
    }

    drawNumber(slot, text, color, crit);
    slot.active = true;
    slot.age = 0;
    slot.life = 0.8;
    slot.rise = 1.5; // ~1.2 units over the 0.8s life
    slot.driftX = (rand() - 0.5) * 0.8;
    slot.driftZ = (rand() - 0.5) * 0.8;
    slot.baseScale = (crit ? 1.6 : 1) * (heal ? 1.05 : 1) * (Number.isFinite(o.scale) ? o.scale : 1);
    const yOff = Number.isFinite(o.y) ? o.y : 0.6;
    const s = slot.sprite;
    s.position.set(pos.x, (pos.y || 0) + yOff, pos.z);
    s.scale.set(1.2 * slot.baseScale * 1.3, 0.6 * slot.baseScale * 1.3, 1);
    s.material.opacity = 1;
    s.visible = true;
  }

  // ---- particle bursts ----------------------------------------------------
  const bursts = [];
  let burstNext = 0;
  for (let s = 0; s < MAX_BURSTS; s++) {
    const posArr = new Float32Array(BURST_PARTICLES * 3);
    const colArr = new Float32Array(BURST_PARTICLES * 3);
    const sizeArr = new Float32Array(BURST_PARTICLES);
    const alphaArr = new Float32Array(BURST_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizeArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BURST_VERT,
      fragmentShader: BURST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = 6;
    points.userData.fxKind = "burst";
    group.add(points);
    bursts.push({
      points,
      geo,
      posArr,
      colArr,
      sizeArr,
      alphaArr,
      vx: new Float32Array(BURST_PARTICLES),
      vy: new Float32Array(BURST_PARTICLES),
      vz: new Float32Array(BURST_PARTICLES),
      life: new Float32Array(BURST_PARTICLES),
      maxLife: 0.001,
      gravity: -12,
      count: 0,
      active: false,
    });
  }

  function burst(pos, opts) {
    if (!pos) return;
    const o = opts || {};
    let sys = null;
    for (let i = 0; i < MAX_BURSTS; i++) {
      if (!bursts[i].active) {
        sys = bursts[i];
        break;
      }
    }
    if (!sys) {
      sys = bursts[burstNext];
      burstNext = (burstNext + 1) % MAX_BURSTS;
    }
    const count = Math.min(BURST_PARTICLES, Math.max(1, Math.round(o.count != null ? o.count : 14)));
    const speed = o.speed != null ? o.speed : 6;
    const size = o.size != null ? o.size : 0.16;
    const life = o.life != null ? o.life : 0.6;
    sys.gravity = o.gravity != null ? o.gravity : -12;
    const up = o.up != null ? o.up : 1.4;
    tmpColor.set(o.color != null ? o.color : PALETTE.torch);

    let maxLife = 0.001;
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * TWO_PI;
      const rr = Math.sqrt(Math.max(0, 1 - u * u));
      const spd = speed * (0.55 + rand() * 0.9);
      sys.vx[i] = Math.cos(th) * rr * spd;
      sys.vy[i] = u * spd + up * (0.5 + rand() * 0.8);
      sys.vz[i] = Math.sin(th) * rr * spd;
      const lf = life * (0.7 + rand() * 0.6);
      sys.life[i] = lf;
      if (lf > maxLife) maxLife = lf;
      const j = i * 3;
      sys.posArr[j] = pos.x + (rand() - 0.5) * 0.12;
      sys.posArr[j + 1] = pos.y + (rand() - 0.5) * 0.12;
      sys.posArr[j + 2] = pos.z + (rand() - 0.5) * 0.12;
      const bright = 0.75 + rand() * 0.55;
      sys.colArr[j] = Math.min(1, tmpColor.r * bright);
      sys.colArr[j + 1] = Math.min(1, tmpColor.g * bright);
      sys.colArr[j + 2] = Math.min(1, tmpColor.b * bright);
      sys.sizeArr[i] = size * (0.6 + rand() * 0.9);
      sys.alphaArr[i] = 1;
    }
    sys.maxLife = maxLife;
    sys.count = count;
    sys.active = true;
    sys.points.visible = true;
    sys.geo.setDrawRange(0, count);
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.aColor.needsUpdate = true;
    sys.geo.attributes.aSize.needsUpdate = true;
    sys.geo.attributes.aAlpha.needsUpdate = true;
  }

  // ---- slash arcs ---------------------------------------------------------
  const arcs = [];
  let arcNext = 0;
  for (let i = 0; i < MAX_ARCS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.steel,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 1, 24, 1, -1.1, 2.2), mat);
    mesh.rotation.order = "YXZ";
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.userData.fxKind = "arc";
    group.add(mesh);
    arcs.push({ mesh, mat, builtArc: 2.2, active: false, age: 0, life: 0.16, range: 2.6, sweepFrom: 0, sweepTo: 0 });
  }

  function slashArc(pos, dir, opts) {
    if (!pos || !dir) return;
    const o = opts || {};
    let slot = null;
    for (let i = 0; i < MAX_ARCS; i++) {
      if (!arcs[i].active) {
        slot = arcs[i];
        break;
      }
    }
    if (!slot) {
      slot = arcs[arcNext];
      arcNext = (arcNext + 1) % MAX_ARCS;
    }

    const arc = clamp(o.arc != null ? o.arc : 2.2, 0.3, Math.PI * 1.6);
    if (Math.abs(arc - slot.builtArc) > 0.02) {
      slot.mesh.geometry.dispose();
      slot.mesh.geometry = new THREE.RingGeometry(0.35, 1, 24, 1, -arc / 2, arc);
      slot.builtArc = arc;
    }

    let dx = dir.x;
    let dz = dir.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      dx = 0;
      dz = 1;
    } else {
      dx /= len;
      dz /= len;
    }

    slot.range = o.range != null ? o.range : 2.6;
    slot.life = o.life != null ? Math.max(0.05, o.life) : 0.16;
    slot.age = 0;
    slot.active = true;
    slot.mat.color.set(o.color != null ? o.color : PALETTE.steel);
    slot.mat.opacity = 0;
    slot.mesh.visible = true;
    slot.mesh.position.set(pos.x, (pos.y || 0) + 0.15, pos.z);
    slot.mesh.rotation.set(-Math.PI / 2 + 0.22, Math.atan2(-dz, dx), 0);
    slot.mesh.scale.setScalar(slot.range * 0.9);
    slot.sweepFrom = -0.22;
    slot.sweepTo = 0.3;
  }

  // ---- ground rings -------------------------------------------------------
  const rings = [];
  let ringNext = 0;
  for (let i = 0; i < MAX_RINGS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.torch,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.userData.fxKind = "ring";
    group.add(mesh);
    rings.push({ mesh, mat, active: false, age: 0, life: 0.5, radius: 2.4 });
  }

  function ring(pos, opts) {
    if (!pos) return;
    const o = opts || {};
    let slot = null;
    for (let i = 0; i < MAX_RINGS; i++) {
      if (!rings[i].active) {
        slot = rings[i];
        break;
      }
    }
    if (!slot) {
      slot = rings[ringNext];
      ringNext = (ringNext + 1) % MAX_RINGS;
    }
    slot.radius = o.radius != null ? Math.max(0.2, o.radius) : 2.4;
    slot.life = o.life != null ? Math.max(0.05, o.life) : 0.5;
    slot.age = 0;
    slot.active = true;
    slot.mat.color.set(o.color != null ? o.color : PALETTE.torch);
    slot.mat.opacity = 0;
    slot.mesh.visible = true;
    slot.mesh.position.set(pos.x, (pos.y || 0) + 0.04, pos.z);
    slot.mesh.scale.setScalar(0.5);
  }

  // ---- coins --------------------------------------------------------------
  const coinGroup = new THREE.Group();
  coinGroup.name = "fx-coins";
  coinGroup.userData.fxKind = "coins";
  group.add(coinGroup);
  const coinPool = [];
  const coins = [];
  let coinTemplate = null;
  let coinRestY = 0.03;
  let fallbackTemplate = null;

  function resolveTemplate() {
    if (coinTemplate) return coinTemplate;
    if (world && world.coinTemplate) {
      coinTemplate = world.coinTemplate;
      coinTemplate.updateMatrixWorld(true);
      tmpBox.setFromObject(coinTemplate);
      coinRestY = Math.max(0.03, -tmpBox.min.y + 0.005);
      return coinTemplate;
    }
    if (!fallbackTemplate) {
      fallbackTemplate = new THREE.Group();
      fallbackTemplate.add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.045, 14),
          new THREE.MeshBasicMaterial({ color: PALETTE.gold })
        )
      );
      coinRestY = 0.03;
    }
    return fallbackTemplate;
  }

  function acquireCoin() {
    let obj = coinPool.pop();
    if (!obj) {
      obj = resolveTemplate().clone(true);
      obj.name = "fx-coin";
      obj.userData.fxKind = "coin";
      obj.traverse((child) => {
        child.frustumCulled = false;
      });
      obj.visible = false;
      coinGroup.add(obj);
    }
    if (obj.userData.fxBaseScale === undefined) obj.userData.fxBaseScale = obj.scale.x || 1;
    return obj;
  }

  function releaseCoinAt(i) {
    const c = coins[i];
    c.obj.visible = false;
    coins[i] = coins[coins.length - 1];
    coins.pop();
    coinPool.push(c.obj);
  }

  function spawnCoin(pos, value, scaleMult) {
    if (coins.length >= MAX_COINS) return;
    const obj = acquireCoin();
    obj.scale.setScalar(obj.userData.fxBaseScale * scaleMult);
    const ang = rand() * TWO_PI;
    const spd = 1.1 + rand() * 2.4;
    const restY = coinRestY * scaleMult;
    obj.position.set(
      pos.x + (rand() - 0.5) * 0.3,
      Math.max(restY, pos.y || 0) + 0.2,
      pos.z + (rand() - 0.5) * 0.3
    );
    obj.rotation.set(0, rand() * TWO_PI, 0);
    obj.visible = true;
    coins.push({
      obj,
      vx: Math.cos(ang) * spd,
      vy: 4.3 + rand() * 2.0,
      vz: Math.sin(ang) * spd,
      spin: 4 + rand() * 6,
      life: COIN_LIFE,
      value,
      bounces: 0,
      magnet: false,
      magnetSpeed: 0,
      restY,
    });
  }

  function spawnCoins(pos, value) {
    if (!pos) return;
    const total = Math.max(0, Math.round(Number.isFinite(value) ? value : 1));
    if (total <= 0) return;
    const small = Math.min(total, 12);
    for (let i = 0; i < small; i++) spawnCoin(pos, 1, 1);
    let rem = total - small;
    while (rem > 0) {
      const chunk = Math.min(rem, 10);
      spawnCoin(pos, chunk, Math.min(2.4, 1 + 0.14 * chunk));
      rem -= chunk;
    }
  }

  function collectCoin(i, c) {
    const o = c.obj;
    const sx = o.position.x;
    const sy = o.position.y;
    const sz = o.position.z;
    const value = c.value;
    releaseCoinAt(i);
    tmpVec.set(sx, sy, sz);
    if (events) {
      events.emit("coin-collected", { value });
      events.emit("sfx", { name: "coin", position: tmpVec.clone() });
    }
    burst(tmpVec, { count: 5, color: PALETTE.gold, speed: 3.2, size: 0.09, life: 0.35, gravity: -5, up: 1.2 });
  }

  // ---- per-frame updates --------------------------------------------------
  function updateNumbers(dt) {
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const n = numbers[i];
      if (!n.active) continue;
      n.age += dt;
      const t = n.age / n.life;
      if (t >= 1) {
        n.active = false;
        n.sprite.visible = false;
        continue;
      }
      const s = n.sprite;
      s.position.x += n.driftX * dt;
      s.position.y += n.rise * dt;
      s.position.z += n.driftZ * dt;
      const e = Math.min(1, n.age / 0.12);
      const pop = 1 + 0.3 * (1 - e * e * (3 - 2 * e));
      const sc = n.baseScale * pop;
      s.scale.set(1.2 * sc, 0.6 * sc, 1);
      s.material.opacity = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    }
  }

  function updateBursts(dt) {
    for (let s = 0; s < MAX_BURSTS; s++) {
      const sys = bursts[s];
      if (!sys.active) continue;
      const n = sys.count;
      let alive = 0;
      const drag = 1 - Math.min(1, 2.2 * dt);
      for (let i = 0; i < n; i++) {
        const lf = sys.life[i] - dt;
        if (lf <= 0) {
          sys.life[i] = 0;
          sys.alphaArr[i] = 0;
          continue;
        }
        alive++;
        sys.life[i] = lf;
        sys.vy[i] += sys.gravity * dt;
        sys.vx[i] *= drag;
        sys.vz[i] *= drag;
        const j = i * 3;
        sys.posArr[j] += sys.vx[i] * dt;
        sys.posArr[j + 1] += sys.vy[i] * dt;
        sys.posArr[j + 2] += sys.vz[i] * dt;
        if (sys.posArr[j + 1] < 0.02) {
          sys.posArr[j + 1] = 0.02;
          sys.vy[i] *= -0.25;
        }
        sys.alphaArr[i] = Math.min(1, lf / (sys.maxLife * 0.45));
      }
      sys.geo.attributes.position.needsUpdate = true;
      sys.geo.attributes.aAlpha.needsUpdate = true;
      if (alive === 0) {
        sys.active = false;
        sys.points.visible = false;
      }
    }
  }

  function updateArcs(dt) {
    for (let i = 0; i < MAX_ARCS; i++) {
      const a = arcs[i];
      if (!a.active) continue;
      a.age += dt;
      const t = a.age / a.life;
      if (t >= 1) {
        a.active = false;
        a.mesh.visible = false;
        a.mat.opacity = 0;
        continue;
      }
      const fade = t < 0.28 ? t / 0.28 : 1 - (t - 0.28) / 0.72;
      a.mat.opacity = fade * 0.9;
      a.mesh.scale.setScalar(a.range * (0.9 + 0.25 * t));
      a.mesh.rotation.z = a.sweepFrom + (a.sweepTo - a.sweepFrom) * t;
    }
  }

  function updateRings(dt) {
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = rings[i];
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        r.mat.opacity = 0;
        continue;
      }
      const e = 1 - (1 - t) * (1 - t);
      r.mesh.scale.setScalar(0.5 + (r.radius - 0.5) * e);
      r.mat.opacity = Math.min(1, t * 8) * 0.8 * (1 - t);
    }
  }

  function updateCoins(dt) {
    const px = lastPlayer.x;
    const py = lastPlayer.y;
    const pz = lastPlayer.z;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const o = c.obj;
      c.life -= dt;
      if (c.life <= 0) {
        releaseCoinAt(i);
        continue;
      }

      if (hasPlayer) {
        const dx = px - o.position.x;
        const dy = py - o.position.y;
        const dz = pz - o.position.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < COIN_MAGNET_SQ) c.magnet = true;
        if (d2 < COIN_PICKUP_SQ) {
          collectCoin(i, c);
          continue;
        }
      }

      if (c.magnet) {
        const dx = px - o.position.x;
        const dy = py + 0.4 - o.position.y;
        const dz = pz - o.position.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
        c.magnetSpeed = Math.min(c.magnetSpeed + 34 * dt, 22);
        const step = (c.magnetSpeed / d) * dt;
        o.position.x += dx * step;
        o.position.y += dy * step;
        o.position.z += dz * step;
        c.spin = 14;
      } else {
        c.vy -= 18 * dt;
        o.position.x += c.vx * dt;
        o.position.y += c.vy * dt;
        o.position.z += c.vz * dt;
        if (o.position.y <= c.restY && c.vy <= 0) {
          if (c.bounces < 1 && c.vy < -1.2) {
            c.bounces += 1;
            c.vy = -c.vy * 0.45;
            c.vx *= 0.68;
            c.vz *= 0.68;
          } else {
            c.vy = 0;
            const f = 1 - Math.min(1, 7 * dt);
            c.vx *= f;
            c.vz *= f;
          }
          o.position.y = c.restY;
        }
      }
      if (o.position.y < c.restY) o.position.y = c.restY;
      o.rotation.y += c.spin * dt;
    }
  }

  function updateCamera(dt) {
    if (!cam) return;
    const p = cam.position;
    const rot = cam.rotation;
    if (camApplied) {
      const ex = camBaseX + camOffX;
      const ey = camBaseY + camOffY;
      const ez = camBaseZ + camOffZ;
      if (Math.abs(p.x - ex) < 1e-4 && Math.abs(p.y - ey) < 1e-4 && Math.abs(p.z - ez) < 1e-4) {
        p.set(camBaseX, camBaseY, camBaseZ);
      }
      if (Math.abs(rot.z - (camBaseRoll + camOffRoll)) < 1e-5) rot.z = camBaseRoll;
    }
    camBaseX = p.x;
    camBaseY = p.y;
    camBaseZ = p.z;
    camBaseRoll = rot.z;

    const amp = trauma * 0.5;
    camOffX = Math.sin(shakeTime * 41.3 + phase[0]) * Math.sin(shakeTime * 19.7 + phase[1]) * amp;
    camOffY = Math.sin(shakeTime * 33.1 + phase[2]) * Math.sin(shakeTime * 23.9 + phase[3]) * amp * 0.75;
    camOffZ = Math.sin(shakeTime * 37.7 + phase[4]) * Math.sin(shakeTime * 15.3 + phase[5]) * amp * 0.6;
    camOffRoll = Math.sin(shakeTime * 47.9 + phase[6]) * Math.sin(shakeTime * 27.1 + phase[7]) * trauma * 0.05;

    p.x = camBaseX + camOffX;
    p.y = camBaseY + camOffY;
    p.z = camBaseZ + camOffZ;
    rot.z = camBaseRoll + camOffRoll;
    camApplied = true;

    if (camData) {
      const off = camData.offset;
      off.x = camOffX;
      off.y = camOffY;
      off.z = camOffZ;
      off.roll = camOffRoll;
      camData.applied = true;
    }
  }

  function restoreCamera() {
    if (!cam || !camApplied) return;
    cam.position.set(camBaseX, camBaseY, camBaseZ);
    cam.rotation.z = camBaseRoll;
    camApplied = false;
    camOffX = camOffY = camOffZ = camOffRoll = 0;
    if (camData) {
      camData.applied = false;
      camData.offset.x = camData.offset.y = camData.offset.z = camData.offset.roll = 0;
    }
  }

  // ---- public API ---------------------------------------------------------
  function hitstop(sec) {
    const d = Number.isFinite(sec) ? Math.max(0, sec) : 0.05;
    hitstopT = Math.max(hitstopT, d);
    if (timeScale > 0.05) timeScale = 0.05;
  }

  function slowmo(scale, duration) {
    const s = clamp(Number.isFinite(scale) ? scale : 0.35, 0.05, 1);
    const d = Number.isFinite(duration) ? Math.max(0.05, duration) : 0.3;
    slowScale = slowT > 0 ? Math.min(slowScale, s) : s;
    slowT = Math.max(slowT, d);
    if (timeScale > slowScale) timeScale = slowScale;
  }

  function shake(amount) {
    const a = Number.isFinite(amount) ? amount : 0.1;
    trauma = Math.min(1.5, trauma + Math.max(0, a));
  }

  function update(dt, player) {
    let rawDt = Number.isFinite(dt) ? dt : 0;
    if (rawDt < 0) rawDt = 0;
    else if (rawDt > 0.25) rawDt = 0.25;

    if (player) {
      const pp = player.position || player;
      if (pp && typeof pp.x === "number") {
        lastPlayer.set(pp.x, pp.y || 0, pp.z || 0);
        hasPlayer = true;
      }
    }

    if (hitstopT > 0) {
      hitstopT -= rawDt;
      if (hitstopT < 0) hitstopT = 0;
    }
    if (slowT > 0) {
      slowT -= rawDt;
      if (slowT < 0) slowT = 0;
    }
    const target = hitstopT > 0 ? 0.05 : slowT > 0 ? slowScale : 1;
    if (timeScale > target) {
      timeScale = target;
    } else if (timeScale < target) {
      timeScale = damp(timeScale, target, 30, rawDt);
      if (target - timeScale < 0.03) timeScale = target;
    }

    shakeTime += rawDt;
    if (trauma > 0) {
      trauma = damp(trauma, 0, 9, rawDt);
      if (trauma < 0.001) trauma = 0;
    }
    updateCamera(rawDt);

    updateNumbers(rawDt);
    updateBursts(rawDt);
    updateArcs(rawDt);
    updateRings(rawDt);
    updateCoins(rawDt);
  }

  function reset() {
    for (let i = 0; i < MAX_NUMBERS; i++) {
      numbers[i].active = false;
      numbers[i].sprite.visible = false;
    }
    for (let i = 0; i < MAX_BURSTS; i++) {
      const b = bursts[i];
      b.active = false;
      b.count = 0;
      b.points.visible = false;
      b.geo.setDrawRange(0, 0);
    }
    for (let i = 0; i < MAX_ARCS; i++) {
      arcs[i].active = false;
      arcs[i].mesh.visible = false;
      arcs[i].mat.opacity = 0;
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      rings[i].active = false;
      rings[i].mesh.visible = false;
      rings[i].mat.opacity = 0;
    }
    for (let i = coins.length - 1; i >= 0; i--) releaseCoinAt(i);
    hitstopT = 0;
    slowT = 0;
    timeScale = 1;
    trauma = 0;
    shakeTime = 0;
    restoreCamera();
  }

  // ---- event wiring -------------------------------------------------------
  function onEnemyHit(p) {
    if (!p || !p.position) return;
    const crit = !!p.crit;
    damageNumber(p.position, p.amount != null ? p.amount : 1, { crit, color: p.color });
    burst(p.position, {
      count: crit ? 10 : 6,
      color: p.color != null ? p.color : PALETTE.ember,
      speed: crit ? 6 : 4.5,
      size: 0.13,
      life: 0.45,
      gravity: -10,
      up: 1.1,
    });
  }

  function onPlayerCast(p) {
    if (!p || !p.position) return;
    burst(p.position, {
      count: 6,
      color: p.color != null ? p.color : PALETTE.arcane,
      speed: 3,
      size: 0.1,
      life: 0.3,
      gravity: 0,
      up: 0.6,
    });
  }

  function onPlayerBlast(p) {
    if (!p || !p.position) return;
    ring(p.position, {
      radius: p.radius != null ? p.radius : 2.4,
      color: p.color != null ? p.color : PALETTE.arcane,
      life: 0.42,
    });
    burst(p.position, {
      count: 18,
      color: p.color != null ? p.color : PALETTE.arcane,
      speed: 8,
      size: 0.14,
      life: 0.5,
      gravity: -6,
      up: 1.4,
    });
  }

  function onEnemyDied(p) {
    if (!p || !p.position) return;
    burst(p.position, {
      count: 16,
      color: p.color != null ? p.color : PALETTE.bone,
      speed: 5.5,
      size: 0.16,
      life: 0.7,
      gravity: -11,
      up: 1.6,
    });
    ring(p.position, { radius: 1.6, color: p.color != null ? p.color : PALETTE.ember, life: 0.4 });
    spawnCoins(p.position, p.value != null ? p.value : 1);
  }

  function onCoinCollected(p) {
    if (!hasPlayer) return;
    const v = Math.round((p && p.value) || 1);
    if (v < 2) return;
    damageNumber(lastPlayer, v, { color: PALETTE.gold, y: 1.5, scale: 0.8 });
  }

  if (events && typeof events.on === "function") {
    events.on("hitstop", (p) => hitstop(p && p.duration));
    events.on("shake", (p) => shake(p && p.amount));
    events.on("enemy-hit", onEnemyHit);
    events.on("enemy-died", onEnemyDied);
    events.on("coin-collected", onCoinCollected);
    events.on("player-cast", onPlayerCast);
    events.on("player-blast", onPlayerBlast);
  }

  return {
    group,
    get timeScale() {
      return timeScale;
    },
    update,
    hitstop,
    shake,
    damageNumber,
    burst,
    slashArc,
    ring,
    spawnCoins,
    slowmo,
    reset,
  };
}
