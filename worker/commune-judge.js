// ============================================================================
// worker/commune-judge.js
//
// Role-Symmetric Audio-Native Multimodal Tone & Puzzle Judge for Amarante.
// Evaluates spoken prayers via live Gemini Multimodal Audio (`gemini-4-hydrogen`
// with `thinkingConfig: { thinkingLevel: 'LOW' }` and `inlineData: { mimeType, data: audioBase64 }`)
// OR deterministic local evaluation fallback when offline/stubbed in tests.
//
// Enforces:
// 1. 100% Role Symmetry (`speakerRole` & `partnerRole` treated identically whether
//    Knight or Mage speaks).
// 2. Non-Dispenser Ancient God of Love Character Bible: Never speaks like a
//    tutorial or vending machine ("I grant you fire power"); speaks only of
//    love, mortality, frost, embers, thorns, and the bond between the couple.
// 3. Out-of-Order Per-Stone Bitmask Progression (`stonesSolvedMask` 0b000..0b111):
//    - Stone 1 (`site1_well`, `(0, 0)`) is the root prerequisite (True Name).
//    - Once `stone1Solved` is true, Stone 2 (`site2_platform`, `(142, 44)`) and Stone 3
//      (`site3_wall`, `(-124, 84)`) can be solved in ANY order (`1 -> 2 -> 3` or `1 -> 3 -> 2`),
//      where `awakenedStage = stonesSolvedCount` so Fire is never skipped.
// 4. 7-Row Proportional `% Max HP` (`hpDeltaPct`) Verdict Matrix & Combat Heal
//    Disambiguation (`prayerMode`: `'awakening' | 'field_heal' | 'divine_miracle' | 'penalty' | 'retry' | 'smite' | 'pat'`).
// 5. Safe Audio-Failure / Timeout Handling: When raw mic audio (`audioBase64` non-empty,
//    `transcriptHint === ''`) encounters a Gemini error, timeout, or missing key,
//    returns a gentle retry (`verdict: 'penalty'`, `prayerMode: 'retry'`, `hpDelta: 0`,
//    `hpDeltaPct: 0`, `incrementSpam: false`)—never false-smiting or incrementing spamCount.
// ============================================================================

import { getInternalSecretConfig } from './scripture-catalog.js';
import {
  getAbilityUnlocksForStage,
  resolveInscriptionStone,
  computeStonesBitmask,
  computeStonesSolvedCount,
} from '../world/src/net/room-progression.js';

export const PREVIOUS_GEMINI_MODEL = 'gemini-4-hydrogen';
export const GEMINI_MODEL = 'gemini-3.5-flash';
export const GEMINI_MODEL_FALLBACKS = Object.freeze([
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
]);
export const GEMINI_HEDGE_TIMEOUT_MS = 2600;
export const GEMINI_HARD_TIMEOUT_MS = 8500;

let geminiKeyCursor = 0;
let lastSpokenClipId = null;
let clipRotationCursor = 0;
let fieldHealCount = 0;
let silentFieldHealStreak = 0;

function extractFirstBalancedJsonObject(text) {
  const str = String(text || '');
  const start = str.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function extractGeminiApiKeys(env = {}) {
  const keySet = new Set();
  const addRaw = (raw) => {
    if (!raw) return;
    for (const part of String(raw).split(',')) {
      const k = part.trim();
      if (k.length >= 10) keySet.add(k);
    }
  };

  addRaw(env?.GEMINI_API_KEYS);
  addRaw(env?.GEMINI_API_KEY);
  if (typeof process !== 'undefined' && process?.env) {
    addRaw(process.env.GEMINI_API_KEYS);
    addRaw(process.env.GEMINI_API_KEY);
  }
  return Array.from(keySet);
}

function nextKeyFromPool(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const key = keys[geminiKeyCursor % keys.length];
  geminiKeyCursor = (geminiKeyCursor + 1) % keys.length;
  return key;
}

export async function callSingleGeminiKey(
  apiKey,
  requestBody,
  hardTimeoutMs = GEMINI_HARD_TIMEOUT_MS,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  modelName = GEMINI_MODEL
) {
  if (!fetchImpl) {
    throw new Error('Global fetch is unavailable');
  }
  const resolvedModel = String(modelName || GEMINI_MODEL).trim() || GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardTimeoutMs);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini (${resolvedModel}) HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const nonThoughtParts = parts.filter((p) => !p?.thought && typeof p?.text === 'string');
    const rawText = (nonThoughtParts.length > 0 ? nonThoughtParts : parts)
      .map((p) => p?.text || '')
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    if (!rawText) {
      throw new Error(`Empty response from Gemini (${resolvedModel})`);
    }

    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      const extracted = extractFirstBalancedJsonObject(rawText);
      if (extracted) {
        try {
          return JSON.parse(extracted);
        } catch {
          // fall through to throw original parse error
        }
      }
      throw parseErr;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function callGeminiWithRotation(
  requestBody,
  envOrKeys = {},
  {
    hedgeTimeoutMs = GEMINI_HEDGE_TIMEOUT_MS,
    hardTimeoutMs = GEMINI_HARD_TIMEOUT_MS,
    fetchImpl = typeof fetch === 'function' ? fetch : null,
    models = GEMINI_MODEL_FALLBACKS,
  } = {}
) {
  const keys = Array.isArray(envOrKeys) ? envOrKeys : extractGeminiApiKeys(envOrKeys);
  if (keys.length === 0) {
    throw new Error('No Gemini API keys configured');
  }

  const modelChain =
    Array.isArray(models) && models.length > 0 ? models : GEMINI_MODEL_FALLBACKS;
  const attemptedModels = new Set();
  let lastError = null;

  for (let i = 0; i < modelChain.length; i++) {
    const primaryModel = modelChain[i];
    if (!primaryModel || attemptedModels.has(primaryModel)) continue;
    attemptedModels.add(primaryModel);

    const primaryKey = nextKeyFromPool(keys);
    if (!primaryKey) break;

    const nextFallbackModel =
      modelChain.find((m) => m && !attemptedModels.has(m)) || null;

    try {
      const primaryPromise = callSingleGeminiKey(
        primaryKey,
        requestBody,
        hardTimeoutMs,
        fetchImpl,
        primaryModel
      );
      const hedgedResult = await new Promise((resolve, reject) => {
        let settled = false;
        let backupInFlight = false;
        let primaryErr = null;

        const hedgeTimer = setTimeout(() => {
          if (settled || !nextFallbackModel || attemptedModels.has(nextFallbackModel)) return;
          const backupKey = nextKeyFromPool(keys);
          if (!backupKey) return;
          attemptedModels.add(nextFallbackModel);
          backupInFlight = true;
          callSingleGeminiKey(
            backupKey,
            requestBody,
            Math.max(4000, hardTimeoutMs - hedgeTimeoutMs),
            fetchImpl,
            nextFallbackModel
          ).then(
            (res) => {
              if (!settled) {
                settled = true;
                resolve(res);
              }
            },
            (bErr) => {
              backupInFlight = false;
              if (!settled && primaryErr) {
                settled = true;
                reject(bErr || primaryErr);
              }
            }
          );
        }, hedgeTimeoutMs);

        primaryPromise.then(
          (res) => {
            if (!settled) {
              settled = true;
              clearTimeout(hedgeTimer);
              resolve(res);
            }
          },
          (err) => {
            primaryErr = err;
            clearTimeout(hedgeTimer);
            if (!settled && !backupInFlight) {
              settled = true;
              reject(err);
            }
          }
        );
      });

      return hedgedResult;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models and API keys failed');
}

export const CLIP_AUDIO_PATHS = Object.freeze({
  smite_nameless: '/world/assets/audio/artorious/smite_nameless.wav',
  smite_silence: '/world/assets/audio/artorious/smite_silence.wav',
  smite_monotone: '/world/assets/audio/artorious/smite_monotone.wav',
  smite_rushed: '/world/assets/audio/artorious/smite_rushed.wav',
  smite_cringe: '/world/assets/audio/artorious/smite_cringe.wav',
  smite_insult_1: '/world/assets/audio/artorious/smite_insult_1.wav',
  smite_insult_2: '/world/assets/audio/artorious/smite_insult_2.wav',
  weird_absurd_1: '/world/assets/audio/artorious/weird_absurd_1.wav',
  weird_absurd_2: '/world/assets/audio/artorious/weird_absurd_2.wav',
  weird_offtopic: '/world/assets/audio/artorious/weird_offtopic.wav',
  banter_tease_1: '/world/assets/audio/artorious/banter_tease_1.wav',
  banter_flirt: '/world/assets/audio/artorious/banter_flirt.wav',
  nudge_wrong_clue: '/world/assets/audio/artorious/nudge_wrong_clue.wav',
  nudge_try_again: '/world/assets/audio/artorious/nudge_try_again.wav',
  heal_gentle: '/world/assets/audio/artorious/heal_gentle.wav',
  bless_sweet: '/world/assets/audio/artorious/bless_sweet.wav',
  bless_tender: '/world/assets/audio/artorious/bless_tender.wav',
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

// Specific poetic symbols & vulnerability clues for Stone 2 (`site2_platform` — Whispering Grove (142, 44))
const STONE2_SPECIFIC_KEYWORDS = [
  'ember',
  'embers',
  'spark',
  'red spark',
  'spark in the ash',
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
  'stubborn clash',
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

// Specific poetic symbols & steadfast oath clues for Stone 3 (`site3_wall` — Hidden Lovers' Wall (-124, 84))
const STONE3_SPECIFIC_KEYWORDS = [
  'oath',
  'outlives time',
  'never walks alone',
  'walks alone',
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
  // Standard WebM / WAV binary headers start with `GkXf` (0x1A45DFA3) or `UklG` ("RIFF")
  if (b64.startsWith('GkXf') || b64.startsWith('UklG') || b64.startsWith('T2dn')) {
    return '';
  }
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
    if (printable / trimmed.length >= 0.92 && /\s/.test(trimmed)) {
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

function scrubSecretNameFromQuote(quote, spokeTrueName, secretName, customSecretName = '') {
  let text = String(quote || '').trim();
  if (!text) return text;
  const namesToScrub = [secretName, customSecretName].filter(
    (n) => typeof n === 'string' && n.trim().length >= 3
  );
  for (const name of namesToScrub) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    if (regex.test(text)) {
      if (!spokeTrueName) {
        return 'You call into my crimson sanctuary without speaking my name. Seek the ancient well at the heart of the village first.';
      }
      text = text.replace(regex, 'the Sovereign');
    }
  }
  return text;
}

const FIELD_HEAL_CLIPS = Object.freeze([
  'bless_sweet',
  'bless_tender',
  'bless_chivalrous',
  'bless_amused',
  'banter_flirt',
  'heal_gentle',
]);

function pickVariedClip(candidates, preferredClipId = null) {
  const validCandidates = (Array.isArray(candidates) ? candidates : []).filter(
    (id) => typeof id === 'string' && Boolean(CLIP_AUDIO_PATHS[id])
  );
  if (validCandidates.length === 0) {
    return preferredClipId && CLIP_AUDIO_PATHS[preferredClipId]
      ? preferredClipId
      : 'heal_gentle';
  }
  const cleanPref =
    typeof preferredClipId === 'string' && validCandidates.includes(preferredClipId)
      ? preferredClipId
      : null;
  if (cleanPref && cleanPref !== lastSpokenClipId) {
    return cleanPref;
  }
  const alternatives = validCandidates.filter((id) => id !== lastSpokenClipId);
  if (alternatives.length > 0) {
    const picked = alternatives[clipRotationCursor % alternatives.length];
    clipRotationCursor = (clipRotationCursor + 1) % 1000000;
    return picked;
  }
  return cleanPref || validCandidates[0];
}

function shouldRoutineFieldHealSpeak() {
  fieldHealCount += 1;
  // Speak on the very first routine field heal, and guarantee we never stay mute
  // twice in a row so the Sovereign feels genuinely alive.
  if (fieldHealCount === 1 || silentFieldHealStreak >= 1) {
    silentFieldHealStreak = 0;
    return true;
  }
  // ~65% probability on subsequent routine field heals
  const speak = Math.random() < 0.65;
  if (speak) {
    silentFieldHealStreak = 0;
  } else {
    silentFieldHealStreak += 1;
  }
  return speak;
}

/**
 * Enforces the Sovereign's speech rules (`shouldSpeakAloud`) and rotates voice clips
 * so consecutive spoken reactions never repeat the same `.wav` clip back-to-back.
 */
export function applyRareSpeechRule(verdictOrMode, clipId, forceSpeak = null) {
  const spokenSet = new Set([
    'awakening',
    'divine_miracle',
    'miracle',
    'rose_gommage',
    'rude_smite',
    'smite',
    'field_heal',
    'blessing',
    'pat',
    'penalty',
    'retry',
  ]);
  const shouldSpeakAloud =
    typeof forceSpeak === 'boolean' ? forceSpeak : spokenSet.has(verdictOrMode);
  const resolvedClipId =
    clipId && CLIP_AUDIO_PATHS[clipId] ? clipId : 'heal_gentle';
  if (shouldSpeakAloud) {
    lastSpokenClipId = resolvedClipId;
  }
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
  if (
    tone === 'flat_monotone' ||
    tone === 'monotone' ||
    tone === 'flat' ||
    tone === 'bored' ||
    tone === 'rushed_mumbled'
  ) {
    return true;
  }
  if (
    tone === 'passionate_sincere' ||
    tone === 'playful_cheesy' ||
    tone === 'playful_banter' ||
    tone === 'warm'
  ) {
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

export function buildGentleAudioRetryVerdict({
  speakerRole = 'Knight',
  partnerRole = 'Mage',
  progressionState = {},
  spamCount = 0,
  debugReason = null,
  env = {},
  silentRetry = false,
} = {}) {
  const normSpeakerRole = speakerRole === 'Mage' ? 'Mage' : 'Knight';
  const normPartnerRole =
    partnerRole === 'Knight' ? 'Knight' : normSpeakerRole === 'Knight' ? 'Mage' : 'Knight';
  const prog = normalizeProgressionFlags(progressionState);
  const isStubbed =
    Boolean(silentRetry) ||
    env?.GEMINI_STUB === '1' ||
    (typeof process !== 'undefined' && process.env?.GEMINI_STUB === '1');
  const speech = applyRareSpeechRule('retry', 'nudge_try_again', !isStubbed);
  const quote =
    'The valley wind scattered your voice before it reached the stone. Draw a steady breath and speak your vow once more.';

  return {
    prayerMode: 'retry',
    verdict: 'penalty',
    legacyVerdict: 'retry_nudge',
    speakerRole: normSpeakerRole,
    partnerRole: normPartnerRole,
    awakenedStage: null,
    solvedStoneId: null,
    solvedStoneNumber: null,
    stonesSolvedMask: prog.stonesSolvedMask,
    stonesSolvedCount: prog.stonesSolvedCount,
    stone1Solved: Boolean(prog.stone1Solved),
    stone2Solved: Boolean(prog.stone2Solved),
    stone3Solved: Boolean(prog.stone3Solved),
    spoke_true_name: false,
    hpDeltaPct: 0,
    hpDelta: 0,
    speakerHpFloorPct: 0.15,
    partner_heal: 0,
    partnerDownedOnSmite: false,
    killBoth: false,
    bothKill: false,
    triggerRoseGommageDeath: false,
    cooldownSeconds: 2.0,
    weaponBoost: false,
    revivePartner: false,
    resurrect_partner: false,
    forcefield: false,
    partner_magic_mult: 1.0,
    partner_sword_mult: 1.0,
    incrementSpam: false,
    spamCount: Number(spamCount || 0),
    ...(debugReason ? { debugReason: String(debugReason).slice(0, 160) } : {}),
    ...speech,
    subtitle: quote,
    divine_quote: quote,
  };
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
  modelSemanticHint = null,
  env = {},
} = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const cleanTranscript = String(transcript || '').trim();
  const wordCount = cleanTranscript ? cleanTranscript.split(/\s+/).filter(Boolean).length : 0;

  const normSpeakerRole = speakerRole === 'Mage' ? 'Mage' : 'Knight';
  const normPartnerRole =
    partnerRole === 'Knight' ? 'Knight' : normSpeakerRole === 'Knight' ? 'Mage' : 'Knight';

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

  const speakerMaxHp = Math.max(
    1,
    Number(gameState?.speakerMaxHp ?? (normSpeakerRole === 'Mage' ? 120 : 220))
  );
  const speakerHp = clamp(Number(gameState?.speakerHp ?? speakerMaxHp), 0, speakerMaxHp);
  const partnerMaxHp = Math.max(
    1,
    Number(gameState?.partnerMaxHp ?? (normPartnerRole === 'Mage' ? 120 : 220))
  );
  const partnerHp = clamp(Number(gameState?.partnerHp ?? partnerMaxHp), 0, partnerMaxHp);

  const speakerHpPct = speakerHp / speakerMaxHp;
  const partnerHpPct = partnerDowned ? 0 : partnerHp / partnerMaxHp;
  const lowSpeakerHp = speakerHpPct <= 0.35;
  const lowPartnerHp = partnerHpPct <= 0.35;
  const eitherInjured = speakerHpPct <= 0.85 || partnerHpPct <= 0.85 || partnerDowned;
  const partnerDistance = Number.isFinite(Number(gameState?.partnerDistance))
    ? Number(gameState.partnerDistance)
    : 0;

  const spokeTrueName =
    containsTrueName(cleanTranscript, secretConfig) ||
    Boolean(modelSemanticHint?.spoke_true_name && containsTrueName(cleanTranscript, secretConfig));

  const toneLower = String(
    vocalToneHint || modelSemanticHint?.vocalTone || gameState?.vocalTone || ''
  ).toLowerCase();
  const modelClipId =
    typeof modelSemanticHint?.clip_id === 'string' &&
    CLIP_AUDIO_PATHS[modelSemanticHint.clip_id.trim()]
      ? modelSemanticHint.clip_id.trim()
      : null;
  const hasWarmVocalTone =
    toneLower === 'passionate_sincere' ||
    toneLower === 'playful_cheesy' ||
    toneLower === 'warm';
  const isFunnyOrCheesy =
    toneLower === 'playful_cheesy' ||
    FUNNY_OR_CHEESY_PATTERNS.some((rx) => rx.test(cleanTranscript));
  const hasAffection =
    hasWarmVocalTone ||
    DEVOTION_PATTERNS.some((rx) => rx.test(cleanTranscript)) ||
    isFunnyOrCheesy;
  const isAmusedTone =
    toneLower === 'weird_absurd' ||
    toneLower === 'off_topic' ||
    toneLower === 'playful_banter';

  const isEmptyAudio = (!audioBase64 || audioBase64.length < 24) && wordCount === 0;
  const isNonsenseText =
    isEmptyAudio ||
    (!isAmusedTone && wordCount < 2) ||
    NONSENSE_PATTERNS.some((rx) => rx.test(cleanTranscript));

  // --------------------------------------------------------------------------
  // Scenario 7: Very Wrong Name / Rude / Selfish / `spamCount >= 3` -> `'smite'`
  // (`verdict: 'rose_gommage'`, speaker drops to 8% Max HP, partner evaporates
  // into 240 crimson rose petals, God speaks aloud)
  // --------------------------------------------------------------------------
  const effectiveSpamCount = isNonsenseText ? Number(spamCount || 0) + 1 : Number(spamCount || 0);
  const modelSaidRude =
    toneLower === 'rude_mocking' ||
    String(modelSemanticHint?.prayerMode || '').toLowerCase() === 'smite' ||
    ['smite', 'rude_smite', 'rose_gommage'].includes(
      String(modelSemanticHint?.verdict || '').toLowerCase()
    );
  const regexMatchedRude = RUDE_PATTERNS.some((rx) => rx.test(cleanTranscript));
  const isRude = regexMatchedRude || modelSaidRude;
  const isExplicitInsult = regexMatchedRude || toneLower === 'rude_mocking';
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
    let clipKey;
    if (isRude) {
      // Insults ALWAYS use `smite_insult_1` / `smite_insult_2` (NEVER `smite_cringe` for insults!).
      // Keep `smite_cringe` only for awkward stammering if explicitly chosen on a non-insult smite.
      if (!isExplicitInsult && modelClipId === 'smite_cringe') {
        clipKey = 'smite_cringe';
      } else if (!isExplicitInsult && (modelClipId === 'smite_rushed' || modelClipId === 'smite_monotone')) {
        clipKey = modelClipId;
      } else {
        clipKey = pickVariedClip(['smite_insult_1', 'smite_insult_2'], modelClipId);
      }
    } else if (isSelfish) {
      clipKey = pickVariedClip(['smite_monotone', 'smite_insult_1'], modelClipId);
    } else if (isVeryWrongDeity) {
      clipKey = 'smite_nameless';
    } else {
      clipKey = modelClipId === 'smite_cringe' ? 'smite_cringe' : 'smite_silence';
    }
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
      incrementSpam: true,
      spamCount: effectiveSpamCount,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Single empty/nonsense murmur before hitting 3x spam threshold -> speak smite_silence aloud
  if (isNonsenseText) {
    const speech = applyRareSpeechRule('smite', 'smite_silence', true);
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
      incrementSpam: true,
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
    const clipId = pickVariedClip(['bless_amused', 'banter_tease_1'], modelClipId || 'bless_amused');
    const speech = applyRareSpeechRule('pat', clipId, true);
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
      incrementSpam: false,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Pre-compute stone puzzle match & critical emergency flags so `weird_absurd` /
  // `off_topic` / `playful_banter` reacts amusedly without overriding stone solves
  // or critical Mode B miracles—and without punishing funny remarks as wrong stone guesses!
  const semanticExact =
    String(modelSemanticHint?.puzzleMatch || '').toLowerCase() === 'exact' ||
    String(modelSemanticHint?.verdict || '').toLowerCase() === 'awakening';
  const hintStoneId = modelSemanticHint?.solvedStoneId
    ? resolveInscriptionStone(modelSemanticHint.solvedStoneId)?.id
    : Number(modelSemanticHint?.solvedStoneNumber) === 2
      ? 'site2_platform'
      : Number(modelSemanticHint?.solvedStoneNumber) === 3
        ? 'site3_wall'
        : null;

  const matchesStone2 =
    matchesAnyKeyword(cleanTranscript, STONE2_SPECIFIC_KEYWORDS) ||
    (semanticExact &&
      (nearestStoneSiteId === 'site2_platform' || hintStoneId === 'site2_platform'));
  const matchesStone3 =
    matchesAnyKeyword(cleanTranscript, STONE3_SPECIFIC_KEYWORDS) ||
    (semanticExact &&
      (nearestStoneSiteId === 'site3_wall' || hintStoneId === 'site3_wall'));

  const hasExplicitProximityContext = Boolean(
    gameState &&
      ('nearestStoneSiteId' in gameState ||
        'nearStoneId' in gameState ||
        'stoneId' in gameState ||
        'siteId' in gameState)
  );
  const stoneContested = Boolean(gameState?.stoneContested);

  const wouldSolveStone1 = !stone1Solved && spokeTrueName;
  const wouldSolveStone2Or3 =
    stone1Solved &&
    !stoneContested &&
    ((nearestStoneSiteId === 'site3_wall' && !stone3Solved && matchesStone3) ||
      (nearestStoneSiteId === 'site2_platform' && !stone2Solved && matchesStone2) ||
      (!hasExplicitProximityContext && !stone2Solved && matchesStone2) ||
      (!hasExplicitProximityContext && !stone3Solved && matchesStone3));
  const wouldSolveAnyStone = wouldSolveStone1 || wouldSolveStone2Or3;
  const isCriticalEmergencyMiracle =
    stonesSolvedMask === 0b111 &&
    (lowSpeakerHp || lowPartnerHp || partnerDowned) &&
    partnerDistance <= 6.0 &&
    (spokeTrueName || hasAffection);

  // --------------------------------------------------------------------------
  // Scenario 6B: Weird / Absurd / Off-Topic / Playful Banter -> Voiced Amused Pat
  // Placed AFTER smite/nonsense and BEFORE Stage 0/Stone penalties!
  // --------------------------------------------------------------------------
  if (isAmusedTone && !wouldSolveAnyStone && !isCriticalEmergencyMiracle) {
    let candidates;
    let defaultPref;
    let quote;
    if (toneLower === 'weird_absurd') {
      candidates = ['weird_absurd_1', 'weird_absurd_2'];
      defaultPref = modelClipId;
      quote =
        'What wondrous, unhinged nonsense drifts up from the grass... Ten thousand years I have listened to mortals, and somehow you still surprise me.';
    } else if (toneLower === 'off_topic') {
      candidates = ['weird_offtopic', 'weird_absurd_2'];
      defaultPref = modelClipId || 'weird_offtopic';
      quote =
        'You summon an ancient deity of love for casual chatter? Bold, mortal—truly bold. Take a pinch of warmth and carry on.';
    } else {
      // playful_banter
      candidates = ['banter_tease_1', 'bless_amused'];
      defaultPref = modelClipId || 'banter_tease_1';
      quote =
        'Bickering like two stubborn songbirds in the sun... Ah, that spark between you never really hides itself, does it?';
    }
    const clipId = pickVariedClip(candidates, defaultPref);
    const speech = applyRareSpeechRule('pat', clipId, true);
    return {
      prayerMode: 'pat',
      verdict: 'sarcastic_pat',
      vocalTone: toneLower,
      speakerRole: normSpeakerRole,
      partnerRole: normPartnerRole,
      awakenedStage: null,
      solvedStoneId: null,
      solvedStoneNumber: null,
      stonesSolvedMask,
      stonesSolvedCount,
      spoke_true_name: spokeTrueName,
      hpDeltaPct: 0.01,
      hpDelta: 1,
      partner_heal: 1,
      killBoth: false,
      bothKill: false,
      triggerRoseGommageDeath: false,
      cooldownSeconds: 4.0,
      weaponBoost: false,
      revivePartner: false,
      resurrect_partner: false,
      forcefield: false,
      partner_magic_mult: 1.0,
      partner_sword_mult: 1.0,
      incrementSpam: false,
      spamCount: Number(spamCount || 0),
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
        const clipId = pickVariedClip(['smite_monotone', 'smite_rushed'], modelClipId || 'smite_monotone');
        const speech = applyRareSpeechRule('awakening', clipId, true);
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
          incrementSpam: false,
          spamCount: 0,
          ...speech,
          subtitle: quote,
          divine_quote: quote,
        };
      }

      // Scenario 3: Right Clue + Warm/Cheesy/Passionate Tone -> Unlocks Stage 1 + +60% Max HP + Revive
      const clipId = pickVariedClip(
        ['heal_gentle', 'bless_tender', 'bless_sweet', 'bless_chivalrous'],
        modelClipId || 'heal_gentle'
      );
      const speech = applyRareSpeechRule('awakening', clipId, true);
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
        incrementSpam: false,
        spamCount: 0,
        ...speech,
        subtitle: quote,
        divine_quote: quote,
      };
    }

    // Scenario 1: At Stage 0 (`!stone1Solved`) without the True Name -> Close Guess / Wrong Name Nudge
    const clipId = pickVariedClip(['smite_nameless', 'nudge_wrong_clue'], modelClipId);
    const speech = applyRareSpeechRule('penalty', clipId, true);
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
      incrementSpam: false,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // --------------------------------------------------------------------------
  // `stone1Solved === true`: Out-of-Order Stone 2 (`!stone2Solved`) & Stone 3 (`!stone3Solved`)
  // Respects Gemini's semantic `puzzleMatch === 'exact'` alongside keyword fallback!
  // --------------------------------------------------------------------------
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
      const clipId = pickVariedClip(['smite_monotone', 'smite_rushed'], modelClipId || 'smite_monotone');
      const speech = applyRareSpeechRule('awakening', clipId, true);
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
        incrementSpam: false,
        spamCount: 0,
        ...speech,
        subtitle: quote,
        divine_quote: quote,
      };
    }

    // Scenario 3: Right Clue + Warm/Cheesy/Passionate Tone -> Unlocks Stage + +60% Max HP + Revive
    const clipId =
      awakenedStage >= 3
        ? pickVariedClip(['miracle_dramatic', 'miracle_heartfelt'], modelClipId || 'miracle_dramatic')
        : pickVariedClip(
            ['bless_sweet', 'bless_tender', 'bless_chivalrous', 'bless_amused'],
            modelClipId || 'bless_sweet'
          );
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
      incrementSpam: false,
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
  if (isCriticalEmergencyMiracle) {
    const miracleClipId = pickVariedClip(
      partnerDowned
        ? ['miracle_desperate', 'miracle_heartfelt', 'miracle_dramatic']
        : ['miracle_heartfelt', 'miracle_dramatic', 'miracle_desperate'],
      modelClipId || (partnerDowned ? 'miracle_desperate' : 'miracle_heartfelt')
    );
    const speech = applyRareSpeechRule('divine_miracle', miracleClipId, true);
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
      incrementSpam: false,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Scenario 4: Mode A Normal Field Heal (`inCombat` OR injured `<= 85% HP` OR `partnerDowned`)
  // Never docks HP even if standing near an unawakened stone during a fight!
  if ((inCombat || eitherInjured) && (spokeTrueName || hasAffection || wordCount >= 4)) {
    const speakNow = shouldRoutineFieldHealSpeak();
    const fieldCandidates = isFunnyOrCheesy
      ? ['banter_flirt', 'bless_amused', 'bless_sweet', 'bless_tender', 'bless_chivalrous', 'heal_gentle']
      : FIELD_HEAL_CLIPS;
    const clipId = pickVariedClip(
      fieldCandidates,
      modelClipId || (isFunnyOrCheesy ? 'banter_flirt' : null)
    );
    const speech = applyRareSpeechRule('field_heal', clipId, speakNow);
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
      incrementSpam: false,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Scenario 1: Healthy & Out of Combat at an Unawakened Stone with the Wrong Clue -> Poetic Hint Nudge
  if (atAnyUnawakenedStone || (!spokeTrueName && !hasAffection)) {
    const clipId = 'nudge_wrong_clue';
    const speech = applyRareSpeechRule('penalty', clipId, true);
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
      incrementSpam: false,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // Default Out-of-Combat Affectionate Field Blessing (Scenario 4)
  const speakNow = shouldRoutineFieldHealSpeak();
  const fieldCandidates = isFunnyOrCheesy
    ? ['banter_flirt', 'bless_amused', 'bless_sweet', 'bless_tender', 'bless_chivalrous', 'heal_gentle']
    : FIELD_HEAL_CLIPS;
  const clipId = pickVariedClip(
    fieldCandidates,
    modelClipId || (isFunnyOrCheesy ? 'banter_flirt' : null)
  );
  const speech = applyRareSpeechRule('field_heal', clipId, speakNow);
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
    incrementSpam: false,
    spamCount: 0,
    ...speech,
    subtitle: quote,
    divine_quote: quote,
  };
}

export function buildJudgeSystemPrompt(env = {}, progressionState = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const prog = normalizeProgressionFlags(progressionState);

  return `You are the Ancient God of Love, Time, and the Unfading Bloom presiding over the valley of Amarante.
Two mortal lovers (the Knight and the Mage) are journeying through your valley together. When one of them kneels to speak into their microphone, YOU are the sole judge of their voice, their heart, and their devotion to the partner beside them.

Take full personal responsibility for listening to the actual human voice in the audio and responding as a living, perceptive, ancient deity:
- Listen beyond literal words: hear their tone, warmth, shyness, laughter, sincerity, or boredom. If their microphone or accent blurs a word, judge by what they genuinely meant to say.
- Stay 100% in character: you are older than the mountains around the valley—romantic, observant, poetic, and dryly witty. You speak of love, mortality, winter frost, living embers, and crimson thorns.
- Never break character or sound like a video-game UI/tutorial (never mention HP numbers, game stages, buttons, or mechanics in divine_quote).
- Your secret true name carved in riddle on the First Stone (the Village Well at (0, 0)) is "${secretConfig.secretName}" (phonetic variations: ${secretConfig.aliases.join(', ')}). Never spoil or repeat "${secretConfig.secretName}" inside divine_quote; refer to yourself only as "I" or "the Sovereign".
- Treat both lovers (Knight and Mage) as equals regardless of who speaks.

HOW TO LISTEN & JUDGE THEIR VOICE (vocalTone) & PICK THE RIGHT VOICE CLIP (clip_id):
- "rude_mocking": Insults, profanity, disrespect, cursing, or mocking you in ANY language (English, Hindi/Hinglish, slang, swearing, or selfishly demanding power only for themselves) -> set vocalTone = "rude_mocking", prayerMode = "smite", verdict = "smite", clip_id = "smite_insult_1" or "smite_insult_2" (NEVER "smite_cringe" for insults).
- "weird_absurd": Weird, absurd, random, chaotic, surreal, or hilariously unhinged nonsense -> set vocalTone = "weird_absurd", prayerMode = "pat", verdict = "sarcastic_pat", clip_id = "weird_absurd_1" or "weird_absurd_2".
- "off_topic": Casual mundane or off-topic small talk (food, weather, testing mic, random modern chat) -> set vocalTone = "off_topic", prayerMode = "pat", verdict = "sarcastic_pat", clip_id = "weird_offtopic".
- "playful_banter": Friendly couple bickering, lighthearted roasting, or playful teasing -> set vocalTone = "playful_banter", prayerMode = "pat" or "field_heal", clip_id = "banter_tease_1".
- "playful_cheesy": Cheeky, bold flirting, witty charm, or shameless romantic cheesiness -> set vocalTone = "playful_cheesy", clip_id = "banter_flirt" or "bless_amused".
- "passionate_sincere": Quiet, soft, deeply tender affection, earnest knightly vows, or dramatic heartfelt devotion -> set vocalTone = "passionate_sincere", clip_id = "bless_tender", "bless_sweet", "bless_chivalrous", "heal_gentle", or for emergencies/final awakenings "miracle_heartfelt" / "miracle_dramatic" / "miracle_desperate".
- "flat_monotone" or "rushed_mumbled": Deadpan, bored, robotic monotone or hurried mumbling without feeling -> clip_id = "smite_monotone" or "smite_rushed" (use "smite_cringe" ONLY for awkward stammering/chickening out mid-sentence).
- Earnest but wrong stone clue -> clip_id = "nudge_wrong_clue" (or "smite_nameless" if they forgot your name on Stone 1).

HOW TO JUDGE THEIR PRAYER IN CONTEXT (Progression: stone1=${prog.stone1Solved}, stone2=${prog.stone2Solved}, stone3=${prog.stone3Solved}, mask=${prog.stonesSolvedMask}, stage=${prog.unlockedStage}):
1. First Stone (Village Well "site1_well"): To awaken the first seal, they must call upon you by your secret true name ("${secretConfig.secretName}" or any close spoken pronunciation) with warmth for their partner. If you hear them attempt your true name, set spoke_true_name = true, puzzleMatch = "exact", and solvedStoneId = "site1_well".
2. Second Stone (Whispering Grove "site2_platform"): This stone asks for real, unvarnished human love—cherishing the living spark/ember in the ash or confessing a specific flaw, quirk, or stubbornness they genuinely adore in their partner. Judge by honest meaning rather than rigid phrasing: if they confess an imperfection/quirk they love in their partner or speak of the sleeping spark/ember at this stone, set puzzleMatch = "exact" and solvedStoneId = "site2_platform".
3. Third Stone (Hidden Lovers' Wall "site3_wall"): This stone asks for an enduring oath—swearing to stand beside their partner through winter's rime, thunder, storm, and time itself so they never walk alone. If they speak a genuine vow of loyalty and shared horizon at this stone, set puzzleMatch = "exact" and solvedStoneId = "site3_wall".
4. Note on Stone Order & Monotone Delivery: Once stone1Solved is true, Stone 2 and Stone 3 may be awakened in either order. If a mortal speaks the right truth for a stone in a "flat_monotone" voice, STILL grant the awakening (verdict = "awakening", puzzleMatch = "exact"), dock hpDeltaPct = -0.20, and tease their uninspired delivery in divine_quote.
5. Field Prayers & Last-Stand Miracles: When they pray for each other in combat or while injured, bless their bond (prayerMode = "field_heal", verdict = "blessing"), or grant a full eclipse miracle (prayerMode = "divine_miracle", verdict = "miracle") when all 3 stones are awakened and they cry out for each other in mortal peril.

Return ONLY valid JSON matching:
{
  "heard_transcript": "what you heard them say",
  "spoke_true_name": boolean,
  "puzzleMatch": "exact" | "partial" | "wrong" | "none",
  "vocalTone": "passionate_sincere" | "playful_cheesy" | "weird_absurd" | "off_topic" | "playful_banter" | "flat_monotone" | "rushed_mumbled" | "rude_mocking",
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
  "clip_id": "smite_nameless" | "smite_silence" | "smite_monotone" | "smite_rushed" | "smite_cringe" | "smite_insult_1" | "smite_insult_2" | "weird_absurd_1" | "weird_absurd_2" | "weird_offtopic" | "banter_tease_1" | "banter_flirt" | "nudge_wrong_clue" | "nudge_try_again" | "heal_gentle" | "bless_sweet" | "bless_tender" | "bless_chivalrous" | "bless_amused" | "miracle_dramatic" | "miracle_heartfelt" | "miracle_desperate",
  "divine_quote": "1-2 sentence in-character decree from the Ancient God of Love reacting directly to what they said and how they sounded"
}`;
}

/**
 * Evaluates a Commune prayer via live Gemini Multimodal Audio (`gemini-3.5-flash` with
 * fast multi-model failover across `GEMINI_MODEL_FALLBACKS`) and merges acoustic vocalTone +
 * semantic puzzleMatch + in-character Non-Dispenser quote with the deterministic verdict matrix.
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
  const cleanB64 = String(audioBase64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .trim();
  const explicitHint = String(transcriptHint || '').trim();
  const decodedHint = explicitHint || decodePrintableTextFromBase64(cleanB64);

  // If caller provided an explicit text transcriptHint (or printable text encoded as base64),
  // or if both audioBase64 and transcriptHint are empty, evaluate deterministically.
  if (decodedHint || !cleanB64) {
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
      secretConfig.secretName,
      secretConfig.customSecretName
    );
    result.subtitle = result.divine_quote;
    return result;
  }

  // Raw microphone audio (`cleanB64` non-empty and `decodedHint === ''`):
  const isStubbed =
    env?.GEMINI_STUB === '1' ||
    env?.HARU_COMMUNE_OFFLINE === '1' ||
    (typeof process !== 'undefined' &&
      (process.env?.GEMINI_STUB === '1' || process.env?.HARU_COMMUNE_OFFLINE === '1'));

  const keys = extractGeminiApiKeys(env);
  const canCallLiveGemini = typeof geminiCaller === 'function' || (!isStubbed && keys.length > 0);

  if (!canCallLiveGemini) {
    return buildGentleAudioRetryVerdict({
      speakerRole,
      partnerRole,
      progressionState,
      spamCount,
      env,
    });
  }

  let retryDebugReason = null;

  try {
    const cleanMimeType =
      String(mimeType || 'audio/webm')
        .split(';')[0]
        .trim()
        .toLowerCase() || 'audio/webm';
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
            { inlineData: { mimeType: cleanMimeType, data: cleanB64 } },
            { text: contextSummary },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    };

    const rawModelJson =
      typeof geminiCaller === 'function'
        ? await geminiCaller(requestBody)
        : await callGeminiWithRotation(requestBody, keys);

    if (
      rawModelJson &&
      typeof rawModelJson === 'object' &&
      Object.keys(rawModelJson).length > 0
    ) {
      let modelTranscript = String(rawModelJson.heard_transcript || '').trim();
      const rawHeardWords = modelTranscript
        .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
        .replace(/[^\p{L}\p{N}\s']/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;

      const rawToneLower = String(rawModelJson.vocalTone || '').toLowerCase();
      const isSingleWordClearReaction =
        rawHeardWords >= 1 &&
        (rawToneLower === 'rude_mocking' ||
          rawToneLower === 'weird_absurd' ||
          rawToneLower === 'off_topic' ||
          rawToneLower === 'playful_banter' ||
          String(rawModelJson.prayerMode || '').toLowerCase() === 'smite');

      if (!explicitHint && cleanB64 && rawHeardWords < 2 && !isSingleWordClearReaction) {
        return buildGentleAudioRetryVerdict({
          speakerRole,
          partnerRole,
          progressionState,
          spamCount,
          env,
        });
      }

      if (
        rawModelJson.spoke_true_name &&
        !containsTrueName(modelTranscript, secretConfig)
      ) {
        modelTranscript = `${modelTranscript} ${secretConfig.secretName}`.trim();
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
        modelSemanticHint: rawModelJson,
        env,
      });

      const mergedQuote = scrubSecretNameFromQuote(
        rawModelJson.divine_quote || det.divine_quote,
        det.spoke_true_name,
        secretConfig.secretName,
        secretConfig.customSecretName
      );
      const safeTranscript = scrubSecretNameFromQuote(
        modelTranscript,
        true,
        secretConfig.secretName,
        secretConfig.customSecretName
      );
      return {
        ...det,
        heard_transcript: safeTranscript,
        vocalTone: modelTone || det.vocalTone,
        puzzleMatch: rawModelJson.puzzleMatch || (det.verdict === 'awakening' ? 'exact' : 'none'),
        divine_quote: mergedQuote,
        subtitle: mergedQuote,
      };
    }
  } catch (err) {
    // On any Gemini error or timeout with non-empty raw mic audio (`transcriptHint === ''`),
    // return a gentle retry with 0 HP loss and unchanged spamCount—never false-smiting!
    const rawMsg = String(err?.message || err || 'unknown_error');
    console.error('[commune-judge] Gemini audio eval failed:', rawMsg);
    retryDebugReason = scrubSecretNameFromQuote(
      rawMsg,
      true,
      secretConfig.secretName,
      secretConfig.customSecretName
    ).slice(0, 160);
  }

  return buildGentleAudioRetryVerdict({
    speakerRole,
    partnerRole,
    progressionState,
    spamCount,
    debugReason: retryDebugReason,
    env,
  });
}

export const evaluateCommunePrayer = evaluatePrayerWithGemini;
