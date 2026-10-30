/**
 * Void gear, concept art (not in the game; no content yet). Items are drawn in the neutral greys
 * `t #9a98ae`, `u #6a6882`, `h #d8d6e6` that a tint swaps, like the shipped ones; the proposed Void
 * tint is `VOID_TINT` (shown on every item as the `void` alt). Fixed keys: `k` ink, `n` the starry
 * window (night), `y` its warm star, and on set pieces `g` / `w` the gold trim. A window always
 * has a lighter edge inside the ink, so it never melts into the night-sky panels.
 */
import { CHARM_SPRITE_DATA } from '../data/item-charm-sprites';
import { expandRows, type SpriteDef } from '../sprite-data';
import type { ConceptSet } from './index';

/**
 * The proposed Void tint: the dusk purple of the Void creatures (`void.ts`), a little lighter so a
 * dark item still stands out on the panels. Bluer and calmer than the setter set tint `#a07be6`
 * (hue 247 against 259, saturation 0.38 against 0.68) and nowhere near Spark's yellow.
 */
export const VOID_TINT = { t: '#7468bc', u: '#463c86', h: '#b4aae8' } as const;

const BASE = {
  k: '#0d0a1a',
  t: '#9a98ae',
  u: '#6a6882',
  h: '#d8d6e6',
  n: '#100c22',
  y: '#fff1b8',
} as const;
const SET = { ...BASE, g: '#f6d56a', w: '#fff6d8' } as const;
const ALTS = { void: VOID_TINT } as const;

/** Void's touch over the shared `trail-charm`: its stone gets a starry window, and a star glints near it. */
export const VOID_CHARM_FLAIR: { rows: readonly string[]; palette: Record<string, string> } = {
  rows: [
    '............',
    '.........k..',
    '........kyk.',
    '.........k..',
    '............',
    '............',
    '....nnnn....',
    '...nnyynn...',
    '....nnnn....',
    '.y..........',
    '............',
    '............',
  ],
  palette: { n: '#100c22', y: '#fff1b8' },
};

const TRAIL_CHARM = CHARM_SPRITE_DATA['trail-charm'] as SpriteDef;

/** The shared sprite with the flair drawn over it, as `withFlair` in `gear-sprites.ts` does (`.` keeps the pixel). */
function flaired(def: SpriteDef, flair: typeof VOID_CHARM_FLAIR): SpriteDef {
  const rows = expandRows(def).map((row, y) =>
    [...row]
      .map((ch, x) => ((flair.rows[y]?.[x] ?? '.') === '.' ? ch : (flair.rows[y]?.[x] as string)))
      .join(''),
  );
  return { rows, palette: { ...def.palette, ...flair.palette } };
}

export const VOID_GEAR_CONCEPTS: ConceptSet = {
  id: 'void-gear',
  title: 'Void gear: tint, plain pieces, a set, a shard',
  element: 'void',
  requested: '2026-10-31: design Void gear.',
  status: 'draft',
  notes: [
    'Needs before use: the Void element in the content (an element tag, a Void Hat, Scarf and Charm at three tiers in gear.json, the set in gear-sets.json, a Void shard in the part kinds), the tint in TINTS and SET_TINTS (gear-sprites.ts), names and flavour confirmed, and the charm flair in item-flair.ts.',
    'Proposed tint: t #7468bc, u #463c86, h #b4aae8 (the Void creatures, a little lighter so a dark item stands out on the panels).',
    'The charm is the shared trail-charm with a Void flair (the variant); every other piece is its own look, as the shipped hats and scarves are.',
  ],
  sprites: {
    'void-cap': {
      kind: 'item',
      note: 'Dusk Cap: a round cap with a star on a stalk and a band of starry window.',
      sprite: {
        mirror: true,
        palette: BASE,
        rows: [
          '.....y',
          '....yy',
          '.....y',
          '..kkkk',
          '.khhtt',
          'khtttt',
          'kttttt',
          'kkkkkk',
          'khhhhh',
          'knnnny',
          'kuuuuu',
          'kkkkkk',
        ],
      },
      alts: ALTS,
    },
    'void-hood': {
      kind: 'item',
      note: 'Gloaming Hood: a deep pointed hood whose face opening is a window of night with one star in it.',
      sprite: {
        mirror: true,
        palette: BASE,
        rows: [
          '.....k',
          '....kh',
          '...khh',
          '..khht',
          '.khtkk',
          'khtkhh',
          'khtknn',
          'khtkny',
          'ktukhh',
          'kuutkk',
          'kuuuuu',
          'kkukuk',
        ],
      },
      alts: ALTS,
    },
    'void-crown': {
      kind: 'item',
      note: "Stargazer's Crown: a three-point crown with a ring in orbit above it and a star in its window.",
      sprite: {
        mirror: true,
        palette: BASE,
        rows: [
          '..kkkk',
          '.khhhh',
          '..kkkk',
          '.k...k',
          'khk.kh',
          'khhkht',
          'khhhtt',
          'khttuu',
          'kkkkkk',
          'khhhhh',
          'knnnny',
          'kkkkkk',
        ],
      },
      alts: ALTS,
    },
    'void-scarf': {
      kind: 'item',
      note: 'Twilight Scarf: a wound band of starry window, one tail (the notch in it is too small to read as a crescent).',
      sprite: {
        palette: BASE,
        rows: [
          '.kkkkkkkkkk.',
          'kthhhhhhhhtk',
          'khnnynnnynhk',
          'khnnnnnnnnuk',
          'kuuuuuuuuuuk',
          '.kkkkkkkkkk.',
          '.ktthk......',
          '.kttuk......',
          '.kyttk......',
          '.ktuuk......',
          '.kt.uk......',
          '.kk.kk......',
        ],
      },
      alts: ALTS,
    },
    'void-shawl': {
      kind: 'item',
      note: 'Nightfall Shawl: a triangle of cloth hanging to a point, a lit window across the chest, a star at the tip.',
      sprite: {
        mirror: true,
        palette: BASE,
        rows: [
          'kkkkkk',
          'khhhhh',
          'kttttt',
          'kthhhh',
          '.ktnnn',
          '.ktnyy',
          '..kthh',
          '..kttu',
          '...ktu',
          '...kuy',
          '....ky',
          '.....k',
        ],
      },
      alts: ALTS,
    },
    'void-mantle': {
      kind: 'item',
      note: "Stargazer's Mantle: a high collar, a ring clasp holding a starry window, and a hem of crescents.",
      sprite: {
        mirror: true,
        palette: BASE,
        rows: [
          '..kkkk',
          '.kthhh',
          'kthhhh',
          'kttttt',
          'kttkhh',
          'kttkhn',
          'kttkhy',
          'kttkhh',
          'ktttuu',
          'kuuuuu',
          'kkukuk',
          '.k.k.k',
        ],
      },
      alts: ALTS,
    },
    'void-charm': {
      kind: 'item',
      note: 'Starwell Charm: the shared trail-charm. The variant is the same stone with the Void flair: a window with a star, and a glint.',
      sprite: TRAIL_CHARM,
      variants: { 'Void flair': flaired(TRAIL_CHARM, VOID_CHARM_FLAIR) },
      alts: ALTS,
    },
    'void-set-hat': {
      kind: 'item',
      role: 'set',
      note: "Starkeeper's Hat: a tall pointed hat with a gold star at the tip and a gold band round a starry window.",
      sprite: {
        palette: SET,
        rows: [
          '........gw..',
          '.......kgk..',
          '......kthk..',
          '.....kthhk..',
          '....kthhtk..',
          '...kthhttuk.',
          '..kgggggggk.',
          '.kgnnnynngk.',
          '.kgggggggggk',
          'kkkkkkkkkkkk',
          'khhtttttuuuk',
          '.kkkkkkkkkk.',
        ],
      },
      alts: ALTS,
    },
    'void-set-scarf': {
      kind: 'item',
      role: 'set',
      note: "Starkeeper's Loop: a scarf wound in a loop like an orbit, gold edges, a star in its side.",
      sprite: {
        mirror: true,
        palette: SET,
        rows: [
          '..kkkk',
          '.kthhh',
          'kthhgg',
          'ktgkkk',
          'ktnk..',
          'kynk..',
          'ktuk..',
          'kugkkk',
          'kuuuuu',
          '.kuuuu',
          '..kgww',
          '......',
        ],
      },
      alts: ALTS,
    },
    'void-set-charm': {
      kind: 'item',
      role: 'set',
      note: "Starkeeper's Lens: a gold ring, like a lens held up to the sky, with a starry window inside.",
      sprite: {
        mirror: true,
        palette: { ...SET, c: '#c9a66b' },
        rows: [
          '....kk',
          '...kcc',
          '..kc..',
          '..kc..',
          '...kgg',
          '..kgwh',
          '.kgthn',
          '.kgtny',
          '.kgunn',
          '..kguu',
          '...kgg',
          '....kk',
        ],
      },
      alts: ALTS,
    },
    'void-shard': {
      kind: 'part',
      note: 'Void shard: a crescent-shaped crystal with a star caught in its hollow.',
      sprite: {
        palette: {
          k: '#0d0a1a',
          b: '#6f62b8',
          h: '#a99fe0',
          m: '#463c86',
          y: '#fff1b8',
        },
        rows: [
          '..kkkk..',
          '.khhhbk.',
          'khhkkkk.',
          'khbk..y.',
          'kbmk.y.y',
          'kbmk..y.',
          '.kbmkkk.',
          '..kkk...',
        ],
      },
    },
  },
};
