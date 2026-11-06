/**
 * The look of the patchwork blueprints (V-FORGE-12, decision 2026-11-06 "Patchwork pieces"): the plain neutral piece of each slot (the Trail
 * Cap, the Patch Scarf, the Trail Charm) with a few patches sewn on, one in each of the five shard colours, so the picture says "made of
 * any shard". A patchwork blueprint is only ever drawn as a blueprint (the Blueprints list, the order editor); the piece it makes is an
 * ordinary element piece with that element's own look. Each flair is a 12x12 overlay as in `item-flair.ts` (`.` keeps the shared pixel); the
 * patch colours are fixed (not tinted): tide blue, ember orange, grove green, spark yellow, mire brown, the colours of the shard icons.
 */
import type { Flair } from '../../gear-sprites';

const PATCHES = {
  a: '#4f8fe6',
  b: '#ef6a3a',
  c: '#5cbf5a',
  d: '#f2d43d',
  e: '#b8864a',
} as const;

/** The shared look each slot's patchwork blueprint is drawn over (a neutral piece of the slot). */
export const PATCHWORK_LOOKS: Readonly<Record<'hat' | 'scarf' | 'charm', string>> = {
  hat: 'trail-cap',
  scarf: 'patch-scarf',
  charm: 'trail-charm',
};

export const PATCHWORK_FLAIR: Readonly<Record<'hat' | 'scarf' | 'charm', Flair>> = {
  hat: {
    palette: PATCHES,
    rows: [
      '............',
      '............',
      '............',
      '............',
      '...aa.......',
      '...aa..bb...',
      '..cc...bb...',
      '..cc.dd..ee.',
      '.....dd..ee.',
      '............',
      '............',
      '............',
    ],
  },
  scarf: {
    palette: PATCHES,
    rows: [
      '............',
      '.....aa.....',
      '.....aa.bb..',
      '.cc.....bb..',
      '.cc.........',
      '...dd.......',
      '............',
      '........d...',
      '...ee.......',
      '............',
      '............',
      '............',
    ],
  },
  charm: {
    palette: PATCHES,
    rows: [
      '............',
      '............',
      '............',
      '............',
      '...aa.......',
      '...aa..bb...',
      '....dd.bb...',
      '..ccdd..ee..',
      '..cc....ee..',
      '............',
      '............',
      '............',
    ],
  },
};
