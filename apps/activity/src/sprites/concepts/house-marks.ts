/**
 * Housing art batch E5: the 24 stamps, the hall's display sprites, the 16 luxury material glyphs, the House
 * navigation glyph and the mail and stamp glyphs (`docs/design/housing.md`, section 5). The art itself is in
 * `sprites/data/house/displays.ts` and `housing/housing-glyphs.ts`; this wrapper only lets the studio render,
 * lint and catalogue it. Nothing in the game imports the concept folder.
 */
import { HOUSING_GLYPHS } from '../../housing/housing-glyphs';
import { HOUSE_ART } from '../data/house/displays';
import type { Concept, ConceptSet } from './index';

const STAMP_NOTES: Readonly<Record<string, string>> = {
  'paw-print': 'The starter stamp: a pink paw, four toes and a pad.',
  'ledger-shell': 'The Tide Ledger: a scallop shell with blue ridges.',
  'ash-feather': 'The Ash Records: a grey quill dipped in ember.',
  'root-knot': 'Rootwork Notes: a root tied in a loop, a bud on top.',
  'static-spark': 'Static Letters: a lightning bolt.',
  signpost: 'The Signpost Series: a post with two boards.',
  crescent: 'Moonlit Verses: a crescent moon and a star.',
  'peat-bubble': 'The Peat Notes: three bubbles rising from the bog.',
  'torn-page': 'Lost Pages: a page with a ragged edge.',
  'colossus-wave': 'Tidal Colossus beaten: a wave curling over.',
  'wyrm-coil': 'Cinder Wyrm beaten: a coiled serpent with horns.',
  'thorn-crown': 'Thornmother beaten: a wreath of thorned vine.',
  'storm-crown': 'Storm Sovereign beaten: a gold crown with a storm gem.',
  'bogback-moss': 'Old Bogback beaten: a mossy shell.',
  'deep-door': 'Dungeon depth 10: an arched door on the dark.',
  'gold-medal': 'A Games gold: a medal on its ribbon.',
  wayfarer: 'Seven places visited: a walking boot.',
  'glimmer-star': 'A shiny found: a four point sparkle.',
  housewarming: 'The cottage built: a house with a heart of smoke.',
  'matched-set': 'One set finished: two matching cups.',
  'old-coin': 'Rare raid drop: a worn coin with a square hole.',
  'lantern-key': 'Rare dungeon drop: a key with a lantern for a bow.',
  'pressed-flower': 'Rare trip drop: a flower pressed flat.',
  rosette: 'Rare Games drop: a pleated rosette with ribbon tails.',
};

const DISPLAY_NOTES: Readonly<Record<string, string>> = {
  plaque:
    'Raid plaque, 28x32: a wooden board with a dark window for the 24x24 boss sprite (drawn at x 2, y 1) and a cream plate for the 3-digit rank (x 6..21, y 26..30).',
  'plaque-empty':
    'The same board, empty: a dashed outline where the boss would hang, three dashes for the rank.',
  bench: 'Games medals: a cushioned bench the medals lie on.',
  'badge-slot': 'Games badges: a small framed velvet square with a pin hole.',
  case: 'Festival trophies: a glass case with a shelf.',
  shelf: 'Keepsakes: a wall shelf on two brackets; the 12x12 keepsakes stand on it.',
  books: 'Journal: a row of spines.',
  marker: 'Dungeon depth: a standing stone with tally marks and a small light.',
  cabinet: 'Set keepsakes: a glass-fronted cabinet with three shelves.',
};

const concept = (
  kind: Concept['kind'],
  group: string,
  note: string,
  sprite: Concept['sprite'],
): Concept => ({
  kind,
  group,
  note,
  sprite,
});

export const HOUSE_MARKS_CONCEPTS: ConceptSet = {
  id: 'house-marks',
  title: 'House: stamps, displays, materials and glyphs',
  requested:
    '2026-11-09: housing art batch E5 (docs/design/housing.md, section 5): 24 stamps, the hall displays, 16 luxury materials, the House glyphs.',
  status: 'draft',
  notes: [
    'Stamps are 16x16 with the ink outline; displays follow the plan (plaque 28x32). Materials differ by shape: woods are timber, stones gems, metals ingots and ore, cloth folded or rolled.',
    'Used by the House (housing flag); nothing ships until the pack is imported by house-art.ts.',
  ],
  shipped: Object.keys(HOUSING_GLYPHS).map((id) => ({
    id,
    marks: id.startsWith('lux-') ? 'Luxury material' : 'House',
    group: id.startsWith('lux-') ? 'Materials' : 'House',
  })),
  sprites: {
    ...Object.fromEntries(
      Object.entries(HOUSE_ART.stamps ?? {}).map(([id, sprite]): [string, Concept] => [
        `stamp-${id}`,
        concept('free', 'Stamps', STAMP_NOTES[id] ?? id, sprite),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(HOUSE_ART.displays ?? {}).map(([id, sprite]): [string, Concept] => [
        `display-${id}`,
        concept('free', 'Displays', DISPLAY_NOTES[id] ?? id, sprite),
      ]),
    ),
  },
};
