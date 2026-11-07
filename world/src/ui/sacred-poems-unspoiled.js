// ============================================================================
// world/src/ui/sacred-poems-unspoiled.js
//
// Unspoiled Sacred Stone Inscriptions for Amarante (The Unfading Bloom).
// Crafted per `docs/skills/sacred-verse-writing-skill.md`:
// - Strictly 8 lines per stone (`site1`, `site2`, `site3`)
// - 25–35 characters per line (<= 36 hard ceiling for clean EB Garamond carving)
// - Zero AI clichés, zero sing-song nursery riddles, oblique mechanical truth
//
// ZERO-SPOILER RULE:
// Never log or print the contents of this file in console output or reports.
// ============================================================================

function createSacredPoemEntry({ id, stage, stoneId, title, subtitle, lines }) {
  const frozenLines = Object.freeze([...lines]);
  const frozenSecondStanza = Object.freeze(lines.slice(4, 8));
  const arr = [...lines];

  Object.defineProperties(arr, {
    id: { value: id, enumerable: false, writable: false },
    stage: { value: stage, enumerable: false, writable: false },
    stoneId: { value: stoneId, enumerable: false, writable: false },
    title: { value: title, enumerable: false, writable: false },
    subtitle: { value: subtitle, enumerable: false, writable: false },
    lines: { value: frozenLines, enumerable: false, writable: false },
    secondStanza: { value: frozenSecondStanza, enumerable: false, writable: false },
  });

  return Object.freeze(arr);
}

const SITE_1_POEM = createSacredPoemEntry({
  id: 'site1',
  stage: 1,
  stoneId: 'stone_plaza',
  title: 'I · The Iron Rim of the Well',
  subtitle: 'Chiseled into weathered grey limestone around the village well-curb',
  lines: [
    'Cold water sleeps below the rim,',
    'White star-shafts hunt the lone;',
    'Who flees the ice as skies grow dim',
    'Shall turn to splintered bone.',
    'Step near · let neither lover stray,',
    'Raise iron ward before her breath:',
    'Two pulses roofed beneath one stay',
    'Shall blunt the winter’s death.',
  ],
});

const SITE_2_POEM = createSacredPoemEntry({
  id: 'site2',
  stage: 2,
  stoneId: 'stone_grove',
  title: 'II · The Gold-Veined Briar Stone',
  subtitle: 'Inscribed in sunken gilt lettering upon the Whispering Grove medallion',
  lines: [
    'Deep gold inlays the briar stone;',
    'The blind god scorns the knave',
    'Whose beggar-lip pleads for its own,',
    'His private skin to save.',
    'Call Artorious · not for thy crown,',
    'Nor mendings of thine own:',
    'Plead for the one beside thee, bound',
    'Before his golden throne.',
  ],
});

const SITE_3_POEM = createSacredPoemEntry({
  id: 'site3',
  stage: 3,
  stoneId: 'stone_pier',
  title: 'III · The Hidden Lovers’ Wall',
  subtitle: 'Carved deep into the cliff-wall sanctuary beyond the briar shade',
  lines: [
    'When briar-gales bow knees to dust',
    'And root-bound boughs rain mire,',
    'No mortal blade nor iron trust',
    'Can stay the sovereign’s ire.',
    'Yet in that hush before the tomb,',
    'Name Artorious for thy dear:',
    'One unfeigned vow awakes the bloom',
    'And cleaves the dark frontier.',
  ],
});

export const UNSPOILED_SACRED_POEMS = Object.freeze({
  site1: SITE_1_POEM,
  site2: SITE_2_POEM,
  site3: SITE_3_POEM,
});

export const UNSPOILED_SACRED_POEM_BY_STONE_ID = Object.freeze({
  stone_plaza: SITE_1_POEM,
  stone_grove: SITE_2_POEM,
  stone_pier: SITE_3_POEM,
});

export function getUnspoiledSacredPoem(siteOrStage = 'site1') {
  if (typeof siteOrStage === 'number') {
    if (siteOrStage === 1) return SITE_1_POEM;
    if (siteOrStage === 2) return SITE_2_POEM;
    if (siteOrStage === 3) return SITE_3_POEM;
  }
  const key = String(siteOrStage || 'site1').trim().toLowerCase();
  if (key === 'site1' || key === '1' || key === 'stone_plaza' || key === 'plaza' || key === 'well') {
    return SITE_1_POEM;
  }
  if (key === 'site2' || key === '2' || key === 'stone_grove' || key === 'grove') {
    return SITE_2_POEM;
  }
  if (key === 'site3' || key === '3' || key === 'stone_pier' || key === 'pier' || key === 'wall') {
    return SITE_3_POEM;
  }
  return SITE_1_POEM;
}
