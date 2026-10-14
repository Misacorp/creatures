/**
 * 8x8 UI glyphs, in the same data format as the other sprites (draw them with `<Sprite>`): boss
 * gimmicks, turn orders, the mark on the boss, shields, sparkles and the loot reveal's orb and
 * gem. Every glyph has its own shape, so the meaning never depends on colour alone. Pure data.
 */
import { EXPEDITION_GLYPHS } from './expedition-glyphs';
import type { SpriteDef } from './sprites/sprite-data';

export const GLYPH_SIZE = { width: 8, height: 8 } as const;

const INK = '#0d0a1a';
const BONE = '#f4eedc';
const GOLD = '#ffd25a';
const HAZE = '#a69fc8';
const BAD = '#ff5f6d';

// --- Boss gimmicks (one per gimmick op in the content schema) ---

/** A heavy blow on the ground: an arrow slamming into a floor. */
const hitZone: SpriteDef = {
  palette: { r: BAD, w: BONE },
  rows: [
    '...rr...',
    '...rr...',
    '...rr...',
    '.r.rr.r.',
    '..rrrr..',
    '...rr...',
    '........',
    'wwwwwwww',
  ],
};

/** A speaker with a cross over it: the creatures at the ends cannot act. */
const silenceEnds: SpriteDef = {
  palette: { k: HAZE, b: BAD },
  rows: [
    '...k....',
    '..kk....',
    'kkkk.b.b',
    'kkkk..b.',
    'kkkk.b.b',
    '..kk....',
    '...k....',
    '........',
  ],
};

/** An arrow that turns back on itself. */
const reflectFirstReaction: SpriteDef = {
  palette: { r: BAD },
  rows: [
    '...rr...',
    '..rrrrrr',
    '...rr..r',
    '.......r',
    'r......r',
    'r.....r.',
    '.rrrrr..',
    '........',
  ],
};

/** A sword: the boss goes for the strongest creature. */
const strikeHighestAtk: SpriteDef = {
  palette: { w: BONE, g: GOLD, k: INK },
  rows: [
    '......ww',
    '.....www',
    '....www.',
    '...www..',
    'g.www...',
    '.ggw....',
    '.kgg....',
    'k..g....',
  ],
};

// --- Turn orders ---

const leftToRight: SpriteDef = {
  palette: { g: GOLD },
  rows: [
    '.g..g...',
    '..g..g..',
    '...g..g.',
    '....g..g',
    '...g..g.',
    '..g..g..',
    '.g..g...',
    '........',
  ],
};

const rightToLeft: SpriteDef = {
  palette: { g: GOLD },
  rows: [
    '...g..g.',
    '..g..g..',
    '.g..g...',
    'g..g....',
    '.g..g...',
    '..g..g..',
    '...g..g.',
    '........',
  ],
};

/** A stopwatch: the fastest creature goes first. */
const speed: SpriteDef = {
  palette: { g: GOLD, b: BONE },
  rows: [
    '...gg...',
    '.gggggg.',
    'gg..b.gg',
    'g...b..g',
    'g...bb.g',
    'gg....gg',
    '.gggggg.',
    '........',
  ],
};

// --- Fight stage ---

/** A ring with a dot in it, the mark on the boss. `m` is the element colour (gold by default). */
const mark: SpriteDef = {
  mirror: true,
  palette: { k: INK, m: GOLD, b: BONE },
  rows: ['...k', '.kkm', '.kmk', 'kmkb', 'kmkb', '.kmk', '.kkm', '...k'],
};

const shield: SpriteDef = {
  palette: { k: INK, w: BONE, s: HAZE, d: '#6b6396' },
  rows: [
    'kkkkkkkk',
    'kwsssssk',
    'kwssssdk',
    'kssssddk',
    '.kssssk.',
    '.kssddk.',
    '..ksdk..',
    '...kk...',
  ],
};

/** A four-point star: shiny creatures and "first on server". */
const sparkle: SpriteDef = {
  mirror: true,
  palette: { g: GOLD, y: BONE },
  rows: ['...g', '...g', '..gy', 'ggyy', 'ggyy', '..gy', '...g', '...g'],
};

/** A star on a wand: a finale ability firing. */
const ability: SpriteDef = {
  mirror: true,
  palette: { k: INK, g: GOLD, y: BONE },
  rows: ['...k', '..kg', 'kkgy', 'kggy', '.kgg', '.kgk', 'kg.k', 'k...'],
};

/** A warning triangle with an exclamation mark: the boss will do something next round. */
const warning: SpriteDef = {
  palette: { y: GOLD, k: INK },
  rows: [
    '...yy...',
    '..yyyy..',
    '..ykky..',
    '.yykkyy.',
    '.yykkyy.',
    'yyyyyyyy',
    'yyykkyyy',
    'yyyyyyyy',
  ],
};

/** Crosshairs: the boss is about to hit this creature. */
const reticle: SpriteDef = {
  mirror: true,
  palette: { r: BAD, k: INK },
  rows: ['..rr', '.r.r', 'r..r', 'rrr.', 'rrr.', 'r..r', '.r.r', '..rr'],
};

/** Shown for anything that has no glyph of its own. */
const unknown: SpriteDef = {
  mirror: true,
  palette: { k: INK, h: HAZE },
  rows: ['...k', '..kh', '.khh', 'khhk', 'khhk', '.khh', '..kh', '...k'],
};

// --- Loot reveal ---

const orb: SpriteDef = {
  mirror: true,
  palette: { k: INK, c: '#b48cff', w: BONE, b: '#6b3fa0' },
  rows: ['..kk', '.kcc', 'kcww', 'kcwc', 'kccc', 'kccb', '.kbb', '..kk'],
};

/** A cut gem: Essence. */
const gem: SpriteDef = {
  mirror: true,
  palette: { k: INK, w: BONE, c: '#7fe0d0' },
  rows: ['..kk', '.kwc', 'kwcc', 'kccc', '.kcc', '..kc', '...k', '....'],
};

// --- Creature states on the stage ---

/** A skull: the creature is knocked out. */
const skull: SpriteDef = {
  palette: { w: BONE, k: INK },
  rows: [
    '..wwww..',
    '.wwwwww.',
    'wwwwwwww',
    'wkkwwkkw',
    'wkkwwkkw',
    '.wwkkww.',
    '..wwww..',
    '..w.w.w.',
  ],
};

/** A hand with a pointing finger: auto fire is off, the ability waits for its owner. */
const hand: SpriteDef = {
  palette: { w: BONE, k: INK },
  rows: [
    '...kk...',
    '..kwwk..',
    '..kwwk.k',
    '..kwwkwk',
    '.kkwwwwk',
    'kwwwwwwk',
    '.kwwwwk.',
    '..kkkk..',
  ],
};

/** A tick: the ability has been used. */
const check: SpriteDef = {
  palette: { h: HAZE },
  rows: [
    '........',
    '......hh',
    '.....hh.',
    'h...hh..',
    'hh.hh...',
    '.hhh....',
    '..h.....',
    '........',
  ],
};

// --- Workshop ---

/** An anvil: the Workshop tab and its jobs. */
const anvil: SpriteDef = {
  palette: { k: INK, m: HAZE, w: BONE },
  rows: [
    '........',
    'kkkkkkk.',
    'kwwmmmmk',
    '.kkmmkk.',
    '...kmk..',
    '...kmk..',
    '..kmmmk.',
    '.kkkkkkk',
  ],
};

// --- Tabs (one colour, key `w`, so a tab can tint it for its selected state) ---

/** A paw print: the Collection tab. */
const paw: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '.ww..ww.',
    '.ww..ww.',
    'w..ww..w',
    'ww.ww.ww',
    '..wwww..',
    '.wwwwww.',
    '.wwwwww.',
    '..w..w..',
  ],
};

/** A compass: the Expeditions tab. */
const compass: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '..wwww..',
    '.w....w.',
    'w...ww.w',
    'w..www.w',
    'w.www..w',
    'w.ww...w',
    '.w....w.',
    '..wwww..',
  ],
};

/** A sword pointing up and right: the Raid tab. */
const blade: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '......ww',
    '.....www',
    '....www.',
    'w..www..',
    '.wwww...',
    '..ww....',
    '.w.ww...',
    'w....w..',
  ],
};

/** A door: the Dungeon tab. */
const door: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '..wwww..',
    '.w....w.',
    'w......w',
    'w......w',
    'w....w.w',
    'w......w',
    'w......w',
    'wwwwwwww',
  ],
};

// --- The dungeon ---

/** A round lure: Bait, in the rewards. */
const bait: SpriteDef = {
  palette: { g: '#c8952b', y: GOLD, w: BONE },
  rows: [
    '..gggg..',
    '.gyyyyg.',
    'gyywwyyg',
    'gywyyyyg',
    'gywyyyyg',
    'gyyyyyyg',
    '.gyyyyg.',
    '..gggg..',
  ],
};

/** A flag on a pole: the landmark depths. */
const flag: SpriteDef = {
  palette: { g: GOLD, k: HAZE },
  rows: [
    '.kggggg.',
    '.kgggggg',
    '.kggggg.',
    '.k......',
    '.k......',
    '.k......',
    '.k......',
    'kkk.....',
  ],
};

export const BUNDLED_GLYPHS: Readonly<Record<string, SpriteDef>> = {
  hit_zone: hitZone,
  silence_ends: silenceEnds,
  reflect_first_reaction: reflectFirstReaction,
  strike_highest_atk: strikeHighestAtk,
  left_to_right: leftToRight,
  right_to_left: rightToLeft,
  speed,
  mark,
  shield,
  sparkle,
  ability,
  unknown,
  orb,
  gem,
  skull,
  hand,
  check,
  warning,
  reticle,
  anvil,
  paw,
  compass,
  blade,
  door,
  bait,
  flag,
  ...EXPEDITION_GLYPHS,
};

/** A glyph by id, or undefined. */
export function glyph(id: string): SpriteDef | undefined {
  return Object.hasOwn(BUNDLED_GLYPHS, id) ? BUNDLED_GLYPHS[id] : undefined;
}

/** A glyph by id, or the plain diamond. */
export function glyphOrUnknown(id: string): SpriteDef {
  return glyph(id) ?? unknown;
}

/** The glyph for a boss gimmick's `op`; a plain diamond for an op that has none yet. */
export function gimmickGlyph(op: string): SpriteDef {
  return glyph(op) ?? unknown;
}

/** The glyph for a boss's turn order. */
export function turnOrderGlyph(order: string): SpriteDef {
  return glyph(order) ?? unknown;
}

export const GIMMICK_GLYPH_OPS = [
  'hit_zone',
  'silence_ends',
  'reflect_first_reaction',
  'strike_highest_atk',
] as const;
export const TURN_ORDER_GLYPHS = ['left_to_right', 'right_to_left', 'speed'] as const;
