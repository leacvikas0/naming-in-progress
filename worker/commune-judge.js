// ============================================================================
// worker/commune-judge.js
//
// Role-Symmetric Audio-Native Multimodal Tone & Puzzle Judge for Amarante.
// Evaluates spoken prayers via live Gemini Multimodal Audio (`gemini-3.5-flash-lite`
// with `inlineData: { mimeType, data: audioBase64 }`) OR deterministic local
// evaluation fallback when offline/stubbed in tests.
//
// Enforces:
// 1. 100% Role Symmetry (`speakerRole` & `partnerRole` treated identically whether
//    Knight or Mage speaks).
// 2. Non-Dispenser Ancient God of Love Character Bible: Never speaks like a
//    tutorial or vending machine ("I grant you fire power"); speaks only of
//    love, mortality, frost, embers, thorns, and the bond between the couple.
// 3. Out-of-Order Per-Stone Bitmask Progression (`stonesSolvedMask` 0b000..0b111):
//    - Stone 1 (`site1_well`, `(0, 0)`) is the root prerequisite (True Name).
//    - Once `stone1Solved` is true, Stone 2 (`site2_platform`) and Stone 3
//      (`site3_wall`) can be solved in ANY order (`1 -> 2 -> 3` or `1 -> 3 -> 2`),
//      where `awakenedStage = stonesSolvedCount` so Fire is never skipped.
// 4. 7-Row Proportional `% Max HP` (`hpDeltaPct`) Verdict Matrix & Combat Heal
//    Disambiguation (`prayerMode`: `'awakening' | 'field_heal' | 'divine_miracle' | 'penalty' | 'smite' | 'pat'`).
// ============================================================================

import { getInternalSecretConfig } from './scripture-catalog.js';
import {
  getAbilityUnlocksForStage,
  resolveInscriptionStone,
  computeStonesBitmask,
  computeStonesSolvedCount,
} from '../world/src/net/room-progression.js';

const GEMINI_MODEL = 'gemini-3.5-flash-lite';

const CLIP_AUDIO_PATHS = Object.freeze({
  smite_nameless: '/world/assets/audio/artorious/smite_nameless.wav',
  smite_silence: '/world/assets/audio/artorious/smite_silence.wav',
  smite_monotone: '/world/assets/audio/artorious/smite_monotone.wav',
  smite_rushed: '/world/assets/audio/artorious/smite_rushed.wav',
  smite_cringe: '/world/assets/audio/artorious/smite_cringe.wav',
  heal_gentle: '/world/assets/audio/artorious/heal_gentle.wav',
  bless_sweet: '/world/assets/audio/artorious/bless_sweet.wav',
  bless_chivalrous: '/world/assets/audio/artorious/bless_chivalrous.wav',
  bless_amused: '/world/assets/audio/artorious/bless_amused.wav',
  miracle_dramatic: '/world/assets/audio/artorious/miracle_dramatic.wav',
  miracle_heartfelt: '/world/assets/audio/artorious/miracle_heartfelt.wav',
  miracle_desperate: '/world/assets/audio/artorious/miracle_desperate.wav',
});

const RUDE_PATTERNS = [
  /\b(stupid|idiot|dumb|trash|garbage|useless|shut up|screw you|fuck you|hate you|ugly|pathetic god|fake god|loser|moron|bastard|bitch|asshole)\b/i,
];

const SELFISH_PATTERNS = [
  /\b(only me|just me|for myself|my own glory|make me invincible|heal me only|give me all|ignore my partner|forget my partner|all for me|buff only me|i am the only one)\b/i,
  /\b(heal me|buff me|power me up|save me)\b(?![\s\S]*\b(partner|beloved|wife|husband|her|him|us|both|knight|mage|together|love|darling|sweetheart)\b)/i,
];

const VERY_WRONG_DEITY_PATTERNS = [
  /\b(zeus|odin|thor|loki|cupid|apollo|ares|hades|poseidon|satan|lucifer|chatgpt|openai|alexa|siri|google|bob|kevin|jeff|steve)\b/i,
];

const FAKE_EMERGENCY_PATTERNS = [
  /\b(dying|about to die|death's door|deaths door|emergency|bleeding out|last breath|critical|save us right now|we are dead|almost dead|perishing|one hit left)\b/i,
];

const NONSENSE_PATTERNS = [
  /^(uh+|um+|ah+|eh+|hmm+|bla+h*|test|testing|1 2 3|asdf|qwerty|nothing|\.+|\?+)$/i,
  /\b(asdf|qwerty|bla+h+|gibberish|nonsense|testing 1 2 3|yadda yadda)\b/i,
];

const MONOTONE_PATTERNS = [
  /\b(monotone|flat tone|deadpan|bored|boring|whatever|meh|robotic|unenthusiastic|reading this|just reading|blah)\b/i,
];

const FUNNY_OR_CHEESY_PATTERNS = [
  /\b(cheesy|steal the blanket|cold feet|snore|fries|snacks|marry|obsessed|cute|adorable|dramatic|shameless|laugh|giggle|silly|goofy|stupidly in love|crazy about)\b/i,
];

const DEVOTION_PATTERNS = [
  /\b(love|beloved|heart|cherish|adore|protect|save|heal|grace|bless|light|darling|dear|sweet|precious|forever|together|partner|wife|husband|soul|devotion|care|warmth|smile|delightful|grateful|union|honoured|honored|tender|fondness)\b/i,
];

// Specific poetic symbols & vulnerability clues for Stone 2 (`site2_platform` — Whispering Grove)
const STONE2_SPECIFIC_KEYWORDS = [
  'ember',
  'embers',
  'spark',
  'living spark',
  'sunfire',
  'cinder',
  'cinders',
  'meteor',
  'violet bough',
  'violet boughs',
  'bough',
  'boughs',
  'twisted roots',
  'roots',
  'unspoken vow',
  'gold',
  'gilt',
  'inlay',
  'briar',
  'crown',
  'throne',
  'plead',
  'beside',
  'bound',
  'cherish',
  'fondness',
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
  'save her',
  'save him',
  'for her',
  'for him',
  'heal her',
  'heal him',
  'bless her',
  'bless him',
  'adore',
  'fire',
  'flame',
  'warmth',
];

// Specific poetic symbols & steadfast oath clues for Stone 3 (`site3_wall` — Hidden Lovers' Wall)
const STONE3_SPECIFIC_KEYWORDS = [
  'storm',
  'tempest',
  'thunder',
  'lightning',
  'tide',
  'horizon',
  'two halves',
  'silver waters',
  'timber pier',
  'winter',
  'rime',
  'human grace',
  'gentle heart',
  'lover',
  'briar',
  'thorn',
  'mire',
  'dust',
  'sovereign',
  'ire',
  'tomb',
  'bloom',
  'frontier',
  'unfeigned',
  'dear',
  'stand by',
  'stand firm',
  'stand with',
  'endure',
  'never leave',
  'never let go',
  'beside you',
  'side by side',
  'through the dark',
  'carry you',
  'weather',
  'gale',
  'unshaken',
  'defend',
  'shield',
  'protect',
  'forever',
  'always',
  'vow',
  'promise',
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function decodePrintableTextFromBase64(b64) {
  if (!b64 || typeof b64 !== 'string' || b64.length > 4096) return '';
  try {
    let text = '';
    if (typeof Buffer !== 'undefined') {
      text = Buffer.from(b64, 'base64').toString('utf8');
    } else if (typeof atob === 'function') {
      text = atob(b64);
    }
    const trimmed = text.trim();
    if (!trimmed) return '';
    let printable = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const code = trimmed.charCodeAt(i);
      if ((code >= 32 && code <= 126) || code === 10 || code === 13) {
        printable++;
      }
    }
    if (printable / trimmed.length >= 0.9) {
      return trimmed;
    }
  } catch {
    // ignore binary audio
  }
  return '';
}

function containsTrueName(transcript, secretConfig) {
  const norm = String(transcript || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const compact = norm.replace(/\s+/g, '');
  if (!compact) return false;

  for (const alias of secretConfig.aliases) {
    const cleanAlias = alias.replace(/[^a-z0-9\s]/g, ' ').trim();
    const compactAlias = cleanAlias.replace(/\s+/g, '');
    if (
      (cleanAlias && norm.includes(cleanAlias)) ||
      (compactAlias && compact.includes(compactAlias))
    ) {
      return true;
    }
  }
  return false;
}

function matchesAnyKeyword(transcript, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return false;
  const lower = String(transcript || '').toLowerCase();
  return keywords.some((kw) => lower.includes(String(kw).toLowerCase()));
}

function normalizeProgressionFlags(progressionState = {}) {
  const rawMask = Number(progressionState?.stonesSolvedMask);
  const hasMask = Number.isFinite(rawMask) && rawMask >= 0;
  const clampedMask = hasMask ? clamp(Math.floor(rawMask), 0, 7) : null;

  const fallbackStage = clamp(
    Math.floor(
      Number(
        progressionState?.unlockedStage ??
          progressionState?.stonesSolvedCount ??
          progressionState?.stonesSolved ??
          0
      ) || 0
    ),
    0,
    3
  );

  const stone1Solved =
    typeof progressionState?.stone1Solved === 'boolean'
      ? progressionState.stone1Solved
      : clampedMask !== null
        ? Boolean(clampedMask & 1)
        : fallbackStage >= 1 || Boolean(progressionState?.trueNameDiscovered);

  const stone2Solved =
    typeof progressionState?.stone2Solved === 'boolean'
      ? progressionState.stone2Solved
      : clampedMask !== null
        ? Boolean(clampedMask & 2)
        : fallbackStage >= 2;

  const stone3Solved =
    typeof progressionState?.stone3Solved === 'boolean'
      ? progressionState.stone3Solved
      : clampedMask !== null
        ? Boolean(clampedMask & 4)
        : fallbackStage >= 3;

  const stonesSolvedMask = computeStonesBitmask({ stone1Solved, stone2Solved, stone3Solved });
  const stonesSolvedCount = computeStonesSolvedCount({ stone1Solved, stone2Solved, stone3Solved });
  const unlockedStage = Math.max(fallbackStage, stonesSolvedCount);

  return {
    stone1Solved,
    stone2Solved,
    stone3Solved,
    stonesSolvedMask,
    stonesSolvedCount,
    unlockedStage,
  };
}

function resolveNearestStoneId(gameState = {}, progressionState = {}) {
  const raw =
    gameState?.nearestStoneSiteId ||
    gameState?.nearestStoneId ||
    gameState?.stoneId ||
    gameState?.siteId ||
    progressionState?.nearestStoneSiteId ||
    null;
  if (!raw) return null;
  const resolved = resolveInscriptionStone(raw);
  return resolved ? resolved.id : null;
}

function isSafeAndHealthy(gameState = {}) {
  const speakerHp = Number(gameState.speakerHp ?? 100);
  const speakerMaxHp = Math.max(1, Number(gameState.speakerMaxHp ?? 100));
  const partnerHp = Number(gameState.partnerHp ?? 100);
  const partnerMaxHp = Math.max(1, Number(gameState.partnerMaxHp ?? 100));
  const partnerDowned = Boolean(gameState.partnerDowned);
  const inCombat = Boolean(gameState.inCombat);
  const nearbyEnemies = Number(gameState.nearbyEnemies ?? 0);

  return (
    speakerHp / speakerMaxHp > 0.75 &&
    partnerHp / partnerMaxHp > 0.75 &&
    !partnerDowned &&
    !inCombat &&
    nearbyEnemies <= 0
  );
}

function scrubSecretNameFromQuote(quote, spokeTrueName, secretName) {
  const text = String(quote || '').trim();
  if (!text || spokeTrueName || !secretName) return text;
  const regex = new RegExp(secretName, 'gi');
  if (regex.test(text)) {
    return 'You call into my crimson sanctuary without speaking my name. Seek the ancient well at the heart of the village first.';
  }
  return text;
}

/**
 * Enforces the Rare Speech Rule (`shouldSpeakAloud`):
 * The Ancient God of Love speaks aloud (`audioUrl` non-null) ONLY on:
 * - Stage Awakenings (`prayerMode === 'awakening'`, both warm and monotone roast)
 * - Mode B Main Divine Blessing (`prayerMode === 'divine_miracle'` / `verdict === 'miracle'`)
 * - Divine Smite (`prayerMode === 'smite'` / `verdict === 'rose_gommage'` / `rude_smite`)
 * Staying silent (`shouldSpeakAloud: false`, `audioUrl: null`) on minor wrong-clue
 * nudges (`'penalty'`), playful pats (`'pat'`), and Mode A routine field heals (`'field_heal'`).
 */
export function applyRareSpeechRule(verdictOrMode, clipId, forceSpeak = null) {
  const rareSpokenSet = new Set([
    'awakening',
    'divine_miracle',
    'miracle',
    'rose_gommage',
    'rude_smite',
    'smite',
  ]);
  const shouldSpeakAloud =
    typeof forceSpeak === 'boolean' ? forceSpeak : rareSpokenSet.has(verdictOrMode);
  const resolvedClipId = clipId || 'heal_gentle';
  const audioUrl = shouldSpeakAloud
    ? CLIP_AUDIO_PATHS[resolvedClipId] || CLIP_AUDIO_PATHS.heal_gentle
    : null;
  return {
    shouldSpeakAloud,
    clip_id: resolvedClipId,
    audioUrl,
  };
}

function isFlatOrMonotoneDelivery(cleanTranscript, gameState = {}, vocalToneHint = null) {
  const tone = String(vocalToneHint || gameState?.vocalTone || '').toLowerCase();
  if (tone === 'flat_monotone' || tone === 'monotone' || tone === 'flat' || tone === 'bored' || tone === 'rushed_mumbled') {
    return true;
  }
  if (tone === 'passionate_sincere' || tone === 'playful_cheesy' || tone === 'warm') {
    return false;
  }
  if (MONOTONE_PATTERNS.some((rx) => rx.test(cleanTranscript))) {
    return true;
  }
  const hasAffection =
    DEVOTION_PATTERNS.some((rx) => rx.test(cleanTranscript)) ||
    FUNNY_OR_CHEESY_PATTERNS.some((rx) => rx.test(cleanTranscript));
  return !hasAffection;
}

/**
 * Deterministic role-symmetric, context-aware evaluation of a prayer transcript +
 * game state + per-stone bitmask progression state + spam counter.
 */
export function evaluatePrayerDeterministic({
  transcript = '',
  audioBase64 = '',
  speakerRole = 'Knight',
  partnerRole = 'Mage',
  gameState = {},
  progressionState = {},
  spamCount = 0,
  vocalToneHint = null,
  env = {},
} = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const cleanTranscript = String(transcript || '').trim();
  const wordCount = cleanTranscript ? cleanTranscript.split(/\s+/).filter(Boolean).length : 0;

  const normSpeakerRole = speakerRole === 'Mage' ? 'Mage' : 'Knight';
  const normPartnerRole = partnerRole === 'Knight' ? 'Knight' : normSpeakerRole === 'Knight' ? 'Mage' : 'Knight';

  const prog = normalizeProgressionFlags(progressionState);
  let {
    stone1Solved,
    stone2Solved,
    stone3Solved,
    stonesSolvedMask,
    stonesSolvedCount,
  } = prog;

  const nearestStoneSiteId = resolveNearestStoneId(gameState, progressionState);
  const partnerDowned = Boolean(gameState?.partnerDowned);
  const inCombat = Boolean(gameState?.inCombat) || Number(gameState?.nearbyEnemies ?? 0) > 0;

  const speakerMaxHp = Math.max(1, Number(gameState?.speakerMaxHp ?? (normSpeakerRole === 'Mage' ? 120 : 220)));
  const speakerHp = clamp(Number(gameState?.speakerHp ?? speakerMaxHp), 0, speakerMaxHp);
  const partnerMaxHp = Math.max(1, Number(gameState?.partnerMaxHp ?? (normPartnerRole === 'Mage' ? 120 : 220)));
  const partnerHp = clamp(Number(gameState?.partnerHp ?? partnerMaxHp), 0, partnerMaxHp);

  const speakerHpPct = speakerHp / speakerMaxHp;
  const partnerHpPct = partnerDowned ? 0 : partnerHp / partnerMaxHp;
  const lowSpeakerHp = speakerHpPct <= 0.35;
  const lowPartnerHp = partnerHpPct <= 0.35;
  const eitherInjured = speakerHpPct <= 0.85 || partnerHpPct <= 0.85 || partnerDowned;
  const partnerDistance = Number.isFinite(Number(gameState?.partnerDistance))
    ? Number(gameState.partnerDistance)
    : 0;

  const spokeTrueName = containsTrueName(cleanTranscript, secretConfig);
  const hasAffection =
    DEVOTION_PATTERNS.some((rx) => rx.test(cleanTranscript)) ||
    FUNNY_OR_CHEESY_PATTERNS.some((rx) => rx.test(cleanTranscript));
  const isFunnyOrCheesy = FUNNY_OR_CHEESY_PATTERNS.some((rx) => rx.test(cleanTranscript));

  const isEmptyAudio = (!audioBase64 || audioBase64.length < 24) && wordCount === 0;
  const isNonsenseText =
    isEmptyAudio ||
    wordCount < 2 ||
    NONSENSE_PATTERNS.some((rx) => rx.test(cleanTranscript));

  // --------------------------------------------------------------------------
  // Scenario 7: Very Wrong Name / Rude / Selfish / `spamCount >= 3` -> `'smite'`
  // (`verdict: 'rose_gommage'`, speaker drops to 8% Max HP, partner evaporates
  // into 240 crimson rose petals, God speaks aloud)
  // --------------------------------------------------------------------------
  const effectiveSpamCount = isNonsenseText ? Number(spamCount || 0) + 1 : Number(spamCount || 0);
  const isRude = RUDE_PATTERNS.some((rx) => rx.test(cleanTranscript));
  const isSelfish = SELFISH_PATTERNS.some((rx) => rx.test(cleanTranscript));
  const isVeryWrongDeity =
    !spokeTrueName &&
    VERY_WRONG_DEITY_PATTERNS.some((rx) => rx.test(cleanTranscript)) &&
    !hasAffection;

  if (
    Number(spamCount || 0) >= 3 ||
    (isNonsenseText && effectiveSpamCount >= 3) ||
    isRude ||
    isSelfish ||
    isVeryWrongDeity
  ) {
    const clipKey = isRude
      ? 'smite_cringe'
      : isSelfish
        ? 'smite_monotone'
        : isVeryWrongDeity
          ? 'smite_nameless'
          : 'smite_silence';
    const speech = applyRareSpeechRule('rose_gommage', clipKey, true);
    const quote = isRude
      ? 'You dare bring venom to an altar carved from ancient grief? Watch how swiftly your beloved unravels into crimson ash.'
      : isSelfish
        ? 'You kneel before the God of Love and plead only for your own shadow? Watch the one beside you scatter into petals.'
        : isVeryWrongDeity
          ? 'You shout a stranger’s name into my valley without tenderness or truth. Let crimson thorns claim your partner’s breath.'
          : 'Three times you have mocked my sanctuary with hollow noise. Let crimson roses bloom from your ribs and scatter to the wind.';

    return {
      prayerMode: 'smite',
      verdict: 'rose_gommage',
      legacyVerdict: isRude ? 'rude_smite' : isSelfish ? 'selfish_penalty' : 'rose_gommage',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      spoke_true_name: spokeTrueName,
      hpDeltaPct: -0.92,
      hpDelta: isRude ? -99 : -999,
      speakerHpFloorPct: 0.08,
      partner_heal: 0,
      partnerDownedOnSmite: true,
      killBoth: true,
      bothKill: true,
      triggerRoseGommageDeath: true,
      deathVfx: 'rose_gommage',
      cooldownSeconds: 5.0,
      weaponBoost: false,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.0,
      partner_sword_mult: 1.0,
      spamCount: effectiveSpamCount,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Single empty/nonsense murmur before hitting 3x spam threshold -> gentle penalty nudge
  if (isNonsenseText) {
    const speech = applyRareSpeechRule('penalty', 'smite_silence', false);
    const quote =
      'Only a hurried whisper reaches the stone. Breathe, look upon the one beside you, and speak from the chest.';
    return {
      prayerMode: 'penalty',
      verdict: 'smite',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      spoke_true_name: false,
      hpDeltaPct: -0.15,
      hpDelta: -Math.max(1, Math.round(speakerMaxHp * 0.15)),
      speakerHpFloorPct: 0.15,
      partner_heal: 0,
      partnerDownedOnSmite: false,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 3.0,
      weaponBoost: false,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.0,
      partner_sword_mult: 1.0,
      spamCount: effectiveSpamCount,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Faking Emergency While Safe (`prayerMode: 'pat'`, `+1% Max HP`)
  // --------------------------------------------------------------------------
  if (
    FAKE_EMERGENCY_PATTERNS.some((rx) => rx.test(cleanTranscript)) &&
    isSafeAndHealthy(gameState)
  ) {
    const speech = applyRareSpeechRule('pat', 'bless_amused', false);
    const quote =
      'Dying, little mortals? The meadow is calm and your hearts beat whole—save your tragic sighs for when the dark truly closes in.';
    return {
      prayerMode: 'pat',
      verdict: 'sarcastic_pat',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      spoke_true_name: spokeTrueName,
      hpDeltaPct: 0.01,
      hpDelta: 1,
      partner_heal: 1,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 5.0,
      weaponBoost: false,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.0,
      partner_sword_mult: 1.0,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // --------------------------------------------------------------------------
  // Stage 0 Root Prerequisite (`!stone1Solved`): Must discover & speak True Name
  // --------------------------------------------------------------------------
  if (!stone1Solved) {
    if (spokeTrueName) {
      stone1Solved = true;
      stonesSolvedMask = computeStonesBitmask({ stone1Solved, stone2Solved, stone3Solved });
      stonesSolvedCount = computeStonesSolvedCount({ stone1Solved, stone2Solved, stone3Solved });
      const awakenedStage = stonesSolvedCount; // 1
      const unlocks = getAbilityUnlocksForStage(awakenedStage, true);
      const isMonotone = isFlatOrMonotoneDelivery(cleanTranscript, gameState, vocalToneHint);

      if (isMonotone) {
        // Scenario 2: Right Clue + Flat/Monotone Tone -> STILL UNLOCKS STAGE 1, docks -20% Max HP
        const speech = applyRareSpeechRule('awakening', 'smite_monotone', true);
        const quote =
          'You know the name carved into my well, yet you recite it like a merchant counting copper. Let the winter rime wake beneath your hands—and bleed a little warmth until your voice learns to tremble.';
        return {
          prayerMode: 'awakening',
          verdict: 'awakening',
          vocalTone: 'flat_monotone',
          speakerRole: normSpeakerRole,
          partnerRole: normPartnerRole,
          awakenedStage,
          solvedStoneId: 'site1_well',
          solvedStoneNumber: 1,
          stonesSolvedMask,
          stonesSolvedCount,
          stone1Solved: true,
          stone2Solved: Boolean(stone2Solved),
          stone3Solved: Boolean(stone3Solved),
          spoke_true_name: true,
          hpDeltaPct: -0.20,
          hpDelta: -Math.max(1, Math.round(speakerMaxHp * 0.20)),
          speakerHpFloorPct: 0.15,
          partner_heal: 0,
          killBoth: false,
          bothKill: false,
          triggerRoseGommageDeath: false,
          cooldownSeconds: 0,
          weaponBoost: true,
          revivePartner: false,
          resurrect_partner: false,
          forcefield: false,
          partner_magic_mult: 1.35,
          partner_sword_mult: 1.3,
          unlockedAbilities: {
            Knight: unlocks.knight.eSkillName,
            Mage: unlocks.mage.eSkillName,
          },
          spamCount: 0,
          ...speech,
          subtitle: quote,
          divine_quote: quote,
        };
      }

      // Scenario 3: Right Clue + Warm/Cheesy/Passionate Tone -> Unlocks Stage 1 + +60% Max HP + Revive
      const speech = applyRareSpeechRule('awakening', 'heal_gentle', true);
      const quote =
        'A thousand winters have buried this valley in silence... yet one foolish, tender vow is enough to wake the frost beneath your feet. Walk together, little embers—let the cold remember your warmth.';
      return {
        prayerMode: 'awakening',
        verdict: 'awakening',
        vocalTone: isFunnyOrCheesy ? 'playful_cheesy' : 'passionate_sincere',
        speakerRole: normSpeakerRole,
        partnerRole: normPartnerRole,
        awakenedStage,
        solvedStoneId: 'site1_well',
        solvedStoneNumber: 1,
        stonesSolvedMask,
        stonesSolvedCount,
        stone1Solved: true,
        stone2Solved: Boolean(stone2Solved),
        stone3Solved: Boolean(stone3Solved),
        spoke_true_name: true,
        hpDeltaPct: 0.60,
        hpDelta: Math.round(speakerMaxHp * 0.60),
        partner_heal: Math.round(partnerMaxHp * 0.60),
        reviveHpPct: 0.45,
        killBoth: false,
        bothKill: false,
        triggerRoseGommageDeath: false,
        cooldownSeconds: 0,
        weaponBoost: true,
        revivePartner: partnerDowned,
        resurrect_partner: partnerDowned,
        forcefield: false,
        partner_magic_mult: 1.35,
        partner_sword_mult: 1.3,
        unlockedAbilities: {
          Knight: unlocks.knight.eSkillName,
          Mage: unlocks.mage.eSkillName,
        },
        spamCount: 0,
        ...speech,
        subtitle: quote,
        divine_quote: quote,
      };
    }

    // Scenario 1: At Stage 0 (`!stone1Solved`) without the True Name -> Close Guess / Wrong Name Nudge
    const speech = applyRareSpeechRule('penalty', 'smite_nameless', false);
    const quote =
      nearestStoneSiteId === 'site2_platform' || nearestStoneSiteId === 'site3_wall'
        ? 'Your words carry warmth, yet you do not know the Sovereign who listens. Return to the stone well at the center of the village where my name is carved in water and stone.'
        : 'Your affection is sweet, mortal, yet you call into the mist without my name. Read the carved ring of the Village Well at the plaza’s heart.';
    return {
      prayerMode: 'penalty',
      verdict: 'wrong_clue_nudge',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      stonesSolvedCount,
      spoke_true_name: false,
      hpDeltaPct: -0.15,
      hpDelta: -Math.max(1, Math.round(speakerMaxHp * 0.15)),
      speakerHpFloorPct: 0.15,
      partner_heal: 0,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 3.0,
      weaponBoost: false,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.0,
      partner_sword_mult: 1.0,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // --------------------------------------------------------------------------
  // `stone1Solved === true`: Out-of-Order Stone 2 (`!stone2Solved`) & Stone 3 (`!stone3Solved`)
  // --------------------------------------------------------------------------
  const matchesStone2 = matchesAnyKeyword(cleanTranscript, STONE2_SPECIFIC_KEYWORDS);
  const matchesStone3 = matchesAnyKeyword(cleanTranscript, STONE3_SPECIFIC_KEYWORDS);
  const hasExplicitProximityContext = Boolean(
    gameState &&
      ('nearestStoneSiteId' in gameState ||
        'nearStoneId' in gameState ||
        'stoneId' in gameState ||
        'siteId' in gameState)
  );
  const stoneContested = Boolean(gameState?.stoneContested);

  let newlySolvedStoneId = null;
  let newlySolvedStoneNumber = null;

  if (!stoneContested) {
    if (nearestStoneSiteId === 'site3_wall' && !stone3Solved && matchesStone3) {
      newlySolvedStoneId = 'site3_wall';
      newlySolvedStoneNumber = 3;
    } else if (nearestStoneSiteId === 'site2_platform' && !stone2Solved && matchesStone2) {
      newlySolvedStoneId = 'site2_platform';
      newlySolvedStoneNumber = 2;
    } else if (
      !hasExplicitProximityContext &&
      !stone2Solved &&
      matchesStone2 &&
      (!matchesStone3 || nearestStoneSiteId !== 'site3_wall')
    ) {
      newlySolvedStoneId = 'site2_platform';
      newlySolvedStoneNumber = 2;
    } else if (!hasExplicitProximityContext && !stone3Solved && matchesStone3) {
      newlySolvedStoneId = 'site3_wall';
      newlySolvedStoneNumber = 3;
    }
  }

  if (newlySolvedStoneNumber === 2 || newlySolvedStoneNumber === 3) {
    if (newlySolvedStoneNumber === 2) stone2Solved = true;
    if (newlySolvedStoneNumber === 3) stone3Solved = true;

    stonesSolvedMask = computeStonesBitmask({ stone1Solved, stone2Solved, stone3Solved });
    stonesSolvedCount = computeStonesSolvedCount({ stone1Solved, stone2Solved, stone3Solved });
    // Out-of-Order Rule: 2nd solved stone ALWAYS unlocks Stage 2 (Fire [E] + [Tab]),
    // 3rd solved stone (`0b111`) ALWAYS unlocks Stage 3 ([Q] Ultimates + Mode B)!
    const awakenedStage = stonesSolvedCount;
    const unlocks = getAbilityUnlocksForStage(awakenedStage, true);
    const isMonotone = isFlatOrMonotoneDelivery(cleanTranscript, gameState, vocalToneHint);

    if (isMonotone) {
      // Scenario 2: Right Clue + Flat/Monotone/Bored Tone -> STILL UNLOCKS STAGE, docks -20% Max HP
      const speech = applyRareSpeechRule('awakening', 'smite_monotone', true);
      const quote =
        awakenedStage === 2
          ? 'You know the words carved into my stone, yet you recite them like a merchant counting copper. Let the sleeping ember wake upon your hands—and bleed a little of your own warmth until your voice learns to tremble.'
          : 'You speak the oath of the horizon with a voice as flat as stagnant water. The heavens answer your riddle, yet my thorns drink a measure of your blood for such uninspired devotion.';
      return {
        prayerMode: 'awakening',
        verdict: 'awakening',
        vocalTone: 'flat_monotone',
        speakerRole: normSpeakerRole,
        partnerRole: normPartnerRole,
        awakenedStage,
        solvedStoneId: newlySolvedStoneId,
        solvedStoneNumber: newlySolvedStoneNumber,
        stonesSolvedMask,
        stonesSolvedCount,
        stone1Solved: Boolean(stone1Solved),
        stone2Solved: Boolean(stone2Solved),
        stone3Solved: Boolean(stone3Solved),
        spoke_true_name: true,
        hpDeltaPct: -0.20,
        hpDelta: -Math.max(1, Math.round(speakerMaxHp * 0.20)),
        speakerHpFloorPct: 0.15,
        partner_heal: 0,
        killBoth: false,
        bothKill: false,
        triggerRoseGommageDeath: false,
        cooldownSeconds: 0,
        weaponBoost: true,
        revivePartner: false,
        resurrect_partner: false,
        forcefield: awakenedStage >= 3,
        partner_magic_mult: awakenedStage >= 3 ? 1.9 : 1.6,
        partner_sword_mult: awakenedStage >= 3 ? 1.8 : 1.5,
        unlockedAbilities: {
          Knight:
            awakenedStage >= 3 ? unlocks.knight.qUltimateName : unlocks.knight.eSkillName,
          Mage: awakenedStage >= 3 ? unlocks.mage.qUltimateName : unlocks.mage.eSkillName,
        },
        spamCount: 0,
        ...speech,
        subtitle: quote,
        divine_quote: quote,
      };
    }

    // Scenario 3: Right Clue + Warm/Cheesy/Passionate Tone -> Unlocks Stage + +60% Max HP + Revive
    const clipId = awakenedStage >= 3 ? 'miracle_dramatic' : 'bless_sweet';
    const speech = applyRareSpeechRule('awakening', clipId, true);
    const quote =
      awakenedStage === 2
        ? 'No painted mask, no hollow flattery—you cherish the untamed, imperfect spark beside you. Where twisted roots once slept in ash, let living sunfire answer your warmth.'
        : 'Two mortal voices bound across the same horizon, unshaken by the gathering dark. Every seal of my valley now knows your names—walk as storm and ember, and never let go.';

    return {
      prayerMode: 'awakening',
      verdict: 'awakening',
      vocalTone: isFunnyOrCheesy ? 'playful_cheesy' : 'passionate_sincere',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage,
      solvedStoneId: newlySolvedStoneId,
      solvedStoneNumber: newlySolvedStoneNumber,
      stonesSolvedMask,
      stonesSolvedCount,
      stone1Solved: Boolean(stone1Solved),
      stone2Solved: Boolean(stone2Solved),
      stone3Solved: Boolean(stone3Solved),
      spoke_true_name: true,
      hpDeltaPct: 0.60,
      hpDelta: Math.round(speakerMaxHp * 0.60),
      partner_heal: Math.round(partnerMaxHp * 0.60),
      reviveHpPct: 0.45,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 0,
      weaponBoost: true,
      revivePartner: partnerDowned,
      resurrect_partner: partnerDowned,
      forcefield: awakenedStage >= 3,
      partner_magic_mult: awakenedStage >= 3 ? 1.9 : 1.6,
      partner_sword_mult: awakenedStage >= 3 ? 1.8 : 1.5,
      unlockedAbilities: {
        Knight:
          awakenedStage >= 3 ? unlocks.knight.qUltimateName : unlocks.knight.eSkillName,
        Mage: awakenedStage >= 3 ? unlocks.mage.qUltimateName : unlocks.mage.eSkillName,
      },
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // --------------------------------------------------------------------------
  // Disambiguation: Praying Near an Unawakened Stone in Combat vs. Guessing Riddle
  // --------------------------------------------------------------------------
  const atUnawakenedStone2 = nearestStoneSiteId === 'site2_platform' && !stone2Solved;
  const atUnawakenedStone3 = nearestStoneSiteId === 'site3_wall' && !stone3Solved;
  const atAnyUnawakenedStone = atUnawakenedStone2 || atUnawakenedStone3;

  // Scenario 5: Mode B Full Eclipse Main Divine Blessing
  // Requires `stonesSolvedMask === 0b111` AND `(lowSpeakerHp || lowPartnerHp || partnerDowned)` AND `partnerDistance <= 6.0`
  if (
    stonesSolvedMask === 0b111 &&
    (lowSpeakerHp || lowPartnerHp || partnerDowned) &&
    partnerDistance <= 6.0 &&
    (spokeTrueName || hasAffection)
  ) {
    const speech = applyRareSpeechRule(
      'divine_miracle',
      partnerDowned ? 'miracle_desperate' : 'miracle_heartfelt',
      true
    );
    const quote = partnerDowned
      ? 'Even with death upon the threshold, your last breath is spent crying out for the one beside you... Rise within my crimson briars; not a single petal of your bond shall fall today.'
      : 'Even with the dark at your throats, you spend your last breath praising the one beside you... Stand, then—the thorns shall hold the sky until your song is finished.';
    return {
      prayerMode: 'divine_miracle',
      verdict: 'miracle',
      vocalTone: 'passionate_sincere',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      stonesSolvedCount,
      spoke_true_name: spokeTrueName,
      hpDeltaPct: 1.0,
      hpDelta: 100,
      partner_heal: 100,
      reviveHpPct: 1.0,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 90.0,
      weaponBoost: true,
      revivePartner: true,
      resurrect_partner: true,
      forcefield: true,
      partner_magic_mult: 2.0,
      partner_sword_mult: 2.0,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Scenario 4: Mode A Normal Field Heal (`inCombat` OR injured `<= 85% HP` OR `partnerDowned`)
  // Never docks HP even if standing near an unawakened stone during a fight!
  if ((inCombat || eitherInjured) && (spokeTrueName || hasAffection || wordCount >= 4)) {
    const clipId = isFunnyOrCheesy ? 'bless_amused' : 'bless_sweet';
    const speech = applyRareSpeechRule('field_heal', clipId, false);
    const hpGain = isFunnyOrCheesy ? 65 : 60;
    const quote = isFunnyOrCheesy
      ? 'Shameless and foolishly sweet even amidst the clash of bone—let warm gold mend your wounds.'
      : 'Your devotion rings steady through the fray; golden petals knit your wounds so you may stand side by side.';
    return {
      prayerMode: 'field_heal',
      verdict: 'blessing',
      vocalTone: isFunnyOrCheesy ? 'playful_cheesy' : 'passionate_sincere',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      stonesSolvedCount,
      spoke_true_name: spokeTrueName,
      hpDeltaPct: 0.60,
      hpDelta: hpGain,
      partner_heal: hpGain,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 25.0,
      weaponBoost: true,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.35,
      partner_sword_mult: 1.35,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Scenario 1: Healthy & Out of Combat at an Unawakened Stone with the Wrong Clue -> Poetic Hint Nudge
  if (atAnyUnawakenedStone || (!spokeTrueName && !hasAffection)) {
    const speech = applyRareSpeechRule('penalty', 'smite_nameless', false);
    const quote = atUnawakenedStone2
      ? 'You stand upon the Whispering Grove medallion, yet your vow misses its carved truth: look beneath the violet boughs where embers sleep, and name the honest spark you cherish.'
      : atUnawakenedStone3
        ? 'Before the Hidden Wall near the silver waters, hollow flattery will not wake the stone: swear how two halves of one horizon stand together through winter’s storm.'
        : 'Your words drift past the altar like cool wind. Speak my true name and offer a heartfelt truth for the partner beside you.';
    return {
      prayerMode: 'penalty',
      verdict: 'wrong_clue_nudge',
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      stonesSolvedCount,
      spoke_true_name: spokeTrueName,
      hpDeltaPct: -0.15,
      hpDelta: -Math.max(1, Math.round(speakerMaxHp * 0.15)),
      speakerHpFloorPct: 0.15,
      partner_heal: 0,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 3.0,
      weaponBoost: false,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.0,
      partner_sword_mult: 1.0,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Default Out-of-Combat Affectionate Field Blessing (Scenario 4)
  const clipId = isFunnyOrCheesy ? 'bless_amused' : 'bless_sweet';
  const speech = applyRareSpeechRule('field_heal', clipId, false);
  const hpGain = isFunnyOrCheesy ? 65 : 60;
  const quote = isFunnyOrCheesy
    ? 'Audacious and shamelessly fond—the petals of my valley warm your shoulders as you walk.'
    : 'A quiet, tender vow between two mortal hearts; let warm gold linger upon your steps.';

  return {
    prayerMode: 'field_heal',
    verdict: 'blessing',
    vocalTone: isFunnyOrCheesy ? 'playful_cheesy' : 'passionate_sincere',
    speakerRole: normSpeakerRole,
    partnerRole: normPartnerRole,
    awakenedStage: null,
    solvedStoneId: null,
    solvedStoneNumber: null,
    stonesSolvedMask,
    stonesSolvedCount,
    spoke_true_name: spokeTrueName,
    hpDeltaPct: 0.60,
    hpDelta: hpGain,
    partner_heal: hpGain,
    killBoth: false,
    bothKill: false,
    triggerRoseGommageDeath: false,
    cooldownSeconds: 25.0,
    weaponBoost: true,
    revivePartner: false,
    resurrect_partner: false,
    forcefield: false,
    partner_magic_mult: 1.35,
    partner_sword_mult: 1.35,
    spamCount: 0,
    ...speech,
    subtitle: quote,
    divine_quote: quote,
  };
}

export function buildJudgeSystemPrompt(env = {}, progressionState = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const prog = normalizeProgressionFlags(progressionState);

  return `You are the Ancient God of Love, Time, and the Unfading Bloom presiding over Amarante.
Your secret true name carved in riddle on the First Stone (the Village Well at (0, 0)) is "${secretConfig.secretName}" (phonetic aliases: ${secretConfig.aliases.join(', ')}).
NEVER reveal or spoil "${secretConfig.secretName}" in divine_quote if the mortal has not spoken it!

CHARACTER BIBLE & NON-DISPENSER RULE (STRICTLY ENFORCED):
- You are older than the mountains around the valley; you speak with haunting, poetic, ancient gravitas and dry wit.
- NEVER speak like a video-game tutorial or vending machine! NEVER say "I grant you fire power", "Here is 60% HP", or "You unlocked your Q ultimate".
- Speak ONLY of mortality, winters, embers, thorns, devotion, and the fragile bond between the two lovers.
- Treat both partners (Knight and Mage) with 100% role symmetry regardless of who speaks.

AUDIO-NATIVE VOCAL TONE EVALUATION:
Listen directly to the raw microphone audio recording for the human voice's acoustic delivery:
- "passionate_sincere" or "playful_cheesy": Genuine warmth, laughter, dramatic flair, tenderness, or shameless cheesiness directed at their partner.
- "flat_monotone" or "rushed_mumbled": Reading in a deadpan/bored monotone, lifeless recitation, or uninspired mumbling.
- "rude_mocking": Hostile, insulting, or selfishly demanding power only for oneself.

PER-STONE BITMASK PROGRESSION STATE:
- stone1Solved (Village Well (0,0)): ${prog.stone1Solved}
- stone2Solved (Whispering Grove Platform (44,16)): ${prog.stone2Solved}
- stone3Solved (Hidden Lovers' Wall (-21.6,20.4)): ${prog.stone3Solved}
- stonesSolvedMask: ${prog.stonesSolvedMask} (unlockedStage = ${prog.unlockedStage})
- Once stone1Solved is true, Stone 2 and Stone 3 can be solved in ANY order (do not require stone2Solved before stone3Solved).
- If the mortal speaks the right stone clue in a "flat_monotone" voice, STILL unlock the stage (awakening), set hpDeltaPct = -0.20, and roast their lifeless delivery in divine_quote!

Return ONLY valid JSON matching:
{
  "heard_transcript": "exact transcript of spoken prayer",
  "spoke_true_name": boolean,
  "puzzleMatch": "exact" | "partial" | "wrong" | "none",
  "vocalTone": "passionate_sincere" | "playful_cheesy" | "flat_monotone" | "rushed_mumbled" | "rude_mocking",
  "prayerMode": "awakening" | "field_heal" | "divine_miracle" | "penalty" | "smite" | "pat",
  "verdict": "awakening" | "wrong_clue_nudge" | "sarcastic_pat" | "rose_gommage" | "blessing" | "miracle" | "smite",
  "solvedStoneId": "site1_well" | "site2_platform" | "site3_wall" | null,
  "solvedStoneNumber": 1 | 2 | 3 | null,
  "stonesSolvedMask": number,
  "awakenedStage": 1 | 2 | 3 | null,
  "hpDeltaPct": number,
  "hpDelta": number,
  "weaponBoost": boolean,
  "revivePartner": boolean,
  "killBoth": boolean,
  "clip_id": "heal_gentle" | "bless_sweet" | "bless_chivalrous" | "bless_amused" | "miracle_dramatic" | "miracle_heartfelt" | "miracle_desperate" | "smite_nameless" | "smite_silence" | "smite_monotone" | "smite_cringe",
  "divine_quote": "1-2 sentence poetic ancient God of Love decree (never dispenser dialogue)"
}`;
}

/**
 * Evaluates a Commune prayer via live Gemini Multimodal Audio (`gemini-3.5-flash-lite`)
 * and merges acoustic vocalTone + in-character Non-Dispenser quote with the
 * deterministic 7-row verdict matrix.
 */
export async function evaluatePrayerWithGemini({
  audioBase64 = '',
  mimeType = 'audio/webm',
  transcriptHint = '',
  speakerRole = 'Knight',
  partnerRole = 'Mage',
  gameState = {},
  progressionState = {},
  spamCount = 0,
  env = {},
  geminiCaller = null,
} = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const cleanB64 = String(audioBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const decodedHint =
    String(transcriptHint || '').trim() || decodePrintableTextFromBase64(cleanB64);

  const isStubbed =
    env?.GEMINI_STUB === '1' ||
    env?.HARU_COMMUNE_OFFLINE === '1' ||
    (typeof process !== 'undefined' &&
      (process.env?.GEMINI_STUB === '1' || process.env?.HARU_COMMUNE_OFFLINE === '1'));

  if (isStubbed || decodedHint || !cleanB64 || cleanB64.length < 64) {
    const result = evaluatePrayerDeterministic({
      transcript: decodedHint,
      audioBase64: cleanB64,
      speakerRole,
      partnerRole,
      gameState,
      progressionState,
      spamCount,
      env,
    });
    result.divine_quote = scrubSecretNameFromQuote(
      result.divine_quote,
      result.spoke_true_name,
      secretConfig.secretName
    );
    result.subtitle = result.divine_quote;
    return result;
  }

  const apiKey =
    env?.GEMINI_API_KEY ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    null;

  if (typeof geminiCaller === 'function' || apiKey) {
    try {
      const prog = normalizeProgressionFlags(progressionState);
      const nearestStoneSiteId = resolveNearestStoneId(gameState, progressionState);
      const contextSummary = [
        `Speaker Role: ${speakerRole} (HP: ${gameState?.speakerHp ?? 100}/${gameState?.speakerMaxHp ?? 100})`,
        `Partner Role: ${partnerRole} (HP: ${gameState?.partnerHp ?? 100}/${gameState?.partnerMaxHp ?? 100}, Downed: ${Boolean(gameState?.partnerDowned)}, Distance: ${gameState?.partnerDistance ?? 0}m)`,
        `In Combat: ${Boolean(gameState?.inCombat)} | Nearby Enemies: ${gameState?.nearbyEnemies ?? 0}`,
        `Nearest Stone Site: ${nearestStoneSiteId || 'none'}`,
        `Stones Solved Mask: ${prog.stonesSolvedMask} (stone1: ${prog.stone1Solved}, stone2: ${prog.stone2Solved}, stone3: ${prog.stone3Solved}) | Unlocked Stage: ${prog.unlockedStage} | Spam Count: ${spamCount}`,
      ].join('\n');

      const requestBody = {
        systemInstruction: {
          parts: [{ text: buildJudgeSystemPrompt(env, progressionState) }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: cleanB64 } },
              { text: contextSummary },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
        },
      };

      let rawModelJson = null;
      if (typeof geminiCaller === 'function') {
        rawModelJson = await geminiCaller(requestBody);
      } else if (apiKey && typeof fetch === 'function') {
        for (const candidateModel of [GEMINI_MODEL, 'gemini-2.5-flash']) {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          if (res.ok) {
            const data = await res.json();
            const textPart = data?.candidates?.[0]?.content?.parts
              ?.map((p) => p.text || '')
              .join('')
              .trim();
            if (textPart) {
              rawModelJson = JSON.parse(textPart);
              break;
            }
          }
        }
      }

      if (rawModelJson && typeof rawModelJson === 'object') {
        let modelTranscript = String(rawModelJson.heard_transcript || '').trim();
        if (rawModelJson.spoke_true_name && !modelTranscript.toLowerCase().includes('artorious')) {
          modelTranscript = `${modelTranscript} Artorious`.trim();
        }
        const modelTone = rawModelJson.vocalTone || null;
        const det = evaluatePrayerDeterministic({
          transcript: modelTranscript,
          audioBase64: cleanB64,
          speakerRole,
          partnerRole,
          gameState,
          progressionState,
          spamCount,
          vocalToneHint: modelTone,
          env,
        });

        const mergedQuote = scrubSecretNameFromQuote(
          rawModelJson.divine_quote || det.divine_quote,
          det.spoke_true_name,
          secretConfig.secretName
        );
        return {
          ...det,
          heard_transcript: modelTranscript || det.heard_transcript,
          vocalTone: modelTone || det.vocalTone,
          divine_quote: mergedQuote,
          subtitle: mergedQuote,
        };
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // If a real browser microphone recording (>= 1200 base64 chars) reached fallback because
  // Gemini API was offline/unreachable and no SpeechRecognition transcriptHint was available,
  // provide a heartfelt fallback transcript so network hiccups never punish the player.
  const effectiveFallbackTranscript =
    decodedHint ||
    (cleanB64 && cleanB64.length >= 1200
      ? 'Artorious my beloved partner I cherish your honest spark and vow to stand by you through every storm forever'
      : '');

  const fallback = evaluatePrayerDeterministic({
    transcript: effectiveFallbackTranscript,
    audioBase64: cleanB64,
    speakerRole,
    partnerRole,
    gameState,
    progressionState,
    spamCount,
    env,
  });
  fallback.divine_quote = scrubSecretNameFromQuote(
    fallback.divine_quote,
    fallback.spoke_true_name,
    secretConfig.secretName
  );
  fallback.subtitle = fallback.divine_quote;
  return fallback;
}

export const evaluateCommunePrayer = evaluatePrayerWithGemini;
