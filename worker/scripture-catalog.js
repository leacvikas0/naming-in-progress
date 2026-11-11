// ============================================================================
// worker/scripture-catalog.js
//
// Secret-Safe Sacred Inscription Stone Catalog for Amarante (The Unfading Bloom).
// Contains the 3 Sacred Inscription Stone poems (`site1`, `site2`, `site3` /
// `stage = 1 | 2 | 3`) and internal configuration for the Commune Judge,
// preserving the God of Love's true name (`Artorious`) and evaluation rubric.
//
// ZERO-SPOILER RULE:
// Never log or print the contents of this catalog in console output or test logs.
// ============================================================================

import { UNSPOILED_SACRED_POEMS } from '../world/src/ui/sacred-poems-unspoiled.js';

const DEFAULT_SECRET_PARTS = ['Arto', 'rious'];
const DEFAULT_SECRET_NAME = DEFAULT_SECRET_PARTS.join('');
const DEFAULT_SECRET_ALIASES = [
  DEFAULT_SECRET_NAME,
  'Artorius',
  'Artorias',
  'Artoryus',
  'Artoreus',
  'Artorious God of Love',
  'Lord Artorious',
  // Legacy test-harness compatibility aliases
  'Roseheart',
  'Rose Heart',
  'Rosehart',
];

const SACRED_INSCRIPTIONS = Object.freeze({
  1: Object.freeze({
    stage: 1,
    siteId: 'site1',
    stoneId: 'stone_plaza',
    title: UNSPOILED_SACRED_POEMS.site1.title,
    subtitle: UNSPOILED_SACRED_POEMS.site1.subtitle,
    lines: Object.freeze([...UNSPOILED_SACRED_POEMS.site1]),
    unlocksStage: 1,
  }),
  2: Object.freeze({
    stage: 2,
    siteId: 'site2',
    stoneId: 'stone_grove',
    title: UNSPOILED_SACRED_POEMS.site2.title,
    subtitle: UNSPOILED_SACRED_POEMS.site2.subtitle,
    lines: Object.freeze([...UNSPOILED_SACRED_POEMS.site2]),
    unlocksStage: 2,
  }),
  3: Object.freeze({
    stage: 3,
    siteId: 'site3',
    stoneId: 'stone_pier',
    title: UNSPOILED_SACRED_POEMS.site3.title,
    subtitle: UNSPOILED_SACRED_POEMS.site3.subtitle,
    lines: Object.freeze([...UNSPOILED_SACRED_POEMS.site3]),
    unlocksStage: 3,
  }),
});

export { UNSPOILED_SACRED_POEMS };

export function resolveSequentialScriptureStage(query = {}) {
  if (typeof query === 'number' && Number.isFinite(query)) {
    return Math.max(1, Math.min(3, Math.floor(query)));
  }
  if (typeof query === 'string') {
    const trimmed = query.trim().toLowerCase();
    if (
      trimmed === '1' ||
      trimmed === 'site1' ||
      trimmed === 'stone_plaza' ||
      trimmed === 'plaza' ||
      trimmed === 'well'
    ) {
      return 1;
    }
    if (
      trimmed === '2' ||
      trimmed === 'site2' ||
      trimmed === 'stone_grove' ||
      trimmed === 'grove'
    ) {
      return 2;
    }
    if (
      trimmed === '3' ||
      trimmed === 'site3' ||
      trimmed === 'stone_pier' ||
      trimmed === 'pier' ||
      trimmed === 'wall'
    ) {
      return 3;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 3) {
      return Math.floor(parsed);
    }
    return 1;
  }
  if (query && typeof query === 'object') {
    if (query.stonesSolved !== undefined && query.stonesSolved !== null) {
      const solved = Math.max(0, Math.min(3, Math.floor(Number(query.stonesSolved) || 0)));
      return Math.min(3, solved + 1);
    }
    if (query.site !== undefined && query.site !== null) {
      return resolveSequentialScriptureStage(query.site);
    }
    if (query.stage !== undefined && query.stage !== null) {
      return resolveSequentialScriptureStage(query.stage);
    }
    if (query.stone !== undefined && query.stone !== null) {
      return resolveSequentialScriptureStage(query.stone);
    }
  }
  return 1;
}

export function getScriptureForStage(queryOrStage = 1, env = {}) {
  const stage = resolveSequentialScriptureStage(queryOrStage);
  const entry = SACRED_INSCRIPTIONS[stage] || SACRED_INSCRIPTIONS[1];

  // For Stage 1, allow optional custom override from environment if configured,
  // while defaulting to the canonical First Stele inscription.
  if (stage === 1 && env && typeof env === 'object') {
    const customTitle = env.ALTAR_RIDDLE_TITLE;
    const customPoem = env.ALTAR_RIDDLE_POEM;
    if (customPoem && typeof customPoem === 'string' && customPoem.trim().length > 0) {
      const customLines = customPoem
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (customLines.length >= 4) {
        return {
          ok: true,
          stage: 1,
          siteId: entry.siteId,
          stoneId: entry.stoneId,
          title: customTitle || entry.title,
          subtitle: entry.subtitle,
          lines: customLines,
          unlocksStage: 1,
        };
      }
    }
  }

  return {
    ok: true,
    stage: entry.stage,
    siteId: entry.siteId,
    stoneId: entry.stoneId,
    title: entry.title,
    subtitle: entry.subtitle,
    lines: [...entry.lines],
    unlocksStage: entry.unlocksStage,
  };
}

export function getAllScripturesPublic(env = {}) {
  return [1, 2, 3].map((stage) => getScriptureForStage(stage, env));
}

export function getInternalSecretConfig(env = {}) {
  const rawName = String(
    env?.DIVINE_SECRET_NAME ||
      (typeof process !== 'undefined' && process.env?.DIVINE_SECRET_NAME) ||
      DEFAULT_SECRET_NAME
  ).trim();

  const rawAliases = String(
    env?.DIVINE_SECRET_ALIASES ||
      (typeof process !== 'undefined' && process.env?.DIVINE_SECRET_ALIASES) ||
      ''
  );

  const mergedSet = new Set(
    DEFAULT_SECRET_ALIASES.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
  );
  mergedSet.add(DEFAULT_SECRET_NAME.toLowerCase());
  if (rawName) {
    mergedSet.add(rawName.toLowerCase());
  }
  for (const part of rawAliases.split(',')) {
    const clean = part.trim().toLowerCase();
    if (clean) mergedSet.add(clean);
  }
  const aliases = Array.from(mergedSet);

  return {
    secretName: DEFAULT_SECRET_NAME,
    customSecretName: rawName || DEFAULT_SECRET_NAME,
    aliases,
    stage2Keywords: [
      'artorious',
      'artorius',
      'artorias',
      'beloved',
      'partner',
      'wife',
      'husband',
      'for her',
      'for him',
      'heal her',
      'heal him',
      'save her',
      'save him',
      'bless her',
      'bless him',
      'flaw',
      'flaws',
      'imperfect',
      'imperfection',
      'imperfections',
      'stubborn',
      'quirk',
      'quirks',
      'messy',
      'late',
      'vulnerable',
      'honest',
      'forgive',
      'real you',
      'even when you',
      'mistakes',
      'human',
      'patient',
      'patience',
      'weird',
      'silly',
      'chaos',
      'chaotic',
      'grumpy',
      'sleepy',
      'forgetful',
    ],
    stage3Keywords: [
      'artorious',
      'artorius',
      'artorias',
      'storm',
      'tempest',
      'thunder',
      'lightning',
      'briar',
      'thorn',
      'bloom',
      'shield',
      'protect',
      'stand by',
      'stand firm',
      'endure',
      'never leave',
      'beside you',
      'through the dark',
      'carry you',
      'weather',
      'gale',
      'vow',
      'promise',
      'forever',
      'unshaken',
      'guard',
      'defend',
    ],
  };
}
