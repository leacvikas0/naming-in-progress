// Minimal TrueType (sfnt) writer. Enough for a pixel font: no hinting,
// no kerning, no composites. Glyphs are authored as pixel grids; the
// boundary is traced with edge cancellation so holes get opposite winding
// and the nonzero fill rule renders them correctly.
//
// Deterministic output: fixed timestamps, stable table order.

const LONG_DATE = 3786912000n; // 2024-01-01T00:00:00Z as seconds since 1904-01-01
const MAGIC = 0x5f0f3cf5;
const CHECKSUM_MAGIC = 0xb1b0afba;

function pad4(n) {
  return (n + 3) & ~3;
}

function tableChecksum(buf) {
  let sum = 0;
  const len = pad4(buf.length);
  for (let i = 0; i < len; i += 4) {
    const a = i < buf.length ? buf[i] : 0;
    const b = i + 1 < buf.length ? buf[i + 1] : 0;
    const c = i + 2 < buf.length ? buf[i + 2] : 0;
    const d = i + 3 < buf.length ? buf[i + 3] : 0;
    sum = (sum + (((a << 24) | (b << 16) | (c << 8) | d) >>> 0)) >>> 0;
  }
  return sum >>> 0;
}

function fileChecksum(buf) {
  return tableChecksum(buf);
}

/**
 * Trace the boundary of a pixel grid into closed loops of corner points.
 * Coordinates are in font units (y-up). Returns arrays of [x, y] points.
 */
export function traceContours(rows, px, ascent) {
  const h = rows.length;
  const w = rows[0].length;
  const edges = new Map();

  const addEdge = (x1, y1, x2, y2) => {
    const rev = `${x2},${y2}|${x1},${y1}`;
    if (edges.has(rev)) {
      edges.delete(rev);
      return;
    }
    edges.set(`${x1},${y1}|${x2},${y2}`, [x1, y1, x2, y2]);
  };

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (rows[j][i] !== "#") continue;
      const x0 = i * px;
      const x1 = (i + 1) * px;
      const y1 = ascent - j * px;
      const y0 = ascent - (j + 1) * px;
      // clockwise in a y-up system, so outer contours match the TTF convention
      addEdge(x0, y0, x0, y1);
      addEdge(x0, y1, x1, y1);
      addEdge(x1, y1, x1, y0);
      addEdge(x1, y0, x0, y0);
    }
  }

  const outgoing = new Map();
  for (const e of edges.values()) {
    const key = `${e[0]},${e[1]}`;
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(e);
  }

  const used = new Set();
  const keyOf = (e) => `${e[0]},${e[1]}|${e[2]},${e[3]}`;
  const loops = [];

  for (const seed of edges.values()) {
    if (used.has(keyOf(seed))) continue;
    const loop = [];
    let cur = seed;
    let guard = 0;
    while (cur && guard++ < 100000) {
      const k = keyOf(cur);
      if (used.has(k)) break;
      used.add(k);
      loop.push([cur[0], cur[1]]);
      const nexts = outgoing.get(`${cur[2]},${cur[3]}`) || [];
      cur = nexts.find((n) => !used.has(keyOf(n)));
    }
    if (loop.length >= 3) loops.push(simplify(loop));
  }

  return loops;
}

function simplify(loop) {
  const n = loop.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n];
    const cur = loop[i];
    const next = loop[(i + 1) % n];
    const d1x = cur[0] - prev[0];
    const d1y = cur[1] - prev[1];
    const d2x = next[0] - cur[0];
    const d2y = next[1] - cur[1];
    const cross = d1x * d2y - d1y * d2x;
    const dot = d1x * d2x + d1y * d2y;
    if (cross !== 0 || dot < 0) out.push(cur);
  }
  return out.length >= 3 ? out : loop;
}

function encodeGlyph(loops) {
  if (!loops.length) return Buffer.alloc(0);

  const points = [];
  const ends = [];
  for (const loop of loops) {
    for (const p of loop) points.push(p);
    ends.push(points.length - 1);
  }

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const [x, y] of points) {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }

  const flags = [];
  const xBytes = [];
  const yBytes = [];
  let px = 0;
  let py = 0;

  for (const [x, y] of points) {
    const dx = x - px;
    const dy = y - py;
    px = x;
    py = y;
    let flag = 0x01; // on-curve

    if (dx === 0) {
      flag |= 0x10;
    } else if (dx >= -255 && dx <= 255) {
      flag |= 0x02;
      if (dx > 0) flag |= 0x10;
      xBytes.push(Math.abs(dx));
    } else {
      xBytes.push((dx >> 8) & 0xff, dx & 0xff);
    }

    if (dy === 0) {
      flag |= 0x20;
    } else if (dy >= -255 && dy <= 255) {
      flag |= 0x04;
      if (dy > 0) flag |= 0x20;
      yBytes.push(Math.abs(dy));
    } else {
      yBytes.push((dy >> 8) & 0xff, dy & 0xff);
    }

    flags.push(flag);
  }

  const packed = [];
  let i = 0;
  while (i < flags.length) {
    let j = i;
    while (j < flags.length && flags[j] === flags[i] && j - i < 255) j++;
    const run = j - i;
    if (run > 1) packed.push(flags[i] | 0x08, run - 1);
    else packed.push(flags[i]);
    i = j;
  }

  const header = Buffer.alloc(10 + loops.length * 2 + 2);
  header.writeInt16BE(loops.length, 0);
  header.writeInt16BE(xMin, 2);
  header.writeInt16BE(yMin, 4);
  header.writeInt16BE(xMax, 6);
  header.writeInt16BE(yMax, 8);
  for (let k = 0; k < loops.length; k++) header.writeUInt16BE(ends[k], 10 + k * 2);
  header.writeUInt16BE(0, 10 + loops.length * 2); // instructionLength

  return Buffer.concat([header, Buffer.from(packed), Buffer.from(xBytes), Buffer.from(yBytes)]);
}

function utf16be(str) {
  const out = Buffer.alloc(str.length * 2);
  for (let i = 0; i < str.length; i++) out.writeUInt16BE(str.charCodeAt(i), i * 2);
  return out;
}

function buildName(family, style) {
  const full = `${family} ${style}`;
  const entries = [
    [1, family],
    [2, style],
    [3, `${family};${style};kilo-3d-kit`],
    [4, full],
    [5, "Version 1.000"],
    [6, `${family.replace(/\s+/g, "")}-${style}`],
  ];
  const records = [];
  const strings = [];
  let offset = 0;
  for (const [id, value] of entries) {
    const bytes = utf16be(value);
    records.push({ id, bytes, offset });
    strings.push(bytes);
    offset += bytes.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16BE(0, 0); // format
  header.writeUInt16BE(records.length, 2);
  header.writeUInt16BE(6 + records.length * 12, 4);

  const recBuf = Buffer.alloc(records.length * 12);
  records.forEach((r, i) => {
    const b = i * 12;
    recBuf.writeUInt16BE(3, b); // platformID: Windows
    recBuf.writeUInt16BE(1, b + 2); // encodingID: UCS-2
    recBuf.writeUInt16BE(0x0409, b + 4); // language: en-US
    recBuf.writeUInt16BE(r.id, b + 6);
    recBuf.writeUInt16BE(r.bytes.length, b + 8);
    recBuf.writeUInt16BE(r.offset, b + 10);
  });

  return Buffer.concat([header, recBuf, ...strings]);
}

function buildCmap(sortedCodes, glyphIndexByCode) {
  const segments = [];
  let runStart = null;
  let prev = null;
  for (const code of sortedCodes) {
    if (runStart === null) {
      runStart = code;
      prev = code;
      continue;
    }
    if (code === prev + 1 && glyphIndexByCode.get(code) === glyphIndexByCode.get(prev) + 1) {
      prev = code;
      continue;
    }
    segments.push([runStart, prev]);
    runStart = code;
    prev = code;
  }
  if (runStart !== null) segments.push([runStart, prev]);

  const segCount = segments.length + 1; // + final 0xFFFF segment
  const segCountX2 = segCount * 2;
  const entrySelector = Math.floor(Math.log2(segCount));
  const searchRange = 2 * Math.pow(2, entrySelector);
  const rangeShift = segCountX2 - searchRange;

  const body = Buffer.alloc(segCount * 8 + 2);
  const endCodeOff = 0;
  const startCodeOff = segCount * 2 + 2;
  const idDeltaOff = startCodeOff + segCount * 2;
  const idRangeOff = idDeltaOff + segCount * 2;

  segments.forEach(([start, end], i) => {
    body.writeUInt16BE(end, endCodeOff + i * 2);
    body.writeUInt16BE(start, startCodeOff + i * 2);
    // idDelta is a uint16 that wraps: glyphIndex = (code + idDelta) mod 65536
    const delta = (((glyphIndexByCode.get(start) - start) % 65536) + 65536) % 65536;
    body.writeUInt16BE(delta, idDeltaOff + i * 2);
    body.writeUInt16BE(0, idRangeOff + i * 2);
  });

  const last = segCount - 1;
  body.writeUInt16BE(0xffff, endCodeOff + last * 2);
  body.writeUInt16BE(0xffff, startCodeOff + last * 2);
  body.writeUInt16BE(1, idDeltaOff + last * 2);
  body.writeUInt16BE(0, idRangeOff + last * 2);

  const sub = Buffer.concat([body, Buffer.alloc(0)]);
  const length = 14 + sub.length;
  const header = Buffer.alloc(14);
  header.writeUInt16BE(4, 0); // format
  header.writeUInt16BE(length, 2);
  header.writeUInt16BE(0, 4); // language
  header.writeUInt16BE(segCountX2, 6);
  header.writeUInt16BE(searchRange, 8);
  header.writeUInt16BE(entrySelector, 10);
  header.writeUInt16BE(rangeShift, 12);

  const subtable = Buffer.concat([header, sub]);

  // cmap header + one encoding record (Windows BMP)
  const outer = Buffer.alloc(4 + 8);
  outer.writeUInt16BE(0, 0); // version
  outer.writeUInt16BE(1, 2); // numTables
  outer.writeUInt16BE(3, 4); // platformID
  outer.writeUInt16BE(1, 6); // encodingID
  outer.writeUInt32BE(12, 8); // offset

  return Buffer.concat([outer, subtable]);
}

function buildOS2({ ascent, descent, avgWidth, firstChar, lastChar, capHeight }) {
  const buf = Buffer.alloc(100);
  buf.writeUInt16BE(4, 0); // version
  buf.writeInt16BE(avgWidth, 2);
  buf.writeUInt16BE(400, 4); // usWeightClass
  buf.writeUInt16BE(5, 6); // usWidthClass
  buf.writeUInt16BE(0, 8); // fsType: installable
  const sizes = [
    [10, 6], // ySubscriptXSize, YSize
    [0, 0], // offsets
    [10, 6], // ySuperscript
    [0, 0],
    [1, 4], // strikeout size/pos
  ];
  let o = 10;
  for (const [a, b] of sizes) {
    buf.writeInt16BE(a, o);
    buf.writeInt16BE(b, o + 2);
    o += 4;
  }
  buf.writeInt16BE(0, 30); // sFamilyClass
  // panose[10] at 32..41 = zeros
  buf.writeUInt32BE(0, 42);
  buf.writeUInt32BE(0, 46);
  buf.writeUInt32BE(0, 50);
  buf.writeUInt32BE(0, 54);
  buf.write("KILO", 58, "latin1");
  buf.writeUInt16BE(0x0040, 62); // fsSelection: REGULAR
  buf.writeUInt16BE(firstChar, 64);
  buf.writeUInt16BE(lastChar, 66);
  buf.writeInt16BE(ascent, 68); // sTypoAscender
  buf.writeInt16BE(-descent, 70); // sTypoDescender
  buf.writeInt16BE(0, 72); // sTypoLineGap
  buf.writeUInt16BE(ascent, 74); // usWinAscent
  buf.writeUInt16BE(descent, 76); // usWinDescent
  buf.writeUInt32BE(0, 78);
  buf.writeUInt32BE(0, 82);
  buf.writeInt16BE(capHeight, 86); // sxHeight
  buf.writeInt16BE(capHeight, 88); // sCapHeight
  buf.writeUInt16BE(0, 90); // usDefaultChar
  buf.writeUInt16BE(32, 92); // usBreakChar
  buf.writeUInt16BE(0, 94); // usMaxContext
  buf.writeUInt16BE(8, 96); // usLowerOpticalPointSize
  buf.writeUInt16BE(6553, 98); // usUpperOpticalPointSize
  return buf;
}

function buildGasp() {
  const buf = Buffer.alloc(8);
  buf.writeUInt16BE(1, 0); // version
  buf.writeUInt16BE(1, 2); // numRanges
  buf.writeUInt16BE(0xffff, 4); // rangeMaxPPEM
  // gridfit, no grayscale: bilevel rasterization keeps pixel edges crisp
  buf.writeUInt16BE(0x0005, 6);
  return buf;
}

/**
 * Build a TTF from pixel-grid glyphs.
 *
 * glyphs: [{ code, rows: string[] of "#"/".", advance }] — rows are top-down,
 *         all the same width; `advance` is in pixels.
 */
export function buildPixelFontTTF({ family = "PixelChrome", style = "Regular", upem = 16, px = 2, ascent = 14, descent = 2, glyphs }) {
  if (!Array.isArray(glyphs) || !glyphs.length) throw new Error("buildPixelFontTTF: no glyphs");

  const sorted = [...glyphs].sort((a, b) => a.code - b.code);
  for (const g of sorted) {
    if (g.rows.length * px !== ascent) {
      throw new Error(
        `buildPixelFontTTF: glyph ${JSON.stringify(String.fromCharCode(g.code))} has ${g.rows.length} rows, expected ${ascent / px}`
      );
    }
  }

  const glyphIndexByCode = new Map();
  glyphIndexByCode.set(0xffff, 0);

  const glyphList = [{ code: -1, rows: null, advance: 6 }]; // .notdef placeholder
  for (const g of sorted) {
    if (glyphIndexByCode.has(g.code)) continue;
    glyphIndexByCode.set(g.code, glyphList.length);
    glyphList.push(g);
  }

  // .notdef: hollow box, so a missing glyph is visible rather than invisible
  const boxRows = ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"];
  glyphList[0] = { code: -1, rows: boxRows, advance: 6 };

  const glyfParts = [];
  const loca = [0];
  const metrics = [];
  let gxMin = Infinity;
  let gyMin = Infinity;
  let gxMax = -Infinity;
  let gyMax = -Infinity;
  let maxPoints = 0;
  let maxContours = 0;
  let advanceWidthMax = 0;

  for (const g of glyphList) {
    const loops = traceContours(g.rows, px, ascent);
    const data = encodeGlyph(loops);
    const advance = Math.round((g.advance ?? g.rows[0].length) * px);

    let pointCount = 0;
    for (const loop of loops) pointCount += loop.length;
    maxPoints = Math.max(maxPoints, pointCount);
    maxContours = Math.max(maxContours, loops.length);
    advanceWidthMax = Math.max(advanceWidthMax, advance);

    let lsb = 0;
    let xMin = 0;
    let xMax = 0;
    let yMin = 0;
    let yMax = 0;
    if (loops.length) {
      xMin = Infinity;
      xMax = -Infinity;
      yMin = Infinity;
      yMax = -Infinity;
      for (const loop of loops) {
        for (const [x, y] of loop) {
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
      lsb = xMin;
      gxMin = Math.min(gxMin, xMin);
      gyMin = Math.min(gyMin, yMin);
      gxMax = Math.max(gxMax, xMax);
      gyMax = Math.max(gyMax, yMax);
    }

    const padded = Buffer.alloc(pad4(data.length));
    data.copy(padded);
    glyfParts.push(padded);
    loca.push(loca[loca.length - 1] + padded.length);
    metrics.push({ advance, lsb });
  }

  if (!Number.isFinite(gxMin)) {
    gxMin = 0;
    gyMin = 0;
    gxMax = 0;
    gyMax = 0;
  }

  const glyf = Buffer.concat(glyfParts);
  const numGlyphs = glyphList.length;

  const head = Buffer.alloc(54);
  head.writeUInt32BE(0x00010000, 0);
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt32BE(0, 8); // checkSumAdjustment, patched later
  head.writeUInt32BE(MAGIC, 12);
  head.writeUInt16BE(0x0003, 16); // flags
  head.writeUInt16BE(upem, 18);
  head.writeBigUInt64BE(LONG_DATE, 20);
  head.writeBigUInt64BE(LONG_DATE, 28);
  head.writeInt16BE(gxMin, 36);
  head.writeInt16BE(gyMin, 38);
  head.writeInt16BE(gxMax, 40);
  head.writeInt16BE(gyMax, 42);
  head.writeUInt16BE(0, 44); // macStyle
  head.writeUInt16BE(8, 46); // lowestRecPPEM
  head.writeInt16BE(2, 48); // fontDirectionHint
  head.writeInt16BE(1, 50); // indexToLocFormat: long
  head.writeInt16BE(0, 52); // glyphDataFormat

  const hhea = Buffer.alloc(36);
  hhea.writeUInt32BE(0x00010000, 0);
  hhea.writeInt16BE(ascent, 4);
  hhea.writeInt16BE(-descent, 6);
  hhea.writeInt16BE(0, 8); // lineGap
  hhea.writeUInt16BE(advanceWidthMax, 10);
  hhea.writeInt16BE(Math.min(...metrics.map((m) => m.lsb)), 12);
  hhea.writeInt16BE(0, 14);
  hhea.writeInt16BE(Math.max(...metrics.map((m) => m.lsb + (m.advance || 0))), 16);
  hhea.writeInt16BE(1, 18); // caretSlopeRise
  hhea.writeInt16BE(0, 20);
  hhea.writeInt16BE(0, 22);
  hhea.writeInt16BE(0, 24);
  hhea.writeInt16BE(0, 26);
  hhea.writeInt16BE(0, 28);
  hhea.writeInt16BE(0, 30);
  hhea.writeInt16BE(0, 32); // metricDataFormat
  hhea.writeUInt16BE(numGlyphs, 34);

  const maxp = Buffer.alloc(32);
  maxp.writeUInt32BE(0x00010000, 0);
  maxp.writeUInt16BE(numGlyphs, 4);
  maxp.writeUInt16BE(maxPoints, 6);
  maxp.writeUInt16BE(maxContours, 8);
  maxp.writeUInt16BE(0, 10);
  maxp.writeUInt16BE(0, 12);
  maxp.writeUInt16BE(1, 14); // maxZones
  maxp.writeUInt16BE(0, 16);
  maxp.writeUInt16BE(0, 18);
  maxp.writeUInt16BE(0, 20);
  maxp.writeUInt16BE(0, 22);
  maxp.writeUInt16BE(0, 24);
  maxp.writeUInt16BE(0, 26);
  maxp.writeUInt16BE(0, 28);
  maxp.writeUInt16BE(0, 30);

  const hmtx = Buffer.alloc(numGlyphs * 4);
  metrics.forEach((m, i) => {
    hmtx.writeUInt16BE(m.advance, i * 4);
    hmtx.writeInt16BE(m.lsb, i * 4 + 2);
  });

  const locaBuf = Buffer.alloc((numGlyphs + 1) * 4);
  loca.forEach((v, i) => locaBuf.writeUInt32BE(v, i * 4));

  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);

  const codes = sorted.map((g) => g.code).filter((c) => c >= 0);
  const os2 = buildOS2({
    ascent,
    descent,
    avgWidth: Math.round(metrics.reduce((a, m) => a + m.advance, 0) / metrics.length),
    firstChar: codes.length ? Math.min(...codes) : 32,
    lastChar: codes.length ? Math.max(...codes) : 32,
    capHeight: ascent - px,
  });

  const tables = [
    ["OS/2", os2],
    ["cmap", buildCmap(codes, glyphIndexByCode)],
    ["gasp", buildGasp()],
    ["glyf", glyf],
    ["head", head],
    ["hhea", hhea],
    ["hmtx", hmtx],
    ["loca", locaBuf],
    ["maxp", maxp],
    ["name", buildName(family, style)],
    ["post", post],
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const numTables = tables.length;
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 16 * Math.pow(2, entrySelector);
  const rangeShift = numTables * 16 - searchRange;

  const dir = Buffer.alloc(12 + numTables * 16);
  dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(numTables, 4);
  dir.writeUInt16BE(searchRange, 6);
  dir.writeUInt16BE(entrySelector, 8);
  dir.writeUInt16BE(rangeShift, 10);

  let offset = 12 + numTables * 16;
  const bodies = [];
  let headOffset = 0;

  tables.forEach(([tag, data], i) => {
    const b = 12 + i * 16;
    dir.write(tag, b, 4, "latin1");
    dir.writeUInt32BE(tableChecksum(data), b + 4);
    dir.writeUInt32BE(offset, b + 8);
    dir.writeUInt32BE(data.length, b + 12);
    if (tag === "head") headOffset = offset;
    const padded = Buffer.alloc(pad4(data.length));
    data.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });

  const font = Buffer.concat([dir, ...bodies]);
  const sum = fileChecksum(font);
  const adjustment = (CHECKSUM_MAGIC - sum) >>> 0;
  font.writeUInt32BE(adjustment, headOffset + 8);

  return font;
}
