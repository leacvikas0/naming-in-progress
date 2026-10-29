// Seeded randomness. Every asset in this kit is deterministic: same seed in,
// same meadow out, on every machine and every run.

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))],
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
    // Approximate normal, mean 0, sd ~0.4. Good enough for jitter, cheap.
    gauss: () => (next() + next() + next() - 1.5) * 0.8165,
  };
}

function hash2i(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 2D value noise in [0,1]. Used for clumping, density variation and
// terrain relief, so patches look grown rather than sprinkled.
export function makeNoise2D(seed = 1) {
  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2i(xi, yi, seed);
    const b = hash2i(xi + 1, yi, seed);
    const c = hash2i(xi, yi + 1, seed);
    const d = hash2i(xi + 1, yi + 1, seed);
    const top = a + (b - a) * u;
    const bot = c + (d - c) * u;
    return top + (bot - top) * v;
  };
}

export function fbm2D(noise, x, y, octaves = 2) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
