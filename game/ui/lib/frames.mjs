// The 9-slice frame engine. Every panel in the game is one of these.
//
// Authoring rules learned from the parts bin:
//  - A slab must read as ROCK, not as a grey rectangle. That needs a real
//    dither texture, a 2px lit bevel, and a hard dark under-shadow.
//  - Bevel contrast must survive being stretched. If two palette entries are
//    neighbours in value, the bevel disappears at display size. Every edge
//    run is therefore at least 2px and at least 2 palette steps apart.
//  - Corners carry the identity. Chunky 2-3px staircases, not 1px cuts.

import { Surface, parseColor, makeRng } from "./pixel.mjs";
import { P, TIERS } from "./palette.mjs";

export const BORDER = 8;

/**
 * Rock face.
 *
 * Per-pixel random speckle reads as TV static at panel size — this was the
 * single biggest visual failure in the first pass. Cut stone reads as a few
 * LARGE, sparse marks: short horizontal dashes (bedding planes), occasional
 * 2px pits, and a couple of longer cracks. Density stays low (~12%) so the
 * bevel and outline stay dominant, and the tone step is only one palette
 * entry so the texture never fights the silhouette.
 */
function ditherStone(s, x0, y0, w, h, a, b, strength = 0.5, seed = 7) {
  const rng = makeRng(seed);
  const ca = parseColor(a);
  const cb = parseColor(b);

  // base fill
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) s.set(x, y, ca);
  }

  const density = 0.1 + strength * 0.08;

  // bedding dashes: 2-4px long, 1px tall, biased to sit on odd rows so they
  // read as sedimentary layers rather than noise
  const dashCount = Math.round(w * h * density * 0.055);
  for (let i = 0; i < dashCount; i++) {
    const len = 2 + Math.floor(rng() * 3);
    const dx = x0 + Math.floor(rng() * w);
    const dy = y0 + Math.floor(rng() * h);
    for (let k = 0; k < len; k++) {
      if (dx + k < x0 + w) s.set(dx + k, dy, cb);
    }
  }

  // pits: single darker pixels, sparse, in clusters of 2
  const pitCount = Math.round(w * h * density * 0.02);
  for (let i = 0; i < pitCount; i++) {
    const dx = x0 + Math.floor(rng() * w);
    const dy = y0 + Math.floor(rng() * h);
    s.set(dx, dy, cb);
    if (rng() < 0.5) s.set(dx + 1, dy, cb);
  }

  // one or two longer cracks on tall panels
  if (h > 20) {
    const cracks = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < cracks; i++) {
      let cx = x0 + 2 + Math.floor(rng() * (w - 4));
      let cy = y0 + 3 + Math.floor(rng() * Math.max(1, h - 10));
      const len = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < len; k++) {
        s.set(cx, cy, cb);
        if (rng() < 0.6) cx += 1;
        else cy += 1;
        if (cx >= x0 + w || cy >= y0 + h) break;
      }
    }
  }
}

/**
 * Flatten the centre of a 9-slice source.
 *
 * In CSS `border-image` the centre region is STRETCHED to fill the element's
 * interior. Any texture there is magnified into large ugly blotches, so the
 * centre must be a single flat colour. All texture belongs in the border ring,
 * which is never resampled.
 */
function flattenCenter(s, border, color) {
  s.rect(border, border, s.width - border * 2, s.height - border * 2, color);
}

/**
 * The workhorse slab. 32x32 source, 10px border.
 * Chunky stony: chiselled 3px corners, iron outline, dithered rock in the
 * border ring, hard 2px lit bevel top/left, 3px shaded bevel bottom/right,
 * corner studs.
 */
export function frameSlab({
  fill,
  fill2,
  hi = P.stoneHi,
  lo = P.stoneDeep,
  edge = P.iron0,
  stud = true,
  size = 32,
  border = 10,
} = {}) {
  const s = new Surface(size, size);
  const base = fill ?? P.stoneMid;
  const base2 = fill2 ?? P.stoneLo;

  // ---- rock face (the border ring carries the texture; see flattenCenter)
  ditherStone(s, 0, 0, size, size, base, base2, 0.36, 11);
  flattenCenter(s, border, base);

  // ---- chiselled corners: 3px staircase
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [size - 1, 0, -1, 1],
    [0, size - 1, 1, -1],
    [size - 1, size - 1, -1, -1],
  ]) {
    s.set(cx, cy, null);
    s.set(cx + sx, cy, null);
    s.set(cx + sx * 2, cy, null);
    s.set(cx, cy + sy, null);
    s.set(cx, cy + sy * 2, null);
    s.set(cx + sx, cy + sy, null);
    s.set(cx + sx, cy + sy * 2, null);
    s.set(cx + sx * 2, cy + sy, null);
  }

  // ---- iron outline following the staircase
  s.hline(3, 0, size - 6, edge);
  s.hline(3, size - 1, size - 6, edge);
  s.vline(0, 3, size - 6, edge);
  s.vline(size - 1, 3, size - 6, edge);
  s.set(2, 1, edge);
  s.set(1, 2, edge);
  s.set(size - 3, 1, edge);
  s.set(size - 2, 2, edge);
  s.set(2, size - 2, edge);
  s.set(1, size - 3, edge);
  s.set(size - 3, size - 2, edge);
  s.set(size - 2, size - 3, edge);

  // ---- lit bevel: 2px top, 2px left, bright then mid
  s.hline(3, 1, size - 6, hi);
  s.hline(3, 2, size - 6, P.stoneLit);
  s.vline(1, 3, size - 6, hi);
  s.vline(2, 3, size - 6, P.stoneLit);
  s.set(2, 2, hi);

  // ---- shaded bevel: 3px bottom, 3px right, mid then deep
  s.hline(3, size - 2, size - 6, P.stoneLo);
  s.hline(3, size - 3, size - 6, lo);
  s.hline(4, size - 4, size - 8, lo);
  s.vline(size - 2, 3, size - 6, P.stoneLo);
  s.vline(size - 3, 3, size - 6, lo);
  s.vline(size - 4, 4, size - 8, lo);
  s.set(size - 3, size - 3, lo);

  // ---- inner shadow: a hard groove just inside the lit bevel.
  // This is what makes the slab read as thick rather than as a sticker.
  s.hline(border - 4, border - 3, size - (border - 4) * 2, P.iron0);
  s.vline(border - 3, border - 4, size - (border - 4) * 2, P.iron0);
  s.hline(border - 3, border - 3, size - (border - 3) * 2, P.stoneLo);
  s.vline(border - 3, border - 3, size - (border - 3) * 2, P.stoneLo);

  // ---- corner studs: struck iron rivets with a lit shoulder
  if (stud) {
    for (const [rx, ry] of [
      [4, 4],
      [size - 7, 4],
      [4, size - 7],
      [size - 7, size - 7],
    ]) {
      s.set(rx, ry, P.iron0);
      s.set(rx + 1, ry, P.iron0);
      s.set(rx + 2, ry, P.iron1);
      s.set(rx, ry + 1, P.iron0);
      s.set(rx + 1, ry + 1, P.iron3);
      s.set(rx + 2, ry + 1, P.iron1);
      s.set(rx, ry + 2, P.iron1);
      s.set(rx + 1, ry + 2, P.iron1);
      s.set(rx + 2, ry + 2, P.stoneHi);
    }
  }

  return s;
}

/**
 * Ornate panel: slab + an inset gold rule with stepped corners and a
 * gem-notch at each corner. 40x40 source, 14px border. This is the
 * "treasure" register — hero detail plaque, upgrade cards, death panel.
 */
export function frameOrnate({ tier = "common", size = 40, border = 14 } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const s = new Surface(size, size);

  ditherStone(s, 0, 0, size, size, P.stoneDeep, "#1a1611", 0.42, 23);
  flattenCenter(s, border, "#14110d");

  // chiselled corners, 3px
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [size - 1, 0, -1, 1],
    [0, size - 1, 1, -1],
    [size - 1, size - 1, -1, -1],
  ]) {
    s.set(cx, cy, null);
    s.set(cx + sx, cy, null);
    s.set(cx + sx * 2, cy, null);
    s.set(cx, cy + sy, null);
    s.set(cx, cy + sy * 2, null);
    s.set(cx + sx, cy + sy, null);
    s.set(cx + sx, cy + sy * 2, null);
    s.set(cx + sx * 2, cy + sy, null);
  }

  // iron outline
  s.hline(3, 0, size - 6, P.iron0);
  s.hline(3, size - 1, size - 6, P.iron0);
  s.vline(0, 3, size - 6, P.iron0);
  s.vline(size - 1, 3, size - 6, P.iron0);
  s.set(2, 1, P.iron0);
  s.set(1, 2, P.iron0);
  s.set(size - 3, 1, P.iron0);
  s.set(size - 2, 2, P.iron0);
  s.set(2, size - 2, P.iron0);
  s.set(1, size - 3, P.iron0);
  s.set(size - 3, size - 2, P.iron0);
  s.set(size - 2, size - 3, P.iron0);

  // stone bevel: lit top/left, shaded bottom/right
  s.hline(3, 1, size - 6, P.stoneHi);
  s.hline(3, 2, size - 6, P.stoneLit);
  s.vline(1, 3, size - 6, P.stoneHi);
  s.vline(2, 3, size - 6, P.stoneLit);
  s.set(2, 2, P.stoneHi);

  s.hline(3, size - 2, size - 6, P.stoneLo);
  s.hline(3, size - 3, size - 6, P.stoneDeep);
  s.vline(size - 2, 3, size - 6, P.stoneLo);
  s.vline(size - 3, 3, size - 6, P.stoneDeep);

  // gold inset rule with stepped corners
  const r = border - 7; // 7 for border 14
  const inner = size - r * 2;
  s.hline(r + 1, r, inner - 2, t.mid);
  s.hline(r + 1, size - r - 1, inner - 2, t.dk);
  s.vline(r, r + 1, inner - 2, t.mid);
  s.vline(size - r - 1, r + 1, inner - 2, t.dk);

  // stepped rule corners
  s.set(r, r, t.deep);
  s.set(r + 1, r, t.hi);
  s.set(r + 2, r, t.mid);
  s.set(r, r + 1, t.hi);
  s.set(r, r + 2, t.mid);

  s.set(size - r - 1, r, t.deep);
  s.set(size - r - 2, r, t.hi);
  s.set(size - r - 3, r, t.mid);
  s.set(size - r - 1, r + 1, t.hi);
  s.set(size - r - 1, r + 2, t.mid);

  s.set(r, size - r - 1, t.deep);
  s.set(r + 1, size - r - 1, t.hi);
  s.set(r + 2, size - r - 1, t.mid);
  s.set(r, size - r - 2, t.hi);
  s.set(r, size - r - 3, t.mid);

  s.set(size - r - 1, size - r - 1, t.deep);
  s.set(size - r - 2, size - r - 1, t.hi);
  s.set(size - r - 3, size - r - 1, t.mid);
  s.set(size - r - 1, size - r - 2, t.hi);
  s.set(size - r - 1, size - r - 3, t.mid);

  // second, fainter rule inside — depth without noise
  s.hline(r + 4, r + 3, size - (r + 4) * 2, P.iron0);
  s.vline(r + 3, r + 4, size - (r + 4) * 2, P.iron0);

  // corner gems: a 2x2 tier-coloured inlay in an iron socket
  for (const [gx, gy] of [
    [r + 5, r + 5],
    [size - r - 7, r + 5],
    [r + 5, size - r - 7],
    [size - r - 7, size - r - 7],
  ]) {
    s.set(gx, gy, P.iron0);
    s.set(gx + 1, gy, P.iron0);
    s.set(gx, gy + 1, P.iron0);
    s.set(gx + 1, gy + 1, P.iron0);
    s.set(gx + 1, gy + 1, t.hi);
    s.set(gx, gy, t.dk);
    s.set(gx + 1, gy, t.mid);
    s.set(gx, gy + 1, t.deep);
  }

  return s;
}

/**
 * Banner button plate. 56x28 source, 9px border.
 * Struck metal with a notched (stepped) silhouette at each end, a bright
 * forge band, and iron studs. Horizontal stretch only.
 */
export function frameButton({ tier = "common", width = 56, height = 28 } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const s = new Surface(width, height);

  const top = 1;
  const bot = height - 2;

  // base metal with a vertical strike gradient
  for (let y = top; y <= bot; y++) {
    const f = (y - top) / (bot - top);
    let color;
    if (f < 0.14) color = t.hi;
    else if (f < 0.3) color = t.hi;
    else if (f < 0.5) color = t.mid;
    else if (f < 0.72) color = t.mid;
    else if (f < 0.86) color = t.dk;
    else color = t.deep;
    s.hline(2, y, width - 4, color);
  }

  // stepped ends: notch 2px in at top and bottom of each end
  s.set(0, top, null);
  s.set(1, top, null);
  s.set(0, bot, null);
  s.set(1, bot, null);
  s.set(width - 1, top, null);
  s.set(width - 2, top, null);
  s.set(width - 1, bot, null);
  s.set(width - 2, bot, null);

  // iron outline
  s.hline(2, top - 1, width - 4, P.iron0);
  s.hline(2, bot + 1, width - 4, P.iron0);
  s.vline(0, top + 1, height - 4, P.iron0);
  s.vline(width - 1, top + 1, height - 4, P.iron0);
  s.set(1, top, P.iron0);
  s.set(2, top, P.iron0);
  s.set(1, bot, P.iron0);
  s.set(2, bot, P.iron0);
  s.set(width - 2, top, P.iron0);
  s.set(width - 3, top, P.iron0);
  s.set(width - 2, bot, P.iron0);
  s.set(width - 3, bot, P.iron0);
  s.set(0, top + 1, P.iron0);
  s.set(0, bot - 1, P.iron0);
  s.set(width - 1, top + 1, P.iron0);
  s.set(width - 1, bot - 1, P.iron0);

  // forge bands: dark rules top and bottom of the face
  s.hline(4, top + 1, width - 8, t.deep);
  s.hline(4, bot - 1, width - 8, t.deep);
  s.hline(4, top + 2, width - 8, t.dk);
  s.hline(4, bot - 2, width - 8, t.dk);

  // end studs
  for (const rx of [3, width - 6]) {
    const cy = Math.floor(height / 2);
    s.set(rx, cy - 2, t.deep);
    s.set(rx + 1, cy - 2, t.hi);
    s.set(rx, cy - 1, t.deep);
    s.set(rx + 1, cy - 1, t.mid);
    s.set(rx, cy, t.deep);
    s.set(rx + 1, cy, t.dk);
    s.set(rx, cy + 1, t.deep);
    s.set(rx + 1, cy + 1, t.deep);
  }

  return s;
}

/**
 * Recessed trough. 20x20 source, 7px border. The channel HP and cooldowns
 * sit in. Interior is near-black so any fill reads.
 */
export function frameTrough({ size = 20, inset = 7 } = {}) {
  const s = new Surface(size, size);
  s.rect(0, 0, size, size, P.iron1);

  // outer iron rim
  s.hline(1, 0, size - 2, P.iron3);
  s.vline(0, 1, size - 2, P.iron3);
  s.hline(1, size - 1, size - 2, P.iron0);
  s.vline(size - 1, 1, size - 2, P.iron0);
  s.set(0, 0, null);
  s.set(size - 1, 0, null);
  s.set(0, size - 1, null);
  s.set(size - 1, size - 1, null);
  s.set(0, 1, P.iron3);
  s.set(1, 0, P.iron3);
  s.set(size - 2, 0, P.iron2);
  s.set(size - 1, 1, P.iron2);
  s.set(0, size - 2, P.iron2);
  s.set(1, size - 1, P.iron0);
  s.set(size - 2, size - 1, P.iron0);
  s.set(size - 1, size - 2, P.iron0);

  // recess: shadow at top/left (light from above), faint lit lip at bottom
  s.hline(1, 1, size - 2, P.iron0);
  s.vline(1, 1, size - 2, P.iron0);
  s.hline(2, 2, size - 4, "#060403");
  s.vline(2, 2, size - 4, "#060403");
  s.rect(inset, inset, size - inset * 2, size - inset * 2, "#070503");
  s.hline(inset, size - inset - 1, size - inset * 2, P.iron2);

  return s;
}

/**
 * Roster bar. 24x18 source, 8px left border, vertical stretch only.
 *
 * Both variants carry an OPAQUE stone body: an alpha fade looked elegant in
 * isolation but vanished entirely against the dark title background, leaving
 * the rows floating. Idle is a dim plank; selected is a lit plank with a 4px
 * tier-gold edge. The taper is done with tone, not transparency.
 */
export function frameRoster({ tier = "common", selected = false } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const w = 24;
  const h = 18;
  const s = new Surface(w, h);

  // body: dark stone, stepped down in tone toward the right so the plank
  // dissolves into the frame edge instead of stopping with a hard line
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rock;
      if (x < 5) rock = selected ? P.stoneLo : P.stoneDeep;
      else if (x < 11) rock = selected ? "#2b2620" : "#1e1a15";
      else if (x < 17) rock = selected ? "#201c17" : "#171410";
      else rock = selected ? "#181510" : "#120f0c";
      s.set(x, y, rock);
    }
  }

  if (!selected) {
    // iron edge
    s.vline(0, 0, h, P.iron0);
    s.vline(1, 0, h, P.stoneLo);
    s.vline(2, 0, h, "#241f19");
    // top and bottom hairlines give the plank a body
    s.hline(3, 0, w - 3, "#0f0d0a");
    s.hline(3, h - 1, w - 3, "#0a0806");
    return s;
  }

  // selected: 4px tier edge, then a hot inner band
  s.vline(0, 0, h, P.iron0);
  s.vline(1, 0, h, t.hi);
  s.vline(2, 0, h, t.mid);
  s.vline(3, 0, h, t.dk);
  s.vline(4, 0, h, t.deep);
  s.vline(5, 0, h, "#241f19");

  // lit inner band just inside the edge
  s.hline(6, 0, w - 6, "#0f0d0a");
  s.hline(6, h - 1, w - 6, "#0a0806");
  s.vline(6, 1, h - 2, "#2b2620");

  return s;
}

/**
 * Ornamental divider. 128x12 source.
 * Slicing: border-image-slice 48 32 48 32 → 48px end caps carrying the
 * diamonds, a 32px stretchable middle of plain rule. The centre boss is a
 * SEPARATE 12x12 asset placed in the middle so it never stretches.
 */
export function frameDivider({ tier = "common", width = 128, height = 12 } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const s = new Surface(width, height);
  const midY = Math.floor(height / 2);

  // plain rule across the whole width (this is what stretches)
  for (let x = 0; x < width; x++) {
    s.set(x, midY, P.boneDeep);
    s.set(x, midY + 1, [...parseColor(P.iron0).slice(0, 3), 170]);
    s.set(x, midY - 1, [...parseColor(P.stoneLit).slice(0, 3), 120]);
  }

  // end caps: diamond finial, tier-coloured
  for (const [cx, dir] of [
    [7, 1],
    [width - 8, -1],
  ]) {
    s.set(cx, midY - 4, P.iron0);
    s.set(cx, midY + 4, P.iron0);
    s.set(cx + dir, midY - 3, P.iron0);
    s.set(cx - dir, midY - 3, P.iron0);
    s.set(cx + dir, midY + 3, P.iron0);
    s.set(cx - dir, midY + 3, P.iron0);

    s.set(cx, midY - 3, t.dk);
    s.set(cx, midY + 3, t.deep);
    s.set(cx + dir, midY - 2, t.mid);
    s.set(cx - dir, midY - 2, t.dk);
    s.set(cx + dir, midY + 2, t.deep);
    s.set(cx - dir, midY + 2, t.deep);

    s.set(cx, midY - 2, t.mid);
    s.set(cx, midY - 1, t.hi);
    s.set(cx, midY, t.hi);
    s.set(cx, midY + 1, t.mid);
    s.set(cx, midY + 2, t.dk);
    s.set(cx + dir, midY - 1, t.hi);
    s.set(cx + dir, midY, t.mid);
    s.set(cx + dir, midY + 1, t.dk);
    s.set(cx - dir, midY - 1, t.hi);
    s.set(cx - dir, midY, t.mid);
    s.set(cx - dir, midY + 1, t.dk);
  }

  // tiny iron studs flanking each cap, so the rule has anchors
  for (const sx of [22, width - 23]) {
    s.set(sx, midY - 1, P.iron1);
    s.set(sx, midY, P.iron3);
    s.set(sx, midY + 1, P.iron0);
  }

  return s;
}

/** Centre boss for dividers: 12x12, iron lozenge with a tier gem. */
export function dividerBoss({ tier = "common" } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const size = 12;
  const s = new Surface(size, size);
  const c = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - c) + Math.abs(y - c);
      if (d > 5.5) continue;
      if (d > 4.5) s.set(x, y, P.iron0);
      else if (d > 3.5) s.set(x, y, P.iron2);
      else if (d > 2.5) s.set(x, y, t.deep);
      else if (d > 1.5) s.set(x, y, t.dk);
      else if (d > 0.5) s.set(x, y, t.mid);
      else s.set(x, y, t.hi);
    }
  }
  // lit top shoulder
  s.set(5, 3, t.hi);
  s.set(6, 3, t.mid);
  s.set(4, 4, t.mid);
  return s;
}

/** Keycap: chunky iron key, lit top face, 22x22, 6px border. */
export function frameKeycap({ size = 22, hot = false, tier = "common" } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const s = new Surface(size, size);

  const face = hot ? t.mid : P.iron2;
  const faceHi = hot ? t.hi : P.iron3;
  const faceMid = hot ? t.mid : P.iron2;
  const faceLo = hot ? t.dk : P.iron1;
  const faceDeep = hot ? t.deep : P.iron0;

  s.rect(1, 1, size - 2, size - 2, faceMid);

  // chiselled corners
  s.set(0, 0, null);
  s.set(1, 0, null);
  s.set(0, 1, null);
  s.set(size - 1, 0, null);
  s.set(size - 2, 0, null);
  s.set(size - 1, 1, null);
  s.set(0, size - 1, null);
  s.set(1, size - 1, null);
  s.set(0, size - 2, null);
  s.set(size - 1, size - 1, null);
  s.set(size - 2, size - 1, null);
  s.set(size - 1, size - 2, null);

  // iron outline
  s.hline(2, 0, size - 4, P.iron0);
  s.hline(2, size - 1, size - 4, P.iron0);
  s.vline(0, 2, size - 4, P.iron0);
  s.vline(size - 1, 2, size - 4, P.iron0);
  s.set(1, 1, P.iron0);
  s.set(size - 2, 1, P.iron0);
  s.set(1, size - 2, P.iron0);
  s.set(size - 2, size - 2, P.iron0);

  // lit top face, 3px — the key-cap read
  s.hline(2, 1, size - 4, faceHi);
  s.hline(2, 2, size - 4, faceHi);
  s.hline(2, 3, size - 4, face);
  s.vline(1, 2, size - 4, faceHi);
  s.vline(2, 2, size - 4, face);

  // shaded lower face, 4px
  s.hline(2, size - 2, size - 4, faceLo);
  s.hline(2, size - 3, size - 4, faceLo);
  s.hline(3, size - 4, size - 6, faceDeep);
  s.vline(size - 2, 2, size - 4, faceLo);
  s.vline(size - 3, 2, size - 4, faceDeep);

  return s;
}

/**
 * Icon socket: a recessed square well with a stepped inner rim. 28x28 source,
 * 10px border — safe to 9-slice at any size, and it reads as carved stone
 * rather than as a pasted-on circle.
 */
export function frameWell({ size = 28, tier = "common" } = {}) {
  const t = TIERS[tier] || TIERS.common;
  const s = new Surface(size, size);

  // outer stone plate
  ditherStone(s, 0, 0, size, size, P.stoneLo, P.stoneDk, 0.45, 41);
  flattenCenter(s, 10, "#0a0806");

  // chiselled corners
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [size - 1, 0, -1, 1],
    [0, size - 1, 1, -1],
    [size - 1, size - 1, -1, -1],
  ]) {
    s.set(cx, cy, null);
    s.set(cx + sx, cy, null);
    s.set(cx, cy + sy, null);
    s.set(cx + sx, cy + sy, null);
  }

  // iron outline
  s.hline(2, 0, size - 4, P.iron0);
  s.hline(2, size - 1, size - 4, P.iron0);
  s.vline(0, 2, size - 4, P.iron0);
  s.vline(size - 1, 2, size - 4, P.iron0);
  s.set(1, 1, P.iron0);
  s.set(size - 2, 1, P.iron0);
  s.set(1, size - 2, P.iron0);
  s.set(size - 2, size - 2, P.iron0);

  // lit bevel
  s.hline(2, 1, size - 4, P.stoneHi);
  s.vline(1, 2, size - 4, P.stoneHi);

  // shaded bevel
  s.hline(2, size - 2, size - 4, P.stoneDeep);
  s.vline(size - 2, 2, size - 4, P.stoneDeep);

  // recessed well: dark, with a stepped rim so it reads as cut into the plate
  const r = 6;
  const inner = size - r * 2;
  s.rect(r, r, inner, inner, "#0a0806");

  // rim: shadow on the top/left (recess), lit lip on the bottom/right
  s.hline(r - 1, r - 1, inner + 2, P.iron0);
  s.vline(r - 1, r - 1, inner + 2, P.iron0);
  s.hline(r, r - 1, inner, P.iron1);
  s.vline(r - 1, r, inner, P.iron1);
  s.hline(r - 1, r + inner, inner + 2, P.iron3);
  s.vline(r + inner, r - 1, inner + 2, P.iron3);

  // tier accent: a single tier-coloured pixel-rule at the bottom of the well
  s.hline(r + 2, r + inner - 1, inner - 4, t.deep);
  s.hline(r + 3, r + inner - 1, inner - 6, t.dk);

  return s;
}

/** Trough with a gold inner lip — the "active" channel (ability ready). */
export function frameTroughGold({ size = 20, inset = 7 } = {}) {
  const s = frameTrough({ size, inset });
  const lip = size - inset;
  s.hline(inset, lip - 1, size - inset * 2, P.goldDk);
  s.vline(inset, inset, size - inset * 2, P.goldDeep);
  s.vline(lip - 1, inset, size - inset * 2, P.goldDeep);
  s.set(inset, lip - 1, P.gold);
  s.set(lip - 1, lip - 1, P.gold);
  return s;
}
