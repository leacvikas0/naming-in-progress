// ============================================================================
// world/src/terrain-scalar.js
//
// Pure, fast, zero-DOM/WebGL scalar math helpers shared by terrain height/slope
// evaluation, shoreline wading physics, Spellbook terrain-conforming Aim Arrow
// projection, and headless Node.js unit tests.
// ============================================================================

export const SHORELINE_WATER_Y = -1.2;
export const SHORELINE_MAX_WADE_DEPTH = 0.35;
export const FROST_LANCE_AIM_LENGTH = 14.5;
export const CINDER_FALL_MIN_DISTANCE = 3.0;
export const CINDER_FALL_MAX_DISTANCE = 16.0;
export const SHATTERLANCE_MIN_DISTANCE = 0.8;
export const SHATTERLANCE_MAX_DISTANCE = 18.0;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  if (Math.abs(edge1 - edge0) < 1e-9) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function shortestAngleDiff(target, current) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Samples the surface normal and slope angle of a heightfield at `(x, z)`
 * using central finite differences.
 *
 * Supports both `sampleSlopeNormal(heightFn, x, z, eps)` and
 * `sampleSlopeNormal(x, z, heightFn, eps)`.
 * Returns an object with `{ x, y, z, slopeCos, slopeAngle }` that is also
 * tuple-iterable (`const [nx, ny, nz] = sampleSlopeNormal(...)`).
 */
export function sampleSlopeNormal(arg0, arg1 = 0, arg2 = 0, eps = 0.45) {
  let heightFn = null;
  let x = 0;
  let z = 0;
  if (typeof arg0 === 'function') {
    heightFn = arg0;
    x = Number(arg1) || 0;
    z = Number(arg2) || 0;
  } else if (typeof arg2 === 'function') {
    x = Number(arg0) || 0;
    z = Number(arg1) || 0;
    heightFn = arg2;
  } else {
    heightFn = () => 0;
    x = Number(arg0) || 0;
    z = Number(arg1) || 0;
  }

  const step = Math.max(1e-3, Number(eps) || 0.45);
  const hL = Number(heightFn(x - step, z)) || 0;
  const hR = Number(heightFn(x + step, z)) || 0;
  const hD = Number(heightFn(x, z - step)) || 0;
  const hU = Number(heightFn(x, z + step)) || 0;

  const rawX = hL - hR;
  const rawY = 2.0 * step;
  const rawZ = hD - hU;
  const len = Math.hypot(rawX, rawY, rawZ) || 1.0;

  const nx = rawX / len;
  const ny = rawY / len;
  const nz = rawZ / len;
  const slopeCos = clamp(ny, -1, 1);
  const slopeAngle = Math.acos(slopeCos);

  return {
    x: nx,
    y: ny,
    z: nz,
    0: nx,
    1: ny,
    2: nz,
    length: 3,
    slopeCos,
    slopeAngle,
    *[Symbol.iterator]() {
      yield nx;
      yield ny;
      yield nz;
    },
  };
}

/**
 * Returns true if the water depth at a point is shallow enough to wade on foot
 * (`waterDepth <= maxWadeDepth`, default `<= 0.35m` ankle depth).
 *
 * Supports both:
 * - `isWalkableShorelineDepth(terrainY, waterY = -1.2, maxWadeDepth = 0.35)`
 * - `isWalkableShorelineDepth(x, z, terrainHeightFn, waterY = -1.2, maxWadeDepth = 0.35)`
 */
export function isWalkableShorelineDepth(
  arg0,
  arg1 = SHORELINE_WATER_Y,
  arg2 = SHORELINE_MAX_WADE_DEPTH,
  arg3 = SHORELINE_WATER_Y,
  arg4 = SHORELINE_MAX_WADE_DEPTH
) {
  let terrainY = 0;
  let waterY = SHORELINE_WATER_Y;
  let maxWadeDepth = SHORELINE_MAX_WADE_DEPTH;

  if (typeof arg2 === 'function') {
    terrainY = Number(arg2(Number(arg0) || 0, Number(arg1) || 0)) || 0;
    waterY = typeof arg3 === 'number' ? arg3 : SHORELINE_WATER_Y;
    maxWadeDepth = typeof arg4 === 'number' ? arg4 : SHORELINE_MAX_WADE_DEPTH;
  } else {
    terrainY = Number(arg0) || 0;
    waterY = typeof arg1 === 'number' ? arg1 : SHORELINE_WATER_Y;
    maxWadeDepth = typeof arg2 === 'number' ? arg2 : SHORELINE_MAX_WADE_DEPTH;
  }

  const depth = waterY - terrainY;
  return depth <= maxWadeDepth + 1e-4;
}

export function clampWalkableShorelineHeight(
  terrainY,
  waterY = SHORELINE_WATER_Y,
  maxWadeDepth = SHORELINE_MAX_WADE_DEPTH
) {
  return Math.max(Number(terrainY) || 0, waterY - maxWadeDepth);
}

/**
 * Projects an aim ray or camera yaw/pitch / tablet touch target onto the
 * terrain heightfield for the Spellbook Aim Arrow (`Frost Lance` at fixed
 * `14.5m` length vs `Cinder Fall` with variable `3.0..16.0m` tip distance).
 */
export function projectAimRayToGround({
  origin = { x: 0, y: 0, z: 0 },
  yaw = 0,
  pitch = 0.18,
  distance = undefined,
  fixedDistance = null,
  minDistance = undefined,
  maxDistance = undefined,
  spellId = null,
  touchTarget = null,
  rayOrigin = null,
  rayDir = null,
  heightFn = () => 0,
  surfaceOffset = 0.08,
} = {}) {
  const ox = Number(origin?.x) || 0;
  const oz = Number(origin?.z) || 0;
  const oy = origin?.y !== undefined ? Number(origin.y) : Number(heightFn(ox, oz)) || 0;

  const isShatterlance = spellId === 'shatterlance';
  const effMinDist =
    typeof minDistance === 'number'
      ? minDistance
      : isShatterlance
        ? SHATTERLANCE_MIN_DISTANCE
        : CINDER_FALL_MIN_DISTANCE;
  const effMaxDist =
    typeof maxDistance === 'number'
      ? maxDistance
      : isShatterlance
        ? SHATTERLANCE_MAX_DISTANCE
        : CINDER_FALL_MAX_DISTANCE;

  const isFrostLance =
    spellId === 'frost_lance' ||
    spellId === 'frostLance' ||
    (typeof fixedDistance === 'number' && fixedDistance > 0);
  const lockedLength =
    typeof fixedDistance === 'number' && fixedDistance > 0
      ? fixedDistance
      : isFrostLance
        ? FROST_LANCE_AIM_LENGTH
        : null;

  let resolvedYaw = Number(yaw) || 0;
  let resolvedDist = null;

  // 1. Tablet touch / world target point override
  if (touchTarget && typeof touchTarget.x === 'number' && typeof touchTarget.z === 'number') {
    const dx = touchTarget.x - ox;
    const dz = touchTarget.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) {
      resolvedYaw = Math.atan2(dx, dz);
    }
    resolvedDist = d;
  } else if (
    rayOrigin &&
    rayDir &&
    typeof rayOrigin.x === 'number' &&
    typeof rayDir.x === 'number'
  ) {
    // 2. 3D Raymarch + Bisection against terrain heightfield
    const rOx = Number(rayOrigin.x) || 0;
    const rOy = Number(rayOrigin.y) || oy + 2.5;
    const rOz = Number(rayOrigin.z) || 0;
    const rLen = Math.hypot(rayDir.x || 0, rayDir.y || 0, rayDir.z || 0) || 1;
    const rDx = (rayDir.x || 0) / rLen;
    const rDy = (rayDir.y || 0) / rLen;
    const rDz = (rayDir.z || 0) / rLen;

    if (Math.hypot(rDx, rDz) > 1e-4) {
      resolvedYaw = Math.atan2(rDx, rDz);
    }

    let hitT = null;
    const maxRayT = 48.0;
    const steps = 24;
    let prevT = 0;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxRayT;
      const px = rOx + rDx * t;
      const py = rOy + rDy * t;
      const pz = rOz + rDz * t;
      const gh = Number(heightFn(px, pz)) || 0;
      if (py <= gh) {
        let lo = prevT;
        let hi = t;
        for (let b = 0; b < 5; b++) {
          const mid = (lo + hi) * 0.5;
          const mx = rOx + rDx * mid;
          const my = rOy + rDy * mid;
          const mz = rOz + rDz * mid;
          if (my <= (Number(heightFn(mx, mz)) || 0)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        hitT = (lo + hi) * 0.5;
        break;
      }
      prevT = t;
    }

    if (hitT !== null) {
      const hx = rOx + rDx * hitT;
      const hz = rOz + rDz * hitT;
      const dx = hx - ox;
      const dz = hz - oz;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        resolvedYaw = Math.atan2(dx, dz);
      }
      resolvedDist = d;
    }
  }

  // 3. Explicit distance or Desktop PointerLock camera pitch mapping
  if (resolvedDist === null) {
    if (typeof distance === 'number' && Number.isFinite(distance)) {
      resolvedDist = distance;
    } else {
      // Steep pitch (looking down near feet) -> minDistance (3.0m)
      // Flat pitch (looking out toward horizon) -> maxDistance (16.0m)
      const absPitch = Math.abs(Number(pitch) || 0);
      const steepness = clamp((absPitch - 0.04) / 0.85, 0, 1);
      resolvedDist = lerp(effMaxDist, effMinDist, steepness);
    }
  }

  const finalDistance =
    lockedLength !== null
      ? lockedLength
      : clamp(resolvedDist, effMinDist, effMaxDist);

  const dirX = Math.sin(resolvedYaw);
  const dirZ = Math.cos(resolvedYaw);
  const tipX = ox + dirX * finalDistance;
  const tipZ = oz + dirZ * finalDistance;
  const rawGroundY = Number(heightFn(tipX, tipZ)) || 0;
  const tipY = rawGroundY + surfaceOffset;
  const normal = sampleSlopeNormal(heightFn, tipX, tipZ, 0.45);

  return {
    x: tipX,
    y: tipY,
    z: tipZ,
    groundY: rawGroundY,
    distance: finalDistance,
    length: finalDistance,
    yaw: resolvedYaw,
    dirX,
    dirZ,
    direction: { x: dirX, y: 0, z: dirZ },
    origin: { x: ox, y: oy, z: oz },
    targetPos: { x: tipX, y: rawGroundY, z: tipZ },
    normal,
    spellId: spellId || (lockedLength !== null ? 'frost_lance' : 'cinder_fall'),
  };
}
