// ============================================================================
// world/src/net/room-progression.js
//
// Wave 3 Co-Op Room Phrase Generator, Invite Link Builder & Sequential 3-Stone
// Progression State Machine for Haru-machi:
// - Human-memorable romantic room phrases ("Love is curiosity", etc.)
// - Canonical room code normalization & `?room=` URL builder
// - Sequential 3-Stage Sacred Inscription Stone Progression (`0 -> 1 -> 2 -> 3`):
//   * Starts at `unlockedStage = 0`, `communeDiscovered = false`,
//     `stonesRead = []`, `stonesSolved = 0`.
//   * Reading ANY of the 3 Sacred Inscription Stones (`stone_plaza`,
//     `stone_pier`, `stone_grove`) immediately reveals the `Commune` button
//     (`communeDiscovered = true`) and selects the sequential riddle
//     (`nextStoneIndex = Math.min(3, stonesSolved + 1)`).
//   * Solving Stone 1 -> Stage 1: Unlocks `E` (Ice Power: `Frost Lance` for
//     Mage, `Ice Sword` for Knight).
//   * Solving Stone 2 -> Stage 2: Unlocks `Fire E` + `Tab` Element Toggle
//     (`Cinder Fall` for Mage, `Fire Sword` for Knight).
//   * Solving Stone 3 -> Stage 3: Unlocks Personal `Q` Ultimate (`Storm
//     Cataclysm` for Mage, `Sky-Lightning Awakening` for Knight).
//   * Zero hand-holding tutorial popups (`showTutorialPopups: false`).
// ============================================================================

export const ROMANTIC_ROOM_PHRASES = Object.freeze([
  'Love is curiosity',
  'Warm hands in winter',
  'Two hearts under wisteria',
  'Crimson roses at dawn',
  'Moonlight on the lake pier',
  'Starlight over Haru-machi',
  'Lanterns in the spring rain',
  'Wildflowers by the old mill',
  'Velvet petals in the breeze',
  'Golden vow beneath the shrine',
  'Soft footsteps in the meadow',
  'Promises kept in the storm',
]);

export const SACRED_INSCRIPTION_STONES = Object.freeze([
  {
    id: 'stone_plaza',
    index: 1,
    name: 'Weathered Stele of the Town Plaza',
    zone: 'plaza',
    position: { x: 0, z: -14 },
  },
  {
    id: 'stone_pier',
    index: 2,
    name: 'Mist-Carved Stele of the Lakeside Pier',
    zone: 'pier',
    position: { x: -42, z: 18 },
  },
  {
    id: 'stone_grove',
    index: 3,
    name: 'Blossom-Wreathed Stele of the Wisteria Grove',
    zone: 'grove',
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
 * Generates a human-memorable romantic room phrase (e.g. `"Love is curiosity"`).
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
    : 'https://haru-machi-coop.workers.dev/world/index.html'
) {
  const code = normalizeRoomPhraseToCode(phraseOrCode);
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('room', code);
    return url.toString();
  } catch {
    return `https://haru-machi-coop.workers.dev/world/index.html?room=${encodeURIComponent(code)}`;
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

export function getAbilityUnlocksForStage(stage = 0, communeDiscovered = false) {
  const clampedStage = Math.max(0, Math.min(3, Math.floor(Number(stage) || 0)));
  const spec = STAGE_ABILITY_UNLOCKS[clampedStage] || STAGE_ABILITY_UNLOCKS[0];
  const hasCommune = Boolean(communeDiscovered || clampedStage >= 1);
  return {
    stage: clampedStage,
    title: spec.title,
    communeUnlocked: hasCommune,
    skillEUnlocked: clampedStage >= 1,
    iceEUnlocked: clampedStage >= 1,
    fireEUnlocked: clampedStage >= 2,
    tabToggleUnlocked: clampedStage >= 2,
    ultimateQUnlocked: clampedStage >= 3,
    showTutorialPopups: false,
    knight: { ...spec.knight, abilities: [...spec.knight.abilities] },
    mage: { ...spec.mage, abilities: [...spec.mage.abilities] },
  };
}

/**
 * Creates the sequential 3-Stage Sacred Inscription Stone Progression state machine.
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

  let communeDiscovered = Boolean(initial.communeDiscovered || unlockedStage >= 1);
  const stonesReadSet = new Set(
    Array.isArray(initial.stonesRead)
      ? initial.stonesRead.map((s) => resolveInscriptionStone(s).id)
      : []
  );
  if (stonesReadSet.size > 0) {
    communeDiscovered = true;
  }
  let lastReadStoneId = initial.lastReadStoneId || null;

  function getNextStoneIndex() {
    return Math.min(3, stonesSolved + 1);
  }

  function getHudVisibility() {
    return {
      communeVisible: Boolean(communeDiscovered || unlockedStage >= 1),
      skillEVisible: unlockedStage >= 1,
      tabToggleVisible: unlockedStage >= 2,
      ultimateQVisible: unlockedStage >= 3,
      showTutorialPopups: false,
    };
  }

  function getState() {
    const nextStoneIndex = getNextStoneIndex();
    const unlocks = getAbilityUnlocksForStage(unlockedStage, communeDiscovered);
    return {
      unlockedStage,
      communeDiscovered,
      stonesRead: Array.from(stonesReadSet),
      stonesSolved,
      nextStoneIndex,
      allStonesSolved: stonesSolved >= 3,
      lastReadStoneId,
      showTutorialPopups: false,
      hudVisibility: getHudVisibility(),
      unlocks,
    };
  }

  /**
   * Reading ANY of the 3 Sacred Inscription Stones immediately reveals the
   * `Commune` button (`communeDiscovered = true`) and returns the current
   * sequential riddle index (`nextStoneIndex = stonesSolved + 1`, so even if
   * players visit Stone 2 or Stone 3 first, riddles progress `1 -> 2 -> 3`).
   */
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
      // Enforce strict sequential order (1 -> 2 -> 3)
      return {
        advanced: false,
        stage: unlockedStage,
        expectedStage: expectedNext,
        state: getState(),
      };
    }

    stonesSolved = Math.min(3, expectedNext);
    unlockedStage = stonesSolved;
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
    const awakenedStage = Number(verdictObj.awakenedStage || 0);
    if (verdictObj.verdict === 'awakening' || awakenedStage > unlockedStage) {
      if (awakenedStage === stonesSolved + 1 || !awakenedStage) {
        solveNextStone(stonesSolved + 1);
      }
    }
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
    if (remoteStage > stonesSolved) {
      stonesSolved = remoteStage;
      unlockedStage = remoteStage;
      communeDiscovered = true;
    }
    return getState();
  }

  function isAbilityUnlocked(role, abilityKey) {
    const unlocks = getAbilityUnlocksForStage(unlockedStage, communeDiscovered);
    const key = String(abilityKey || '').toLowerCase();
    if (key === 'commune') return unlocks.communeUnlocked;
    if (key === 'e' || key === 'skille' || key === 'ice' || key === 'icee') {
      return unlocks.iceEUnlocked;
    }
    if (key === 'fire' || key === 'firee') {
      return unlocks.fireEUnlocked;
    }
    if (key === 'tab' || key === 'tabtoggle') {
      return unlocks.tabToggleUnlocked;
    }
    if (key === 'q' || key === 'ultimate' || key === 'ultimateq') {
      return unlocks.ultimateQUnlocked;
    }
    return true;
  }

  return {
    getState,
    getHudVisibility,
    readInscriptionStone,
    solveNextStone,
    recordCommuneAwakening: solveNextStone,
    applyVerdictProgression,
    syncFromRemote,
    isAbilityUnlocked,
  };
}
