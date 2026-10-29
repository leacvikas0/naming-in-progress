import * as THREE from 'three';
import { createRng, range, clamp01 } from './rng.js';
import { createPetalMaterial, createGlowTexture } from './materials.js';
import { getPetalType, getPetalTypes } from './petalTypes.js';
import { BokehField, HaloField } from './bokeh.js';

// ---------------------------------------------------------------------------
// Default hero seed poses.
// These are the art-directed foreground petals that frame the shot. They are
// deliberately hand-placed rather than random so the close-up composition
// stays readable at any count.
// ---------------------------------------------------------------------------
const HERO_SEEDS = [
  { x: -1.65, y: 1.45, z: 13.6, rx: 0.35, ry: 0.4, rz: -0.45, s: 1.15 },
  { x: -0.95, y: 2.95, z: 12.8, rx: 0.25, ry: -0.5, rz: 0.55, s: 1.10 },
  { x: -1.85, y: 2.20, z: 13.2, rx: -0.3, ry: 0.8, rz: -0.35, s: 1.05 },
  { x: 0.85,  y: 3.45, z: 13.0, rx: 0.42, ry: -0.3, rz: -0.50, s: 1.25 },
  { x: 1.55,  y: 3.60, z: 13.4, rx: 0.18, ry: 0.2, rz: 0.35, s: 1.15 },
  { x: 1.15,  y: 2.55, z: 12.5, rx: -0.25, ry: 0.6, rz: -0.40, s: 1.18 },
  { x: 1.95,  y: 1.25, z: 13.8, rx: 0.30, ry: -0.7, rz: 0.45, s: 1.20 },
  { x: 0.35,  y: 2.75, z: 11.8, rx: 0.22, ry: 0.3, rz: -0.60, s: 1.05 },
  { x: -0.45, y: 3.25, z: 11.5, rx: -0.35, ry: -0.4, rz: 0.28, s: 1.12 },
  { x: 0.65,  y: 1.55, z: 12.2, rx: 0.48, ry: 0.5, rz: -0.25, s: 1.02 },
  { x: -1.25, y: 1.20, z: 12.4, rx: -0.40, ry: 0.2, rz: 0.50, s: 1.08 },
  { x: -0.72, y: 2.05, z: 10.6, rx: 0.28, ry: -0.6, rz: -0.38, s: 1.15 },
  { x: 0.12,  y: 2.38, z: 10.2, rx: -0.22, ry: 0.4, rz: 0.42, s: 1.10 },
  { x: 1.35,  y: 2.15, z: 10.8, rx: 0.32, ry: -0.5, rz: -0.32, s: 1.15 }
];

const DEFAULTS = {
  scene: null,
  parent: null,
  camera: null,
  types: null,          // null = every registered type
  count: 240,           // falling petals
  heroCount: 44,        // big foreground petals
  bokeh: 600,           // 0 disables
  halo: true,
  wind: 0.85,
  seed: 133742,
  maxDelta: 0.05,       // clamp long frames (tab switch, loading hitch)
  nearDepth: 3.2,
  farDepth: 20.2,
  heroSeeds: null,      // custom array of {x,y,z,rx,ry,rz,s}
  fogDensity: 0,        // if > 0 and a scene is given, sets scene.fog
  fogColor: 0xffeccc
};

function distribute(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const counts = raw.map((v) => Math.floor(v));
  let used = counts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < total) {
    counts[order[k % order.length].i]++;
    used++;
    k++;
  }
  return counts;
}

export class PetalSystem {
  /**
   * @param {object} options
   * @param {THREE.Scene}   [options.scene]     scene to add the group to
   * @param {THREE.Object3D}[options.parent]    explicit parent (wins over scene)
   * @param {THREE.Camera}  [options.camera]    used for screen-space distribution
   * @param {string[]|object[]} [options.types] type ids (or type objects)
   * @param {number} [options.count]            falling petals
   * @param {number} [options.heroCount]        foreground petals
   * @param {number} [options.bokeh]            bokeh motes (0 = off)
   * @param {boolean} [options.halo]            backlight halo on hero petals
   * @param {number} [options.wind]             global speed multiplier
   * @param {number} [options.seed]             deterministic layout seed
   */
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    const opts = this.options;

    this.scene = opts.scene || null;
    this.parent = opts.parent || opts.scene || null;
    this.camera = opts.camera || null;

    this.wind = opts.wind;
    this.paused = false;
    this.time = 0;
    this._rand = createRng(opts.seed);
    this._dummy = new THREE.Object3D();
    this._glowTexture = null;

    this.group = new THREE.Group();
    this.group.name = 'PetalSystem';
    if (this.parent) this.parent.add(this.group);

    if (opts.fogDensity > 0 && this.scene) {
      this.scene.fog = new THREE.FogExp2(opts.fogColor, opts.fogDensity);
      this._ownedFog = true;
    } else {
      this._ownedFog = false;
    }

    this.types = this._resolveTypes(opts.types);

    this.heroSeeds = this._buildHeroSeeds(opts.heroCount, opts.heroSeeds);
    this.heroGroups = this._buildGroups(this.heroSeeds.length, 'hero');
    this._assignHero();
    this._initHeroStates();

    this.fallingGroups = this._buildGroups(opts.count, 'falling');
    this._initFallingStates();

    this._buildBokeh(opts.bokeh);
    this._buildHalo(opts.halo);

    this._applyFrameZero();
  }

  // -------------------------------------------------------------------------
  // Construction helpers
  // -------------------------------------------------------------------------
  _resolveTypes(requested) {
    if (!requested || requested.length === 0) return getPetalTypes();

    const resolved = [];
    for (const item of requested) {
      const type = typeof item === 'string' ? getPetalType(item) : item;
      if (type && typeof type.build === 'function' && type.palette) {
        resolved.push(type);
      } else {
        console.warn('[PetalSystem] unknown petal type:', item);
      }
    }
    return resolved.length ? resolved : getPetalTypes();
  }

  _buildHeroSeeds(count, customSeeds) {
    const base = customSeeds && customSeeds.length
      ? customSeeds.slice()
      : HERO_SEEDS.slice();

    const seeds = base.slice(0, Math.max(0, count));
    const rand = this._rand;

    while (seeds.length < count) {
      seeds.push({
        x: range(rand, -5.2, 5.2),
        y: range(rand, 1.0, 6.2),
        z: range(rand, -16.0, 9.8),
        rx: range(rand, -0.8, 0.8),
        ry: range(rand, -Math.PI, Math.PI),
        rz: range(rand, -0.9, 0.9),
        s: range(rand, 0.88, 1.35)
      });
    }
    return seeds;
  }

  _buildGroups(total, kind) {
    const weights = this.types.map((t) => t.weight != null ? t.weight : 1);
    const counts = distribute(total, weights);
    const rand = this._rand;
    const groups = [];

    this.types.forEach((type, ti) => {
      const count = counts[ti];
      if (count === 0) return;

      const cfg = { ...type.params, scale: type.scale, palette: type.palette };
      const geometry = type.build(cfg);
      const material = createPetalMaterial(type.palette);
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.name = 'PetalMesh:' + type.id;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;

      // Per-instance tint around the palette's own hue so no two petals match
      const baseCol = new THREE.Color(type.palette.base);
      const hsl = {};
      baseCol.getHSL(hsl);
      const tint = new THREE.Color();
      for (let i = 0; i < count; i++) {
        tint.setHSL(
          (hsl.h + range(rand, -0.015, 0.015) + 1) % 1,
          clamp01(hsl.s + range(rand, -0.08, 0.08)),
          clamp01(hsl.l + range(rand, -0.10, 0.10))
        );
        mesh.setColorAt(i, tint);
      }
      mesh.instanceColor.needsUpdate = true;

      this.group.add(mesh);

      const sizeRange = type.size || [1.0, 1.8];
      groups.push({
        type,
        mesh,
        count,
        cursor: 0,
        sizeMin: sizeRange[0],
        sizeMax: sizeRange[1],
        kind
      });
    });

    return groups;
  }

  _assignHero() {
    this.heroAssignments = [];
    this.heroGroups.forEach((group) => {
      for (let i = 0; i < group.count; i++) this.heroAssignments.push(group);
    });
  }

  _initHeroStates() {
    this.heroStates = this.heroSeeds.map((seed, i) => ({
      seed,
      group: this.heroAssignments[i],
      phase: i * 1.13
    }));
  }

  _initFallingStates() {
    const rand = this._rand;
    const opts = this.options;
    const aspect = this.camera && this.camera.aspect ? this.camera.aspect : 16 / 9;

    // Shuffle the group pool so colours are mixed, not banded
    const pool = [];
    this.fallingGroups.forEach((group) => {
      for (let i = 0; i < group.count; i++) pool.push(group);
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    this.fallingStates = [];
    for (let i = 0; i < pool.length; i++) {
      const group = pool[i];
      const d = range(rand, opts.nearDepth, opts.farDepth);
      const halfW = 0.40 * d * aspect;
      const halfH = 0.38 * d;

      this.fallingStates.push({
        group,
        x: range(rand, -halfW, halfW) * 1.05,
        y: 2.4 + range(rand, -halfH, halfH),
        z: 16.5 - d,
        vx: range(rand, -0.20, 0.20),
        vy: range(rand, 0.30, 0.72),
        vz: range(rand, -0.16, 0.16),
        rx: rand() * Math.PI * 2,
        ry: rand() * Math.PI * 2,
        rz: rand() * Math.PI * 2,
        vrx: range(rand, -0.9, 0.9),
        vry: range(rand, -1.2, 1.2),
        vrz: range(rand, -0.8, 0.8),
        phase: rand() * Math.PI * 2,
        swayAmp: range(rand, 1.0, 2.4),
        swayFreq: range(rand, 0.35, 0.70),
        scale: range(rand, group.sizeMin, group.sizeMax)
      });
    }
  }

  _buildBokeh(count) {
    this.bokehField = null;
    if (!count || count <= 0) return;

    this._glowTexture = createGlowTexture();
    this.bokehField = new BokehField({
      count,
      texture: this._glowTexture,
      rand: this._rand
    });
    this.group.add(this.bokehField.points);
  }

  _buildHalo(enabled) {
    this.haloField = null;
    if (!enabled || this.heroStates.length === 0) return;

    if (!this._glowTexture) this._glowTexture = createGlowTexture();
    this.haloField = new HaloField({
      count: this.heroStates.length,
      texture: this._glowTexture
    });
    this.group.add(this.haloField.points);
  }

  // -------------------------------------------------------------------------
  // Frame zero - populate matrices before the first render
  // -------------------------------------------------------------------------
  _applyFrameZero() {
    this._updateHero(0);
    this._updateFalling(0);
    if (this.bokehField) this.bokehField.update(0);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Advance the simulation. Call once per frame from your game loop.
   * @param {number} dt seconds since the last frame
   */
  update(dt) {
    const clamped = Math.min(Math.max(dt, 0), this.options.maxDelta);
    const step = this.paused ? 0 : clamped * this.wind;
    this.time += step;

    this._updateHero(step);
    this._updateFalling(step);
    if (this.bokehField) this.bokehField.update(this.time);
  }

  setWind(multiplier) {
    this.wind = Math.max(0, multiplier);
  }

  pause() { this.paused = true; }

  resume() { this.paused = false; }

  /** Re-roll the falling layout with a new seed (hero petals stay art-directed). */
  reset(seed = this.options.seed) {
    this.options.seed = seed;
    this._rand = createRng(seed);
    this._initFallingStates();
    this._applyFrameZero();
  }

  getStats() {
    return {
      fallingPetals: this.fallingStates ? this.fallingStates.length : 0,
      heroPetals: this.heroStates ? this.heroStates.length : 0,
      bokeh: this.bokehField ? this.bokehField.count : 0,
      instancedMeshes: this.heroGroups.length + this.fallingGroups.length,
      types: this.types.map((t) => t.id)
    };
  }

  /** Tear everything down: GPU resources, scene nodes, arrays. */
  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map && obj.material.map !== this._glowTexture) {
          obj.material.map.dispose();
        }
        obj.material.dispose();
      }
    });

    if (this.bokehField) this.bokehField.dispose();
    if (this.haloField) this.haloField.dispose();
    if (this._glowTexture) this._glowTexture.dispose();

    if (this.parent) this.parent.remove(this.group);

    if (this._ownedFog && this.scene) this.scene.fog = null;

    this.heroGroups = [];
    this.fallingGroups = [];
    this.heroStates = [];
    this.fallingStates = [];
    this.bokehField = null;
    this.haloField = null;
    this._glowTexture = null;
  }

  /** Dispose and rebuild with new options. Returns the new system. */
  rebuild(overrides = {}) {
    const nextOptions = {
      ...this.options,
      ...overrides,
      scene: this.scene,
      parent: this.parent,
      camera: this.camera
    };
    this.dispose();
    return new PetalSystem(nextOptions);
  }

  // -------------------------------------------------------------------------
  // Per-frame updates
  // -------------------------------------------------------------------------
  _updateHero(dt) {
    const dummy = this._dummy;
    const t = this.time;
    const halo = this.haloField;

    for (let i = 0; i < this.heroStates.length; i++) {
      const state = this.heroStates[i];
      const seed = state.seed;
      const group = state.group;
      const spin = group.type.motion ? group.type.motion.spin : 1;
      const phase = state.phase;

      dummy.position.set(
        seed.x + Math.sin(t * 0.23 + phase) * 0.75 + Math.sin(t * 0.07 + i) * 0.35,
        seed.y + Math.cos(t * 0.31 + phase * 0.8) * 0.32,
        seed.z + Math.sin(t * 0.17 + phase * 0.6) * 0.30
      );
      dummy.rotation.set(
        seed.rx + Math.sin(t * 0.55 + phase) * 0.22,
        seed.ry + t * 0.12 * spin + Math.cos(t * 0.42 + phase) * 0.26,
        seed.rz + Math.sin(t * 0.63 + phase * 1.3) * 0.24
      );
      dummy.scale.set(seed.s, seed.s, seed.s);
      dummy.updateMatrix();
      group.mesh.setMatrixAt(group.cursor++, dummy.matrix);

      if (halo) {
        halo.set(i, dummy.position.x, dummy.position.y, dummy.position.z + 0.12);
      }
    }

    for (let g = 0; g < this.heroGroups.length; g++) {
      this.heroGroups[g].cursor = 0;
      this.heroGroups[g].mesh.instanceMatrix.needsUpdate = true;
    }
    if (halo) halo.commit();
  }

  _updateFalling(dt) {
    const dummy = this._dummy;
    const t = this.time;
    const opts = this.options;
    const aspect = this.camera && this.camera.aspect ? this.camera.aspect : 16 / 9;

    for (let i = 0; i < this.fallingStates.length; i++) {
      const st = this.fallingStates[i];
      const motion = st.group.type.motion || { spin: 1, fall: 1, sway: 1 };

      if (dt > 0) {
        const sway = Math.sin(t * st.swayFreq + st.phase + st.y * 0.22) *
                     st.swayAmp * motion.sway;
        const breezeZ = Math.cos(t * st.swayFreq * 0.8 + st.phase) * 0.45;

        st.x += (st.vx + sway) * dt;
        st.y -= st.vy * motion.fall *
                (0.80 + 0.20 * Math.sin(t * 1.7 + st.phase)) * dt;
        st.z += (st.vz + breezeZ) * dt;

        const spin = motion.spin;
        st.rx += st.vrx * spin * (0.55 + 0.45 * Math.sin(t * 1.3 + st.phase)) * dt;
        st.ry += st.vry * spin * (0.60 + 0.40 * Math.cos(t * 1.1 + st.phase)) * dt;
        st.rz += st.vrz * spin * (0.50 + 0.50 * Math.sin(t * 0.9 + st.phase)) * dt;

        const depth = 16.5 - st.z;
        if (st.y < 2.4 - 0.40 * depth || Math.abs(st.x) > 0.42 * depth * aspect) {
          const nd = range(this._rand, opts.nearDepth, opts.farDepth);
          st.z = 16.5 - nd;
          st.y = 2.4 + 0.38 * nd;
          st.x = range(this._rand, -0.40 * nd * aspect, 0.40 * nd * aspect);
        }
      }

      const group = st.group;
      dummy.position.set(st.x, st.y, st.z);
      dummy.rotation.set(st.rx, st.ry, st.rz);
      dummy.scale.set(st.scale, st.scale, st.scale);
      dummy.updateMatrix();
      group.mesh.setMatrixAt(group.cursor++, dummy.matrix);
    }

    for (let g = 0; g < this.fallingGroups.length; g++) {
      this.fallingGroups[g].cursor = 0;
      this.fallingGroups[g].mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
