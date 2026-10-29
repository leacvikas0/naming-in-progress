// Palette access. The JSON in /data is the single source of truth — it is
// plain data so a non-JS engine can read the same colours.

import paletteData from "../../data/meadow.palette.json" with { type: "json" };
import * as THREE from "three";

export const PALETTE = paletteData;

const cache = new Map();

/** Hex string (or number) -> cached THREE.Color. */
export function col(value) {
  if (value == null) return new THREE.Color(0xffffff);
  if (value instanceof THREE.Color) return value;
  const key = String(value);
  let c = cache.get(key);
  if (!c) {
    c = new THREE.Color(value);
    cache.set(key, c);
  }
  return c;
}

/** Colour from a species block, e.g. speciesCol("daisy", "petal"). */
export function speciesCol(id, key) {
  const block = PALETTE.species[id];
  if (!block) throw new Error(`palette: no species "${id}"`);
  const v = block[key];
  if (v == null) throw new Error(`palette: species "${id}" has no colour "${key}"`);
  return col(v);
}

/** Colour from the ground block, e.g. groundCol("pathLit"). */
export function groundCol(key) {
  const v = PALETTE.ground[key];
  if (v == null) throw new Error(`palette: ground has no colour "${key}"`);
  return col(v);
}

export function lightCol(key) {
  const v = PALETTE.light[key];
  if (v == null) throw new Error(`palette: light has no colour "${key}"`);
  return col(v);
}
