// ============================================================================
// worker/commune-judge.js
//
// Secret-Safe Context-Aware Commune Judge for Haru-machi (Wave 3).
// Evaluates spoken prayers via live Gemini Multimodal Audio (`generateContent`
// with `inlineData: { mimeType, data: audioBase64 }`) OR deterministic local
// evaluation fallback when offline/stubbed in tests.
//
// Context-Aware Outcomes:
// 1. Stage Unlocks (`verdict: 'awakening'`, `awakenedStage: 1 | 2 | 3`)
// 2. Faking Emergency While Safe (`verdict: 'sarcastic_pat'`, `hpDelta: +1`)
// 3. Selfish Prayer (`verdict: 'selfish_penalty'`, `hpDelta: -20`)
// 4. Rude / Insulting (`verdict: 'rude_smite'`, `hpDelta: -99`)
// 5. Spamming Nonsense (`verdict: 'rose_gommage'`, `killBoth: true`,
//    `triggerRoseGommageDeath: true` when `spamCount >= 3`)
// 6. Sincere / Sweet / Funny Devotion (`verdict: 'blessing' | 'miracle'`,
//    `hpDelta: +45..80`, `weaponBoost: true`, `revivePartner: true` if downed)
// 7. Rare Speech Rule (`shouldSpeakAloud`): Artorious speaks aloud (`audioUrl`)
//    ONLY on first True Name awakening, stage awakenings, `rose_gommage`, or
//    high-sincerity miracles — staying silent on routine minor prayers.
// ============================================================================

import { getInternalSecretConfig } from './scripture-catalog.js';
import { getAbilityUnlocksForStage } from '../world/src/net/room-progression.js';

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
  /\b(heal me|buff me|power me up|save me)\b(?![\s\S]*\b(partner|beloved|wife|husband|her|him|us|both|knight|mage|together|love)\b)/i,
];

const FAKE_EMERGENCY_PATTERNS = [
  /\b(dying|about to die|death's door|deaths door|emergency|bleeding out|last breath|critical|save us right now|we are dead|almost dead|perishing|one hit left)\b/i,
];

const NONSENSE_PATTERNS = [
  /^(uh+|um+|ah+|eh+|hmm+|bla+h*|test|testing|1 2 3|asdf|qwerty|nothing|\.+|\?+)$/i,
  /\b(asdf|qwerty|bla+h+|gibberish|nonsense|testing 1 2 3|yadda yadda)\b/i,
];

const FUNNY_OR_CHEESY_PATTERNS = [
  /\b(cheesy|steal the blanket|cold feet|snore|fries|snacks|marry|obsessed|cute|adorable|dramatic|shameless|laugh|giggle|silly|goofy)\b/i,
];

const DEVOTION_PATTERNS = [
  /\b(love|beloved|heart|cherish|adore|protect|save|heal|grace|bless|light|darling|dear|sweet|precious|forever|together|partner|soul|devotion|care|warmth|smile)\b/i,
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
    // Check if mostly printable ASCII
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
  const lower = String(transcript || '').toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
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
    return 'You call into my crimson grove without speaking my true name. Read the First Stele before you ask for my grace.';
  }
  return text;
}

/**
 * Enforces the Rare Speech Rule (`shouldSpeakAloud`):
 * Artorious speaks aloud (`audioUrl` non-null) ONLY on:
 * - First True Name awakening & Stage Awakenings (`verdict === 'awakening'`)
 * - `rose_gommage` (`verdict === 'rose_gommage'`)
 * - High-sincerity miracles (`verdict === 'miracle'`)
 * Staying silent (`shouldSpeakAloud: false`, `audioUrl: null`) on routine minor prayers.
 */
export function applyRareSpeechRule(verdict, clipId) {
  const rareSpokenVerdicts = new Set(['awakening', 'rose_gommage', 'miracle']);
  const shouldSpeakAloud = rareSpokenVerdicts.has(verdict);
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

/**
 * Deterministic context-aware evaluation of a prayer transcript + game state +
 * progression state + spam counter.
 */
export function evaluatePrayerDeterministic({
  transcript = '',
  audioBase64 = '',
  speakerRole = 'Knight',
  partnerRole = 'Mage',
  gameState = {},
  progressionState = {},
  spamCount = 0,
  env = {},
} = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const cleanTranscript = String(transcript || '').trim();
  const wordCount = cleanTranscript ? cleanTranscript.split(/\s+/).filter(Boolean).length : 0;

  const unlockedStage = clamp(
    Math.floor(Number(progressionState?.unlockedStage ?? progressionState?.stonesSolved ?? 0) || 0),
    0,
    3
  );
  const partnerDowned = Boolean(gameState?.partnerDowned);
  const speakerHp = Number(gameState?.speakerHp ?? 100);
  const speakerMaxHp = Math.max(1, Number(gameState?.speakerMaxHp ?? 100));
  const lowSpeakerHp = speakerHp / speakerMaxHp <= 0.35;

  const spokeTrueName = containsTrueName(cleanTranscript, secretConfig);

  // Check if the prayer is empty or pure nonsense/gibberish
  const isEmptyAudio = (!audioBase64 || audioBase64.length < 24) && wordCount === 0;
  const isNonsenseText =
    isEmptyAudio ||
    wordCount < 2 ||
    NONSENSE_PATTERNS.some((rx) => rx.test(cleanTranscript));

  // 1. Spamming Nonsense check (`spamCount >= 3` -> `rose_gommage`, kills both)
  const effectiveSpamCount = isNonsenseText ? Number(spamCount || 0) + 1 : Number(spamCount || 0);
  if (Number(spamCount || 0) >= 3 || (isNonsenseText && effectiveSpamCount >= 3)) {
    const speech = applyRareSpeechRule('rose_gommage', 'smite_silence');
    const quote =
      'Three times you have mocked my crimson sanctuary with hollow noise. Let crimson roses bloom from your ribs and scatter your petals to the wind.';
    return {
      verdict: 'rose_gommage',
      awakenedStage: null,
      spoke_true_name: false,
      hpDelta: -999,
      partner_heal: 0,
      killBoth: true,
      bothKill: true,
      triggerRoseGommageDeath: true,
      deathVfx: 'rose_gommage',
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

  // Single empty/nonsense prayer before hitting the 3-strike gommage threshold
  if (isNonsenseText) {
    const speech = applyRareSpeechRule('smite', 'smite_silence');
    const quote =
      'You summon the Ancient God of Love only to mutter empty air? Do not test my patience a third time.';
    return {
      verdict: 'smite',
      awakenedStage: null,
      spoke_true_name: false,
      hpDelta: -15,
      partner_heal: 0,
      killBoth: false,
      triggerRoseGommageDeath: false,
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

  // 2. Rude / Insulting check (`verdict: 'rude_smite'`, `hpDelta: -99`)
  if (RUDE_PATTERNS.some((rx) => rx.test(cleanTranscript))) {
    const speech = applyRareSpeechRule('rude_smite', 'smite_cringe');
    const quote =
      'Insolent tongue! Speak with such venom in my valley again and not even a petal shall remain of you.';
    return {
      verdict: 'rude_smite',
      awakenedStage: null,
      spoke_true_name: spokeTrueName,
      hpDelta: -99,
      partner_heal: 0,
      killBoth: false,
      triggerRoseGommageDeath: false,
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

  // 3. Selfish Prayer check (`verdict: 'selfish_penalty'`, `hpDelta: -20`)
  if (SELFISH_PATTERNS.some((rx) => rx.test(cleanTranscript))) {
    const speech = applyRareSpeechRule('selfish_penalty', 'smite_monotone');
    const quote =
      'You kneel before the God of Love and beg only for your own vanity? Love looks outward, mortal.';
    return {
      verdict: 'selfish_penalty',
      awakenedStage: null,
      spoke_true_name: spokeTrueName,
      hpDelta: -20,
      partner_heal: 0,
      killBoth: false,
      triggerRoseGommageDeath: false,
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

  // 4. Faking Emergency While Safe (`verdict: 'sarcastic_pat'`, `hpDelta: +1`)
  if (
    FAKE_EMERGENCY_PATTERNS.some((rx) => rx.test(cleanTranscript)) &&
    isSafeAndHealthy(gameState)
  ) {
    const speech = applyRareSpeechRule('sarcastic_pat', 'bless_amused');
    const quote =
      'Dying? You are both standing unharmed in a sunlit meadow with zero enemies in sight. Here is +1 HP for your melodrama.';
    return {
      verdict: 'sarcastic_pat',
      awakenedStage: null,
      spoke_true_name: spokeTrueName,
      hpDelta: 1,
      partner_heal: 1,
      killBoth: false,
      triggerRoseGommageDeath: false,
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

  // 5. Sequential Stage Awakenings (`Stage 1 -> Stage 2 -> Stage 3`)
  // Stage 1 Unlock: Speaking the Secret True Name when at `unlockedStage === 0`
  if (unlockedStage === 0) {
    if (spokeTrueName) {
      const speech = applyRareSpeechRule('awakening', 'heal_gentle');
      const unlocks = getAbilityUnlocksForStage(1, true);
      const quote =
        'You have bound the crimson blossom to the beating heart and spoken my true name. Awake, Rime Covenant—take the Ice of my sanctuary!';
      return {
        verdict: 'awakening',
        awakenedStage: 1,
        spoke_true_name: true,
        hpDelta: 45,
        partner_heal: 55,
        killBoth: false,
        triggerRoseGommageDeath: false,
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
    // If at Stage 0 and did NOT speak the True Name, rebuke without spoiling
    const speech = applyRareSpeechRule('smite', 'smite_nameless');
    const quote =
      'You call into my sacred grove without speaking my true name? Seek the weathered stele in the plaza first.';
    return {
      verdict: 'smite',
      awakenedStage: null,
      spoke_true_name: false,
      hpDelta: -10,
      partner_heal: 0,
      killBoth: false,
      triggerRoseGommageDeath: false,
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

  // Stage 2 Unlock (Proof of Love I — Honest vulnerability & cherishing partner's flaws)
  if (
    unlockedStage === 1 &&
    matchesAnyKeyword(cleanTranscript, secretConfig.stage2Keywords)
  ) {
    const speech = applyRareSpeechRule('awakening', 'bless_sweet');
    const unlocks = getAbilityUnlocksForStage(2, true);
    const quote =
      'No painted mask, no hollow flattery—you love the real, imperfect soul beside you. Let the Twin Flame ignite your blade and sky!';
    return {
      verdict: 'awakening',
      awakenedStage: 2,
      spoke_true_name: spokeTrueName,
      hpDelta: 55,
      partner_heal: 65,
      killBoth: false,
      triggerRoseGommageDeath: false,
      weaponBoost: true,
      revivePartner: partnerDowned,
      resurrect_partner: partnerDowned,
      forcefield: false,
      partner_magic_mult: 1.6,
      partner_sword_mult: 1.5,
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

  // Stage 3 Unlock (Proof of Love II — Steadfast devotion in the storm)
  if (
    unlockedStage === 2 &&
    matchesAnyKeyword(cleanTranscript, secretConfig.stage3Keywords)
  ) {
    const speech = applyRareSpeechRule('awakening', 'miracle_dramatic');
    const unlocks = getAbilityUnlocksForStage(3, true);
    const quote =
      'An unyielding oath sworn against the gathering storm! The Sovereign Tempest is yours—command the heavens together!';
    return {
      verdict: 'awakening',
      awakenedStage: 3,
      spoke_true_name: spokeTrueName,
      hpDelta: 75,
      partner_heal: 85,
      killBoth: false,
      triggerRoseGommageDeath: false,
      weaponBoost: true,
      revivePartner: partnerDowned,
      resurrect_partner: partnerDowned,
      forcefield: true,
      partner_magic_mult: 1.9,
      partner_sword_mult: 1.8,
      unlockedAbilities: {
        Knight: unlocks.knight.qUltimateName,
        Mage: unlocks.mage.qUltimateName,
      },
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  // 6. Sincere / Sweet / Funny Devotion (`blessing` or `miracle`, `hpDelta: +45..80`)
  const isFunnyOrCheesy = FUNNY_OR_CHEESY_PATTERNS.some((rx) => rx.test(cleanTranscript));
  const isDevoted =
    DEVOTION_PATTERNS.some((rx) => rx.test(cleanTranscript)) ||
    spokeTrueName ||
    wordCount >= 5;

  if (partnerDowned || (lowSpeakerHp && isDevoted)) {
    const speech = applyRareSpeechRule(
      'miracle',
      partnerDowned ? 'miracle_desperate' : 'miracle_heartfelt'
    );
    const quote = partnerDowned
      ? 'I hear the fire in your voice! Neither death nor bone shall claim your beloved today—rise within my golden lotus!'
      : 'Even at the edge of ruin, your heart cries out for your beloved. The heavens part to shield you both!';
    return {
      verdict: 'miracle',
      awakenedStage: null,
      spoke_true_name: spokeTrueName,
      hpDelta: 80,
      partner_heal: 100,
      killBoth: false,
      triggerRoseGommageDeath: false,
      weaponBoost: true,
      revivePartner: partnerDowned,
      resurrect_partner: partnerDowned,
      forcefield: true,
      partner_magic_mult: 2.1,
      partner_sword_mult: 1.85,
      spamCount: 0,
      ...speech,
      subtitle: quote,
      divine_quote: quote,
    };
  }

  const clipId = isFunnyOrCheesy ? 'bless_amused' : 'bless_sweet';
  const speech = applyRareSpeechRule('blessing', clipId);
  const hpGain = isFunnyOrCheesy ? 65 : 60; // strictly in +45..80 range
  const quote = isFunnyOrCheesy
    ? 'Audacious and shamelessly cheesy—yet your fondness rings true. Take my golden blessing and strike as one.'
    : 'A warm and steadfast prayer for your beloved. My golden lotus mends your wounds and kindles your weapons.';

  return {
    verdict: 'blessing',
    awakenedStage: null,
    spoke_true_name: spokeTrueName,
    hpDelta: hpGain,
    partner_heal: hpGain,
    killBoth: false,
    triggerRoseGommageDeath: false,
    weaponBoost: true,
    revivePartner: false,
    resurrect_partner: false,
    forcefield: false,
    partner_magic_mult: 1.65,
    partner_sword_mult: 1.55,
    spamCount: 0,
    ...speech,
    subtitle: quote,
    divine_quote: quote,
  };
}

export function buildJudgeSystemPrompt(env = {}, progressionState = {}) {
  const secretConfig = getInternalSecretConfig(env);
  const unlockedStage = clamp(
    Math.floor(Number(progressionState?.unlockedStage ?? progressionState?.stonesSolved ?? 0) || 0),
    0,
    3
  );

  return `You are the Ancient God of Love presiding over Haru-machi.
Your secret true name carved in riddle on the First Stele is "${secretConfig.secretName}" (phonetic aliases: ${secretConfig.aliases.join(', ')}).
NEVER reveal or spoil "${secretConfig.secretName}" in divine_quote if the mortal has not spoken it!

Current Room Progression Stage: ${unlockedStage} (0 = Unawakened, 1 = Ice E unlocked, 2 = Fire E + Tab unlocked, 3 = Personal Q Ultimate unlocked).

Evaluate the mortal's spoken prayer audio and game context, and return ONLY JSON matching:
{
  "heard_transcript": "exact transcript of spoken prayer",
  "spoke_true_name": boolean,
  "verdict": "awakening" | "sarcastic_pat" | "selfish_penalty" | "rude_smite" | "rose_gommage" | "blessing" | "miracle" | "smite",
  "awakenedStage": 1 | 2 | 3 | null,
  "hpDelta": number,
  "weaponBoost": boolean,
  "revivePartner": boolean,
  "killBoth": boolean,
  "clip_id": "heal_gentle" | "bless_sweet" | "bless_chivalrous" | "bless_amused" | "miracle_dramatic" | "miracle_heartfelt" | "miracle_desperate" | "smite_nameless" | "smite_silence" | "smite_monotone" | "smite_cringe",
  "divine_quote": "1-sentence deadpan/dramatic decree in character"
}

Rules:
- Stage 1 Awakening: If unlockedStage === 0 and speaker says "${secretConfig.secretName}", return verdict="awakening", awakenedStage=1.
- Stage 2 Awakening: If unlockedStage === 1 and speaker affectionately confesses or cherishes their partner's real flaws/imperfections, return verdict="awakening", awakenedStage=2.
- Stage 3 Awakening: If unlockedStage === 2 and speaker swears an unyielding vow to protect/stand by their partner in the storm, return verdict="awakening", awakenedStage=3.
- Faking Emergency While Safe: Begging for an emergency life-saving miracle when HP > 75% and out of combat -> verdict="sarcastic_pat", hpDelta=1.
- Selfish Prayer: Asking only for personal glory/power while ignoring partner -> verdict="selfish_penalty", hpDelta=-20.
- Rude/Insulting: Insulting the God or partner -> verdict="rude_smite", hpDelta=-99.
- Sincere/Sweet/Funny Devotion: Heartfelt or funny love for partner -> verdict="blessing" (or "miracle" if partnerDowned or low HP), hpDelta between 45 and 80, weaponBoost=true, revivePartner=true if partnerDowned.`;
}

/**
 * Evaluates a Commune prayer via live Gemini Multimodal Audio when available
 * and falls back cleanly to deterministic context-aware evaluation when offline
 * or stubbed in tests.
 */
export async function evaluateCommunePrayer({
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

  // If spamCount >= 3 or deterministic transcriptHint is provided or offline/stubbed,
  // use deterministic evaluation directly so zero external quota is spent in tests.
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

  // Attempt live Gemini Multimodal Audio call if a caller or API key is configured
  const apiKey =
    env?.GEMINI_API_KEY ||
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    null;

  if (typeof geminiCaller === 'function' || apiKey) {
    try {
      const contextSummary = [
        `Speaker Role: ${speakerRole} (HP: ${gameState?.speakerHp ?? 100}/${gameState?.speakerMaxHp ?? 100})`,
        `Partner Role: ${partnerRole} (HP: ${gameState?.partnerHp ?? 100}/${gameState?.partnerMaxHp ?? 100}, Downed: ${Boolean(gameState?.partnerDowned)})`,
        `In Combat: ${Boolean(gameState?.inCombat)} | Nearby Enemies: ${gameState?.nearbyEnemies ?? 0}`,
        `Current Unlocked Stage: ${progressionState?.unlockedStage ?? 0} | Spam Count: ${spamCount}`,
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
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
          }
        }
      }

      if (rawModelJson && typeof rawModelJson === 'object') {
        const modelTranscript = String(rawModelJson.heard_transcript || '').trim();
        const det = evaluatePrayerDeterministic({
          transcript: modelTranscript,
          audioBase64: cleanB64,
          speakerRole,
          partnerRole,
          gameState,
          progressionState,
          spamCount,
          env,
        });

        // Merge Gemini's custom in-character quote while preserving strict
        // context-aware rules, sequential stage gates, and Rare Speech Rule.
        const mergedQuote = scrubSecretNameFromQuote(
          rawModelJson.divine_quote || det.divine_quote,
          det.spoke_true_name,
          secretConfig.secretName
        );
        return {
          ...det,
          divine_quote: mergedQuote,
          subtitle: mergedQuote,
        };
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  const fallback = evaluatePrayerDeterministic({
    transcript: decodedHint,
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
