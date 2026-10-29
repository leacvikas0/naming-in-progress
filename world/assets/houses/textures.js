import * as THREE from 'three';

/**
 * Hand-painted, cel-shaded procedural 2D canvas textures for the Tudor Village Houses Kit.
 * Adapted and expanded from `house3d/src/textures.js`.
 *
 * Each map is a seamless repeating tile (1 UV unit = 1 physical tile in metres):
 *   roof 2.4 x 1.6 | stucco 2.5 | stone 2.4 | stoneLight 2.4 | wood 1.4
 *   doorWood = one leaf | glass = one pane
 */

const TAU = Math.PI * 2;

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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
  if (typeof document === 'undefined') {
    const dummyGrad = { addColorStop() {} };
    const ctx = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => dummyGrad;
          }
          return () => {};
        },
        set() {
          return true;
        },
      },
    );
    return { canvas: { width: w, height: h, isHeadlessMock: true }, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

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

function paintRoof() {
  const W = 768;
  const H = 512;
  const cols = 8;
  const rows = 8;
  const tw = W / cols;
  const th = H / rows;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#7a2a17';
  ctx.fillRect(0, 0, W, H);

  for (let row = rows - 1; row >= -1; row--) {
    const rowY = row * th + th * 0.5;
    const stagger = (((row % 2) + 2) % 2) * tw * 0.5;
    for (let col = -1; col <= cols; col++) {
      const kx = ((col % cols) + cols) % cols;
      const ky = ((row % rows) + rows) % rows;
      const r1 = hash2(kx + 7, ky + 3);
      const r2 = hash2(kx + 19, ky + 41);
      const accent = r1 > 0.9;
      const dark = r1 < 0.08;
      const hue = 10 + r2 * 5 + (accent ? 5 : 0);
      const sat = 85 + r1 * 8;
      const lig = 47 + r2 * 5 + (accent ? 3 : 0) - (dark ? 5 : 0);
      const x = col * tw + stagger + 0.8;
      const y = rowY + 0.8;
      const w = tw - 1.6;
      const h = th - 1.6;
      const sag = (hash2(kx + 61, ky + 73) - 0.5) * 1.6;

      ctx.fillStyle = 'rgba(74, 20, 9, 0.6)';
      roundRectPath(ctx, x + 1, y + h - 4 + sag, w - 2, 9, 4);
      ctx.fill();

      const body = ctx.createLinearGradient(0, y, 0, y + h);
      body.addColorStop(0, hsl(hue, sat, lig + 5));
      body.addColorStop(0.55, hsl(hue, sat, lig));
      body.addColorStop(1, hsl(hue, sat, lig - 6));
      tilePath(ctx, x, y, w, h + sag, 12);
      ctx.fillStyle = body;
      ctx.fill();

      ctx.save();
      tilePath(ctx, x, y, w, h + sag, 12);
      ctx.clip();
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

      tilePath(ctx, x + 0.5, y + 0.5, w - 1, h + sag - 1, 11.5);
      ctx.strokeStyle = 'rgba(84, 26, 12, 0.62)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
  return canvas;
}

function paintStucco() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x57ac01);
  ctx.fillStyle = '#f3e6cb';
  ctx.fillRect(0, 0, S, S);

  const mottle = [
    [232, 212, 178],
    [248, 240, 223],
    [238, 221, 194],
    [226, 206, 176],
  ];
  for (let i = 0; i < 28; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 50 + rnd() * 105;
    const rgb = mottle[i % mottle.length];
    const alpha = 0.065 + rnd() * 0.045;
    wrapDraw(S, S, x, y, r, (px, py) => softBlob(ctx, px, py, r, rgb, alpha));
  }

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

  for (let i = 0; i < 6; i++) {
    const x = rnd() * S;
    const y = S * (0.45 + rnd() * 0.5);
    const r = 60 + rnd() * 85;
    wrapDraw(S, S, x, y, r, (px, py) => softBlob(ctx, px, py, r, [200, 168, 126], 0.05));
  }
  return canvas;
}

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
      const inset = 1 + hash2(kx + 9, ky + 5) * 0.6;
      const x = col * bw + offset + inset;
      const y = row * bh + inset;
      const w = bw - inset * 2;
      const h = bh - inset * 2;

      const body = ctx.createLinearGradient(x, y, x + w * 0.2, y + h);
      body.addColorStop(0, hsl(hue, sat, lig + 2));
      body.addColorStop(1, hsl(hue, sat, lig - 1.5));
      roundRectPath(ctx, x, y, w, h, 2.5);
      ctx.fillStyle = body;
      ctx.fill();

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
    cols: 5,
    rows: 8,
    mortar: '#bdb5a5',
    tints: [
      [42, 16, 79],
      [40, 14, 81],
      [45, 18, 77],
      [38, 12, 80],
      [44, 15, 82],
      [36, 11, 76],
    ],
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
    tints: [
      [44, 11, 83],
      [42, 9, 86],
      [46, 13, 81],
      [40, 8, 85],
      [44, 10, 88],
      [38, 7, 80],
    ],
    bevelHi: 'rgba(255, 255, 250, 0.5)',
    bevelLo: 'rgba(150, 140, 122, 0.18)',
  });
}

function paintWood() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = makeRng(0x8f31);
  ctx.fillStyle = '#9d6636';
  ctx.fillRect(0, 0, S, S);

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

  for (let i = 0; i < 2; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 8 + rnd() * 5;
    wrapDraw(S, S, x, y, r * 2, (px, py) => woodKnot(ctx, px, py, r));
  }
  return canvas;
}

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

    const body = ctx.createLinearGradient(x, 0, x + pw, 0);
    body.addColorStop(0, hsl(hue, sat, lig + 8));
    body.addColorStop(0.2, hsl(hue, sat, lig + 2));
    body.addColorStop(0.82, hsl(hue, sat, lig));
    body.addColorStop(1, hsl(hue, sat, lig - 7));
    ctx.fillStyle = body;
    ctx.fillRect(x + 2.5, 0, pw - 5, H);

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

  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255, 220, 170, 0.08)');
  shade.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(50, 25, 10, 0.16)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

function paintGlass() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);

  const base = ctx.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, '#4487d8');
  base.addColorStop(0.28, '#2f6fc4');
  base.addColorStop(0.75, '#1c4a8f');
  base.addColorStop(1, '#173a72');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  const top = ctx.createLinearGradient(0, 0, 0, S * 0.42);
  top.addColorStop(0, 'rgba(176, 216, 255, 0.22)');
  top.addColorStop(0.55, 'rgba(176, 216, 255, 0.07)');
  top.addColorStop(1, 'rgba(176, 216, 255, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, S, S * 0.42);

  const glint = ctx.createLinearGradient(0, S * 0.95, S * 0.9, 0);
  glint.addColorStop(0, 'rgba(205, 235, 255, 0)');
  glint.addColorStop(0.34, 'rgba(205, 235, 255, 0.04)');
  glint.addColorStop(0.48, 'rgba(232, 247, 255, 0.28)');
  glint.addColorStop(0.56, 'rgba(205, 235, 255, 0.08)');
  glint.addColorStop(0.7, 'rgba(205, 235, 255, 0.03)');
  glint.addColorStop(1, 'rgba(205, 235, 255, 0)');
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, S, S);

  const streak = ctx.createLinearGradient(0, S * 0.55, S * 0.55, 0);
  streak.addColorStop(0.44, 'rgba(220, 242, 255, 0)');
  streak.addColorStop(0.5, 'rgba(220, 242, 255, 0.14)');
  streak.addColorStop(0.56, 'rgba(220, 242, 255, 0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, 0, S, S);

  for (const cx of [0, S]) {
    const corner = ctx.createRadialGradient(cx, S, 0, cx, S, S * 0.7);
    corner.addColorStop(0, 'rgba(8, 18, 42, 0.32)');
    corner.addColorStop(1, 'rgba(8, 18, 42, 0)');
    ctx.fillStyle = corner;
    ctx.fillRect(0, 0, S, S);
  }
  return canvas;
}

export function createTextures(renderer) {
  const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

  const toTexture = (canvas) => {
    const texture = canvas?.isHeadlessMock
      ? new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2, THREE.RGBAFormat)
      : new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  };

  return {
    roof: toTexture(paintRoof()),
    stucco: toTexture(paintStucco()),
    stone: toTexture(paintStone()),
    stoneLight: toTexture(paintStoneLight()),
    wood: toTexture(paintWood()),
    doorWood: toTexture(paintDoorWood()),
    glass: toTexture(paintGlass()),
  };
}
