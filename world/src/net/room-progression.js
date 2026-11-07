// ============================================================================
// world/src/net/room-progression.js
//
// Wave 3 & 4 Co-Op Room Phrase Generator, Invite Link Builder & Non-Linear /
// Sequential 3-Stone Progression State Machine for Amarante:
// - Poetic romantic room phrases ("Rain on warm limestone", "Love is curiosity", etc.)
// - Canonical room code normalization & `?room=` URL builder
// - Non-Linear & Sequential Sacred Inscription Stone Progression:
//   * Supports `{ iceUnlocked, fireUnlocked, ultimateUnlocked }` so solving
//     Fire first unlocks `[E]` as Fire (`tabToggleVisible: false`), solving
//     Ice first unlocks `[E]` as Ice (`tabToggleVisible: false`), and `[Tab]`
//     only appears when BOTH `iceUnlocked` AND `fireUnlocked` are true!
//   * Also maintains full backwards compatibility with sequential `0 -> 1 -> 2 -> 3`
//     (`solveNextStone()`) for existing room tests.
//   * Zero hand-holding tutorial popups (`showTutorialPopups: false`).
// ============================================================================

export const ROMANTIC_ROOM_PHRASES = Object.freeze([
  'Rain on warm limestone',
  'Two lanterns under wisteria',
  'Snowmelt in the orchard',
  'Wild clover at dusk',
  'Petals on still water',
  'Love is curiosity',
]);

export const SACRED_INSCRIPTION_STONES = Object.freeze([
  {
    id: 'stone_plaza',
    index: 1,
    name: 'Weathered Stele of the Town Plaza',
    zone: 'plaza',
    elementHint: 'ultimate',
    position: { x: 0, z: -14 },
  },
  {
    id: 'stone_pier',
    index: 2,
    name: 'Mist-Carved Stele of the Lakeside Pier',
    zone: 'pier',
    elementHint: 'ice',
    position: { x: -42, z: 18 },
  },
  {
    id: 'stone_grove',
    index: 3,
    name: 'Blossom-Wreathed Stele of the Wisteria Grove',
    zone: 'grove',
    elementHint: 'fire',
    position: { x: 44, z: 16 },
  },
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
        'Hold: Stationary Shatterlance (max 3 consecutive)',
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
        'Hold: Stationary Shatterlance',
        'Hold/Release E: Frost Lance (14.5m ice spear line, 8.5s cooldown)',
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
        'Hold: Stationary Shatterlance',
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
      qUltimateName: 'Sky-Lightning Awakening',
      abilities: Object.freeze([
        'Sword 4-Hit Combo',
        'Hold: Frontal Shield Block',
        'Tab: Toggle Ice / Fire Element',
        'E: Fire Sword & Ice Sword',
        'Q: Sky-Lightning Awakening (sword-raise lightning strike + 10s 2x double damage)',
      ]),
    }),
    mage: Object.freeze({
      eSkill: 'cinder_fall_and_frost_lance',
      eSkillName: 'Cinder Fall & Frost Lance',
      frostLance: true,
      cinderFall: true,
      tabToggle: true,
      qUltimate: 'storm_cataclysm',
      qUltimateName: 'Storm Cataclysm',
      abilities: Object.freeze([
        'Arcane 3-Bolt Combo',
        'Hold: Stationary Shatterlance',
        'Tab: Toggle Frost Lance / Cinder Fall',
        'Hold/Release E: Cinder Fall & Frost Lance',
        'Q: Storm Cataclysm (6s stationary devastating tempest — Knight must protect)',
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
 * Resolves any stone identifier (`'stone_plaza'`, `'stone_pier'`, `'stone_grove'`,
 * `1`, `2`, `3`, `'plaza'`, `'pier'`, `'grove'`) to the canonical stone metadata.
 */
export function resolveInscriptionStone(stoneIdOrIndex) {
  if (typeof stoneIdOrIndex === 'number') {
    const byIdx = SACRED_INSCRIPTION_STONES.find((s) => s.index === stoneIdOrIndex);
    if (byIdx) return byIdx;
  }
  const raw = String(stoneIdOrIndex || 'stone_plaza').trim().toLowerCase();
  for (const stone of SACRED_INSCRIPTION_STONES) {
    if (
      stone.id === raw ||
      stone.zone === raw ||
      String(stone.index) === raw ||
      raw.includes(stone.zone)
    ) {
      return stone;
    }
  }
  return SACRED_INSCRIPTION_STONES[0];
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
 * BOTH non-linear unlocks (`{ iceUnlocked, fireUnlocked, ultimateUnlocked }`)
 * and sequential stage progression (`0 -> 1 -> 2 -> 3`):
 * - Solving `stone_pier` (`(-42, 18)`) or an Ice riddle unlocks `iceUnlocked = true`.
 * - Solving `stone_grove` (`(44, 16)`) or a Fire riddle unlocks `fireUnlocked = true`.
 * - Solving `stone_plaza` (`(0, -14)`) or the Sovereign riddle unlocks `ultimateUnlocked = true`.
 */
export function createRoomProgressionState(initial = {}) {
  let unlockedStage = Math.max(
    0,
    Math.min(3, Math.floor(Number(initial.unlockedStage ?? initial.stonesSolved ?? 0) || 0))
  );
  let stonesSolved = Math.max(
    unlockedStage,
    Math.min(3, Math.floor(Number(initial.stonesSolved ?? unlockedStage) || 0))
  );
  unlockedStage = stonesSolved;

  let iceUnlocked =
    typeof initial.iceUnlocked === 'boolean' ? initial.iceUnlocked : unlockedStage >= 1;
  let fireUnlocked =
    typeof initial.fireUnlocked === 'boolean' ? initial.fireUnlocked : unlockedStage >= 2;
  let ultimateUnlocked =
    typeof initial.ultimateUnlocked === 'boolean' ? initial.ultimateUnlocked : unlockedStage >= 3;

  let communeDiscovered = Boolean(
    initial.communeDiscovered || iceUnlocked || fireUnlocked || ultimateUnlocked || unlockedStage >= 1
  );
  const stonesReadSet = new Set(
    Array.isArray(initial.stonesRead)
      ? initial.stonesRead.map((s) => resolveInscriptionStone(s).id)
      : []
  );
  if (stonesReadSet.size > 0) {
    communeDiscovered = true;
  }
  let lastReadStoneId = initial.lastReadStoneId || null;

  function recomputeStageCounts() {
    const count =
      (iceUnlocked ? 1 : 0) + (fireUnlocked ? 1 : 0) + (ultimateUnlocked ? 1 : 0);
    stonesSolved = Math.max(stonesSolved, count);
    unlockedStage = ultimateUnlocked
      ? 3
      : iceUnlocked && fireUnlocked
        ? 2
        : iceUnlocked || fireUnlocked
          ? 1
          : 0;
  }

  function getNextStoneIndex() {
    return Math.min(3, stonesSolved + 1);
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
      communeDiscovered,
      iceUnlocked: Boolean(iceUnlocked),
      fireUnlocked: Boolean(fireUnlocked),
      ultimateUnlocked: Boolean(ultimateUnlocked),
      activeElement: fireUnlocked && !iceUnlocked ? 'fire' : 'ice',
      stonesRead: Array.from(stonesReadSet),
      stonesSolved,
      nextStoneIndex,
      allStonesSolved: stonesSolved >= 3 || Boolean(iceUnlocked && fireUnlocked && ultimateUnlocked),
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
    const sequentialRiddleStage = getNextStoneIndex();
    return {
      stoneId: stone.id,
      stoneName: stone.name,
      stoneZone: stone.zone,
      sequentialRiddleStage,
      nextStoneIndex: sequentialRiddleStage,
      communeDiscovered: true,
      showTutorialPopups: false,
      state: getState(),
    };
  }

  /**
   * Non-linearly unlocks a specific power (`'ice'`, `'fire'`, or `'ultimate'`)
   * or sets explicit `{ iceUnlocked, fireUnlocked, ultimateUnlocked }` flags.
   */
  function setUnlocks(patch = {}) {
    if (typeof patch.communeDiscovered === 'boolean') {
      communeDiscovered = patch.communeDiscovered;
    }
    if (typeof patch.iceUnlocked === 'boolean') {
      iceUnlocked = patch.iceUnlocked;
    }
    if (typeof patch.fireUnlocked === 'boolean') {
      fireUnlocked = patch.fireUnlocked;
    }
    if (typeof patch.ultimateUnlocked === 'boolean') {
      ultimateUnlocked = patch.ultimateUnlocked;
    }
    if (iceUnlocked || fireUnlocked || ultimateUnlocked) {
      communeDiscovered = true;
    }
    stonesSolved =
      (iceUnlocked ? 1 : 0) + (fireUnlocked ? 1 : 0) + (ultimateUnlocked ? 1 : 0);
    recomputeStageCounts();
    return getState();
  }

  /**
   * Solves a specific stone (`'stone_pier'`, `'stone_grove'`, `'stone_plaza'`)
   * or riddle kind (`'ice'`, `'fire'`, `'ultimate'` / `'sovereign'`) non-linearly:
   * - `stone_pier` (`(-42, 18)`) or Ice riddle -> `iceUnlocked = true`
   * - `stone_grove` (`(44, 16)`) or Fire riddle -> `fireUnlocked = true`
   * - `stone_plaza` (`(0, -14)`) or Sovereign / Ultimate riddle -> `ultimateUnlocked = true`
   */
  function solveStone(stoneIdOrKind = 'stone_pier') {
    communeDiscovered = true;
    const raw = String(stoneIdOrKind || 'stone_pier').trim().toLowerCase();
    let unlockedKind = 'ice';
    let resolvedStoneId = 'stone_pier';

    if (
      raw === 'stone_grove' ||
      raw.includes('grove') ||
      raw.includes('wisteria') ||
      raw === 'fire' ||
      raw === 'solar' ||
      raw === 'cinder' ||
      raw === 'cinder_fall' ||
      raw === 'fire_sword'
    ) {
      fireUnlocked = true;
      unlockedKind = 'fire';
      resolvedStoneId = 'stone_grove';
    } else if (
      raw === 'stone_plaza' ||
      raw.includes('plaza') ||
      raw.includes('town') ||
      raw.includes('sovereign') ||
      raw === 'ultimate' ||
      raw === 'storm' ||
      raw === 'tempest' ||
      raw === 'q' ||
      raw === 'storm_cataclysm' ||
      raw === 'sky_lightning_awakening'
    ) {
      ultimateUnlocked = true;
      unlockedKind = 'ultimate';
      resolvedStoneId = 'stone_plaza';
    } else {
      iceUnlocked = true;
      unlockedKind = 'ice';
      resolvedStoneId = 'stone_pier';
    }

    stonesReadSet.add(resolvedStoneId);
    lastReadStoneId = resolvedStoneId;
    recomputeStageCounts();
    const snapshot = getState();
    return {
      advanced: true,
      stoneId: resolvedStoneId,
      unlockedKind,
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
   * Advances progression sequentially (`0 -> 1 -> 2 -> 3`) when a Stone's
   * riddle / Proof of Love is solved via `Commune`.
   */
  function solveNextStone(requestedStage = null) {
    communeDiscovered = true;
    const expectedNext = stonesSolved + 1;
    if (stonesSolved >= 3) {
      return {
        advanced: false,
        stage: 3,
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
        state: getState(),
      };
    }

    stonesSolved = Math.min(3, expectedNext);
    unlockedStage = stonesSolved;
    if (unlockedStage >= 1) iceUnlocked = true;
    if (unlockedStage >= 2) fireUnlocked = true;
    if (unlockedStage >= 3) ultimateUnlocked = true;

    const snapshot = getState();
    return {
      advanced: true,
      stage: unlockedStage,
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
    if (typeof verdictObj.iceUnlocked === 'boolean') iceUnlocked = verdictObj.iceUnlocked;
    if (typeof verdictObj.fireUnlocked === 'boolean') fireUnlocked = verdictObj.fireUnlocked;
    if (typeof verdictObj.ultimateUnlocked === 'boolean') {
      ultimateUnlocked = verdictObj.ultimateUnlocked;
    }
    const targetStoneOrElement =
      verdictObj.unlockedElement ||
      verdictObj.element ||
      verdictObj.riddleKind ||
      verdictObj.stoneId ||
      verdictObj.stone;
    if (targetStoneOrElement) {
      solveStone(targetStoneOrElement);
      return getState();
    }
    const awakenedStage = Number(verdictObj.awakenedStage || 0);
    if (verdictObj.verdict === 'awakening' || awakenedStage > unlockedStage) {
      if (awakenedStage === stonesSolved + 1 || !awakenedStage) {
        solveNextStone(stonesSolved + 1);
      }
    }
    recomputeStageCounts();
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
    if (typeof remote.lastReadStoneId === 'string' && remote.lastReadStoneId) {
      lastReadStoneId = remote.lastReadStoneId;
    }
    const remoteStage = Math.max(
      0,
      Math.min(
        3,
        Math.floor(Number(remote.unlockedStage ?? remote.stonesSolved ?? 0) || 0)
      )
    );
    if (remoteStage > unlockedStage) {
      unlockedStage = remoteStage;
      stonesSolved = remoteStage;
      if (unlockedStage >= 1) iceUnlocked = true;
      if (unlockedStage >= 2) fireUnlocked = true;
      if (unlockedStage >= 3) ultimateUnlocked = true;
      communeDiscovered = true;
    }
    if (typeof remote.iceUnlocked === 'boolean') iceUnlocked = remote.iceUnlocked;
    if (typeof remote.fireUnlocked === 'boolean') fireUnlocked = remote.fireUnlocked;
    if (typeof remote.ultimateUnlocked === 'boolean') ultimateUnlocked = remote.ultimateUnlocked;
    recomputeStageCounts();
    return getState();
  }

  function reset() {
    unlockedStage = 0;
    stonesSolved = 0;
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
