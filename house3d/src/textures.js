import * as THREE from 'three';

/**
 * Hand-painted, cel-shaded texture set for the cottage.
 *
 * Drawn entirely with the 2D canvas API at start-up: no images, no network, no
 * dependencies. The style follows the front-elevation reference — flat fills,
 * painted dark edges, bevel highlights and a little per-tile / per-block
 * variation. Nothing is photographic or noisy.
 *
 * Each map is one repeating tile and one UV unit equals one tile, so `repeat`
 * stays (1, 1); the geometry owns the physical scale. Tile sizes in metres:
 *   roof 2.4 x 1.6 | stucco 2.5 | stone 2.4 | stoneLight 2.4 | wood 1.4
 *   grass 5.0 | path 2.4 | bark 1.2 | doorWood = one leaf | glass = one pane
 */

const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- helpers */

/** Deterministic hash in [0,1) — identical textures on every reload. */
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Small seeded PRNG for scattering elements. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

/**
 * Paint at (x, y) plus every wrapped copy that can reach the canvas, so an
 * element crosses the tile border exactly as it does in the middle. `pad` must
 * cover its radius. Resolve all randomness before calling this — copies must
 * agree at the seam.
 */
function wrapDraw(W, H, x, y, pad, paint) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const px = x + dx * W;
      const py = y + dy * H;
      if (px < -pad || px > W + pad || py < -pad || py > H + pad) continue;
      paint(px, py);
    }
  }
}

/** Soft radial blotch, used for mottling and moss. */
function softBlob(ctx, x, y, r, rgb, alpha) {
  const g = ctx.createRadialGradient(x, y, r * 0.08, x, y, r);
  g.addColorStop(0, rgba(rgb, alpha));
  g.addColorStop(0.55, rgba(rgb, alpha * 0.55));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Clay tile silhouette: square shoulders, rounded lower lip. */
function tilePath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.closePath();
}

/** Painted knot: two dark rings around a soft core. */
function woodKnot(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.62);
  ctx.fillStyle = 'rgba(120, 74, 36, 0.28)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 57, 27, 0.45)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(76, 43, 20, 0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------- roof */

function paintRoof() {
  const W = 768;
  const H = 512;
  const cols = 8; // 0.30 m tiles across 2.4 m
  const rows = 8; // 0.20 m tiles across 1.6 m
  const tw = W / cols;
  const th = H / rows;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#7a2a17'; // grout / shadow between tiles
  ctx.fillRect(0, 0, W, H);

  // Bottom-up, so each row's lip throws a shadow onto the row below it.
  for (let row = rows - 1; row >= -1; row--) {
    const rowY = row * th + th * 0.5;
    const stagger = (((row % 2) + 2) % 2) * tw * 0.5;
    for (let col = -1; col <= cols; col++) {
      const kx = ((col % cols) + cols) % cols;
      const ky = ((row % rows) + rows) % rows;
      const r1 = hash2(kx + 7, ky + 3);
      const r2 = hash2(kx + 19, ky + 41);
      const accent = r1 > 0.9; // occasional brighter orange tile
      const dark = r1 < 0.08; // and the odd weathered one
      const hue = 10 + r2 * 5 + (accent ? 5 : 0);
      const sat = 85 + r1 * 8;
      const lig = 47 + r2 * 5 + (accent ? 3 : 0) - (dark ? 5 : 0);
      const x = col * tw + stagger + 0.8;
      const y = rowY + 0.8;
      const w = tw - 1.6;
      const h = th - 1.6;
      const sag = (hash2(kx + 61, ky + 73) - 0.5) * 1.6; // hand-made lip wobble

      // Shadow the lip casts onto the tile below.
      ctx.fillStyle = 'rgba(74, 20, 9, 0.6)';
      roundRectPath(ctx, x + 1, y + h - 4 + sag, w - 2, 9, 4);
      ctx.fill();

      // Body: light at the top, a touch darker towards the lip.
      const body = ctx.createLinearGradient(0, y, 0, y + h);
      body.addColorStop(0, hsl(hue, sat, lig + 5));
      body.addColorStop(0.55, hsl(hue, sat, lig));
      body.addColorStop(1, hsl(hue, sat, lig - 6));
      tilePath(ctx, x, y, w, h + sag, 12);
      ctx.fillStyle = body;
      ctx.fill();

      // Glazed top lip, crease, bright rim and inner lip shade.
      ctx.save();
      tilePath(ctx, x, y, w, h + sag, 12);
      ctx.clip();
      // Slight side shading gives each tile a convex, clay-like face.
      const side = ctx.createLinearGradient(x, 0, x + w, 0);
      side.addColorStop(0, 'rgba(86, 26, 11, 0.18)');
      side.addColorStop(0.18, 'rgba(86, 26, 11, 0)');
      side.addColorStop(0.8, 'rgba(86, 26, 11, 0)');
      side.addColorStop(1, 'rgba(86, 26, 11, 0.16)');
      ctx.fillStyle = side;
      ctx.fillRect(x, y, w, h + sag);
      ctx.fillStyle = 'rgba(72, 20, 9, 0.38)';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = hsl(hue, sat, lig + 9, 0.7);
      ctx.fillRect(x, y + 3, w, h * 0.13);
      ctx.fillStyle = 'rgba(96, 28, 12, 0.4)';
      ctx.fillRect(x, y + 3 + h * 0.13, w, 1.4);
      ctx.fillStyle = 'rgba(255, 196, 150, 0.4)';
      ctx.fillRect(x, y + 1, w, 1);
      ctx.fillStyle = 'rgba(84, 24, 10, 0.2)';
      ctx.fillRect(x, y + h - 4 + sag, w, 4);
      ctx.restore();

      // Painted outline.
      tilePath(ctx, x + 0.5, y + 0.5, w - 1, h + sag - 1, 11.5);
      ctx.strokeStyle = 'rgba(84, 26, 12, 0.62)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
  return canvas;
}

/* ----------------------------------------------------------------- stucco */

function paintStucco() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x57ac01);
  ctx.fillStyle = '#f3e6cb';
  ctx.fillRect(0, 0, S, S);

  // Broad, very low-contrast mottling keeps the tile edge invisible.
  const mottle = [[232, 212, 178], [248, 240, 223], [238, 221, 194], [226, 206, 176]];
  for (let i = 0; i < 28; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 50 + rnd() * 105;
    const rgb = mottle[i % mottle.length];
    const alpha = 0.065 + rnd() * 0.045;
    wrapDraw(S, S, x, y, r, (px, py) => softBlob(ctx, px, py, r, rgb, alpha));
  }

  // Faint trowel sweeps: short soft arcs.
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 34 + rnd() * 70;
    const bow = (rnd() - 0.5) * 16;
    const angle = (rnd() - 0.5) * 0.9;
    const width = 5 + rnd() * 9;
    const rgb = rnd() > 0.5 ? [252, 245, 232] : [220, 200, 167];
    const alpha = 0.03 + rnd() * 0.03;
    wrapDraw(S, S, x, y, len + width, (px, py) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.strokeStyle = rgba(rgb, alpha);
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(0, bow, len / 2, 0);
      ctx.stroke();
      ctx.restore();
    });
  }

  // A few soft age stains, weighted towards the bottom of the tile.
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S;
    const y = S * (0.45 + rnd() * 0.5);
    const r = 60 + rnd() * 85;
    wrapDraw(S, S, x, y, r, (px, py) => softBlob(ctx, px, py, r, [200, 168, 126], 0.05));
  }
  return canvas;
}

/* ------------------------------------------------------------------ stone */

/** Shared ashlar painter for wall stone and its lighter trim variant. */
function paintAshlar({ size, cols, rows, mortar, tints, bevelHi, bevelLo }) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, size, size);
  const bw = size / cols;
  const bh = size / rows;

  for (let row = -1; row <= rows; row++) {
    const offset = (((row % 2) + 2) % 2) * bw * 0.5;
    for (let col = -1; col <= cols; col++) {
      const kx = ((col % cols) + cols) % cols;
      const ky = ((row % rows) + rows) % rows;
      const [hue, sat, lig] = tints[Math.floor(hash2(kx + 3, ky + 11) * tints.length)];
      const inset = 1 + hash2(kx + 9, ky + 5) * 0.6; // thin painted mortar
      const x = col * bw + offset + inset;
      const y = row * bh + inset;
      const w = bw - inset * 2;
      const h = bh - inset * 2;

      // Softly graded block body — no hard outline, just a warm stone face.
      const body = ctx.createLinearGradient(x, y, x + w * 0.2, y + h);
      body.addColorStop(0, hsl(hue, sat, lig + 2));
      body.addColorStop(1, hsl(hue, sat, lig - 1.5));
      roundRectPath(ctx, x, y, w, h, 2.5);
      ctx.fillStyle = body;
      ctx.fill();

      // Low-alpha top-left bevel and bottom-right shade.
      ctx.lineCap = 'round';
      ctx.strokeStyle = bevelHi;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 1.8, y + h - 3);
      ctx.lineTo(x + 1.8, y + 1.8);
      ctx.lineTo(x + w - 3, y + 1.8);
      ctx.stroke();
      ctx.strokeStyle = bevelLo;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + w - 1.8, y + 3);
      ctx.lineTo(x + w - 1.8, y + h - 1.8);
      ctx.lineTo(x + 3, y + h - 1.8);
      ctx.stroke();
    }
  }
  return canvas;
}

function paintStone() {
  return paintAshlar({
    size: 512,
    cols: 5, // 0.48 m blocks
    rows: 8, // 0.30 m courses
    mortar: '#bdb5a5',
    tints: [[42, 16, 79], [40, 14, 81], [45, 18, 77], [38, 12, 80], [44, 15, 82], [36, 11, 76]],
    bevelHi: 'rgba(255, 252, 244, 0.45)',
    bevelLo: 'rgba(140, 130, 112, 0.24)',
  });
}

function paintStoneLight() {
  return paintAshlar({
    size: 512,
    cols: 5,
    rows: 8,
    mortar: '#d2cbba',
    tints: [[44, 11, 83], [42, 9, 86], [46, 13, 81], [40, 8, 85], [44, 10, 88], [38, 7, 80]],
    bevelHi: 'rgba(255, 255, 250, 0.5)',
    bevelLo: 'rgba(150, 140, 122, 0.18)',
  });
}

/* ------------------------------------------------------------------- wood */

function paintWood() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x8f31);
  ctx.fillStyle = '#9d6636';
  ctx.fillRect(0, 0, S, S);

  // Broad tonal bands keep the fine grain from reading as stripes.
  for (let i = 0; i < 8; i++) {
    const y = rnd() * S;
    const r = 40 + rnd() * 80;
    const rgb = rnd() > 0.5 ? [180, 128, 74] : [120, 76, 38];
    wrapDraw(S, S, 0, y, r, (px, py) => {
      const g = ctx.createLinearGradient(0, py - r, 0, py + r);
      g.addColorStop(0, rgba(rgb, 0));
      g.addColorStop(0.5, rgba(rgb, 0.06));
      g.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, py - r, S, r * 2);
    });
  }

  // Grain runs along U. The sine is periodic across the tile, so each streak
  // wraps horizontally; vertical copies complete streaks cut by the seam.
  for (let i = 0; i < 110; i++) {
    const strong = i % 5 === 0;
    const y0 = rnd() * S;
    const amp = 0.8 + rnd() * 4;
    const cycles = 1 + Math.floor(rnd() * 3);
    const phase = rnd() * TAU;
    const rgb = rnd() > 0.5 ? [190, 142, 86] : [92, 55, 26];
    const alpha = strong ? 0.12 + rnd() * 0.1 : 0.04 + rnd() * 0.07;
    const width = strong ? 1.6 + rnd() * 1.4 : 0.7 + rnd() * 1.3;
    for (let dy = -1; dy <= 1; dy++) {
      const baseY = y0 + dy * S;
      if (baseY < -amp - 8 || baseY > S + amp + 8) continue;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = baseY + amp * Math.sin((x / S) * TAU * cycles + phase);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = rgba(rgb, alpha);
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // A couple of knots.
  for (let i = 0; i < 2; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 8 + rnd() * 5;
    wrapDraw(S, S, x, y, r * 2, (px, py) => woodKnot(ctx, px, py, r));
  }
  return canvas;
}

/* --------------------------------------------------------------- doorWood */

function paintDoorWood() {
  const W = 512;
  const H = 1024;
  const planks = 6;
  const pw = W / planks;
  const { canvas, ctx } = makeCanvas(W, H);
  const rnd = makeRng(0x2d19);
  ctx.fillStyle = '#4a2610';
  ctx.fillRect(0, 0, W, H);

  for (let p = 0; p < planks; p++) {
    const key = hash2(p + 5, 3);
    const hue = 23 + key * 5;
    const sat = 44 + key * 8;
    const lig = 42 + key * 6;
    const x = p * pw;

    // Plank body with a left-lit bevel.
    const body = ctx.createLinearGradient(x, 0, x + pw, 0);
    body.addColorStop(0, hsl(hue, sat, lig + 8));
    body.addColorStop(0.2, hsl(hue, sat, lig + 2));
    body.addColorStop(0.82, hsl(hue, sat, lig));
    body.addColorStop(1, hsl(hue, sat, lig - 7));
    ctx.fillStyle = body;
    ctx.fillRect(x + 2.5, 0, pw - 5, H);

    // Vertical grain: a few strong lines plus fine streaks.
    for (let i = 0; i < 12; i++) {
      const strong = i % 3 === 0;
      const gx = x + 6 + rnd() * (pw - 12);
      const amp = 0.6 + rnd() * 2;
      const cycles = 1 + Math.floor(rnd() * 2);
      const phase = rnd() * TAU;
      const rgb = rnd() > 0.5 ? [204, 154, 98] : [112, 66, 30];
      ctx.beginPath();
      for (let y = -20; y <= H + 20; y += 24) {
        const xx = gx + amp * Math.sin((y / H) * TAU * cycles + phase);
        if (y === -20) ctx.moveTo(xx, y);
        else ctx.lineTo(xx, y);
      }
      ctx.strokeStyle = rgba(rgb, strong ? 0.14 + rnd() * 0.08 : 0.04 + rnd() * 0.06);
      ctx.lineWidth = strong ? 1.6 + rnd() * 1.4 : 0.7 + rnd() * 1.2;
      ctx.stroke();
    }

    // Dark seam, a highlight on its left shoulder and a soft right shadow.
    ctx.fillStyle = 'rgba(58, 29, 12, 0.92)';
    ctx.fillRect(x + pw - 3, 0, 3, H);
    ctx.fillStyle = 'rgba(255, 210, 156, 0.26)';
    ctx.fillRect(x + pw - 5, 0, 1.8, H);
    ctx.fillStyle = 'rgba(255, 214, 164, 0.16)';
    ctx.fillRect(x + 2.5, 0, 1.4, H);
    ctx.fillStyle = 'rgba(60, 30, 12, 0.14)';
    ctx.fillRect(x + 2.5, 0, 3, H);
  }

  for (let i = 0; i < 2; i++) {
    woodKnot(ctx, 70 + rnd() * (W - 140), 140 + rnd() * (H - 280), 6 + rnd() * 5);
  }

  // Gentle top light / bottom shade so the leaf reads as a solid panel.
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255, 220, 170, 0.08)');
  shade.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(50, 25, 10, 0.16)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

/* ------------------------------------------------------------------ glass */

function paintGlass() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);

  // Deep blue pane, darker towards the bottom.
  const base = ctx.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, '#4487d8');
  base.addColorStop(0.28, '#2f6fc4');
  base.addColorStop(0.75, '#1c4a8f');
  base.addColorStop(1, '#173a72');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // Pale sky band across the top third.
  const top = ctx.createLinearGradient(0, 0, 0, S * 0.42);
  top.addColorStop(0, 'rgba(176, 216, 255, 0.22)');
  top.addColorStop(0.55, 'rgba(176, 216, 255, 0.07)');
  top.addColorStop(1, 'rgba(176, 216, 255, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, S, S * 0.42);

  // Strong, soft diagonal sky reflection.
  const glint = ctx.createLinearGradient(0, S * 0.95, S * 0.9, 0);
  glint.addColorStop(0, 'rgba(205, 235, 255, 0)');
  glint.addColorStop(0.34, 'rgba(205, 235, 255, 0.04)');
  glint.addColorStop(0.48, 'rgba(232, 247, 255, 0.26)');
  glint.addColorStop(0.56, 'rgba(205, 235, 255, 0.08)');
  glint.addColorStop(0.7, 'rgba(205, 235, 255, 0.03)');
  glint.addColorStop(1, 'rgba(205, 235, 255, 0)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, S, S);

  // Thinner secondary streak.
  const streak = ctx.createLinearGradient(0, S * 0.55, S * 0.55, 0);
  streak.addColorStop(0.44, 'rgba(220, 242, 255, 0)');
  streak.addColorStop(0.5, 'rgba(220, 242, 255, 0.12)');
  streak.addColorStop(0.56, 'rgba(220, 242, 255, 0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, 0, S, S);

  // Darker bottom corners so the pane sits into its stone reveal.
  for (const cx of [0, S]) {
    const corner = ctx.createRadialGradient(cx, S, 0, cx, S, S * 0.7);
    corner.addColorStop(0, 'rgba(8, 18, 42, 0.32)');
    corner.addColorStop(1, 'rgba(8, 18, 42, 0)');
    ctx.fillStyle = corner;
    ctx.fillRect(0, 0, S, S);
  }
  return canvas;
}

/* ------------------------------------------------------------------ grass */

function grassBlade(ctx, x, y, len, lean, width, fill, edge) {
  ctx.beginPath();
  ctx.moveTo(x - width * 0.5, y);
  ctx.quadraticCurveTo(x + lean * 0.25 - width * 0.2, y - len * 0.58, x + lean, y - len);
  ctx.quadraticCurveTo(x + lean * 0.3 + width * 0.3, y - len * 0.5, x + width * 0.5, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
}

function paintGrass() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x3ab7);
  ctx.fillStyle = '#7cb35a';
  ctx.fillRect(0, 0, S, S);

  // Soft clumps of lighter / darker grass.
  const clumps = [[152, 202, 108], [100, 156, 72], [170, 212, 124], [90, 144, 66]];
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 40 + rnd() * 120;
    const rgb = clumps[i % clumps.length];
    const alpha = 0.18 + rnd() * 0.12;
    wrapDraw(S, S, x, y, r, (px, py) => softBlob(ctx, px, py, r, rgb, alpha));
  }

  // Stylised tufts: a few blades fanning from each root, larger than life so
  // the ground still reads at 5 m per tile.
  for (let i = 0; i < 170; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const blades = [];
    for (let k = 0, n = 3 + Math.floor(rnd() * 3); k < n; k++) {
      const len = 9 + rnd() * 15;
      blades.push([(rnd() - 0.5) * 12, len, (rnd() - 0.5) * len * 1.3, 2 + rnd() * 1.8, rnd()]);
    }
    wrapDraw(S, S, x, y, 42, (px, py) => {
      for (const [ox, len, lean, width, pick] of blades) {
        const rgb = pick < 0.45 ? [70, 112, 48] : pick < 0.8 ? [122, 176, 84] : [164, 206, 118];
        const edge = pick < 0.55 ? 'rgba(56, 92, 38, 0.32)' : null;
        grassBlade(ctx, px + ox, py, len, lean, width, rgba(rgb, 0.95), edge);
      }
    });
  }

  // Tiny clover patches.
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const spots = [];
    for (let k = 0, n = 3 + Math.floor(rnd() * 3); k < n; k++) {
      spots.push([x + (rnd() - 0.5) * 18, y + (rnd() - 0.5) * 18, 1.8 + rnd() * 2.6]);
    }
    wrapDraw(S, S, x, y, 26, (px, py) => {
      const ox = px - x;
      const oy = py - y;
      for (const [sx, sy, sr] of spots) {
        ctx.beginPath();
        ctx.arc(sx + ox, sy + oy, sr, 0, TAU);
        ctx.fillStyle = 'rgba(186, 220, 128, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(86, 128, 60, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    });
  }
  return canvas;
}

/* ------------------------------------------------------------------- path */

/** Rounded, irregular cobble outline; radii and rotation are pre-computed. */
function cobbleShape(ctx, cx, cy, radii, rot, ox, oy) {
  const n = radii.length;
  const pt = (i) => {
    const a = rot + (i / n) * TAU;
    return [cx + ox + Math.cos(a) * radii[i], cy + oy + Math.sin(a) * radii[i] * 0.86];
  };
  const mid = (p, q) => [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5];
  const m0 = mid(pt(n - 1), pt(0));
  ctx.beginPath();
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pt(i);
    const m = mid(p, pt((i + 1) % n));
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

function paintPath() {
  const S = 512;
  const cells = 6; // 0.40 m cobbles across 2.4 m
  const cell = S / cells;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x6c2f);
  ctx.fillStyle = '#5d5546'; // damp earth in the joints
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 40 + rnd() * 70;
    wrapDraw(S, S, x, y, r, (px, py) => softBlob(ctx, px, py, r, [104, 126, 74], 0.13));
  }

  const tints = [[38, 14, 70], [42, 12, 76], [34, 10, 66], [44, 16, 80], [36, 12, 72], [40, 10, 62], [32, 9, 74]];
  for (let row = -1; row <= cells; row++) {
    for (let col = -1; col <= cells; col++) {
      const kx = ((col % cells) + cells) % cells;
      const ky = ((row % cells) + cells) % cells;
      const h1 = hash2(kx + 13, ky + 29);
      const h2 = hash2(kx + 31, ky + 7);
      const h3 = hash2(kx + 47, ky + 53);
      const cx = (col + 0.5) * cell + (h1 - 0.5) * cell * 0.12;
      const cy = (row + 0.5) * cell + (h2 - 0.5) * cell * 0.12;
      const baseR = cell * (0.46 + h3 * 0.05);
      const rot = h1 * TAU;
      const radii = [];
      for (let k = 0; k < 10; k++) {
        radii.push(baseR * (0.78 + hash2(kx * 17 + k, ky * 13 + k) * 0.36));
      }
      const [hue, sat, lig] = tints[Math.floor(h3 * tints.length) % tints.length];

      wrapDraw(S, S, cx, cy, baseR * 1.5, (px, py) => {
        const g = ctx.createLinearGradient(px, py - baseR, px, py + baseR);
        g.addColorStop(0, hsl(hue, sat, lig + 6));
        g.addColorStop(0.55, hsl(hue, sat, lig));
        g.addColorStop(1, hsl(hue, sat, lig - 6));

        // Soft drop shadow in the joint.
        cobbleShape(ctx, px, py, radii, rot, 1.6, 2.4);
        ctx.fillStyle = 'rgba(38, 32, 24, 0.35)';
        ctx.fill();

        cobbleShape(ctx, px, py, radii, rot, 0, 0);
        ctx.fillStyle = g;
        ctx.fill();

        // Bevel: light inside the top-left rim, shade inside the bottom-right.
        ctx.save();
        cobbleShape(ctx, px, py, radii, rot, 0, 0);
        ctx.clip();
        cobbleShape(ctx, px, py, radii, rot, -1.8, -2.2);
        ctx.strokeStyle = 'rgba(255, 250, 236, 0.3)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        cobbleShape(ctx, px, py, radii, rot, 1.8, 2.4);
        ctx.strokeStyle = 'rgba(70, 62, 48, 0.36)';
        ctx.stroke();
        ctx.restore();

        cobbleShape(ctx, px, py, radii, rot, 0, 0);
        ctx.strokeStyle = 'rgba(72, 64, 50, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    }
  }

  // Moss creeping into the cracks.
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 2 + rnd() * 7;
    wrapDraw(S, S, x, y, r + 2, (px, py) => softBlob(ctx, px, py, r, [118, 146, 78], 0.22));
  }
  return canvas;
}

/* ------------------------------------------------------------------- bark */

/** Wavy vertical plate outline: periodic in Y, so it wraps without a seam. */
function platePath(ctx, x0, w, amp, cycles, phase, S) {
  ctx.beginPath();
  for (let y = -24; y <= S + 24; y += 8) {
    const x = x0 + amp * Math.sin((y / S) * TAU * cycles + phase);
    if (y === -24) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let y = S + 24; y >= -24; y -= 8) {
    const x = x0 + w + amp * Math.sin((y / S) * TAU * cycles + phase + 1.1);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function paintBark() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x9d41);
  ctx.fillStyle = '#4a301c'; // deep grooves between the plates
  ctx.fillRect(0, 0, S, S);

  // Chunky vertical bark plates.
  for (let i = 0; i < 16; i++) {
    const x0 = rnd() * S;
    const w = 20 + rnd() * 34;
    const amp = 2 + rnd() * 4.5;
    const cycles = 1 + Math.floor(rnd() * 2);
    const phase = rnd() * TAU;
    const tone = 0.78 + rnd() * 0.4;
    for (let dx = -1; dx <= 1; dx++) {
      const ox = x0 + dx * S;
      if (ox < -w - 24 || ox > S + 24) continue;
      platePath(ctx, ox, w, amp, cycles, phase, S);
      const g = ctx.createLinearGradient(ox, 0, ox + w, 0);
      g.addColorStop(0, '#5a3d26');
      g.addColorStop(0.32, hsl(28, 26, 37 * tone));
      g.addColorStop(0.62, hsl(28, 28, 44 * tone));
      g.addColorStop(1, '#553a23');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(42, 27, 14, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Painted highlight down the crown of the plate.
      ctx.beginPath();
      for (let y = -24; y <= S + 24; y += 8) {
        const x = ox + w * 0.5 + amp * Math.sin((y / S) * TAU * cycles + phase + 0.55);
        if (y === -24) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(166, 124, 80, 0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // A few short horizontal cracks.
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 6 + rnd() * 16;
    const angle = (rnd() - 0.5) * 0.8;
    wrapDraw(S, S, x, y, len + 4, (px, py) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(48, 30, 16, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.restore();
    });
  }

  // Knots.
  for (let i = 0; i < 2; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    wrapDraw(S, S, x, y, 26, (px, py) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, 0.7);
      ctx.strokeStyle = 'rgba(44, 27, 14, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(36, 22, 11, 0.65)';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    });
  }
  return canvas;
}

/* ----------------------------------------------------------------- export */

/**
 * Build the full texture set once, at start-up.
 * @param {THREE.WebGLRenderer} renderer source of anisotropy / mip settings
 */
export function createTextures(renderer) {
  const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

  const toTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1); // UV scale lives in the geometry
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  };

  return {
    roof: toTexture(paintRoof()), // 2.4 x 1.6 m
    stucco: toTexture(paintStucco()), // 2.5 m
    stone: toTexture(paintStone()), // 2.4 m
    stoneLight: toTexture(paintStoneLight()), // 2.4 m
    wood: toTexture(paintWood()), // 1.4 m
    doorWood: toTexture(paintDoorWood()), // one door leaf
    glass: toTexture(paintGlass()), // one pane
    grass: toTexture(paintGrass()), // 5.0 m
    path: toTexture(paintPath()), // 2.4 m
    bark: toTexture(paintBark()), // 1.2 m
  };
}
