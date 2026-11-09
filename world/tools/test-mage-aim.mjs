#!/usr/bin/env node
// ============================================================================
// world/tools/test-mage-aim.mjs
//
// Headless checks for the Mage aim/cast pipeline: sticky soft-lock priority and
// hysteresis, E aim assist + clamping, touch drag-to-aim, cancel windows,
// release-frame timing (measured against the KayKit 1.1 clips when present),
// aim-arrow states and gentle bolt homing.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { selectSoftLockTarget, isSoftLockable } from '../src/combat/combat-balance.js';
import {
  MAGE_COMBO_SPECS,
  MAGE_CHARGED_SHATTERLANCE_SPEC,
  MAGE_E_CAST_SPECS,
  MAGE_E_COOLDOWN,
  MAGE_AIM_ASSIST,
  resolveSkillAimAssist,
  mapTouchAimDrag,
  composeMageSkillAim,
  desktopPitchAimDistance,
  createCombatActionAimController,
} from '../src/combat/combat-action-aim.js';
import { FROST_LANCE_AIM_LENGTH, CINDER_FALL_MIN_DISTANCE, CINDER_FALL_MAX_DISTANCE } from '../src/terrain-scalar.js';
import { AimArrowSystem } from '../assets/vfx/aim-arrow.js';
import { MageBoltSystem } from '../assets/vfx/mage-bolt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const enemy = (id, x, z, extra = {}) => ({ id, x, z, hp: 100, dead: false, active: true, ...extra });
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

console.log('=== Haru-machi Mage Aim, Soft-Lock & Release-Frame Tests ===');

await check('1. Locked numbers unchanged: Frost Lance 14.5 m, Cinder Fall 3..16 m, E cooldown 8.5 s', () => {
  assert.equal(FROST_LANCE_AIM_LENGTH, 14.5);
  assert.equal(CINDER_FALL_MIN_DISTANCE, 3.0);
  assert.equal(CINDER_FALL_MAX_DISTANCE, 16.0);
  assert.equal(MAGE_E_COOLDOWN, 8.5);
});

await check('2. Soft-lock priority: aim ray, threats on the Mage, partner focus; dying/spawning ignored', () => {
  const mage = { id: 'Mage', x: 0, z: 0 };
  // Nearest to the aim ray wins between equals.
  const onRay = enemy('onRay', 0.2, 8);
  const offRay = enemy('offRay', 3.5, 7);
  assert.equal(selectSoftLockTarget(mage, 0, [offRay, onRay], { maxRange: 13 })?.id, 'onRay');

  // An enemy winding up on the Mage beats a slightly better-placed neutral one.
  const neutral = enemy('neutral', 0.5, 7);
  const threat = enemy('threat', 2.4, 8, { targetHeroId: 'Mage', aiState: 'windup' });
  assert.equal(selectSoftLockTarget(mage, 0, [neutral, threat], { maxRange: 13 })?.id, 'threat');

  // Partner focus bias pulls toward the Knight's current target.
  const a = enemy('a', -1.0, 9);
  const b = enemy('b', 1.2, 9);
  assert.equal(selectSoftLockTarget(mage, 0, [a, b], { maxRange: 13, partnerTarget: b, stickyTarget: null })?.id, 'b');

  // Dying (death clip) and spawning (rise clip) enemies are never locked.
  const dying = enemy('dying', 0, 5, { deathTimer: 0.8 });
  const rising = enemy('rising', 0, 6, { spawnAnimTimer: 0.3 });
  const valid = enemy('valid', 3, 9);
  assert.equal(isSoftLockable(dying), false);
  assert.equal(isSoftLockable(rising), false);
  assert.equal(selectSoftLockTarget(mage, 0, [dying, rising, valid], { maxRange: 13 })?.id, 'valid');
  assert.equal(selectSoftLockTarget(mage, 0, [dying, rising], { maxRange: 13 }), null);
});

await check('3. Soft-lock hysteresis: sticky target survives jitter, yields only to a clearly better one', () => {
  const mage = { id: 'Mage', x: 0, z: 0, softLockTarget: null };
  const left = enemy('left', -1.6, 8);
  const right = enemy('right', 1.6, 8);
  const enemies = [left, right];
  mage.softLockTarget = selectSoftLockTarget(mage, -0.05, enemies, { maxRange: 13 });
  assert.equal(mage.softLockTarget.id, 'left');

  // 120 frames of aim jitter around dead-centre: without hysteresis this would flip.
  let switches = 0;
  for (let i = 0; i < 120; i++) {
    const yaw = Math.sin(i * 1.7) * 0.12;
    const t = selectSoftLockTarget(mage, yaw, enemies, { maxRange: 13 });
    if (t !== mage.softLockTarget) switches++;
    mage.softLockTarget = t;
  }
  assert.equal(switches, 0, 'lock must not flip while aim jitters near the midpoint');

  // Aiming squarely at the other enemy does switch.
  const t2 = selectSoftLockTarget(mage, Math.atan2(1.6, 8), enemies, { maxRange: 13 });
  assert.equal(t2.id, 'right');

  // Sticky is kept slightly outside the normal cone/range, but drops when it dies.
  mage.softLockTarget = right;
  const coneHalf = (75 * Math.PI) / 360;
  const yawPastCone = Math.atan2(1.6, 8) - coneHalf * 1.2; // right is now ~1.2x cone half-angle away
  assert.equal(selectSoftLockTarget(mage, yawPastCone, [right], { maxRange: 13 })?.id, 'right');
  right.deathTimer = 0.5;
  assert.equal(selectSoftLockTarget(mage, 0, enemies, { maxRange: 13 })?.id, 'left');
});

await check('4. E aim assist: Cinder Fall magnet (2.4 m snap / 3.4 m release) and Frost Lance yaw snap', () => {
  const origin = { x: 0, z: 0 };
  const e = enemy('e', 0.0, 10.0);
  // Free reticle 2 m short of the enemy -> snaps onto it.
  const snap = resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 8.0, enemies: [e] });
  assert.equal(snap.locked, true);
  assert.ok(near(snap.distance, 10.0));
  // 3.0 m away: not a fresh snap, but a current lock holds (hysteresis).
  const fresh = resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 7.0, enemies: [e] });
  assert.equal(fresh.locked, false);
  const held = resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 7.0, enemies: [e], current: e });
  assert.equal(held.locked, true);
  const freed = resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 6.0, enemies: [e], current: e });
  assert.equal(freed.locked, false, 'dragging 4 m away is a manual override');
  assert.ok(near(freed.distance, 6.0));

  // Clamping: enemies inside 3 m / just past 16 m clamp to the Cinder Fall band.
  const close = enemy('close', 0, 1.5);
  const far = enemy('far', 0, 16.6);
  assert.ok(near(resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 3, enemies: [close] }).distance, 3.0));
  assert.ok(near(resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 16, enemies: [far] }).distance, 16.0));
  assert.ok(near(resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 40, enemies: [] }).distance, 16.0));
  assert.ok(near(resolveSkillAimAssist({ origin, spellId: 'cinder_fall', yaw: 0, distance: 0.2, enemies: [] }).distance, 3.0));

  // Frost Lance stays 14.5 m; yaw snaps within 10 deg, holds to 15 deg.
  const side = enemy('side', Math.sin(0.15) * 9, Math.cos(0.15) * 9); // ~8.6 deg off
  const lance = resolveSkillAimAssist({ origin, spellId: 'frost_lance', yaw: 0, enemies: [side] });
  assert.equal(lance.locked, true);
  assert.ok(near(lance.yaw, 0.15));
  assert.equal(lance.distance, 14.5);
  const wide = enemy('wide', Math.sin(0.22) * 9, Math.cos(0.22) * 9); // ~12.6 deg
  assert.equal(resolveSkillAimAssist({ origin, spellId: 'frost_lance', yaw: 0, enemies: [wide] }).locked, false);
  assert.equal(resolveSkillAimAssist({ origin, spellId: 'frost_lance', yaw: 0, enemies: [wide], current: wide }).locked, true);
  // Dying enemies are skipped when the shared predicate is supplied.
  const dyingSide = enemy('dyingSide', side.x, side.z, { deathTimer: 0.4 });
  assert.equal(
    resolveSkillAimAssist({ origin, spellId: 'frost_lance', yaw: 0, enemies: [dyingSide], isTargetable: isSoftLockable }).locked,
    false
  );
});

await check('5. Touch drag-to-aim: deadzone auto-snap, up = camera forward, distance 3..16, cancel by returning to the button', () => {
  const still = mapTouchAimDrag({ dx: 6, dy: 8, camYaw: 0.7 });
  assert.equal(still.manual, false);
  const up = mapTouchAimDrag({ dx: 0, dy: 120, camYaw: 0.7 });
  assert.ok(near(up.yaw, 0.7));
  // Right drag -> world right of the camera (-cos yaw, sin yaw), same basis as movement.
  const r = mapTouchAimDrag({ dx: 120, dy: 0, camYaw: 0 });
  assert.ok(near(Math.sin(r.yaw), -1) && near(Math.cos(r.yaw), 0, 1e-6));
  assert.ok(near(mapTouchAimDrag({ dx: 0, dy: MAGE_AIM_ASSIST.touchDeadzonePx + 0.01 }).distance, 3.0, 1e-3));
  assert.ok(near(mapTouchAimDrag({ dx: 0, dy: 999 }).distance, 16.0));
  // Over the button only cancels after the finger has left it once.
  assert.equal(mapTouchAimDrag({ dx: 2, dy: 3, overButton: true, leftButton: false }).cancel, false);
  assert.equal(mapTouchAimDrag({ dx: 2, dy: 3, overButton: true, leftButton: true }).cancel, true);
});

await check('6. composeMageSkillAim: auto-snap on press, manual drag override, desktop pitch, blocked/cancel states', () => {
  const origin = { x: 0, z: 0 };
  const target = enemy('t', 5, 5);
  const auto = composeMageSkillAim({ source: 'touch', spellId: 'cinder_fall', origin, facingYaw: 2.0, touch: { dx: 0, dy: 0 }, autoTarget: target, enemies: [target], isTargetable: isSoftLockable });
  assert.equal(auto.lockState, 'locked');
  assert.ok(near(auto.yaw, Math.atan2(5, 5)));
  assert.ok(near(auto.distance, Math.hypot(5, 5)));
  // Dragging away overrides the auto-snap.
  const manual = composeMageSkillAim({ source: 'touch', spellId: 'cinder_fall', origin, camYaw: Math.PI, touch: { dx: 0, dy: 200 }, autoTarget: target, enemies: [target] });
  assert.equal(manual.lockState, 'free');
  assert.ok(near(manual.distance, 16.0));
  // No target: aim along facing at the default Cinder distance.
  const facing = composeMageSkillAim({ source: 'auto', spellId: 'cinder_fall', origin, facingYaw: 1.0 });
  assert.ok(near(facing.yaw, 1.0) && near(facing.distance, MAGE_AIM_ASSIST.cinderDefaultDistance));
  // Desktop: pitch maps distance (steep = near, flat = far).
  const steep = composeMageSkillAim({ source: 'desktop', spellId: 'cinder_fall', origin, pitch: 0.9 });
  const flat = composeMageSkillAim({ source: 'desktop', spellId: 'cinder_fall', origin, pitch: 0.05 });
  assert.ok(steep.distance < 4.0 && flat.distance > 15.5);
  assert.ok(near(desktopPitchAimDistance(0.9), steep.distance));
  // State precedence.
  assert.equal(composeMageSkillAim({ source: 'auto', origin, autoTarget: target, onCooldown: true }).lockState, 'blocked');
  assert.equal(composeMageSkillAim({ source: 'touch', origin, touch: { dx: 0, dy: 0, overButton: true, leftButton: true }, onCooldown: true }).lockState, 'cancel');
});

await check('7. Release-E: cancel state never casts; a real cast runs before hide and hands its result to the arrow', () => {
  const events = [];
  const ctrl = createCombatActionAimController({
    onAimChanged: (aim, phase, castResult) => events.push({ phase, castResult, lockState: aim.lockState }),
    onAimCast: (p) => {
      events.push({ phase: 'cast', spellId: p.spellId, lockState: p.lockState });
      return { scheduled: true, releaseIn: 0.22 };
    },
  });
  ctrl.startSkillAim({ yaw: 0, spellId: 'frost_lance', lockState: 'free' });
  ctrl.updateSkillAim({ lockState: 'cancel' });
  const cancelled = ctrl.releaseSkillAim();
  assert.equal(cancelled.cancelled, true);
  assert.ok(!events.some((e) => e.phase === 'cast'), 'cancel must not cast');
  assert.equal(ctrl.aimState.active, false);

  events.length = 0;
  ctrl.startSkillAim({ yaw: 0, spellId: 'cinder_fall', distance: 9, lockState: 'locked', lockTargetId: 'e1' });
  const res = ctrl.releaseSkillAim();
  const phases = events.map((e) => e.phase);
  assert.deepEqual(phases.slice(-2), ['cast', 'hide']);
  assert.equal(events.at(-1).castResult.releaseIn, 0.22);
  assert.equal(res.lockState, 'locked');
  assert.equal(res.cooldown, 8.5);
  assert.ok(near(res.distance, 9));
});

await check('8. Release frames: bolts/Shatterlance/E fire on the clip release frame; bolt 1 outlasts the hold timers', () => {
  for (const s of MAGE_COMBO_SPECS) {
    assert.ok(s.nativeClip, `${s.clip} needs a native 1.1 clip`);
    assert.ok(near(s.duration * s.contactFrac, s.releaseTime, 0.012), `${s.clip} contact ${s.duration * s.contactFrac} vs release ${s.releaseTime}`);
  }
  // 0.26 s (touch) / 0.28 s (mouse) hold timers must upgrade bolt 1 before it releases.
  assert.ok(MAGE_COMBO_SPECS[0].duration * MAGE_COMBO_SPECS[0].contactFrac > 0.285);

  const contacts = [];
  const started = [];
  const ctrl = createCombatActionAimController({
    onSwingStarted: (sw) => started.push(sw),
    onContactHit: (sw) => contacts.push({ kind: sw.kind, t: sw.elapsed }),
  });
  ctrl.pressAttack('Mage');
  for (let i = 0; i < 17; i++) ctrl.update(1 / 60); // 0.283 s
  assert.equal(contacts.length, 0, 'no bolt before the release frame');
  assert.equal(ctrl.isInReleaseWindup('Mage'), true);
  assert.equal(ctrl.cancelRecovery('Mage').cancelled, false, 'dash/move cannot cancel the wind-up');
  // Desktop hold fires at 0.28 s: upgrades into Shatterlance without a stray bolt.
  const heavy = ctrl.pressHeavy('Mage');
  assert.equal(heavy.kind, 'charged');
  assert.equal(started.at(-1).windupClip, 'Ranged_Magic_Spellcasting');
  const charged = ctrl.heroes.Mage.activeSwing;
  assert.ok(charged.contactTime - charged.nativeReleaseOffset > 0.15, 'wind-up clip plays before the thrust');
  for (let i = 0; i < 26; i++) ctrl.update(1 / 60); // 0.433 s
  assert.equal(contacts.length, 0);
  for (let i = 0; i < 2; i++) ctrl.update(1 / 60); // 0.467 s
  assert.equal(contacts.length, 1);
  assert.ok(near(contacts[0].t, MAGE_CHARGED_SHATTERLANCE_SPEC.duration * MAGE_CHARGED_SHATTERLANCE_SPEC.contactFrac, 1 / 60 + 1e-6));
  // After release, recovery is cancellable (dash/move/aim).
  assert.equal(ctrl.isInReleaseWindup('Mage'), false);
  assert.equal(ctrl.cancelRecovery('Mage').cancelled, true);
  assert.equal(ctrl.heroes.Mage.activeSwing, null);

  // A hold that arrives after a tap bolt released cuts its recovery into the charge.
  ctrl.update(2.0);
  ctrl.pressAttack('Mage');
  ctrl.update(0.35);
  assert.equal(ctrl.heroes.Mage.activeSwing.contactFired, true);
  assert.equal(ctrl.pressHeavy('Mage').kind, 'charged');
  assert.equal(ctrl.heroes.Mage.activeSwing.kind, 'charged');

  // E casts: release before lock; lock within the clip at its playback speed.
  const clipLen = { Ranged_1H_Shoot: 1.07, Ranged_Magic_Raise: 2.1 };
  for (const [id, spec] of Object.entries(MAGE_E_CAST_SPECS)) {
    assert.ok(spec.releaseTime < spec.lock, id);
    assert.ok(spec.lock * spec.timeScale <= clipLen[spec.nativeClip] + 1e-6, id);
  }
});

await check('9. Release frames match the measured KayKit 1.1 staff-hand extension (skips if the pack is absent)', async () => {
  const glb = path.resolve(
    __dirname,
    '../../library/kaykit-v2/character-animations-1.1/Animations/gltf/Rig_Medium/Rig_Medium_CombatRanged.glb'
  );
  if (!fs.existsSync(glb)) {
    console.log('        (Rig_Medium_CombatRanged.glb not found - skipped)');
    return;
  }
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const buf = fs.readFileSync(glb);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  let hand = null;
  gltf.scene.traverse((o) => {
    if (!hand && /^handslot\.?r$/i.test(o.name)) hand = o;
  });
  assert.ok(hand, 'right hand socket');
  // Time at which the hand reaches 97% of its peak forward (+Z) reach / height.
  function reachTime(clipName, axis) {
    const clip = gltf.animations.find((c) => c.name === clipName);
    assert.ok(clip, clipName);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(clip).play();
    const v = new THREE.Vector3();
    const samples = [];
    for (let t = 0; t <= clip.duration * 0.7; t += 1 / 60) {
      mixer.setTime(t);
      gltf.scene.updateMatrixWorld(true);
      hand.getWorldPosition(v);
      samples.push({ t, val: v[axis] });
    }
    mixer.stopAllAction();
    const base = samples[0].val;
    const peak = Math.max(...samples.map((s) => s.val));
    return samples.find((s) => s.val - base >= (peak - base) * 0.97).t;
  }
  const shoot = reachTime('Ranged_Magic_Shoot', 'z');
  const jab = reachTime('Ranged_1H_Shoot', 'z');
  const raise = reachTime('Ranged_Magic_Raise', 'y');
  assert.ok(Math.abs(MAGE_COMBO_SPECS[0].releaseTime - shoot) <= 0.06, `Magic_Shoot reach ${shoot}`);
  assert.ok(Math.abs(MAGE_COMBO_SPECS[1].releaseTime - jab) <= 0.04, `1H_Shoot reach ${jab}`);
  assert.ok(Math.abs(MAGE_E_CAST_SPECS.frost_lance.releaseTime - jab) <= 0.04);
  const raiseRelease = MAGE_E_CAST_SPECS.cinder_fall.releaseTime * MAGE_E_CAST_SPECS.cinder_fall.timeScale;
  assert.ok(Math.abs(raiseRelease - raise) <= 0.07, `Magic_Raise apex ${raise} vs ${raiseRelease}`);
  const thrustAt = MAGE_CHARGED_SHATTERLANCE_SPEC.nativeReleaseOffset;
  assert.ok(Math.abs(thrustAt - jab) <= 0.04, 'Shatterlance thrust offset lands on the 1H_Shoot extension');
});

// The modern over-the-shoulder parabolic reticle (aim-arrow.js) is protected; this checks its
// contract with the controller (dirX/dirZ orientation, re-aim, hide) rather than the older
// ground-arrow glide/lock visuals it intentionally does not have.
await check('10. Aim arrow: reads dirX/dirZ, re-aims via updateAim, hides on release', () => {
  const arrow = new AimArrowSystem({ getGroundHeight: () => 0 });
  arrow.show({ origin: { x: 0, z: 0 }, dirX: 0, dirZ: 1, mode: 'frost_lance', lockState: 'free' });
  for (let i = 0; i < 40; i++) arrow.update(1 / 60);
  let tip = arrow.getTipPosition();
  assert.ok(tip.z > 1.0 && Math.abs(tip.x) < 0.25 * tip.z, `dirZ must orient the arrow forward (tip ${tip.x.toFixed(2)},${tip.z.toFixed(2)})`);

  arrow.updateAim({ origin: { x: 0, z: 0 }, dirX: 1, dirZ: 0, lockState: 'locked' });
  for (let i = 0; i < 40; i++) arrow.update(1 / 60);
  tip = arrow.getTipPosition();
  assert.ok(tip.x > 1.0 && Math.abs(tip.z) < 0.25 * tip.x, `updateAim must re-orient to +X (tip ${tip.x.toFixed(2)},${tip.z.toFixed(2)})`);

  if (typeof arrow.release === 'function') arrow.release({ holdSeconds: 0 });
  else arrow.hide();
  arrow.update(0.2);
  assert.equal(arrow.group.visible, false);
  arrow.dispose();
});

await check('11. Bolt homing eases the impact point toward a moving target, capped at 2.5 m', () => {
  const bolts = new MageBoltSystem({ getGroundHeight: () => 0 });
  const target = enemy('mover', 0, 10, { y: 0 });
  bolts.setTargetResolver((pt) => (Math.hypot(pt.x - target.x, pt.z - target.z) < 1.6 ? target : null));
  bolts.fireComboVolley({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, z: 1 }, targetPos: { x: 0, y: 1, z: 10 }, comboIndex: 0 });
  const volley = bolts.volleys.at(-1);
  assert.equal(volley.trackRef, target);
  target.x = 1.0;
  for (let i = 0; i < 12; i++) bolts.update(1 / 60);
  assert.ok(volley.end.x > 0.6 && volley.end.x <= 1.0 + 1e-6, `end.x=${volley.end.x}`);
  target.x = 9.0;
  for (let i = 0; i < 6; i++) bolts.update(1 / 60);
  assert.ok(volley.end.x <= 2.5 + 1e-6, 'never curves more than 2.5 m (not auto-play)');
  bolts.dispose();
});

if (process.exitCode) {
  console.error(`\n${passed} PASSED, SOME MAGE AIM TESTS FAILED (see FAIL above)\n`);
} else {
  console.log(`\nALL ${passed} MAGE AIM TESTS PASSED\n`);
}
