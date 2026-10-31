/**
 * Pixel art of gear: a 12x12 sprite for each slot (hat, scarf, charm), recoloured by the item's
 * element (neutral, explorer and role pieces are grey), a trimmed 12x12 variant of each for the pieces of a
 * gear set (gold trim, tinted by the set's tag so a set is known at a glance), and 8x8 icons for the parts. The same data format and
 * palette approach as the creature sprites and glyphs (draw them with `<Sprite>`). Every kind has
 * its own shape and every part its own silhouette, so colour is never the only cue. Pure data.
 */
import {
  baseElement,
  gearBase,
  gearContent,
  gearSet,
  type GearBase,
  type GearSlot,
  type PartKind,
} from '@creatures/game';
import { CHARM_SPRITE_DATA } from './sprites/data/item-charm-sprites';
import { ITEM_FLAIR } from './sprites/data/item-flair';
import { HAT_SPRITE_DATA } from './sprites/data/item-hat-sprites';
import { SCARF_SPRITE_DATA } from './sprites/data/item-scarf-sprites';
import { expandRows, type SpriteDef } from './sprites/sprite-data';

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
  mire: { t: '#b8864a', u: '#6b4a2a', h: '#e8c068' },
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

/** A cap with a brim and a bobble. */
const hat: SpriteDef = {
  mirror: true,
  palette: { k: INK, ...NEUTRAL },
  rows: [
    '......',
    '....kk',
    '...kth',
    '..ktth',
    '.kthht',
    'kttttt',
    'kttttt',
    'kuuuuu',
    'kkkkkk',
    '.kuuuu',
    '..kkkk',
    '......',
  ],
};

/** A wound scarf with a tail hanging down. */
const scarf: SpriteDef = {
  mirror: true,
  palette: { k: INK, ...NEUTRAL },
  rows: [
    '......',
    '.kkkkk',
    'kttttt',
    'kthhhh',
    'kuuuuu',
    '.kkkkk',
    '...kth',
    '...ktt',
    '...kth',
    '...ktu',
    '...kkk',
    '......',
  ],
};

export const BUNDLED_ITEM_SPRITES: Readonly<Record<GearSlot, SpriteDef>> = { hat, scarf, charm };

// --- Gear set pieces ---

/** The gold of a set piece's trim: it stays the same whatever the set's tag tints. */
const TRIM = { g: '#f6d56a', w: '#fff6d8' } as const;

/** A set Hat: a pointed cap with a gold band and a star on top. */
const setHat: SpriteDef = {
  mirror: true,
  palette: { k: INK, ...TRIM, ...NEUTRAL },
  rows: [
    '.....g',
    '....gw',
    '....kk',
    '...kth',
    '..ktth',
    '.kthht',
    'kttttt',
    'kggggg',
    'kuuuuu',
    'kkkkkk',
    '.kuuuu',
    '..kkkk',
  ],
};

/** A set Scarf: a wound scarf with a gold stripe, a striped tail and a tassel. */
const setScarf: SpriteDef = {
  mirror: true,
  palette: { k: INK, ...TRIM, ...NEUTRAL },
  rows: [
    '......',
    '.kkkkk',
    'kttttt',
    'kggggg',
    'kuuuuu',
    '.kkkkk',
    '...kth',
    '...kgg',
    '...ktu',
    '...kgg',
    '...kuu',
    '...gwg',
  ],
};

/** A set Charm: a gold-framed diamond on a cord. */
const setCharm: SpriteDef = {
  mirror: true,
  palette: { k: INK, c: '#c9a66b', ...TRIM, ...NEUTRAL },
  rows: [
    '....kk',
    '...kcc',
    '..kc..',
    '..kc..',
    '....kg',
    '...kgh',
    '..kgth',
    '.kgtth',
    '..kgtu',
    '...kgu',
    '....kg',
    '.....k',
  ],
};

/** The sprite of each slot for a gear set piece: a trimmed variant of the plain one, so a set is known at a glance. */
export const BUNDLED_SET_SPRITES: Readonly<Record<GearSlot, SpriteDef>> = {
  hat: setHat,
  scarf: setScarf,
  charm: setCharm,
};

export const GEAR_SLOT_IDS = ['hat', 'scarf', 'charm'] as const satisfies readonly GearSlot[];

/**
 * The coat of an item with no element and no set (Misa, 2026-10-31): the neutral pieces and the role
 * and explorer charms. A low-saturation oat beige instead of the bare grey, kept clear of Mire's
 * saturated ochre and of the explorer set's brighter tan.
 */
export const NEUTRAL_PAINT = { t: '#bba88c', u: '#7f6e58', h: '#e4d8c2' } as const;

/** The palette swap that gives an item its element's colours; undefined for neutral (the base palette). */
export function tintPalette(tint: string | null): Readonly<Record<string, string>> | undefined {
  return tint !== null && Object.hasOwn(TINTS, tint) ? TINTS[tint] : undefined;
}

/**
 * The colours of a gear set's tag: the four elements wear their own colours, and each role, the explorers
 * and the Festival have one more (a set is tinted by its tag, so a role set is as recognisable as an element
 * set). None is the colour of an element.
 */
const SET_TINTS: Readonly<Record<string, Readonly<Record<'t' | 'u' | 'h', string>>>> = {
  ...TINTS,
  guard: { t: '#7d8fb5', u: '#4d5c80', h: '#c3d0ea' },
  support: { t: '#e58cb5', u: '#a8517d', h: '#ffd0e6' },
  setter: { t: '#a07be6', u: '#6a48b0', h: '#d9c8ff' },
  payoff: { t: '#3cc1b4', u: '#1f7f76', h: '#a8f0e8' },
  explorer: { t: '#c8a46a', u: '#8a6a36', h: '#f0dcae' },
  festival: { t: '#f6b73c', u: '#b0791a', h: '#ffe6a0' },
};

/** The palette swap of a set's tag, or undefined for a tag with none. */
export function setTintPalette(tag: string): Readonly<Record<string, string>> | undefined {
  return Object.hasOwn(SET_TINTS, tag) ? SET_TINTS[tag] : undefined;
}

/** A plain grey silhouette for an item whose base is not in the content (so a screen never breaks). */
const FALLBACK_ITEM: SpriteDef = charm;

/** Every item look's own sprite (12x12), by look id (`itemLookId`). */
export const ITEM_LOOK_SPRITES: Readonly<Record<string, SpriteDef>> = {
  ...HAT_SPRITE_DATA,
  ...SCARF_SPRITE_DATA,
  ...CHARM_SPRITE_DATA,
};

/** Whether two bases are the same item in another element: one slot, the same stats, no set. */
function sameLook(a: GearBase, b: GearBase): boolean {
  const plain = (x: GearBase): boolean =>
    x.set === undefined && (x.tag === 'neutral' || baseElement(x) !== null);
  return (
    a.slot === b.slot &&
    plain(a) &&
    plain(b) &&
    JSON.stringify(a.stats ?? null) === JSON.stringify(b.stats ?? null)
  );
}

/**
 * The look an item base is drawn with (Misa, 2026-10-30): every item with its own name has its own
 * sprite, except element versions of one item (same slot, same stats, no set), which share the first
 * one's sprite in content order and are told apart by the element tint.
 */
export function itemLookId(baseId: string): string {
  const base = gearBase(baseId);
  if (base === undefined) return baseId;
  return gearContent.bases.find((other) => sameLook(other, base))?.id ?? base.id;
}

/** An element's touch over a shared item look: 12x12 rows where `.` keeps the shared pixel. */
export interface Flair {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

/** The shared sprite with a flair drawn over it (both expanded to full rows; the result is not mirrored). */
export function withFlair(def: SpriteDef, flair: Flair): SpriteDef {
  const rows = expandRows(def).map((row, y) => {
    const over = flair.rows[y] ?? '';
    return [...row]
      .map((ch, x) => (over[x] === undefined || over[x] === '.' ? ch : over[x]))
      .join('');
  });
  return { rows, palette: { ...def.palette, ...flair.palette } };
}

/** The flair of an element version of a shared look, or undefined (neutral, a set piece, none drawn). */
export function itemFlair(baseId: string): Flair | undefined {
  const base = gearBase(baseId);
  const element = base === undefined || base.set !== undefined ? null : baseElement(base);
  if (element === null) return undefined;
  return ITEM_FLAIR[itemLookId(baseId)]?.[element];
}

const FLAIRED = new Map<string, SpriteDef>();

/** The sprite of an item base and the palette that tints it. */
export function itemArt(baseId: string): {
  sprite: SpriteDef;
  palette: Readonly<Record<string, string>> | undefined;
} {
  const base = gearBase(baseId);
  if (base === undefined) return { sprite: FALLBACK_ITEM, palette: undefined };
  const own = ITEM_LOOK_SPRITES[itemLookId(baseId)];
  // A gear set piece is tinted by its set's tag (the Festival pieces by the Festival's); the slot's
  // shared sprites are the fallback for a base drawn before its own sprite.
  if (base.set !== undefined) {
    const set = gearSet(base.set);
    return {
      sprite: own ?? BUNDLED_SET_SPRITES[base.slot],
      palette: setTintPalette(set?.tag ?? base.tag),
    };
  }
  const plain = own ?? BUNDLED_ITEM_SPRITES[base.slot];
  const flair = itemFlair(baseId);
  let sprite = plain;
  if (flair !== undefined) {
    // One sprite object per base, so a screen redraw gets the same object back.
    sprite = FLAIRED.get(baseId) ?? withFlair(plain, flair);
    FLAIRED.set(baseId, sprite);
  }
  return { sprite, palette: tintPalette(baseElement(base)) ?? NEUTRAL_PAINT };
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

/** A rounded, lumpy crystal with an oily sheen. */
const mireShard: SpriteDef = {
  mirror: true,
  palette: { k: INK, b: '#b8864a', h: '#e8c068', m: '#6b4a2a' },
  rows: ['.kkk', 'kbhh', 'kbhb', 'kbbb', 'kmbb', 'kmmb', '.kmm', '..kk'],
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
  'mire-shard': mireShard,
  glimmer,
};

/** The icon of a part kind, or a plain scrap icon for a kind that has none. */
export function partIcon(kind: string): SpriteDef {
  return Object.hasOwn(BUNDLED_PART_ICONS, kind) ? BUNDLED_PART_ICONS[kind as PartKind] : scrap;
}
