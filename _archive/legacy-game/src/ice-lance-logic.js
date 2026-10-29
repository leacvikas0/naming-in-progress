// Frost Lance — shared footprint and clipping math.
//
// This private helper exists for one reason: the damage side (enemies.js) and
// the visual side (ice-lance-vfx.js) must agree on the exact same band shape,
// and the player must clip the cast line against the live world. Duplicating
// halfWidthAt() in two modules would let the visible ice and the hurtbox drift
// apart, so both import it from here. It imports nothing.

/** Half-width of the Frost Lance band at `s` (0..1) along the locked line. */
export function halfWidthAt(s, cfg) {
  const t = s < 0 ? 0 : s > 1 ? 1 : s;
  return cfg.widthNear + (cfg.widthFar - cfg.widthNear) * Math.pow(t, cfg.widthCurve);
}

/**
 * How far a cast aimed from `origin` along `dir` can travel before it meets the
 * first solid world collider or the play-area boundary. Never exceeds maxRange.
 *
 * `origin` needs x/z; `dir` is a horizontal direction (normalised by the caller).
 * Returns metres, always finite and >= 0.
 */
export function clipCastLength(origin, dir, maxRange, world) {
  let length = Number.isFinite(maxRange) && maxRange > 0 ? maxRange : 0;
  if (length <= 0) return 0;
  const dx = Number.isFinite(dir && dir.x) ? dir.x : 0;
  const dz = Number.isFinite(dir && dir.z) ? dir.z : 0;
  const ox = Number.isFinite(origin && origin.x) ? origin.x : 0;
  const oz = Number.isFinite(origin && origin.z) ? origin.z : 0;

  // Play-area boundary: the first slab the ray leaves.
  const b = world && world.bounds;
  if (b && Number.isFinite(b.minX) && Number.isFinite(b.maxX)) {
    if (dx > 1e-6) length = Math.min(length, (b.maxX - ox) / dx);
    else if (dx < -1e-6) length = Math.min(length, (b.minX - ox) / dx);
    if (dz > 1e-6) length = Math.min(length, (b.maxZ - oz) / dz);
    else if (dz < -1e-6) length = Math.min(length, (b.minZ - oz) / dz);
  }

  // Solid props: nearest positive ray-circle intersection. A small margin keeps
  // the far crystals from visually intersecting the prop that stopped the line.
  const colliders = world && world.colliders;
  if (Array.isArray(colliders)) {
    const margin = 0.25;
    for (const c of colliders) {
      if (!c) continue;
      const r = (Number.isFinite(c.radius) ? c.radius : 0) + margin;
      if (r <= 0) continue;
      const cx = ox - c.x;
      const cz = oz - c.z;
      const bq = cx * dx + cz * dz;
      const cq = cx * cx + cz * cz - r * r;
      if (cq <= 0) continue; // origin already inside the prop
      const disc = bq * bq - cq;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      const t = -bq - root;
      if (t > 0 && t < length) length = t;
    }
  }

  return length > 0 ? length : 0;
}

/** Advance a fracture front by `dt` gameplay seconds. Returns the new front. */
export function advanceFront(front, dt, cfg, length) {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const speed = Number.isFinite(cfg.speed) ? cfg.speed : 0;
  const next = front + speed * step;
  return next > length ? length : next;
}
