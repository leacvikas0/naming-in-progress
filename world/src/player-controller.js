// ============================================================================
// world/src/player-controller.js
//
// Stage 3 World Integration: Co-Op Hero Duo (Knight + Mage), Partner Wingman
// Follow AI, East Wisteria Arena Skeleton Guardians & 100% Native Skeletal
// Animation State Machine (Zero Procedural Bone-Wiggling).
// ============================================================================

import * as THREE from 'three';
import { createCharactersKit } from '../assets/characters/index.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function shortestAngleDiff(target, current) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Configures generous local bounding spheres and enables `frustumCulled = true`
 * on a unified character's `SkinnedMesh` pair so off-screen characters cost 0
 * draw calls when outside the camera frustum.
 */
function enableCharacterFrustumCulling(charInstance, sphereRadius = 3.2) {
  if (!charInstance || !charInstance.modelRoot) return;
  const localSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), sphereRadius);
  charInstance.modelRoot.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      if (obj.geometry) {
        obj.geometry.boundingSphere = localSphere.clone();
      }
      obj.boundingSphere = localSphere.clone();
      obj.frustumCulled = true;
    }
  });
}

/**
 *Deterministic shot pose table for `window.__WORLD__.setShot(shotId)` so
 * automated verification screenshots capture expressive, reproducible native
 * skeletal poses across all 8 views.
 */
export const SHOT_CHARACTER_POSES = {
  'day-plaza': {
    knight: { x: 0.85, z: 11.5, rotY: 0.38, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: 3.15, z: 11.6, rotY: -0.35, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-mill-pier': {
    knight: { x: -38.4, z: 9.0, rotY: -2.25, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: -36.3, z: 8.0, rotY: -1.95, clip: 'cheer', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-arena-wisteria': {
    knight: { x: 50.5, z: -5.8, rotY: 1.55, clip: 'combo1', time: 0.36 },
    mage: { x: 48.2, z: -0.2, rotY: 1.85, clip: 'cast_shoot', time: 0.34 },
    skeletonWarrior: { x: 56.5, z: -8.2, rotY: -1.35, clip: 'combo2', time: 0.38 },
    skeletonMage: { x: 60.5, z: 0.8, rotY: -1.55, clip: 'cast_shoot', time: 0.35 },
  },
  'day-shrine-arch': {
    knight: { x: -1.05, z: -76.2, rotY: 2.88, clip: 'pray_channel', time: 0.52 },
    mage: { x: 1.25, z: -76.0, rotY: -2.82, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'evening-sunset-vista': {
    knight: { x: -0.9, z: -36.5, rotY: -0.15, clip: 'cheer', time: 0.55 },
    mage: { x: 1.1, z: -36.5, rotY: -0.25, clip: 'wave', time: 0.45 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-moon-shrine': {
    knight: { x: -1.05, z: -76.2, rotY: 2.85, clip: 'pray_channel', time: 0.55 },
    mage: { x: 1.25, z: -76.0, rotY: -2.78, clip: 'burst_aoe', time: 0.62 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-plaza-lanterns': {
    knight: { x: 1.05, z: 8.5, rotY: 0.42, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: 3.35, z: 8.9, rotY: -0.38, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'aerial-masterplan': {
    knight: { x: 0.0, z: 14.0, rotY: Math.PI, clip: 'idle', time: 0.35 },
    mage: { x: 2.0, z: 14.0, rotY: Math.PI, clip: 'idle', time: 0.35 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
};

export async function createCoopPlayerSystem({
  scene,
  walkableHeightAt,
  resolveCollisions,
  arenaZone = { x: 68, z: -4, y: 0.6 },
  initialPos = { x: 2.8, z: 14.5, yaw: Math.PI + 0.15 },
  onHeroSwapped = null,
} = {}) {
  const kit = createCharactersKit();
  await kit.loadAnimationPacks();

  const rootGroup = new THREE.Group();
  rootGroup.name = 'stage3CoopCharactersRoot';
  scene.add(rootGroup);

  const heroesGroup = new THREE.Group();
  heroesGroup.name = 'coopHeroesDuoGroup';
  rootGroup.add(heroesGroup);

  const arenaEnemiesGroup = new THREE.Group();
  arenaEnemiesGroup.name = 'eastArenaSkeletonsGroup';
  rootGroup.add(arenaEnemiesGroup);

  // Instantiate the 2 Co-Op Heroes (Knight + Mage) and 2 East Arena Skeletons in parallel
  const [knightChar, mageChar, skelWarrior, skelMage] = await Promise.all([
    kit.createCharacter('Knight', {
      initialClip: 'idle',
      position: [initialPos.x, walkableHeightAt(initialPos.x, initialPos.z), initialPos.z],
      rotY: initialPos.yaw,
    }),
    kit.createCharacter('Mage', {
      initialClip: 'idle',
      position: [
        initialPos.x + 1.85,
        walkableHeightAt(initialPos.x + 1.85, initialPos.z + 0.5),
        initialPos.z + 0.5,
      ],
      rotY: initialPos.yaw - 0.25,
    }),
    kit.createCharacter('Skeleton_Warrior', {
      initialClip: 'idle',
      position: [54.6, walkableHeightAt(54.6, -3.2), -3.2],
      rotY: -1.25,
    }),
    kit.createCharacter('Skeleton_Mage', {
      initialClip: 'idle',
      position: [57.0, walkableHeightAt(57.0, -0.8), -0.8],
      rotY: -1.35,
    }),
  ]);

  heroesGroup.add(knightChar.group);
  heroesGroup.add(mageChar.group);

  // Enable frustum culling on East Arena Skeletons so they cost 0 draw calls when looking away
  enableCharacterFrustumCulling(skelWarrior, 3.2);
  enableCharacterFrustumCulling(skelMage, 3.2);
  arenaEnemiesGroup.add(skelWarrior.group);
  arenaEnemiesGroup.add(skelMage.group);

  // State for Player 1 (Active Leader) and Player 2 (Co-Op Wingman Partner)
  const heroStates = {
    Knight: {
      id: 'Knight',
      char: knightChar,
      x: initialPos.x,
      z: initialPos.z,
      y: walkableHeightAt(initialPos.x, initialPos.z),
      vy: 0,
      yaw: initialPos.yaw,
      grounded: true,
      locomotionState: 'idle',
      actionState: null,
      actionTimer: 0,
      comboIndex: 0,
      comboResetTimer: 0,
      dashDirX: 0,
      dashDirZ: 0,
      praying: false,
      landTimer: 0,
    },
    Mage: {
      id: 'Mage',
      char: mageChar,
      x: initialPos.x + 1.85,
      z: initialPos.z + 0.5,
      y: walkableHeightAt(initialPos.x + 1.85, initialPos.z + 0.5),
      vy: 0,
      yaw: initialPos.yaw - 0.25,
      grounded: true,
      locomotionState: 'idle',
      actionState: null,
      actionTimer: 0,
      comboIndex: 0,
      comboResetTimer: 0,
      dashDirX: 0,
      dashDirZ: 0,
      praying: false,
      landTimer: 0,
    },
  };

  let activeHeroId = 'Knight';
  let partnerHeroId = 'Mage';

  // Shared `player` telemetry object mutated in-place for compatibility with `main.js` camera & stats
  const player = {
    x: initialPos.x,
    z: initialPos.z,
    y: walkableHeightAt(initialPos.x, initialPos.z),
    vy: 0,
    yaw: initialPos.yaw,
    speed: 7.5,
    sprintMult: 1.55,
    radius: 0.48,
    grounded: true,
    get activeHeroId() {
      return activeHeroId;
    },
    get partnerHeroId() {
      return partnerHeroId;
    },
  };

  function syncSharedPlayerFromLeader() {
    const leader = heroStates[activeHeroId];
    player.x = leader.x;
    player.y = leader.y;
    player.z = leader.z;
    player.vy = leader.vy;
    player.yaw = leader.yaw;
    player.grounded = leader.grounded;
  }

  function applyTransform(st) {
    st.char.group.position.set(st.x, st.y, st.z);
    st.char.group.rotation.y = st.yaw;
  }

  function playHeroLocomotionClip(st, nextLoco) {
    if (st.actionState || st.praying) return;
    if (st.locomotionState === nextLoco && st.char.anim.currentKey === nextLoco) return;
    st.locomotionState = nextLoco;
    const isOnce = nextLoco === 'jump_start' || nextLoco === 'jump_land';
    st.char.play(nextLoco, {
      loop: !isOnce,
      fade: isOnce ? 0.08 : 0.14,
      timeScale: nextLoco === 'sprint' ? 1.22 : 1.0,
    });
  }

  function startOneShotAction(st, clipKey, duration, { timeScale = 1.0, fade = 0.1 } = {}) {
    st.actionState = clipKey;
    st.actionTimer = duration;
    st.char.play(clipKey, {
      loop: false,
      fade,
      timeScale,
      force: true,
    });
  }

  function triggerAction(actionType) {
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    if (actionType === 'jump') {
      if (leader.grounded && !leader.praying) {
        leader.vy = 7.4;
        leader.grounded = false;
        leader.actionState = null;
        leader.actionTimer = 0;
        playHeroLocomotionClip(leader, 'jump_start');
      }
      return;
    }

    if (actionType === 'dash') {
      leader.praying = false;
      leader.dashDirX = Math.sin(leader.yaw);
      leader.dashDirZ = Math.cos(leader.yaw);
      startOneShotAction(leader, 'dash', 0.42, { timeScale: 1.35, fade: 0.06 });
      return;
    }

    if (actionType === 'attack') {
      leader.praying = false;
      if (leader.comboResetTimer > 0) {
        leader.comboIndex = (leader.comboIndex + 1) % 3;
      } else {
        leader.comboIndex = 0;
      }
      leader.comboResetTimer = 1.15;

      if (leader.id === 'Mage') {
        const mageClips = ['cast_shoot', 'combo1', 'cast_spell'];
        const clip = mageClips[leader.comboIndex];
        startOneShotAction(leader, clip, 0.56, { timeScale: 1.25, fade: 0.08 });
      } else {
        const knightClips = ['combo1', 'combo2', 'combo3'];
        const clip = knightClips[leader.comboIndex];
        startOneShotAction(leader, clip, 0.54, { timeScale: 1.28, fade: 0.08 });
      }

      // Co-op wingman support strike on 3rd combo finisher
      if (leader.comboIndex === 2 && !partner.actionState) {
        const supportClip = partner.id === 'Mage' ? 'cast_shoot' : 'combo1';
        startOneShotAction(partner, supportClip, 0.55, { timeScale: 1.2, fade: 0.1 });
      }
      return;
    }

    if (actionType === 'charged') {
      leader.praying = false;
      const clip = leader.id === 'Mage' ? 'burst_aoe' : 'charged';
      startOneShotAction(leader, clip, 0.78, { timeScale: 1.15, fade: 0.1 });
      return;
    }

    if (actionType === 'skill') {
      leader.praying = false;
      const leaderClip = leader.id === 'Mage' ? 'cast_spell' : 'pray_channel';
      startOneShotAction(leader, leaderClip, 0.72, { timeScale: 1.15, fade: 0.1 });
      // Partner reacts with synchronized romantic synergy cast/cheer
      const partnerClip = partner.id === 'Mage' ? 'cast_shoot' : 'cheer';
      startOneShotAction(partner, partnerClip, 0.68, { timeScale: 1.15, fade: 0.1 });
      return;
    }

    if (actionType === 'burst') {
      leader.praying = false;
      startOneShotAction(leader, 'burst_aoe', 0.95, { timeScale: 1.05, fade: 0.12 });
      startOneShotAction(partner, 'burst_aoe', 0.95, { timeScale: 1.05, fade: 0.12 });
      return;
    }

    if (actionType === 'cheer') {
      leader.praying = false;
      startOneShotAction(leader, 'cheer', 0.9, { timeScale: 1.0, fade: 0.12 });
      startOneShotAction(partner, 'wave', 0.9, { timeScale: 1.0, fade: 0.12 });
    }
  }

  function setPraying(isHoldingPray) {
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];
    if (isHoldingPray) {
      if (!leader.praying) {
        leader.praying = true;
        leader.actionState = null;
        leader.actionTimer = 0;
        leader.char.play('pray_channel', { loop: true, fade: 0.15, timeScale: 0.85, force: true });
        partner.char.play('cast_spell', { loop: true, fade: 0.15, timeScale: 0.9, force: true });
      }
    } else if (leader.praying) {
      leader.praying = false;
      // Miracle release!
      startOneShotAction(leader, 'burst_aoe', 0.85, { timeScale: 1.15, fade: 0.1 });
      startOneShotAction(partner, 'cheer', 0.85, { timeScale: 1.1, fade: 0.1 });
    }
  }

  function swapActiveHero() {
    const prevLeader = heroStates[activeHeroId];
    prevLeader.praying = false;
    activeHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    partnerHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    syncSharedPlayerFromLeader();
    if (onHeroSwapped) {
      onHeroSwapped(activeHeroId, partnerHeroId);
    }
    return activeHeroId;
  }

  function teleportLeaderAndPartner(x, z, yaw = Math.PI) {
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    leader.x = x;
    leader.z = z;
    leader.y = walkableHeightAt(x, z);
    leader.vy = 0;
    leader.yaw = yaw;
    leader.grounded = true;
    leader.actionState = null;
    leader.actionTimer = 0;
    leader.praying = false;
    applyTransform(leader);
    playHeroLocomotionClip(leader, 'idle');

    const wingAngle = yaw - 1.85;
    const wx = x + Math.sin(wingAngle) * 1.95;
    const wz = z + Math.cos(wingAngle) * 1.95;
    partner.x = wx;
    partner.z = wz;
    partner.y = walkableHeightAt(wx, wz);
    partner.vy = 0;
    partner.yaw = yaw - 0.18;
    partner.grounded = true;
    partner.actionState = null;
    partner.actionTimer = 0;
    applyTransform(partner);
    playHeroLocomotionClip(partner, 'idle');

    syncSharedPlayerFromLeader();
  }

  // East Arena Skeleton encounter state
  let arenaTimer = 0;
  const arenaCenterVec = new THREE.Vector3(arenaZone.x, arenaZone.y || 0.6, arenaZone.z);

  function updateArenaSkeletons(dt, camera) {
    // Distance cull Skeletons when camera is > 92m away (e.g., aerial-masterplan or far side of valley)
    // so they cost 0 draw calls and 0 triangles outside the East Arena vicinity
    if (camera) {
      const camDistSq = camera.position.distanceToSquared(arenaCenterVec);
      arenaEnemiesGroup.visible = camDistSq <= 92 * 92;
      if (!arenaEnemiesGroup.visible) return;
    }

    arenaTimer += dt;
    const leader = heroStates[activeHeroId];
    const distToHero = Math.hypot(leader.x - 55.8, leader.z - -2.0);

    if (distToHero < 22.0) {
      // Face the approaching heroes and cycle combat/cast animations
      const angW = Math.atan2(leader.x - 54.6, leader.z - -3.2);
      const angM = Math.atan2(leader.x - 57.0, leader.z - -0.8);
      skelWarrior.group.rotation.y += shortestAngleDiff(angW, skelWarrior.group.rotation.y) * Math.min(1, 6 * dt);
      skelMage.group.rotation.y += shortestAngleDiff(angM, skelMage.group.rotation.y) * Math.min(1, 6 * dt);

      const cycle = arenaTimer % 4.2;
      const wClip = distToHero < 9.5 && cycle < 1.1 ? 'combo1' : 'idle';
      const mClip = distToHero < 14.0 && cycle >= 1.5 && cycle < 2.6 ? 'cast_shoot' : 'idle';
      skelWarrior.play(wClip, { loop: wClip === 'idle', fade: 0.18 });
      skelMage.play(mClip, { loop: mClip === 'idle', fade: 0.18 });
    } else {
      skelWarrior.play('idle', { loop: true, fade: 0.2 });
      skelMage.play('idle', { loop: true, fade: 0.2 });
    }

    skelWarrior.update(dt);
    skelMage.update(dt);
  }

  function update(dt, { keys, joyState, camYaw, camera } = {}) {
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    // Sync leader position if mutated externally by `main.js`
    if (Math.hypot(player.x - leader.x, player.z - leader.z) > 0.05) {
      leader.x = player.x;
      leader.z = player.z;
      leader.y = walkableHeightAt(leader.x, leader.z);
      leader.yaw = player.yaw;
    }

    if (leader.comboResetTimer > 0) {
      leader.comboResetTimer = Math.max(0, leader.comboResetTimer - dt);
    }

    // 1. Gather Keyboard + Touch Joystick input
    let fwd = 0;
    let right = 0;
    if (keys) {
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('d') || keys.has('arrowright')) right += 1;
      if (keys.has('a') || keys.has('arrowleft')) right -= 1;
    }
    if (joyState && joyState.magnitude > 0.08) {
      fwd += joyState.y;
      right += joyState.x;
    }

    const rawMag = Math.hypot(fwd, right);
    const moveMag = clamp(rawMag, 0, 1);
    const isSprinting =
      Boolean(keys && keys.has('shift')) || Boolean(joyState && joyState.sprinting);

    let didWrap = false;

    // 2. Update Active Hero (Leader)
    if (leader.actionTimer > 0) {
      leader.actionTimer = Math.max(0, leader.actionTimer - dt);
      if (leader.actionState === 'dash') {
        const dashSpeed = player.speed * 1.9;
        const next = resolveCollisions(
          leader.x + leader.dashDirX * dashSpeed * dt,
          leader.z + leader.dashDirZ * dashSpeed * dt,
          player.radius
        );
        leader.x = next.x;
        leader.z = next.z;
        didWrap = next.wrapped;
      }
      if (leader.actionTimer <= 0) {
        leader.actionState = null;
      }
    }

    if (moveMag > 1e-3 && leader.actionState !== 'dash') {
      const nx = right / (rawMag || 1);
      const nz = fwd / (rawMag || 1);
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = -fz;
      const rz = fx;
      const moveX = fx * nz + rx * nx;
      const moveZ = fz * nz + rz * nx;

      // Sanctuary time-dilation slows walk slightly while channeling prayer to Artorious
      const prayMult = leader.praying ? 0.38 : 1.0;
      const actionMult = leader.actionState ? 0.35 : 1.0;
      const spd =
        player.speed *
        (isSprinting ? player.sprintMult : moveMag < 0.55 ? 0.56 : 1.0) *
        prayMult *
        actionMult;

      const next = resolveCollisions(
        leader.x + moveX * spd * dt,
        leader.z + moveZ * spd * dt,
        player.radius
      );
      leader.x = next.x;
      leader.z = next.z;
      didWrap = next.wrapped;

      const targetYaw = Math.atan2(moveX, moveZ);
      leader.yaw += shortestAngleDiff(targetYaw, leader.yaw) * Math.min(1, 14 * dt);
    }

    // Vertical physics & Jump state transitions
    const floorY = walkableHeightAt(leader.x, leader.z);
    if (didWrap) {
      leader.y = floorY;
      leader.vy = 0;
      leader.grounded = true;
    } else if (keys && keys.has(' ') && leader.grounded && !leader.praying) {
      triggerAction('jump');
    }

    if (!leader.grounded) {
      leader.vy -= 19.0 * dt;
      leader.y += leader.vy * dt;
      if (leader.vy < 1.5 && leader.locomotionState === 'jump_start') {
        playHeroLocomotionClip(leader, 'jump_idle');
      }
      if (leader.y <= floorY) {
        leader.y = floorY;
        leader.vy = 0;
        leader.grounded = true;
        leader.landTimer = 0.18;
        playHeroLocomotionClip(leader, 'jump_land');
      }
    } else {
      leader.y = floorY;
      if (leader.landTimer > 0) {
        leader.landTimer = Math.max(0, leader.landTimer - dt);
      }
    }

    if (leader.grounded && !leader.actionState && !leader.praying && leader.landTimer <= 0) {
      if (moveMag < 0.08) {
        playHeroLocomotionClip(leader, 'idle');
      } else if (isSprinting) {
        playHeroLocomotionClip(leader, 'sprint');
      } else if (moveMag < 0.55) {
        playHeroLocomotionClip(leader, 'walk');
      } else {
        playHeroLocomotionClip(leader, 'run');
      }
    }

    applyTransform(leader);
    leader.char.update(dt);
    syncSharedPlayerFromLeader();

    // 3. Update Co-Op Partner Wingman Follow AI
    if (partner.actionTimer > 0) {
      partner.actionTimer = Math.max(0, partner.actionTimer - dt);
      if (partner.actionTimer <= 0) {
        partner.actionState = null;
      }
    }

    const wingOffsetAngle = leader.yaw - 2.1; // Right-rear wingman slot
    const targetWingX = leader.x + Math.sin(wingOffsetAngle) * 2.15;
    const targetWingZ = leader.z + Math.cos(wingOffsetAngle) * 2.15;
    const dxW = targetWingX - partner.x;
    const dzW = targetWingZ - partner.z;
    const distW = Math.hypot(dxW, dzW);

    if (didWrap || distW > 18.0) {
      partner.x = targetWingX;
      partner.z = targetWingZ;
      partner.y = walkableHeightAt(partner.x, partner.z);
      partner.yaw = leader.yaw;
      playHeroLocomotionClip(partner, 'idle');
    } else if (distW > 0.65 && !partner.actionState && !leader.praying) {
      const dirX = dxW / distW;
      const dirZ = dzW / distW;
      const partnerSpd =
        distW > 4.2
          ? player.speed * player.sprintMult
          : distW > 1.75
            ? player.speed * 1.02
            : player.speed * 0.56;
      const step = Math.min(distW - 0.45, partnerSpd * dt);
      const nextP = resolveCollisions(
        partner.x + dirX * step,
        partner.z + dirZ * step,
        player.radius * 0.9
      );
      partner.x = nextP.x;
      partner.z = nextP.z;
      partner.y = walkableHeightAt(partner.x, partner.z);

      const pTargetYaw = Math.atan2(dirX, dirZ);
      partner.yaw += shortestAngleDiff(pTargetYaw, partner.yaw) * Math.min(1, 11 * dt);

      if (distW > 4.2 || (isSprinting && moveMag > 0.2)) {
        playHeroLocomotionClip(partner, 'sprint');
      } else if (distW > 1.75 || moveMag > 0.55) {
        playHeroLocomotionClip(partner, 'run');
      } else {
        playHeroLocomotionClip(partner, 'walk');
      }
    } else if (!partner.actionState && !leader.praying) {
      partner.y = walkableHeightAt(partner.x, partner.z);
      partner.yaw += shortestAngleDiff(leader.yaw - 0.22, partner.yaw) * Math.min(1, 5 * dt);
      playHeroLocomotionClip(partner, 'idle');
    }

    applyTransform(partner);
    partner.char.update(dt);

    // 4. Update East Arena Skeleton Guardians
    updateArenaSkeletons(dt, camera);
  }

  /**
   * Deterministically positions and poses the Knight, Mage, and East Arena
   * Skeletons for automated verification screenshots (`setShot`).
   */
  function poseForShot(shotId, fallbackPlayerPos = null, camera = null) {
    const preset = SHOT_CHARACTER_POSES[shotId] || SHOT_CHARACTER_POSES['day-plaza'];

    const kx = preset.knight?.x ?? (fallbackPlayerPos ? fallbackPlayerPos[0] : 1.5);
    const kz = preset.knight?.z ?? (fallbackPlayerPos ? fallbackPlayerPos[1] : 11.5);
    const kRot = preset.knight?.rotY ?? (fallbackPlayerPos ? fallbackPlayerPos[2] : Math.PI);
    const kClip = preset.knight?.clip || 'Idle_Combat';
    const kTime = preset.knight?.time ?? 0.35;

    const mx = preset.mage?.x ?? kx + 1.8;
    const mz = preset.mage?.z ?? kz + 0.4;
    const mRot = preset.mage?.rotY ?? kRot - 0.35;
    const mClip = preset.mage?.clip || 'cast_spell';
    const mTime = preset.mage?.time ?? 0.52;

    // Position & pose Knight
    const kState = heroStates.Knight;
    kState.x = kx;
    kState.z = kz;
    kState.y = walkableHeightAt(kx, kz);
    kState.vy = 0;
    kState.yaw = kRot;
    kState.grounded = true;
    kState.actionState = null;
    kState.actionTimer = 0;
    kState.praying = false;
    applyTransform(kState);
    knightChar.poseAt(kClip, kTime);

    // Position & pose Mage
    const mState = heroStates.Mage;
    mState.x = mx;
    mState.z = mz;
    mState.y = walkableHeightAt(mx, mz);
    mState.vy = 0;
    mState.yaw = mRot;
    mState.grounded = true;
    mState.actionState = null;
    mState.actionTimer = 0;
    mState.praying = false;
    applyTransform(mState);
    mageChar.poseAt(mClip, mTime);

    // Position & pose East Arena Skeletons
    const sw = preset.skeletonWarrior || SHOT_CHARACTER_POSES['day-arena-wisteria'].skeletonWarrior;
    const sm = preset.skeletonMage || SHOT_CHARACTER_POSES['day-arena-wisteria'].skeletonMage;

    skelWarrior.group.position.set(sw.x, walkableHeightAt(sw.x, sw.z), sw.z);
    skelWarrior.group.rotation.y = sw.rotY;
    skelWarrior.poseAt(sw.clip, sw.time);

    skelMage.group.position.set(sm.x, walkableHeightAt(sm.x, sm.z), sm.z);
    skelMage.group.rotation.y = sm.rotY;
    skelMage.poseAt(sm.clip, sm.time);

    // Only keep East Arena Skeletons visible when camera is within 92m of the Arena
    if (camera) {
      const camDistSq = camera.position.distanceToSquared(arenaCenterVec);
      arenaEnemiesGroup.visible = camDistSq <= 92 * 92;
    } else {
      arenaEnemiesGroup.visible = shotId === 'day-arena-wisteria';
    }

    rootGroup.updateMatrixWorld(true);
    syncSharedPlayerFromLeader();
  }

  return {
    kit,
    rootGroup,
    heroesGroup,
    arenaEnemiesGroup,
    knight: knightChar,
    mage: mageChar,
    skeletonWarrior: skelWarrior,
    skeletonMage: skelMage,
    heroStates,
    player,
    triggerAction,
    setPraying,
    swapActiveHero,
    teleportLeaderAndPartner,
    poseForShot,
    update,
  };
}
