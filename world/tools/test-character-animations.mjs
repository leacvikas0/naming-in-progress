#!/usr/bin/env node
// Headless checks for world/assets/characters/index.js: KayKit v2 asset URLs exist,
// every semantic animation resolves on both rigs, and play() restarts finished
// one-shots and plays reversed clips (e.g. the Golem's Death_A stand-up).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CHARACTER_ROSTER,
  ENEMY_ROSTER_IDS,
  ENEMY_CANDIDATES_BASE,
  WEAPON_SPECS,
  ANIMATION_PACKS,
  SEMANTIC_ANIMATIONS,
  loadAnimationPacks,
  resolveClipNameForRig,
  createCharacterAnimationController,
} from '../assets/characters/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const onDisk = (url) => path.join(root, url.replace(/^\//, ''));
let passed = 0;

async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

const diskLoader = {
  async loadAsync(url) {
    const buf = fs.readFileSync(onDisk(url));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new GLTFLoader().parseAsync(ab, '');
  },
};

await check('roster covers the 12 enemies and KayKit-backed URLs exist', () => {
  assert.equal(ENEMY_ROSTER_IDS.length, 12);
  for (const id of ENEMY_ROSTER_IDS) assert.ok(CHARACTER_ROSTER[id], `missing roster entry ${id}`);
  const urls = [
    ...Object.values(CHARACTER_ROSTER).map((s) => s.glb),
    ...Object.values(WEAPON_SPECS).map((w) => w.url),
    ...Object.values(ANIMATION_PACKS).map((p) => p.url),
  ].filter((u) => !u.startsWith(ENEMY_CANDIDATES_BASE));
  for (const url of urls) assert.ok(fs.existsSync(onDisk(url)), `missing asset ${url}`);
  for (const spec of Object.values(CHARACTER_ROSTER)) {
    if (!spec.glb.startsWith(ENEMY_CANDIDATES_BASE)) continue;
    const fb = CHARACTER_ROSTER[spec.fallbackId];
    assert.ok(fb, `${spec.id} needs a fallbackId`);
    assert.equal(fb.rig, spec.rig, `${spec.id} fallback must share its rig`);
    assert.ok(!fb.glb.startsWith(ENEMY_CANDIDATES_BASE), `${spec.id} fallback must be a KayKit model`);
  }
});

await check('every semantic animation resolves on both rigs', async () => {
  for (const rig of ['medium', 'large']) await loadAnimationPacks(diskLoader, rig);
  for (const spec of Object.values(CHARACTER_ROSTER)) {
    const rig = spec.rig;
    for (const key of Object.keys(SEMANTIC_ANIMATIONS)) {
      const name = resolveClipNameForRig(key, { rig, weaponStyle: spec.weaponStyle });
      assert.ok(name, `${spec.id}: semantic "${key}" has no clip on ${rig}`);
    }
  }
});

await check('play() restarts finished one-shots and plays reverse from the clip end', () => {
  const clip = new THREE.AnimationClip('Death_A', 1, [
    new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 1, 0]),
  ]);
  const bank = { rig: 'large', allClips: [clip], clipsByName: new Map([['Death_A', clip]]) };
  const anim = createCharacterAnimationController(new THREE.Group(), bank, { rig: 'large' });

  const action = anim.play('Death_A', { loop: false });
  anim.update(1.5);
  assert.equal(action.paused, true, 'one-shot should be finished/paused');

  anim.play('Death_A', { loop: false, force: true, timeScale: -1 });
  assert.equal(action.getEffectiveTimeScale(), -1);
  assert.ok(Math.abs(action.time - 1) < 1e-6, 'reverse starts at clip end');
  anim.update(0.4);
  assert.ok(Math.abs(action.time - 0.6) < 1e-6, `reverse advanced backwards (time=${action.time})`);

  anim.play('Death_A', { loop: false, force: true });
  assert.equal(action.getEffectiveTimeScale(), 1);
  assert.equal(action.time, 0);
});

console.log(`\n${passed} checks passed`);
