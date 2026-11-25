// ============================================================================
// world/src/net/room-progression.js
//
// Wave 3 & 4 Co-Op Room Phrase Generator, Invite Link Builder & Per-Stone
// Bitmask Progression State Machine (`stonesSolvedMask` 0b000..0b111) for Amarante:
// - Poetic romantic room phrases ("Rain on warm limestone", "Love is curiosity", etc.)
// - Canonical room code normalization & `?room=` URL builder
// - Integrated 3 Sacred Inscription Monument Coordinates:
//   * Stone 1 (`site1_well`, `stage: 1`): `x: 0.0, z: 0.0, radius: 6.5` (Village Well)
//   * Stone 2 (`site2_platform`, `stage: 2`): `x: 44.0, z: 16.0, radius: 6.5` (Whispering Grove Circular Platform)
//   * Stone 3 (`site3_wall`, `stage: 3`): `x: -21.6, z: 20.4, radius: 6.5` (Hidden Lovers' Wall behind Secluded Cottage)
// - Out-of-Order Safe Progression Rule (`1 -> 3 -> 2` Safe, `unlockedStage = stonesSolvedCount`):
//   * Solving Stone 1 (`stone1Solved = true`) unlocks Stage 1 (`Ice [E]`) + Mode A Field Heal.
//   * Once `stone1Solved === true`, solving whichever remaining stone the couple visits
//     second (`Stone 2` OR `Stone 3`, `stonesSolvedCount === 2`) unlocks Stage 2
//     (`Fire [E]` + `[Tab]` Switcher)—never skipping Fire or unlocking Fire+Ice Q before Fire exists!
//   * Solving the third and final stone (`stonesSolvedMask === 0b111`, `stonesSolvedCount === 3`)
//     unlocks Stage 3 (`[Q]` Ultimates + Mode B Full Eclipse Main Divine Blessing).
// ============================================================================

export const ROMANTIC_ROOM_PHRASES = Object.freeze([
  'Love is curiosity',
  'Rain on warm limestone',
  'Two lanterns under wisteria',
  'Snowmelt in the orchard',
  'Wild clover at dusk',
  'Petals on still water',
]);

export const SACRED_INSCRIPTION_STONES = Object.freeze([
  Object.freeze({
    id: 'site1_well',
    siteId: 'site1_well',
    legacyId: 'stone_plaza',
    stage: 1,
    index: 1,
    name: 'Sacred Well of the Town Plaza',
    zone: 'plaza',
    elementHint: 'ice',
    x: 0.0,
    z: 0.0,
    radius: 6.5,
    position: Object.freeze({ x: 0.0, z: 0.0 }),
    aliases: Object.freeze(['site1_well', 'site1', 'stone_plaza', 'plaza', 'well', '1']),
  }),
  Object.freeze({
    id: 'site2_platform',
    siteId: 'site2_platform',
    legacyId: 'stone_grove',
    stage: 2,
    index: 2,
    name: 'Whispering Grove Circular Platform',
    zone: 'grove',
    elementHint: 'fire',
    x: 142.0,
    z: 44.0,
    radius: 6.5,
    position: Object.freeze({ x: 142.0, z: 44.0 }),
    aliases: Object.freeze(['site2_platform', 'site2', 'stone_grove', 'grove', 'platform', 'wisteria', '2']),
  }),
  Object.freeze({
    id: 'site3_wall',
    siteId: 'site3_wall',
    legacyId: 'stone_pier',
    stage: 3,
    index: 3,
    name: "Hidden Lovers' Wall Sanctuary",
    zone: 'wall',
    elementHint: 'ultimate',
    x: -124.0,
    z: 84.0,
    radius: 6.5,
    position: Object.freeze({ x: -124.0, z: 84.0 }),
    aliases: Object.freeze(['site3_wall', 'site3', 'stone_pier', 'pier', 'wall', 'cottage', '3']),
  }),
]);

export const STAGE_ABILITY_UNLOCKS = Object.freeze({
  0: Object.freeze({
    stage: 0,
    title: 'Unawakened Mortal',
    unlockedControls: Object.freeze(['attack', 'evade', 'jump']),
    knight: Object.freeze({
      eSkill: null,
      eSkillName: null,
      iceSword: false,
      fireSword: false,
      tabToggle: false,
      qUltimate: null,
      qUltimateName: null,
      abilities: Object.freeze([
        'Sword 4-Hit Combo',
        'Hold: Frontal Shield Block',
      ]),
    }),
    mage: Object.freeze({
      eSkill: null,
      eSkillName: null,
      frostLance: false,
      cinderFall: false,
      tabToggle: false,
      qUltimate: null,
      qUltimateName: null,
      abilities: Object.freeze([
        'Arcane 3-Bolt Combo',
        'Hold: Parabolic Shatterlance',
      ]),
    }),
  }),
  1: Object.freeze({
    stage: 1,
    title: 'First Awakening — Rime Covenant',
    unlockedControls: Object.freeze(['attack', 'evade', 'jump', 'commune', 'skillE']),
    knight: Object.freeze({
      eSkill: 'ice_sword',
      eSkillName: 'Ice Sword',
      iceSword: true,
      fireSword: false,
      tabToggle: false,
      qUltimate: null,
      qUltimateName: null,
      abilities: Object.freeze([
        'Sword 4-Hit Combo',
        'Hold: Frontal Shield Block',
        'E: Ice Sword (13s active / 18s cooldown — slows enemy speed, attack & damage)',
      ]),
    }),
    mage: Object.freeze({
      eSkill: 'frost_lance',
      eSkillName: 'Frost Lance',
      frostLance: true,
      cinderFall: false,
      tabToggle: false,
      qUltimate: null,
      qUltimateName: null,
      abilities: Object.freeze([
        'Arcane 3-Bolt Combo',
        'Hold: Parabolic Shatterlance',
        'Hold/Release E: Frost Lance (14.5m ice spear line, 7.5s cooldown)',
      ]),
    }),
  }),
  2: Object.freeze({
    stage: 2,
    title: 'Second Awakening — Twin Flame',
    unlockedControls: Object.freeze([
      'attack',
      'evade',
      'jump',
      'commune',
      'skillE',
      'tabToggle',
    ]),
    knight: Object.freeze({
      eSkill: 'fire_and_ice_sword',
      eSkillName: 'Fire Sword & Ice Sword',
      iceSword: true,
      fireSword: true,
      tabToggle: true,
      qUltimate: null,
      qUltimateName: null,
      abilities: Object.freeze([
        'Sword 4-Hit Combo',
        'Hold: Frontal Shield Block',
        'Tab: Toggle Ice / Fire Element',
        'E: Fire Sword (persistent burn) & Ice Sword (glacial slow)',
      ]),
    }),
    mage: Object.freeze({
      eSkill: 'cinder_fall_and_frost_lance',
      eSkillName: 'Cinder Fall & Frost Lance',
      frostLance: true,
      cinderFall: true,
      tabToggle: true,
      qUltimate: null,
      qUltimateName: null,
      abilities: Object.freeze([
        'Arcane 3-Bolt Combo',
        'Hold: Parabolic Shatterlance',
        'Tab: Toggle Frost Lance / Cinder Fall',
        'Hold/Release E: Cinder Fall (3..16m aimed meteor) & Frost Lance',
      ]),
    }),
  }),
  3: Object.freeze({
    stage: 3,
    title: 'Third Awakening — Sovereign Tempest',
    unlockedControls: Object.freeze([
      'attack',
      'evade',
      'jump',
      'commune',
      'skillE',
      'tabToggle',
      'ultimateQ',
    ]),
    knight: Object.freeze({
      eSkill: 'fire_and_ice_sword',
      eSkillName: 'Fire Sword & Ice Sword',
      iceSword: true,
      fireSword: true,
      tabToggle: true,
      qUltimate: 'sky_lightning_awakening',
      qUltimateName: 'Sun & Tide Combined Breathing',
      abilities: Object.freeze([
        'Sword 4-Hit Combo',
        'Hold: Frontal Shield Block',
        'Tab: Toggle Ice / Fire Element',
        'E: Fire Sword & Ice Sword',
        'Q: Sun & Tide Twin-Element Blade (12s 2x double damage + dual Rime & Solar marks)',
      ]),
    }),
    mage: Object.freeze({
      eSkill: 'cinder_fall_and_frost_lance',
      eSkillName: 'Cinder Fall & Frost Lance',
      frostLance: true,
      cinderFall: true,
      tabToggle: true,
      qUltimate: 'storm_cataclysm',
      qUltimateName: 'Starfall Meteor Cataclysm',
      abilities: Object.freeze([
        'Arcane 3-Bolt Combo',
        'Hold: Parabolic Shatterlance',
        'Tab: Toggle Frost Lance / Cinder Fall',
        'Hold/Release E: Cinder Fall & Frost Lance',
        'Q: Starfall Meteor Shower (6s 10-meteor sky bombardment)',
      ]),
    }),
  }),
});

/**
 * Generates a human-memorable romantic room phrase.
 */
export function generateRoomPhrase(indexOrRng = null) {
  const count = ROMANTIC_ROOM_PHRASES.length;
  if (typeof indexOrRng === 'number' && Number.isFinite(indexOrRng)) {
    const idx = ((Math.floor(indexOrRng) % count) + count) % count;
    return ROMANTIC_ROOM_PHRASES[idx];
  }
  if (typeof indexOrRng === 'function') {
    const r = Number(indexOrRng());
    const idx = Math.min(count - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * count)));
    return ROMANTIC_ROOM_PHRASES[idx];
  }
  const idx = Math.floor(Math.random() * count);
  return ROMANTIC_ROOM_PHRASES[idx];
}

/**
 * Normalizes a human-memorable romantic phrase or short code into a canonical
 * URL-safe room code (e.g. `"Love is curiosity"` -> `"LOVE-IS-CURIOSITY"`,
 * `"LOVE"` -> `"LOVE"`).
 */
export function normalizeRoomPhraseToCode(rawPhraseOrCode) {
  const str = String(rawPhraseOrCode ?? '').trim();
  if (!str) return 'LOVE';
  const cleaned = str
    .toUpperCase()
    .replace(/['’`]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return cleaned || 'LOVE';
}

/**
 * Formats a normalized room code back into a readable display phrase if it
 * matches one of the romantic phrases or contains hyphenated words.
 */
export function formatRoomCodeToPhrase(codeOrPhrase) {
  const norm = normalizeRoomPhraseToCode(codeOrPhrase);
  for (const phrase of ROMANTIC_ROOM_PHRASES) {
    if (normalizeRoomPhraseToCode(phrase) === norm) {
      return phrase;
    }
  }
  if (norm.includes('-')) {
    const lower = norm.toLowerCase().replace(/-/g, ' ');
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return norm;
}

/**
 * Builds a shareable `?room=` invite URL from a room phrase or code.
 */
export function buildRoomInviteLink(
  phraseOrCode,
  baseUrl = typeof window !== 'undefined' && window.location?.href
    ? window.location.href
    : 'https://amarante-coop.workers.dev/world/index.html'
) {
  const code = normalizeRoomPhraseToCode(phraseOrCode);
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('room', code);
    return url.toString();
  } catch {
    return `https://amarante-coop.workers.dev/world/index.html?room=${encodeURIComponent(code)}`;
  }
}

/**
 * Extracts and normalizes the `?room=` parameter from a URL or query string.
 */
export function parseRoomFromUrl(urlOrSearch, fallback = 'LOVE') {
  if (!urlOrSearch) return normalizeRoomPhraseToCode(fallback);
  try {
    const str = String(urlOrSearch);
    const search = str.includes('?') ? str.slice(str.indexOf('?')) : str;
    const params = new URLSearchParams(search);
    const fromParam = params.get('room');
    if (fromParam) {
      return normalizeRoomPhraseToCode(fromParam);
    }
  } catch {
    // fallback below
  }
  return normalizeRoomPhraseToCode(fallback);
}

/**
 * Resolves any stone identifier (`'site1_well'`, `'site2_platform'`, `'site3_wall'`,
 * `'stone_plaza'`, `'stone_grove'`, `'stone_pier'`, `1`, `2`, `3`, `'well'`, `'grove'`, `'wall'`)
 * to the canonical stone metadata.
 */
export function resolveInscriptionStone(stoneIdOrIndex) {
  if (typeof stoneIdOrIndex === 'number') {
    const byIdx = SACRED_INSCRIPTION_STONES.find((s) => s.index === stoneIdOrIndex || s.stage === stoneIdOrIndex);
    if (byIdx) return byIdx;
  }
  const raw = String(stoneIdOrIndex || 'site1_well').trim().toLowerCase();
  for (const stone of SACRED_INSCRIPTION_STONES) {
    if (
      stone.id === raw ||
      stone.siteId === raw ||
      stone.legacyId === raw ||
      stone.zone === raw ||
      String(stone.index) === raw ||
      stone.aliases.includes(raw) ||
      stone.aliases.some((alias) => alias.length >= 4 && raw.includes(alias))
    ) {
      return stone;
    }
  }
  return SACRED_INSCRIPTION_STONES[0];
}

export function findNearestInscriptionStone(x, z, maxRadius = null) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let bestStone = null;
  let bestDist = Infinity;
  for (const stone of SACRED_INSCRIPTION_STONES) {
    const d = Math.hypot(x - stone.x, z - stone.z);
    const limit = maxRadius !== null && maxRadius !== undefined ? maxRadius : stone.radius;
    if (d <= limit && d < bestDist) {
      bestDist = d;
      bestStone = stone;
    }
  }
  return bestStone ? { stone: bestStone, distance: bestDist } : null;
}

export function computeStonesBitmask({
  stone1Solved = false,
  stone2Solved = false,
  stone3Solved = false,
} = {}) {
  return (stone1Solved ? 1 : 0) | (stone2Solved ? 2 : 0) | (stone3Solved ? 4 : 0);
}

export function computeStonesSolvedCount({
  stone1Solved = false,
  stone2Solved = false,
  stone3Solved = false,
} = {}) {
  return (stone1Solved ? 1 : 0) + (stone2Solved ? 1 : 0) + (stone3Solved ? 1 : 0);
}

export function getAbilityUnlocksForStage(
  stage = 0,
  communeDiscovered = false,
  explicitUnlocks = null
) {
  const clampedStage = Math.max(0, Math.min(3, Math.floor(Number(stage) || 0)));
  const iceUnlocked =
    typeof explicitUnlocks?.iceUnlocked === 'boolean'
      ? explicitUnlocks.iceUnlocked
      : clampedStage >= 1;
  const fireUnlocked =
    typeof explicitUnlocks?.fireUnlocked === 'boolean'
      ? explicitUnlocks.fireUnlocked
      : clampedStage >= 2;
  const ultimateUnlocked =
    typeof explicitUnlocks?.ultimateUnlocked === 'boolean'
      ? explicitUnlocks.ultimateUnlocked
      : clampedStage >= 3;

  const bothElements = Boolean(iceUnlocked && fireUnlocked);
  const anyElement = Boolean(iceUnlocked || fireUnlocked);
  const effectiveStage = ultimateUnlocked
    ? 3
    : bothElements
      ? 2
      : anyElement
        ? 1
        : clampedStage;

  const spec = STAGE_ABILITY_UNLOCKS[effectiveStage] || STAGE_ABILITY_UNLOCKS[0];
  const hasCommune = Boolean(communeDiscovered || anyElement || ultimateUnlocked || clampedStage >= 1);

  const knightESkill = bothElements
    ? 'fire_and_ice_sword'
    : fireUnlocked
      ? 'fire_sword'
      : iceUnlocked
        ? 'ice_sword'
        : null;
  const knightESkillName = bothElements
    ? 'Fire Sword & Ice Sword'
    : fireUnlocked
      ? 'Fire Sword'
      : iceUnlocked
        ? 'Ice Sword'
        : null;
  const mageESkill = bothElements
    ? 'cinder_fall_and_frost_lance'
    : fireUnlocked
      ? 'cinder_fall'
      : iceUnlocked
        ? 'frost_lance'
        : null;
  const mageESkillName = bothElements
    ? 'Cinder Fall & Frost Lance'
    : fireUnlocked
      ? 'Cinder Fall'
      : iceUnlocked
        ? 'Frost Lance'
        : null;

  return {
    stage: effectiveStage,
    title: spec.title,
    communeUnlocked: hasCommune,
    iceUnlocked,
    fireUnlocked,
    ultimateUnlocked,
    skillEUnlocked: anyElement,
    iceEUnlocked: iceUnlocked,
    fireEUnlocked: fireUnlocked,
    tabToggleUnlocked: bothElements,
    ultimateQUnlocked: ultimateUnlocked,
    activeElement: fireUnlocked && !iceUnlocked ? 'fire' : 'ice',
    showTutorialPopups: false,
    knight: {
      ...spec.knight,
      eSkill: knightESkill,
      eSkillName: knightESkillName,
      iceSword: iceUnlocked,
      fireSword: fireUnlocked,
      tabToggle: bothElements,
      qUltimate: ultimateUnlocked ? 'sky_lightning_awakening' : null,
      qUltimateName: ultimateUnlocked ? 'Sky-Lightning Awakening' : null,
      abilities: [...spec.knight.abilities],
    },
    mage: {
      ...spec.mage,
      eSkill: mageESkill,
      eSkillName: mageESkillName,
      frostLance: iceUnlocked,
      cinderFall: fireUnlocked,
      tabToggle: bothElements,
      qUltimate: ultimateUnlocked ? 'storm_cataclysm' : null,
      qUltimateName: ultimateUnlocked ? 'Storm Cataclysm' : null,
      abilities: [...spec.mage.abilities],
    },
  };
}

/**
 * Creates the Sacred Inscription Stone Progression state machine supporting
 * per-stone bitmask tracking (`stone1Solved`, `stone2Solved`, `stone3Solved`,
 * `stonesSolvedMask = 0b000..0b111`, `stonesSolvedCount = 0..3`) and the
 * Out-of-Order Progression Rule (`1 -> 3 -> 2` Safe: `unlockedStage = stonesSolvedCount`):
 * - Solving Stone 1 (`site1_well`, `(0, 0)`) unlocks Stage 1 (`Ice [E]`) + Mode A Field Heal.
 * - Solving whichever remaining stone the couple visits second (`Stone 2` OR `Stone 3`,
 *   so `stonesSolvedCount === 2`) unlocks Stage 2 (`Fire [E]` + `[Tab]` Switcher),
 *   so visiting Stone 3 before Stone 2 NEVER skips Fire or unlocks Fire+Ice Q before Fire exists!
 * - Solving the 3rd and final stone (`stonesSolvedMask === 0b111`, `stonesSolvedCount === 3`)
 *   unlocks Stage 3 (`[Q]` Ultimates + Mode B Full Eclipse Main Divine Blessing).
 */
export function createRoomProgressionState(initial = {}) {
  const initMask = Number.isFinite(Number(initial.stonesSolvedMask))
    ? Math.max(0, Math.min(7, Math.floor(Number(initial.stonesSolvedMask))))
    : null;

  const initStage = Math.max(
    0,
    Math.min(
      3,
      Math.floor(
        Number(
          initial.unlockedStage ??
            initial.stonesSolvedCount ??
            initial.stonesSolved ??
            0
        ) || 0
      )
    )
  );

  let stone1Solved =
    typeof initial.stone1Solved === 'boolean'
      ? initial.stone1Solved
      : initMask !== null
        ? Boolean(initMask & 1)
        : initStage >= 1 || Boolean(initial.trueNameDiscovered);
  let stone2Solved =
    typeof initial.stone2Solved === 'boolean'
      ? initial.stone2Solved
      : initMask !== null
        ? Boolean(initMask & 2)
        : initStage >= 2;
  let stone3Solved =
    typeof initial.stone3Solved === 'boolean'
      ? initial.stone3Solved
      : initMask !== null
        ? Boolean(initMask & 4)
        : initStage >= 3;

  let stonesSolvedMask = computeStonesBitmask({ stone1Solved, stone2Solved, stone3Solved });
  let stonesSolvedCount = computeStonesSolvedCount({ stone1Solved, stone2Solved, stone3Solved });
  let stonesSolved = Math.max(initStage, stonesSolvedCount);
  let unlockedStage = stonesSolved;
  let trueNameDiscovered = Boolean(
    initial.trueNameDiscovered || stone1Solved || unlockedStage >= 1
  );

  let iceUnlocked =
    typeof initial.iceUnlocked === 'boolean' ? initial.iceUnlocked : unlockedStage >= 1;
  let fireUnlocked =
    typeof initial.fireUnlocked === 'boolean' ? initial.fireUnlocked : unlockedStage >= 2;
  let ultimateUnlocked =
    typeof initial.ultimateUnlocked === 'boolean' ? initial.ultimateUnlocked : unlockedStage >= 3;

  let communeDiscovered = Boolean(
    initial.communeDiscovered ||
      trueNameDiscovered ||
      stone1Solved ||
      stone2Solved ||
      stone3Solved ||
      iceUnlocked ||
      fireUnlocked ||
      ultimateUnlocked ||
      unlockedStage >= 1
  );

  const stonesReadSet = new Set(
    Array.isArray(initial.stonesRead)
      ? initial.stonesRead.map((s) => resolveInscriptionStone(s).id)
      : []
  );
  if (stonesReadSet.size > 0) {
    communeDiscovered = true;
  }
  let lastReadStoneId = initial.lastReadStoneId
    ? resolveInscriptionStone(initial.lastReadStoneId).id
    : null;

  function syncFromStoneFlags() {
    stonesSolvedMask = computeStonesBitmask({ stone1Solved, stone2Solved, stone3Solved });
    stonesSolvedCount = computeStonesSolvedCount({ stone1Solved, stone2Solved, stone3Solved });
    if (stone1Solved) {
      trueNameDiscovered = true;
      communeDiscovered = true;
    }
    // Out-of-Order Progression Rule (`unlockedStage = stonesSolvedCount`):
    // 1st stone -> Stage 1 (Ice [E])
    // 2nd stone (Stone 2 OR Stone 3) -> Stage 2 (Fire [E] + [Tab] Switcher)
    // 3rd stone (0b111) -> Stage 3 ([Q] Ultimates + Mode B Divine Miracle)
    stonesSolved = stonesSolvedCount;
    unlockedStage = stonesSolvedCount;
    iceUnlocked = stonesSolvedCount >= 1;
    fireUnlocked = stonesSolvedCount >= 2;
    ultimateUnlocked = stonesSolvedCount >= 3;
    if (stonesSolvedCount > 0) {
      communeDiscovered = true;
    }
  }

  function recomputeStageCountsFromExplicitFlags() {
    const flagCount =
      (iceUnlocked ? 1 : 0) + (fireUnlocked ? 1 : 0) + (ultimateUnlocked ? 1 : 0);
    stonesSolvedMask = computeStonesBitmask({ stone1Solved, stone2Solved, stone3Solved });
    stonesSolvedCount = computeStonesSolvedCount({ stone1Solved, stone2Solved, stone3Solved });
    stonesSolved = Math.max(stonesSolvedCount, flagCount);
    unlockedStage = ultimateUnlocked
      ? 3
      : iceUnlocked && fireUnlocked
        ? 2
        : iceUnlocked || fireUnlocked
          ? 1
          : stonesSolvedCount;
    if (stone1Solved || unlockedStage >= 1) {
      trueNameDiscovered = true;
    }
  }

  function getNextStoneIndex() {
    if (!stone1Solved) return 1;
    if (!stone2Solved) return 2;
    if (!stone3Solved) return 3;
    return 3;
  }

  function getHudVisibility() {
    const bothElements = Boolean(iceUnlocked && fireUnlocked);
    const anyElement = Boolean(iceUnlocked || fireUnlocked);
    return {
      communeVisible: Boolean(communeDiscovered || anyElement || ultimateUnlocked || unlockedStage >= 1),
      skillEVisible: anyElement,
      tabToggleVisible: bothElements,
      ultimateQVisible: Boolean(ultimateUnlocked),
      iceUnlocked: Boolean(iceUnlocked),
      fireUnlocked: Boolean(fireUnlocked),
      ultimateUnlocked: Boolean(ultimateUnlocked),
      activeElement: fireUnlocked && !iceUnlocked ? 'fire' : 'ice',
      showTutorialPopups: false,
    };
  }

  function getState() {
    const nextStoneIndex = getNextStoneIndex();
    const unlocks = getAbilityUnlocksForStage(unlockedStage, communeDiscovered, {
      iceUnlocked,
      fireUnlocked,
      ultimateUnlocked,
    });
    return {
      unlockedStage,
      stonesSolved,
      stonesSolvedCount,
      stonesSolvedMask,
      stone1Solved: Boolean(stone1Solved),
      stone2Solved: Boolean(stone2Solved),
      stone3Solved: Boolean(stone3Solved),
      trueNameDiscovered: Boolean(trueNameDiscovered),
      communeDiscovered: Boolean(communeDiscovered),
      iceUnlocked: Boolean(iceUnlocked),
      fireUnlocked: Boolean(fireUnlocked),
      ultimateUnlocked: Boolean(ultimateUnlocked),
      modeBUnlocked: stonesSolvedMask === 0b111 && Boolean(ultimateUnlocked),
      activeElement: fireUnlocked && !iceUnlocked ? 'fire' : 'ice',
      stonesRead: Array.from(stonesReadSet),
      nextStoneIndex,
      allStonesSolved:
        stonesSolvedMask === 0b111 ||
        stonesSolved >= 3 ||
        Boolean(iceUnlocked && fireUnlocked && ultimateUnlocked),
      lastReadStoneId,
      showTutorialPopups: false,
      hudVisibility: getHudVisibility(),
      unlocks,
    };
  }

  function readInscriptionStone(stoneIdOrIndex) {
    const stone = resolveInscriptionStone(stoneIdOrIndex);
    stonesReadSet.add(stone.id);
    communeDiscovered = true;
    lastReadStoneId = stone.id;
    const sequentialRiddleStage = Math.min(3, stonesSolved + 1);
    return {
      stoneId: stone.id,
      siteId: stone.siteId,
      stoneStage: stone.stage,
      stoneName: stone.name,
      stoneZone: stone.zone,
      sequentialRiddleStage,
      nextStoneIndex: getNextStoneIndex(),
      communeDiscovered: true,
      showTutorialPopups: false,
      state: getState(),
    };
  }

  /**
   * Explicitly sets stone solved flags or element unlock flags.
   */
  function setUnlocks(patch = {}) {
    if (typeof patch.communeDiscovered === 'boolean') {
      communeDiscovered = patch.communeDiscovered;
    }
    if (typeof patch.trueNameDiscovered === 'boolean') {
      trueNameDiscovered = patch.trueNameDiscovered;
    }
    const hasStonePatch =
      typeof patch.stone1Solved === 'boolean' ||
      typeof patch.stone2Solved === 'boolean' ||
      typeof patch.stone3Solved === 'boolean' ||
      Number.isFinite(Number(patch.stonesSolvedMask));

    if (Number.isFinite(Number(patch.stonesSolvedMask))) {
      const m = Math.max(0, Math.min(7, Math.floor(Number(patch.stonesSolvedMask))));
      stone1Solved = Boolean(m & 1);
      stone2Solved = Boolean(m & 2);
      stone3Solved = Boolean(m & 4);
    }
    if (typeof patch.stone1Solved === 'boolean') stone1Solved = patch.stone1Solved;
    if (typeof patch.stone2Solved === 'boolean') stone2Solved = patch.stone2Solved;
    if (typeof patch.stone3Solved === 'boolean') stone3Solved = patch.stone3Solved;

    if (hasStonePatch) {
      syncFromStoneFlags();
    }

    const hasExplicitElementPatch =
      typeof patch.iceUnlocked === 'boolean' ||
      typeof patch.fireUnlocked === 'boolean' ||
      typeof patch.ultimateUnlocked === 'boolean';

    if (hasExplicitElementPatch) {
      if (typeof patch.iceUnlocked === 'boolean') iceUnlocked = patch.iceUnlocked;
      if (typeof patch.fireUnlocked === 'boolean') fireUnlocked = patch.fireUnlocked;
      if (typeof patch.ultimateUnlocked === 'boolean') ultimateUnlocked = patch.ultimateUnlocked;
      if (iceUnlocked && !stone1Solved && !hasStonePatch) stone1Solved = true;
      if (fireUnlocked && !stone2Solved && !stone3Solved && !hasStonePatch) stone2Solved = true;
      if (ultimateUnlocked && !stone3Solved && !hasStonePatch) stone3Solved = true;
      if (iceUnlocked || fireUnlocked || ultimateUnlocked) {
        communeDiscovered = true;
      }
      recomputeStageCountsFromExplicitFlags();
    }

    return getState();
  }

  /**
   * Solves a specific stone (`1` / `'site1_well'`, `2` / `'site2_platform'`, `3` / `'site3_wall'`)
   * using the Out-of-Order Progression Rule (`unlockedStage = stonesSolvedCount`):
   * - Solving Stone 1 (`site1_well`) sets `stone1Solved = true` -> Stage 1 (Ice [E]).
   * - Once `stone1Solved === true`, solving whichever stone is visited second
   *   (`Stone 2` OR `Stone 3`, so `stonesSolvedCount === 2`) unlocks Stage 2
   *   (`Fire [E]` + `[Tab]` Switcher) so Fire is NEVER skipped!
   * - Solving the third stone (`stonesSolvedMask === 0b111`, `stonesSolvedCount === 3`)
   *   unlocks Stage 3 (`[Q]` Ultimates + Mode B Full Eclipse Main Divine Blessing).
   * Also supports direct legacy element keywords (`'ice'`, `'fire'`, `'ultimate'`).
   */
  function solveStone(stoneIdOrKind = 'site1_well') {
    communeDiscovered = true;
    const raw =
      typeof stoneIdOrKind === 'number'
        ? String(stoneIdOrKind)
        : String(stoneIdOrKind || 'site1_well').trim().toLowerCase();

    // Check if caller passed an explicit element keyword rather than a stone ID
    const isDirectElementKeyword =
      raw === 'ice' ||
      raw === 'rime' ||
      raw === 'frost_lance' ||
      raw === 'ice_sword' ||
      raw === 'fire' ||
      raw === 'solar' ||
      raw === 'cinder' ||
      raw === 'cinder_fall' ||
      raw === 'fire_sword' ||
      raw === 'ultimate' ||
      raw === 'storm' ||
      raw === 'tempest' ||
      raw === 'q' ||
      raw === 'storm_cataclysm' ||
      raw === 'sky_lightning_awakening';

    let resolvedStone = SACRED_INSCRIPTION_STONES[0];
    let unlockedKind = 'ice';

    if (
      raw === '1' ||
      raw === 'site1_well' ||
      raw === 'site1' ||
      raw === 'stone_plaza' ||
      raw.includes('well') ||
      raw.includes('plaza')
    ) {
      resolvedStone = SACRED_INSCRIPTION_STONES[0];
      stone1Solved = true;
      syncFromStoneFlags();
      unlockedKind = unlockedStage === 3 ? 'ultimate' : unlockedStage === 2 ? 'fire' : 'ice';
    } else if (
      raw === '2' ||
      raw === 'site2_platform' ||
      raw === 'site2' ||
      raw === 'stone_grove' ||
      raw.includes('platform') ||
      raw.includes('grove') ||
      raw.includes('wisteria')
    ) {
      resolvedStone = SACRED_INSCRIPTION_STONES[1];
      stone2Solved = true;
      syncFromStoneFlags();
      unlockedKind = unlockedStage === 3 ? 'ultimate' : unlockedStage === 2 ? 'fire' : 'ice';
    } else if (
      raw === '3' ||
      raw === 'site3_wall' ||
      raw === 'site3' ||
      raw === 'stone_pier' ||
      raw.includes('wall') ||
      raw.includes('pier') ||
      raw.includes('cottage')
    ) {
      resolvedStone = SACRED_INSCRIPTION_STONES[2];
      stone3Solved = true;
      syncFromStoneFlags();
      unlockedKind = unlockedStage === 3 ? 'ultimate' : unlockedStage === 2 ? 'fire' : 'ice';
    } else if (isDirectElementKeyword) {
      if (
        raw === 'fire' ||
        raw === 'solar' ||
        raw === 'cinder' ||
        raw === 'cinder_fall' ||
        raw === 'fire_sword'
      ) {
        resolvedStone = SACRED_INSCRIPTION_STONES[1];
        stone2Solved = true;
        fireUnlocked = true;
        unlockedKind = 'fire';
      } else if (
        raw === 'ultimate' ||
        raw === 'storm' ||
        raw === 'tempest' ||
        raw === 'q' ||
        raw === 'storm_cataclysm' ||
        raw === 'sky_lightning_awakening'
      ) {
        resolvedStone = SACRED_INSCRIPTION_STONES[2];
        stone3Solved = true;
        ultimateUnlocked = true;
        unlockedKind = 'ultimate';
      } else {
        resolvedStone = SACRED_INSCRIPTION_STONES[0];
        stone1Solved = true;
        iceUnlocked = true;
        unlockedKind = 'ice';
      }
      recomputeStageCountsFromExplicitFlags();
    } else {
      resolvedStone = SACRED_INSCRIPTION_STONES[0];
      stone1Solved = true;
      syncFromStoneFlags();
      unlockedKind = 'ice';
    }

    stonesReadSet.add(resolvedStone.id);
    lastReadStoneId = resolvedStone.id;
    const snapshot = getState();
    return {
      advanced: true,
      stoneId: resolvedStone.id,
      solvedStoneId: resolvedStone.id,
      solvedStoneNumber: resolvedStone.stage,
      unlockedKind,
      stone1Solved: Boolean(stone1Solved),
      stone2Solved: Boolean(stone2Solved),
      stone3Solved: Boolean(stone3Solved),
      stonesSolvedMask,
      stonesSolvedCount,
      trueNameDiscovered: Boolean(trueNameDiscovered),
      iceUnlocked: Boolean(iceUnlocked),
      fireUnlocked: Boolean(fireUnlocked),
      ultimateUnlocked: Boolean(ultimateUnlocked),
      communeDiscovered: Boolean(communeDiscovered),
      stage: unlockedStage,
      unlockedStage,
      knightUnlock: snapshot.unlocks.knight,
      mageUnlock: snapshot.unlocks.mage,
      hudVisibility: snapshot.hudVisibility,
      showTutorialPopups: false,
      state: snapshot,
    };
  }

  function solveStoneByElement(elementOrKind = 'ice') {
    return solveStone(elementOrKind);
  }

  /**
   * Advances progression by solving the next unsolved stone (`0 -> 1 -> 2 -> 3`).
   */
  function solveNextStone(requestedStage = null) {
    communeDiscovered = true;
    const expectedNext = stonesSolved + 1;
    if (stonesSolved >= 3) {
      return {
        advanced: false,
        stage: 3,
        stonesSolvedMask,
        stonesSolvedCount,
        state: getState(),
      };
    }
    if (
      requestedStage !== null &&
      requestedStage !== undefined &&
      Number(requestedStage) !== expectedNext
    ) {
      return {
        advanced: false,
        stage: unlockedStage,
        expectedStage: expectedNext,
        stonesSolvedMask,
        stonesSolvedCount,
        state: getState(),
      };
    }

    let solvedStone = SACRED_INSCRIPTION_STONES[0];
    if (!stone1Solved) {
      stone1Solved = true;
      solvedStone = SACRED_INSCRIPTION_STONES[0];
    } else if (!stone2Solved) {
      stone2Solved = true;
      solvedStone = SACRED_INSCRIPTION_STONES[1];
    } else if (!stone3Solved) {
      stone3Solved = true;
      solvedStone = SACRED_INSCRIPTION_STONES[2];
    }

    syncFromStoneFlags();
    stonesReadSet.add(solvedStone.id);
    lastReadStoneId = solvedStone.id;

    const snapshot = getState();
    return {
      advanced: true,
      stage: unlockedStage,
      unlockedStage,
      solvedStoneId: solvedStone.id,
      solvedStoneNumber: solvedStone.stage,
      stonesSolvedMask,
      stonesSolvedCount,
      stone1Solved: Boolean(stone1Solved),
      stone2Solved: Boolean(stone2Solved),
      stone3Solved: Boolean(stone3Solved),
      knightUnlock: snapshot.unlocks.knight,
      mageUnlock: snapshot.unlocks.mage,
      hudVisibility: snapshot.hudVisibility,
      showTutorialPopups: false,
      state: snapshot,
    };
  }

  function applyVerdictProgression(verdictObj) {
    if (!verdictObj || typeof verdictObj !== 'object') return getState();
    if (typeof verdictObj.communeDiscovered === 'boolean') {
      communeDiscovered = verdictObj.communeDiscovered;
    }
    if (typeof verdictObj.trueNameDiscovered === 'boolean' && verdictObj.trueNameDiscovered) {
      trueNameDiscovered = true;
    }
    if (verdictObj.spoke_true_name) {
      trueNameDiscovered = true;
    }

    if (Number.isFinite(Number(verdictObj.stonesSolvedMask))) {
      const m = Math.max(0, Math.min(7, Math.floor(Number(verdictObj.stonesSolvedMask))));
      stone1Solved = Boolean(stone1Solved || (m & 1));
      stone2Solved = Boolean(stone2Solved || (m & 2));
      stone3Solved = Boolean(stone3Solved || (m & 4));
      syncFromStoneFlags();
      return getState();
    }

    const explicitStone =
      verdictObj.stoneSolvedId ||
      verdictObj.solvedStoneId ||
      verdictObj.solvedStoneNumber ||
      verdictObj.stoneId ||
      verdictObj.stone;
    if (explicitStone) {
      solveStone(explicitStone);
      return getState();
    }

    const explicitElement =
      verdictObj.unlockedElement ||
      verdictObj.element ||
      verdictObj.riddleKind;
    if (explicitElement) {
      solveStone(explicitElement);
      return getState();
    }

    if (typeof verdictObj.iceUnlocked === 'boolean') iceUnlocked = verdictObj.iceUnlocked;
    if (typeof verdictObj.fireUnlocked === 'boolean') fireUnlocked = verdictObj.fireUnlocked;
    if (typeof verdictObj.ultimateUnlocked === 'boolean') {
      ultimateUnlocked = verdictObj.ultimateUnlocked;
    }

    const awakenedStage = Number(verdictObj.awakenedStage || 0);
    if (verdictObj.verdict === 'awakening' || awakenedStage > unlockedStage) {
      solveNextStone(stonesSolved + 1);
      return getState();
    }

    recomputeStageCountsFromExplicitFlags();
    return getState();
  }

  function syncFromRemote(remote = {}) {
    if (!remote || typeof remote !== 'object') return getState();
    if (Array.isArray(remote.stonesRead)) {
      for (const s of remote.stonesRead) {
        stonesReadSet.add(resolveInscriptionStone(s).id);
      }
    }
    if (remote.communeDiscovered || stonesReadSet.size > 0) {
      communeDiscovered = true;
    }
    if (remote.trueNameDiscovered) {
      trueNameDiscovered = true;
    }
    if (typeof remote.lastReadStoneId === 'string' && remote.lastReadStoneId) {
      lastReadStoneId = resolveInscriptionStone(remote.lastReadStoneId).id;
    }

    const hasRemoteMask = Number.isFinite(Number(remote.stonesSolvedMask));
    const hasRemoteStoneFlags =
      typeof remote.stone1Solved === 'boolean' ||
      typeof remote.stone2Solved === 'boolean' ||
      typeof remote.stone3Solved === 'boolean';

    if (hasRemoteMask) {
      const m = Math.max(0, Math.min(7, Math.floor(Number(remote.stonesSolvedMask))));
      stone1Solved = Boolean(stone1Solved || (m & 1));
      stone2Solved = Boolean(stone2Solved || (m & 2));
      stone3Solved = Boolean(stone3Solved || (m & 4));
    }
    if (typeof remote.stone1Solved === 'boolean') {
      stone1Solved = Boolean(stone1Solved || remote.stone1Solved);
    }
    if (typeof remote.stone2Solved === 'boolean') {
      stone2Solved = Boolean(stone2Solved || remote.stone2Solved);
    }
    if (typeof remote.stone3Solved === 'boolean') {
      stone3Solved = Boolean(stone3Solved || remote.stone3Solved);
    }

    if (hasRemoteMask || hasRemoteStoneFlags) {
      syncFromStoneFlags();
      return getState();
    }

    const remoteStage = Math.max(
      0,
      Math.min(
        3,
        Math.floor(
          Number(
            remote.unlockedStage ??
              remote.stonesSolvedCount ??
              remote.stonesSolved ??
              0
          ) || 0
        )
      )
    );
    if (remoteStage > unlockedStage) {
      if (remoteStage >= 1) stone1Solved = true;
      if (remoteStage >= 2) stone2Solved = true;
      if (remoteStage >= 3) stone3Solved = true;
      syncFromStoneFlags();
    }

    if (typeof remote.iceUnlocked === 'boolean') iceUnlocked = remote.iceUnlocked;
    if (typeof remote.fireUnlocked === 'boolean') fireUnlocked = remote.fireUnlocked;
    if (typeof remote.ultimateUnlocked === 'boolean') ultimateUnlocked = remote.ultimateUnlocked;
    recomputeStageCountsFromExplicitFlags();
    return getState();
  }

  function reset() {
    stone1Solved = false;
    stone2Solved = false;
    stone3Solved = false;
    stonesSolvedMask = 0;
    stonesSolvedCount = 0;
    unlockedStage = 0;
    stonesSolved = 0;
    trueNameDiscovered = false;
    iceUnlocked = false;
    fireUnlocked = false;
    ultimateUnlocked = false;
    communeDiscovered = false;
    stonesReadSet.clear();
    lastReadStoneId = null;
    return getState();
  }

  return {
    getState,
    getHudVisibility,
    readInscriptionStone,
    solveStone,
    solveStoneByElement,
    solveNextStone,
    setUnlocks,
    applyVerdictProgression,
    syncFromRemote,
    reset,
  };
}

export const createRoomProgressionStateMachine = createRoomProgressionState;
