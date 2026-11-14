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
  title: 'I · The Well of the First Name',
  subtitle: 'Chiseled into weathered grey limestone around the village well-curb',
  lines: [
    'My first is winter’s crystal sheet,',
    'Where frozen rivers softly gleam;',
    'My next is what two lovers’ feet',
    'Still wander by the quiet stream.',
    'Bind winter’s mirror unto way,',
    'Speak low my two-part ancient name;',
    'Praise warm the one you love today,',
    'To wake the Winter King’s acclaim.',
  ],
});

const SITE_2_POEM = createSacredPoemEntry({
  id: 'site2',
  stage: 2,
  stoneId: 'stone_grove',
  title: 'II · The Medallion of the Sleeping Spark',
  subtitle: 'Inscribed in sunken gilt lettering upon the Whispering Grove medallion',
  lines: [
    'I die when drowned in selfish pride,',
    'I starve when left to burn alone;',
    'Yet fed by two who stand beside,',
    'I turn the coldest night to home.',
    'Name me—the red spark in the ash,',
    'Then call the Sovereign by his name:',
    'Confess one quirk or stubborn clash',
    'You love in them, and wake my flame.',
  ],
});

const SITE_3_POEM = createSacredPoemEntry({
  id: 'site3',
  stage: 3,
  stoneId: 'stone_pier',
  title: 'III · The Hidden Lovers’ Wall',
  subtitle: 'Carved deep into the cliff-wall sanctuary beyond the briar shade',
  lines: [
    'No blade of steel can cut my thread,',
    'No tempest drowns the word I keep;',
    'When winter bows the mountain’s head,',
    'I bind two souls across the deep.',
    'Name me—the oath that outlives time,',
    'And call the Sovereign on his throne:',
    'Swear through the thunder and the rime',
    'Your partner never walks alone.',
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
