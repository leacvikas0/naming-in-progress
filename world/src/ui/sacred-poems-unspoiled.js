// ============================================================================
// world/src/ui/sacred-poems-unspoiled.js
//
// Unspoiled Sacred Stone Inscriptions for Amarante (The Unfading Bloom).
// Crafted per `docs/skills/sacred-verse-writing-skill.md`:
// - Strictly 8 lines per stone (`site1`, `site2`, `site3`)
// - 25–36 characters per line (<= 36 hard ceiling for clean EB Garamond carving)
// - Stored in UTF-8 Base64 so opening source/config files never spoils the riddles.
// ============================================================================

function decodeB64Utf8(b64) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function createSacredPoemEntry({ id, stage, stoneId, title, subtitle, linesB64 }) {
  const lines = linesB64.map(decodeB64Utf8);
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
  title: 'I · The Well of the Roman Sovereign',
  subtitle: 'Chiseled into weathered grey limestone around the village well-curb',
  linesB64: [
    'U3RvbmUtY2FydmVkIGluaXRpYWxzIG1hcmsgbXkgcmltLA==',
    'T2xkIFJvbWUgb25jZSBrbmVsdCBiZWZvcmUgbXkgc3VuOw==',
    'TG9vayBkb3duIHRoZSBtYXJnaW4sIGNvbGQgYW5kIGRpbSw=',
    'QW5kIHJlYWQgdGhlIGxldHRlcnMgb25lIGJ5IG9uZS4=',
    'Um9tZeKAmXMgU29sIG5vdyB3ZWRzIHRoZSBnb2xkZW4gcmFtOw==',
    'SW52b2tlIHRoYXQgUm9tYW4gc292ZXJlaWduIGxvdWQs',
    'VW5pdGUgdHdvIGJyZWF0aHMgdG8gc3BlYWsgbXkgbmFtZSw=',
    'U3BlYWsgd2FybSBvZiB5b3VyIGJlbG92ZWQsIHByb3VkLg==',
  ],
});

const SITE_2_POEM = createSacredPoemEntry({
  id: 'site2',
  stage: 2,
  stoneId: 'stone_grove',
  title: 'II · The Medallion of the Cinder Bough',
  subtitle: 'Inscribed in sunken gilt lettering upon the Whispering Grove medallion',
  linesB64: [
    'QmVuZWF0aCBncmV5IHJvb3RzIGFuZCBmcm96ZW4gYmFyayw=',
    'QSBjcmltc29uIGNpbmRlciBzbGVlcHMgaW4gYXNoOw==',
    'Tm8gcGFpbnRlZCBtYXNrIGNhbiBmZWVkIHRoaXMgc3Bhcmss',
    'Tm9yIGZsYXR0ZXJ5IHN1cnZpdmUgaXRzIGZsYXNoLg==',
    'Q2FsbCBmb3J0aCB0aGUgZW1iZXIgZnJvbSB0aGUgc3RvbmUs',
    'QW5kIG5hbWUgdGhlIFNvdmVyZWlnbiBvZiB0aGUgYm91Z2g6',
    'Q29uZmVzcyBvbmUgc3R1YmJvcm4gZmxhdyB5b3Ugb3du',
    'VG8gbG92ZSBpbiB5b3VyIGNvbXBhbmlvbiBub3cu',
  ],
});

const SITE_3_POEM = createSacredPoemEntry({
  id: 'site3',
  stage: 3,
  stoneId: 'stone_pier',
  title: 'III · The Sanctuary of the Unbroken Vow',
  subtitle: 'Carved deep into the cliff-wall sanctuary beyond the briar shade',
  linesB64: [
    'V2hlbiBpcm9uIGdhbGVzIGFuZCB3aW50ZXIgcnltZQ==',
    'QmVhdCBvbiB0aGUgdmFsbGV54oCZcyBjb2xkIGZyb250aWVyLA==',
    'T25lIHNwb2tlbiB2b3cgb3V0bGFzdHMgYWxsIHRpbWUs',
    'T25lIGNvdmVuYW50IG91dGxpdmVzIGFsbCBmZWFyLg==',
    'RGVjbGFyZSB0aGF0IG9hdGggYmVmb3JlIHRoZSB0aHJvbmUs',
    'QW5kIGNhbGwgdGhlIFJvbWFuIFNvdmVyZWlnbuKAmXMgbmFtZTo=',
    'U3dlYXIgbmVpdGhlciB3YWxrcyB0aGUgZGFyayBhbG9uZQ==',
    'SW4gdGh1bmRlciwgcnltZSwgb3Igd2ludGVyIGZsYW1lLg==',
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
