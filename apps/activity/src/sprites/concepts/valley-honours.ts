/**
 * The honour ribbon a graduate wears (phase 5 step 9b, `systems/trials.md` V-TRIAL-1: "a badge, a title and a ribbon worn on the creature's
 * sprite"): a small rosette with two tails, pinned at the lower right of the creature's 16x16 sprite, below the chibi face (rows 11 to 15,
 * x 10 to 15, so the eyes, blush and mouth stay clear). One drawing, three metals as palettes: Bronze (main), Silver and Gold (`alts`).
 * Same ink as every sprite. The game draws it over the sprite at the sprite's own pixel scale.
 */
import type { SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';

const INK = '#0d0a1a';

/** The rosette: a round knot of two tones and two short tails, 6 x 6. */
const RIBBON: SpriteDef = {
  palette: { k: INK, b: '#d08a4a', c: '#f6c08a' },
  rows: ['.kkkk.', 'kbccbk', 'kbccbk', '.kbbk.', '.kbkbk', '.kk.kk'],
};

export const VALLEY_HONOURS_CONCEPTS: ConceptSet = {
  id: 'valley-honours',
  title: 'The honour ribbon',
  requested:
    "2026-11-06 (valley phase 5 step 9b, trials.md V-TRIAL-1): a ribbon worn on a graduate's sprite, one for each honour (Bronze, Silver, Gold).",
  status: 'draft',
  notes: [
    'Where it goes: on the creature sprite at the card, the page and the scenes, its top-left at (10, 10) of the 16x16 sprite, so its bottom-right is the sprite corner; it stays below the face (rows 8 to 10 are the chibi face).',
    'The same drawing in three metals: the main palette is Bronze, `silver` and `gold` are the other two. Colour is not the only cue: the badge and the title ("Pip, Silver") say the honour in words.',
    'Drawn from the prototype school scene ribbon (`proto/valley/school-sample.ts`, a 7 x 8 bronze rosette), a little smaller so it sits under the face on a 16x16 creature.',
  ],
  sprites: {
    'honour-ribbon': {
      kind: 'free',
      note: 'A rosette with two tails, 6 x 6, ink outline, two tones of metal. Bronze main; Silver and Gold as palettes.',
      sprite: RIBBON,
      alts: {
        silver: { b: '#8f97b0', c: '#e6e9f2' },
        gold: { b: '#c8952b', c: '#fff0b0' },
      },
    },
  },
};
