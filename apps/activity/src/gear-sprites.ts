/**
 * Pixel art of gear: a 12x12 sprite for each kind of item (charm, band, trinket), recoloured by the
 * item's element (neutral items are grey), and 8x8 icons for the parts. The same data format and
 * palette approach as the creature sprites and glyphs (draw them with `<Sprite>`). Every kind has
 * its own shape and every part its own silhouette, so colour is never the only cue. Pure data.
 */
import { gearBase, type GearKind, type PartKind } from '@creatures/game';
import type { SpriteDef } from './sprites/sprite-data';

export const ITEM_SIZE = { width: 12, height: 12 } as const;
export const PART_SIZE = { width: 8, height: 8 } as const;

const INK = '#0d0a1a';

/**
 * `t` is the item's main colour, `u` its shade and `h` its highlight. A tint swaps these three; `c`
 * is the cord of a charm and stays tan.
 */
const NEUTRAL = { t: '#9a98ae', u: '#6a6882', h: '#d8d6e6' } as const;

const TINTS: Readonly<Record<string, Readonly<Record<'t' | 'u' | 'h', string>>>> = {
  tide: { t: '#4f8fe6', u: '#2f5fb0', h: '#a6d0ff' },
  ember: { t: '#ef6a3a', u: '#b0391c', h: '#ffc08a' },
  grove: { t: '#5cbf5a', u: '#2f7a3a', h: '#b8f08a' },
  spark: { t: '#f2d43d', u: '#b08f12', h: '#fff6b0' },
};

/** A round charm hanging from a cord. */
const charm: SpriteDef = {
  mirror: true,
  palette: { k: INK, c: '#c9a66b', ...NEUTRAL },
  rows: [
    '....kk',
    '...kcc',
    '..kc..',
    '..kc..',
    '...kc.',
    '....kk',
    '...kkk',
    '..kthh',
    '.kthhh',
    '.kttth',
    '..kuuu',
    '...kkk',
  ],
};

/** A ring-shaped band with a gem on top. */
const band: SpriteDef = {
  mirror: true,
  palette: { k: INK, ...NEUTRAL },
  rows: [
    '....kk',
    '...khh',
    '..kkhh',
    '.kkkkk',
    'kttu..',
    'kt....',
    'kt....',
    'kt....',
    'ktu...',
    '.ktuuu',
    '..kkkk',
    '......',
  ],
};

/** A small star with two legs. */
const trinket: SpriteDef = {
  mirror: true,
  palette: { k: INK, ...NEUTRAL },
  rows: [
    '.....k',
    '....kt',
    '....kt',
    'kkkktt',
    'kttthh',
    '.kttth',
    '..ktth',
    '..kttt',
    '.kttkk',
    '.ktk..',
    '.kk...',
    '......',
  ],
};

export const BUNDLED_ITEM_SPRITES: Readonly<Record<GearKind, SpriteDef>> = { charm, band, trinket };

export const GEAR_KIND_IDS = ['charm', 'band', 'trinket'] as const satisfies readonly GearKind[];

/** The palette swap that gives an item its element's colours; undefined for neutral (the base palette). */
export function tintPalette(tint: string | null): Readonly<Record<string, string>> | undefined {
  return tint !== null && Object.hasOwn(TINTS, tint) ? TINTS[tint] : undefined;
}

/** A plain grey silhouette for an item whose base is not in the content (so a screen never breaks). */
const FALLBACK_ITEM: SpriteDef = trinket;

/** The sprite of an item base and the palette that tints it. */
export function itemArt(baseId: string): {
  sprite: SpriteDef;
  palette: Readonly<Record<string, string>> | undefined;
} {
  const base = gearBase(baseId);
  if (base === undefined) return { sprite: FALLBACK_ITEM, palette: undefined };
  return { sprite: BUNDLED_ITEM_SPRITES[base.kind], palette: tintPalette(base.tint) };
}

// --- Parts (8x8) ---

const SCRAP_PALETTE = { k: INK, m: '#9a98ae', w: '#d8d6e6' } as const;

/** Bent pieces of metal. */
const scrap: SpriteDef = {
  palette: SCRAP_PALETTE,
  rows: [
    '........',
    '.kkk....',
    'kmmwk.kk',
    'kmmmkkmk',
    '.kkkkmmk',
    '..kmmmk.',
    '..kkkkk.',
    '........',
  ],
};

/** A tall diamond crystal. */
const tideShard: SpriteDef = {
  mirror: true,
  palette: { k: INK, b: '#4f8fe6', h: '#a6d0ff', w: '#e6f6ff' },
  rows: ['...k', '..kb', '.kbh', 'kbwh', 'kbbh', '.kbb', '..kb', '...k'],
};

/** A crystal with two peaks. */
const emberShard: SpriteDef = {
  mirror: true,
  palette: { k: INK, b: '#ef6a3a', h: '#ffc08a', y: '#ffe680' },
  rows: ['.k.k', '.kbk', 'kbhb', 'kbhh', 'kbyh', '.kbb', '..kb', '...k'],
};

/** A wide, flat-topped crystal. */
const groveShard: SpriteDef = {
  mirror: true,
  palette: { k: INK, b: '#5cbf5a', h: '#b8f08a', m: '#2f7a3a' },
  rows: ['....', 'kkkk', 'kbhh', 'kbhh', 'kbbh', 'kmbb', '.kmb', '..kk'],
};

/** A crystal bent like a bolt. */
const sparkShard: SpriteDef = {
  palette: { k: INK, b: '#f2d43d', h: '#fff6b0' },
  rows: [
    '....kkk.',
    '...kbhk.',
    '..kbhk..',
    '.kbhhbk.',
    '.kkkbhk.',
    '...kbk..',
    '..kbk...',
    '..kk....',
  ],
};

/** A rare twinkle: a bright gem with points of light around it. */
const glimmer: SpriteDef = {
  mirror: true,
  palette: { k: INK, w: '#fff6ff', c: '#d9a8ff' },
  rows: ['k..w', '.kkw', '..kc', 'wwcc', 'wwcc', '..kc', '.kkw', 'k..w'],
};

export const BUNDLED_PART_ICONS: Readonly<Record<PartKind, SpriteDef>> = {
  scrap,
  'tide-shard': tideShard,
  'ember-shard': emberShard,
  'grove-shard': groveShard,
  'spark-shard': sparkShard,
  glimmer,
};

/** The icon of a part kind, or a plain scrap icon for a kind that has none. */
export function partIcon(kind: string): SpriteDef {
  return Object.hasOwn(BUNDLED_PART_ICONS, kind) ? BUNDLED_PART_ICONS[kind as PartKind] : scrap;
}
