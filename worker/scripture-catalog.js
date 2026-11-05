// ============================================================================
// worker/scripture-catalog.js
//
// Secret-Safe Sacred Inscription Stone Catalog for Haru-machi (Wave 3).
// Contains the 3 sequential Sacred Inscription Stone poems (`stage = 1 | 2 | 3`)
// and internal configuration for the Commune Judge.
//
// ZERO-SPOILER RULE:
// Never log or print the contents of this catalog in console output or test logs.
// ============================================================================

const DEFAULT_SECRET_PARTS = ['Rose', 'heart'];
const DEFAULT_SECRET_NAME = DEFAULT_SECRET_PARTS.join('');
const DEFAULT_SECRET_ALIASES = [
  DEFAULT_SECRET_NAME,
  'Rose Heart',
  'Rosehart',
  'Rose Hart',
  'Rosart',
  'Rozhart',
  'Rozeheart',
  'Rozehart',
  'Rosaheart',
  'Rosahart',
];

const SACRED_INSCRIPTIONS = Object.freeze({
  1: Object.freeze({
    stage: 1,
    stoneId: 'stone_plaza',
    title: 'First Stele — The Weathered Stele of the Unnamed Grove',
    subtitle: 'Carved in weathered limestone inside a ring of crimson petals',
    lines: Object.freeze([
      'Approach not with a beggar’s whine, nor ask a crown solely for thy brow;',
      'The Ancient Sovereign listens only when thou speakest for thy beloved’s vow.',
      'My first is crowned in velvet red and guarded by a waking thorn,',
      'The very word for what the sun did when the golden day was born.',
      'My second drums within thy chest from mortal life’s first waking start,',
      'The tender throne that breaks in two when distant lovers have to part.',
      'Now bind the blossom to the beat, and call the two as one:',
      'Speak aloud the Ancient God’s true name before thy prayer is done.',
    ]),
    unlocksStage: 1,
  }),
  2: Object.freeze({
    stage: 2,
    stoneId: 'stone_pier',
    title: 'Second Stele — The Mist-Carved Stele of the Twin Flame',
    subtitle: 'Inscribed where gentle lake ripples kiss the timber pier',
    lines: Object.freeze([
      'Thou knowest my name, yet winter’s frost unlocks but half my sleeping fire;',
      'A painted idol made of marble wakes no ember of desire.',
      'False lovers praise a flawless mask and hide their trembling hands in shame,',
      'While truer hearts adore the cracks where stubborn, human tempers flame.',
      'Confess aloud with vulnerable truth the quirk or flaw thou holdest dear—',
      'The messy, imperfect grace in thy beloved that draws thy spirit near.',
      'When honest fondness names the flaw and loves them all the more,',
      'The Twin Flame wakes upon thy blade and meteor-cinders pour.',
    ]),
    unlocksStage: 2,
  }),
  3: Object.freeze({
    stage: 3,
    stoneId: 'stone_grove',
    title: 'Third Stele — The Blossom-Wreathed Stele of the Sovereign Tempest',
    subtitle: 'Set beneath ancient wisteria where sky-lightning gathers',
    lines: Object.freeze([
      'Fair-weather vows are summer chaff that scatter when the thunder rolls;',
      'Anyone may whisper sweet when sunlit meadows warm their souls.',
      'But when the dark cataclysm falls and fragile breath is nearly spent,',
      'Who stands unshaken in the gale until the iron sky is rent?',
      'Swear now before the lightning’s eye the storm-vow thou shalt keep:',
      'What burden thou wilt shield or bear when shadows gather deep.',
      'Pledge steadfast devotion through the tempest for the one beside thy heart,',
      'And Sovereign Thunder from the heavens shall tear the night apart.',
    ]),
    unlocksStage: 3,
  }),
});

export function resolveSequentialScriptureStage(query = {}) {
  if (typeof query === 'number' && Number.isFinite(query)) {
    return Math.max(1, Math.min(3, Math.floor(query)));
  }
  if (typeof query === 'string') {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === '1' || trimmed === 'stone_plaza' || trimmed === 'plaza') return 1;
    if (trimmed === '2' || trimmed === 'stone_pier' || trimmed === 'pier') return 2;
    if (trimmed === '3' || trimmed === 'stone_grove' || trimmed === 'grove') return 3;
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
      DEFAULT_SECRET_ALIASES.join(',')
  );

  const aliases = rawAliases
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (rawName && !aliases.includes(rawName.toLowerCase())) {
    aliases.unshift(rawName.toLowerCase());
  }

  return {
    secretName: rawName || DEFAULT_SECRET_NAME,
    aliases,
    stage2Keywords: [
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
      'storm',
      'tempest',
      'thunder',
      'lightning',
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
