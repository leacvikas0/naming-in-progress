// ============================================================================
// world/tools/fetch-real-foley.mjs
//
// Searches Openverse (Freesound / Wikimedia CC0 & CC-BY) for real recorded
// studio foley samples and downloads them into `world/assets/audio/sfx/foley/`
// with a manifest and CREDITS.md.
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FOLEY_DIR = path.resolve(__dirname, '../assets/audio/sfx/foley');

const CUES = [
  { id: 'sword-whoosh', queries: ['sword whoosh', 'sword swing', 'blade swoosh'], maxMs: 3500 },
  { id: 'sword-clash', queries: ['sword clash', 'sword hit metal', 'blade clang'], maxMs: 3500 },
  { id: 'flesh-armor-hit', queries: ['sword impact', 'heavy punch hit', 'armor hit'], maxMs: 3500 },
  { id: 'fire-whoosh', queries: ['fire whoosh', 'flame burst', 'torch whoosh'], maxMs: 4500 },
  { id: 'vine-whip', queries: ['whip whoosh', 'branch swish', 'whip crack'], maxMs: 3500 },
  { id: 'wood-creak', queries: ['wood creak', 'tree creak', 'branch snap'], maxMs: 5000 },
  { id: 'foliage-rustle', queries: ['leaves rustle', 'bush rustle', 'foliage'], maxMs: 5000 },
  { id: 'earth-thud', queries: ['heavy thud', 'ground impact', 'boulder drop'], maxMs: 4000 },
  { id: 'deep-rumble', queries: ['thunder rumble', 'earthquake rumble', 'deep boom'], maxMs: 7000 },
  { id: 'singing-bowl', queries: ['singing bowl', 'tibetan bowl', 'temple bell'], maxMs: 9000 },
  { id: 'heartbeat', queries: ['heartbeat', 'heart beat thump', 'low pulse'], maxMs: 6000 },
  { id: 'wind-gust', queries: ['wind gust', 'wind swoosh', 'cold wind'], maxMs: 7000 },
  { id: 'petals-flutter', queries: ['wings flutter', 'paper flutter', 'dry leaves wind'], maxMs: 5000 },
  { id: 'meteor-crash', queries: ['rock smash', 'boulder crash', 'stone shatter'], maxMs: 5000 },
  { id: 'ice-crack', queries: ['ice crack', 'ice shatter', 'glass shatter'], maxMs: 4500 },
];

const LICENSES = new Set(['cc0', 'by']);
const EXTS = new Set(['mp3', 'wav', 'ogg']);

async function searchOpenverse(query, maxMs = 5000) {
  const params = new URLSearchParams({
    q: query,
    page_size: '20',
    license: 'cc0,by',
  });
  const url = `https://api.openverse.org/v1/audio/?${params}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'HaruMachiAudioDirector/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for query "${query}"`);
  }
  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];
  const candidates = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!LICENSES.has(r.license)) continue;
    let fileUrl = r.url;
    let ext = r.filetype;
    // Also check alt_files for mp3/ogg previews if main file is flac or huge
    if ((!EXTS.has(ext) || r.filesize > 1500000) && Array.isArray(r.alt_files)) {
      const alt = r.alt_files.find((a) => EXTS.has(a.filetype));
      if (alt && alt.url) {
        fileUrl = alt.url;
        ext = alt.filetype;
      }
    }
    if (!EXTS.has(ext) || !fileUrl || !fileUrl.startsWith('https://')) continue;
    if (!Number.isFinite(r.duration) || r.duration <= 80 || r.duration > maxMs * 2.2) continue;
    const durPenalty = Math.max(0, r.duration - maxMs) / 1000;
    const licPenalty = r.license === 'by' ? 1.5 : 0;
    const score = i + durPenalty + licPenalty;
    candidates.push({
      score,
      id: r.id,
      title: String(r.title || '').trim(),
      creator: String(r.creator || '').trim(),
      license: r.license,
      attribution: String(r.attribution || '').trim(),
      foreignUrl: r.foreign_landing_url || '',
      durationMs: r.duration,
      url: fileUrl,
      ext,
    });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HaruMachiAudioDirector/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 512) throw new Error(`Downloaded file too small (${buf.length}B)`);
  await fs.writeFile(destPath, buf);
  return buf.length;
}

async function main() {
  await fs.mkdir(FOLEY_DIR, { recursive: true });
  const manifest = {};
  const credits = [
    '# Real Studio Foley Credits (Openverse / Freesound CC0 & CC-BY)',
    '',
  ];

  for (const cue of CUES) {
    let downloaded = null;
    for (const q of cue.queries) {
      if (downloaded) break;
      try {
        const candidates = await searchOpenverse(q, cue.maxMs);
        for (const cand of candidates.slice(0, 4)) {
          const filename = `${cue.id}.${cand.ext}`;
          const destPath = path.join(FOLEY_DIR, filename);
          try {
            const bytes = await downloadFile(cand.url, destPath);
            downloaded = {
              id: cue.id,
              file: filename,
              bytes,
              durationMs: cand.durationMs,
              title: cand.title,
              creator: cand.creator,
              license: cand.license,
              sourceUrl: cand.foreignUrl,
              query: q,
            };
            if (cand.license === 'by') {
              credits.push(`- \`${filename}\`: ${cand.attribution || `${cand.title} by ${cand.creator} (CC BY)`} (${cand.foreignUrl})`);
            } else {
              credits.push(`- \`${filename}\`: ${cand.title} by ${cand.creator} (CC0 Public Domain) (${cand.foreignUrl})`);
            }
            console.log(`[FOLEY DOWNLOADED] ${cue.id} -> ${filename} (${(bytes / 1024).toFixed(1)} KB, ${cand.durationMs}ms) [${cand.title}]`);
            break;
          } catch (dlErr) {
            console.warn(`  [Retry candidate] ${cand.url}: ${dlErr.message}`);
          }
        }
      } catch (err) {
        console.warn(`  [Query warn] "${q}": ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    if (downloaded) {
      manifest[cue.id] = downloaded;
    } else {
      console.warn(`[FOLEY MISSING] Could not resolve ${cue.id}`);
    }
  }

  await fs.writeFile(path.join(FOLEY_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(FOLEY_DIR, 'CREDITS.md'), credits.join('\n') + '\n');
  console.log(`\nDone! Resolved ${Object.keys(manifest).length}/${CUES.length} real foley cues.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
