#!/usr/bin/env node
// Downloads the KayKit v2 character packs used by world/assets/characters/index.js
// (Adventurers 2.0, Skeletons 1.1, Character Animations 1.1 — all CC0) into
// library/kaykit-v2/ via a shallow sparse git clone. No npm dependencies.
//
//   npm run fetch:kaykit            # fetch / refresh
//   node scripts/fetch-kaykit.mjs --ref main --keep-temp

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'https://github.com/GeorgeQLe/assets-kaykit-3d-characters.git';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'library', 'kaykit-v2');

// Upstream folder (posix, as stored in git) -> destination under library/kaykit-v2
const FOLDERS = [
  ['assets/kaykit/adventurers-2.0/Characters/gltf', ['adventurers-2.0', 'Characters', 'gltf']],
  ['assets/kaykit/adventurers-2.0/Assets/gltf', ['adventurers-2.0', 'Assets', 'gltf']],
  ['assets/kaykit/skeletons-1.1/characters/gltf', ['skeletons-1.1', 'characters', 'gltf']],
  ['assets/kaykit/skeletons-1.1/assets/gltf', ['skeletons-1.1', 'assets', 'gltf']],
  ['assets/kaykit/character-animations-1.1/Animations/gltf', ['character-animations-1.1', 'Animations', 'gltf']],
  ['LICENSES', ['LICENSES']],
];

// Files the character loader cannot run without
const REQUIRED = [
  ['adventurers-2.0', 'Characters', 'gltf', 'Knight.glb'],
  ['adventurers-2.0', 'Characters', 'gltf', 'Mage.glb'],
  ['adventurers-2.0', 'Assets', 'gltf', 'sword_1handed.gltf'],
  ['adventurers-2.0', 'Assets', 'gltf', 'staff.gltf'],
  ['skeletons-1.1', 'characters', 'gltf', 'Skeleton_Warrior.glb'],
  ['skeletons-1.1', 'characters', 'gltf', 'Skeleton_Golem.glb'],
  ['skeletons-1.1', 'characters', 'gltf', 'Necromancer.glb'],
  ['skeletons-1.1', 'assets', 'gltf', 'Skeleton_Blade.gltf'],
  ['character-animations-1.1', 'Animations', 'gltf', 'Rig_Medium', 'Rig_Medium_General.glb'],
  ['character-animations-1.1', 'Animations', 'gltf', 'Rig_Medium', 'Rig_Medium_CombatMelee.glb'],
  ['character-animations-1.1', 'Animations', 'gltf', 'Rig_Large', 'Rig_Large_General.glb'],
];

function parseArgs(argv) {
  const args = { ref: 'main', keepTemp: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ref') args.ref = argv[++i];
    else if (argv[i] === '--keep-temp') args.keepTemp = true;
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed with exit code ${res.status}`);
}

function ensureGit() {
  const res = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    console.error(
      '[fetch:kaykit] git was not found on PATH.\n' +
        '  Install Git (https://git-scm.com/downloads; on Windows "Git for Windows"),\n' +
        '  reopen your terminal, then run `npm run fetch:kaykit` again.'
    );
    process.exit(1);
  }
  // --filter + sparse-checkout need git >= 2.25
  const match = /(\d+)\.(\d+)/.exec(res.stdout || '');
  if (match && (Number(match[1]) < 2 || (Number(match[1]) === 2 && Number(match[2]) < 25))) {
    console.error(`[fetch:kaykit] git ${match[0]} is too old; git 2.25+ is required for sparse checkout.`);
    process.exit(1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/fetch-kaykit.mjs [--ref <branch|tag>] [--keep-temp]');
    return;
  }
  ensureGit();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaykit-v2-'));
  const clone = path.join(tmp, 'repo');
  try {
    console.log(`[fetch:kaykit] Cloning ${REPO_URL} (${args.ref}, sparse) ...`);
    git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', args.ref, REPO_URL, clone]);
    git(['sparse-checkout', 'set', ...FOLDERS.map(([src]) => src)], clone);

    for (const [src, destParts] of FOLDERS) {
      const from = path.join(clone, ...src.split('/'));
      const to = path.join(DEST, ...destParts);
      if (!fs.existsSync(from)) throw new Error(`Upstream folder missing: ${src}`);
      fs.mkdirSync(to, { recursive: true });
      fs.cpSync(from, to, { recursive: true, force: true });
      console.log(`[fetch:kaykit]   ${src} -> ${path.relative(ROOT, to)} (${fs.readdirSync(from).length} entries)`);
    }

    const missing = REQUIRED.map((parts) => path.join(DEST, ...parts)).filter((file) => !fs.existsSync(file));
    if (missing.length) {
      throw new Error(`Fetched packs are missing required files:\n  ${missing.join('\n  ')}`);
    }
    console.log(`[fetch:kaykit] Done -> ${path.relative(ROOT, DEST)}`);
  } finally {
    if (args.keepTemp) {
      console.log(`[fetch:kaykit] Kept temp clone at ${clone}`);
    } else {
      // Windows may hold read-only git pack files briefly; retry before giving up
      try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (err) {
        console.warn(`[fetch:kaykit] Could not remove temp clone ${tmp}: ${err.message}`);
      }
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`[fetch:kaykit] ${err.message}`);
  process.exit(1);
}
