/**
 * 8x8 icons of the Valley Games, in the glyph format (draw them with `<Sprite>`): the Games tab's trophy
 * (one colour, `w`, so the selected tab can tint it), what an event favours where the game had no
 * picture yet (HP, Attack, Speed, Dodge, small and big creatures), the medal point a Prize Stall
 * price is counted in, and the "Good fit" badge's tick. Every icon has its own shape, so meaning never depends on colour alone. Pure
 * data; `glyphs.ts` adds them to the bundled glyphs.
 */
import type { SpriteDef } from './sprites/sprite-data';

const INK = '#0d0a1a';
const BONE = '#f4eedc';
const GOLD = '#ffd25a';
const GOLD_SHADE = '#c8952b';
const HAZE = '#a69fc8';
const RED = '#ff5f6d';
const ORANGE = '#ef8a3a';
const TIDE = '#4f8fe6';
const SKY = '#7fc4ff';
const GOOD = '#6fdc8c';
const GOOD_SHADE = '#3a9a5a';

/** A cup with two handles on a foot: the Games tab. */
const trophy: SpriteDef = {
  palette: { w: BONE },
  rows: [
    'wwwwwwww',
    'w.wwww.w',
    'w.wwww.w',
    '.wwwwww.',
    '..wwww..',
    '...ww...',
    '..wwww..',
    '.wwwwww.',
  ],
};

/** A heart: the event favours HP. */
const favHp: SpriteDef = {
  palette: { r: RED, w: BONE },
  rows: [
    '.rr..rr.',
    'rwrrrrrr',
    'rrrrrrrr',
    'rrrrrrrr',
    '.rrrrrr.',
    '..rrrr..',
    '...rr...',
    '........',
  ],
};

/** A boxing glove: the event favours Attack (a shove, a push). */
const favAtk: SpriteDef = {
  palette: { o: ORANGE, w: BONE, k: INK },
  rows: [
    '..oooo..',
    '.oooooo.',
    'oowooooo',
    'oooooook',
    'ooooook.',
    '.ooooo..',
    '.wwwww..',
    '.wwwww..',
  ],
};

/** An arrow with speed lines: the event favours Speed. */
const favSpd: SpriteDef = {
  palette: { g: GOLD, w: BONE },
  rows: [
    '........',
    'ww..gg..',
    '....ggg.',
    'www.gggg',
    '....ggg.',
    'ww..gg..',
    '........',
    '........',
  ],
};

/** A ball and its afterimage: the event favours Dodge (slipping past). */
const favDodge: SpriteDef = {
  palette: { h: HAZE, b: SKY },
  rows: [
    '........',
    '.hh..bb.',
    'h..hbbbb',
    'h..hbbbb',
    'h..hbbbb',
    'h..hbbbb',
    '.hh..bb.',
    '........',
  ],
};

/** A tiny creature: the event favours small (stage 1) creatures. */
const favSmall: SpriteDef = {
  palette: { w: BONE, k: INK },
  rows: [
    '........',
    '........',
    '........',
    '........',
    '..wwww..',
    '..wkwk..',
    '..wwww..',
    '..w..w..',
  ],
};

/** A big creature filling the box: the event favours big (stage 2) creatures. */
const favBig: SpriteDef = {
  palette: { w: BONE, k: INK },
  rows: [
    '.wwwwww.',
    'wwwwwwww',
    'wwkwwkww',
    'wwkwwkww',
    'wwwwwwww',
    'wwwwwwww',
    '.wwwwww.',
    '.ww..ww.',
  ],
};

/** A small medal on a ribbon: a medal point, what the Prize Stall's prices are counted in. */
const medalPoint: SpriteDef = {
  palette: { r: RED, b: TIDE, g: GOLD, y: BONE, s: GOLD_SHADE },
  rows: [
    '.rr..bb.',
    '..rrbb..',
    '..gggg..',
    '.gyyggs.',
    '.gyggss.',
    '.gggsss.',
    '..ssss..',
    '........',
  ],
};

/** A green tick with no box behind it (clear pixels round it): the "Good fit" badge draws it on the tag. */
const goodFit: SpriteDef = {
  palette: { g: GOOD, d: GOOD_SHADE },
  rows: [
    '........',
    '......g.',
    '.....gg.',
    '.g..ggd.',
    '.ggggd..',
    '..ggg...',
    '...d....',
    '........',
  ],
};

export const GAMES_GLYPHS: Readonly<Record<string, SpriteDef>> = {
  trophy,
  'fav-hp': favHp,
  'fav-atk': favAtk,
  'fav-spd': favSpd,
  'fav-dodge': favDodge,
  'fav-small': favSmall,
  'fav-big': favBig,
  'medal-point': medalPoint,
  'good-fit': goodFit,
};
