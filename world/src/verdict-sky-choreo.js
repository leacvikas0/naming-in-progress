// Divine Verdict sky choreography: pure time -> sky/post parameters.
// Beats stay inside the gameplay locks (smite 2.8 s, blessing 4.8 s); the
// release/afterglow tails run after controls unlock and are purely visual.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const easeInQuart = (u) => u * u * u * u;
const easeOutBack = (u, s = 1.70158) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);

// Curtain fronts (shader maps front 0..1 linearly to elevation 1.12..-0.12): drop
// quickly through the mostly off-screen zenith, then spend ~70% of the time
// lowering heavily through the visible sky and settling onto the horizon.
const DESCEND_SPLIT = 0.2;
export function descend(u) {
  u = clamp01(u);
  if (u < DESCEND_SPLIT) return 0.5 * (u / DESCEND_SPLIT) ** 2;
  return 0.5 + 0.5 * (1 - Math.pow(1 - (u - DESCEND_SPLIT) / (1 - DESCEND_SPLIT), 1.5));
}

export const VERDICT_SKY_TAILS = Object.freeze({ smite: 4.4, blessing: 9.6, channelRelease: 1.2 });

export function idleVerdictSky() {
  return {
    weight: 0, compression: 0, windTimeScale: 1, monochrome: 0,
    front: 1, clear: 0, discScale: 1, coronaGold: 0, diamond: 0, wrath: 0,
    skyBolt: 0, flash: 0, flashGold: 0, dim: 0, gold: 0, shafts: 0, shaftReach: 0, part: 0,
  };
}

// Prayer channel (listening / judging): hush, then the eclipse curtain descends.
export function evalChannelSky(c, entryFront = 0) {
  const o = idleVerdictSky();
  o.weight = 1;
  o.windTimeScale = 1 - 0.65 * easeOutCubic(seg(c, 0, 0.9));
  o.front = Math.max(entryFront, descend(seg(c, 0.3, 3.0)));
  // Disc swells in with overshoot as the curtain passes its elevation
  o.discScale = 0.35 + 0.65 * easeOutBack(seg(c, 1.0, 2.4), 2.2);
  o.compression = 0.65 * easeInOutCubic(seg(c, 1.2, 3.2));
  o.dim = 0.6 * easeInOutCubic(seg(c, 0, 0.7)) * (1 - easeInOutCubic(seg(c, 1.8, 2.8)));
  return o;
}

// Cancelled prayer: curtain lifts back up toward the zenith.
export function evalChannelReleaseSky(r, snap) {
  const o = idleVerdictSky();
  const u = easeInOutCubic(seg(r, 0, 1.1));
  o.weight = 1;
  o.front = (snap?.front ?? 1) * (1 - u);
  o.discScale = snap?.discScale ?? 1;
  o.compression = (snap?.compression ?? 0.65) * (1 - u);
  o.windTimeScale = 0.35 + 0.65 * u;
  if (r >= VERDICT_SKY_TAILS.channelRelease) return idleVerdictSky();
  return o;
}

// Smite: the strike lands with the gameplay hit (t = 0.04), then a crimson
// wrath front sweeps down, the disc punches out and clouds roll down.
export function evalSmiteSky(t, entryFront = 1) {
  const o = idleVerdictSky();
  if (t >= VERDICT_SKY_TAILS.smite) return o;
  o.weight = 1;
  o.windTimeScale = 0;
  o.front = entryFront + (1 - entryFront) * easeOutCubic(seg(t, 0, 0.45));
  o.discScale = t < 0.04 ? 1 - 0.06 * (t / 0.04) : 0.94 + 0.24 * easeOutBack(seg(t, 0.04, 0.62), 2.6) - 0.06 * easeInOutCubic(seg(t, 0.62, 1.4));
  // One heavy bolt with two after-strokes
  o.skyBolt = t < 0.04 ? 0 : t < 0.13 ? 1 : t < 0.17 ? 0.25 : t < 0.23 ? 0.85 : t < 0.27 ? 0 : t < 0.31 ? 0.55 : 0;
  o.flash = o.skyBolt * 0.45; // hard photographic strobe, no lingering wash
  o.monochrome = t < 0.04 ? 0 : 1;
  o.wrath = descend(seg(t, 0.08, 1.05));
  o.compression = 0.65 + 0.35 * easeInOutCubic(seg(t, 0.2, 1.2));
  if (t > 2.8) {
    // Release: colour drains back in while a clean sky descends from the zenith
    const r = t - 2.8;
    o.monochrome = 1 - easeInOutCubic(seg(r, 0.05, 0.75));
    o.clear = descend(seg(r, 0, 1.5));
    o.wrath *= 1 - easeOutCubic(seg(r, 0, 0.9));
    o.compression *= 1 - easeInOutCubic(seg(r, 0.2, 1.5));
    o.windTimeScale = easeInOutCubic(seg(r, 0.3, 1.6));
    if (r > 1.52) o.weight = 0;
  }
  return o;
}

// Blessing: hush -> court holds -> corona turns gold underground -> diamond
// ring at the pop-up (4.25 s) -> clear golden veil and shafts descend -> settle.
export function evalBlessingSky(t, entryFront = 1) {
  const o = idleVerdictSky();
  if (t >= VERDICT_SKY_TAILS.blessing) return o;
  o.weight = 1;
  o.front = entryFront + (1 - entryFront) * easeOutCubic(seg(t, 0, 0.6));
  o.windTimeScale = 0.35 * (1 - easeOutCubic(seg(t, 0, 0.6))) + easeInOutCubic(seg(t, 4.25, 5.8));
  o.dim = 0.4 * easeInOutCubic(seg(t, 0, 0.7)) * (1 - easeInOutCubic(seg(t, 2.7, 3.8)));
  o.compression =
    (0.65 + 0.35 * easeInOutCubic(seg(t, 0.3, 2.1))) * (1 - easeInOutCubic(seg(t, 4.2, 5.6)));
  o.discScale =
    1 - 0.1 * easeInOutCubic(seg(t, 2.1, 2.65)) + 0.1 * easeOutBack(seg(t, 2.65, 4.25), 1.4);
  o.coronaGold = easeInOutCubic(seg(t, 2.75, 3.95));
  o.diamond = t < 4.25 ? easeInQuart(seg(t, 3.55, 4.25)) : Math.exp(-(t - 4.25) * 3.2);
  o.flash = t < 4.25 ? 0 : 0.22 * Math.exp(-(t - 4.25) * 7);
  o.flashGold = 1;
  o.clear = descend(seg(t, 4.1, 5.7));
  o.shafts = easeOutCubic(seg(t, 4.1, 4.6)) * (1 - easeInOutCubic(seg(t, 6.6, 9.2)));
  o.shaftReach = easeOutCubic(seg(t, 4.1, 5.0));
  o.gold = easeOutCubic(seg(t, 4.15, 5.0)) * (1 - easeInOutCubic(seg(t, 6.0, 9.4)));
  o.part = easeOutCubic(seg(t, 4.2, 5.6)) * (1 - easeInOutCubic(seg(t, 7.0, 9.5)));
  if (t > 5.75) o.weight = 0;
  return o;
}

export function evalVerdictSky(kind, t, entryFront = 1) {
  if (kind === 'smite') return evalSmiteSky(t, entryFront);
  if (kind === 'blessing') return evalBlessingSky(t, entryFront);
  if (kind === 'channel') return evalChannelSky(t, entryFront);
  return idleVerdictSky();
}
