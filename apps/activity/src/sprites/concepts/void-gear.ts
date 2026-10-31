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
/** The star accent of the Starkeeper's set: fixed (no tint changes it), a pale starlight cyan like the creatures' glint. */
const STAR = '#9fe8ff';
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
    "2026-10-31: Misa liked the other eight; for the Starkeeper's set (hat, scarf, charm) he said it read pure purple and yellow and asked for a small accent toward the stars. Added a fixed pale starlight cyan `#9fe8ff` (not tinted) on the stars and a glint on the trim; silhouettes and gold trim kept. Those three are draft again.",
    'The charm is the shared trail-charm with a Void flair (the variant); every other piece is its own look, as the shipped hats and scarves are.',
  ],
  sprites: {
    'void-cap': {
      kind: 'item',
      status: 'liked',
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
          'kuuhnn',
          'kuuuuu',
          'kkkkkk',
        ],
      },
      alts: ALTS,
    },
    'void-hood': {
      kind: 'item',
      status: 'liked',
      note: 'Gloaming Hood: a pointed cloth hood; inside it shows a round window of night with one star.',
      sprite: {
        palette: BASE,
        rows: [
          '.....kk.....',
          '....khhk....',
          '...khhhtk...',
          '..khhhtttk..',
          '.khhtkkktuk.',
          '.khtkhhhkuk.',
          'khtkhnnnhkuk',
          'khtkhnnyhkuk',
          'kttkhnnnhkuk',
          'kuutkhhhkuuk',
          'kuuuuuuuuuuk',
          'kkkkkkkkkkkk',
        ],
      },
      alts: ALTS,
    },
    'void-crown': {
      kind: 'item',
      status: 'liked',
      note: "Stargazer's Crown: a three-point crown with a tilted ring in orbit around its tips and a star in its window.",
      sprite: {
        palette: BASE,
        rows: [
          '.....kkkkk..',
          '..kkkhhhhhk.',
          '.khhkkkkkkhk',
          '..kkhhhhkkk.',
          '.k...kk...k.',
          'khk.khhk.khk',
          'khhkhtthkhhk',
          'khhhtttthhhk',
          'khttuuuutthk',
          'kkkkkkkkkkkk',
          'kuuhnnynhuuk',
          'kkkkkkkkkkkk',
        ],
      },
      alts: ALTS,
    },
    'void-scarf': {
      kind: 'item',
      status: 'liked',
      note: 'Twilight Scarf: a soft wound scarf with a star on the band and one long tail, notched at the end.',
      sprite: {
        palette: { k: BASE.k, t: BASE.t, u: BASE.u, h: BASE.h, y: BASE.y },
        rows: [
          '............',
          '....kkkkkkk.',
          '...kthhhhhtk',
          '.kkttthyhhtk',
          'khkuuutttttk',
          'ktkkkkkkkkk.',
          'kuhtk.......',
          '.kuhtk......',
          '.kuyhtk.....',
          '..kuhhtk....',
          '....kuutk...',
          '....kk.kk...',
        ],
      },
      alts: ALTS,
    },
    'void-shawl': {
      kind: 'item',
      status: 'liked',
      note: 'Nightfall Shawl: a triangle of cloth hanging to a point, a lit window across the chest, a star at the tip.',
      sprite: {
        mirror: true,
        palette: BASE,
        rows: [
          'kkkkkk',
          'khhhhh',
          'kttttt',
          'kthhhh',
          '.kthhn',
          '.kthnn',
          '..kthn',
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
      status: 'liked',
      note: "Stargazer's Mantle: sloping shoulders, a collar, a crescent clasp, a front seam and a scalloped hem.",
      sprite: {
        palette: { k: BASE.k, t: BASE.t, u: BASE.u, h: BASE.h, y: BASE.y },
        rows: [
          '...kkkkkk...',
          '..kthhhhtk..',
          '.kthhhhhhtk.',
          'kthhtttthhtk',
          'ktttyytttttk',
          'kttyttttyttk',
          'kttytttttttk',
          'ktttykkutttk',
          'kttuukkuuttk',
          'kuuuukkuuuuk',
          'kkukukkukukk',
          '.k.k.kk.k.k.',
        ],
      },
      alts: ALTS,
    },
    'void-charm': {
      kind: 'item',
      status: 'liked',
      note: 'Starwell Charm: the shared trail-charm with a Void flair (a window with a star, and a glint); the variant is the plain shipped stone.',
      sprite: flaired(TRAIL_CHARM, VOID_CHARM_FLAIR),
      variants: { 'plain stone (shipped trail-charm)': TRAIL_CHARM },
      alts: ALTS,
    },
    'void-set-hat': {
      kind: 'item',
      status: 'draft',
      role: 'set',
      note: "Starkeeper's Hat: a tall pointed hat with a gold star at the tip and a gold band round a starry window.",
      sprite: {
        palette: { k: SET.k, t: SET.t, u: SET.u, h: SET.h, n: SET.n, g: SET.g, s: STAR },
        rows: [
          '........gs..',
          '.......kgk..',
          '......kthk..',
          '.....kthhk..',
          '....kthhtk..',
          '...kthhttuk.',
          '..kggnsnggk.',
          '.kgnnnsnnngk',
          '.kgggnnggggk',
          'kkkkkkkkkkkk',
          'khhtttttuuuk',
          '.kkkkkkkkkk.',
        ],
      },
      alts: ALTS,
    },
    'void-set-scarf': {
      kind: 'item',
      status: 'draft',
      role: 'set',
      note: "Starkeeper's Loop: a gold-striped wound scarf with a long tail, a star on it and a gold tassel.",
      sprite: {
        palette: { k: SET.k, t: SET.t, u: SET.u, h: SET.h, g: SET.g, s: STAR },
        rows: [
          '............',
          '....kkkkkkk.',
          '...kthhhhhtk',
          '.kktgggsgggk',
          'khkuuutttttk',
          'ktkkkkkkkkk.',
          'kutgk.......',
          '.kutgk......',
          '.kustgk.....',
          '..kuhtgk....',
          '....kutgk...',
          '....kkgsk...',
        ],
      },
      alts: ALTS,
    },
    'void-set-charm': {
      kind: 'item',
      status: 'draft',
      role: 'set',
      note: "Starkeeper's Lens: a gold ring, like a lens held up to the sky, with a starry window inside.",
      sprite: {
        mirror: true,
        palette: {
          k: SET.k,
          t: SET.t,
          u: SET.u,
          h: SET.h,
          n: SET.n,
          g: SET.g,
          s: STAR,
          c: '#c9a66b',
        },
        rows: [
          '....kk',
          '...kcc',
          '..kc..',
          '..kc..',
          '...kgg',
          '..kgsh',
          '.kgthn',
          '.kgtns',
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
      status: 'liked',
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
