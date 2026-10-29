// Deterministic pseudo-random generator.
// Same seed -> same petal layout, which makes the system reproducible in
// games (replays, networked seeds, screenshot tests).
export function createRng(seed = 133742) {
  let s = (seed >>> 0) || 1;
  return function rand() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function range(rand, min, max) {
  return min + rand() * (max - min);
}

export function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
