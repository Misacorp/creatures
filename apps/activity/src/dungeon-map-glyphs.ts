/**
 * 8x8 icons for the rooms of the dungeon map, in the glyph format (draw them with `<Sprite>`): crossed
 * blades (a fight), a horned skull (an elite), a "?" (a mystery room), a chest (a cache), a campfire (the
 * camp) and a crown (the room boss). Every icon has its own shape, so a room's kind never depends on colour
 * alone. Pure data; `glyphs.ts` adds them to the bundled glyphs.
 */
import type { SpriteDef } from './sprites/sprite-data';

const BONE = '#f4eedc';
const GOLD = '#ffd25a';
const GOLD_SHADE = '#c8952b';
const BAD = '#ff5f6d';

/** Two blades crossed, with a gold pommel at each end. */
const mapFight: SpriteDef = {
  palette: { w: BONE, g: GOLD },
  rows: [
    'g......g',
    '.w....w.',
    '..w..w..',
    '...ww...',
    '...ww...',
    '..w..w..',
    '.w....w.',
    'g......g',
  ],
};

/** A skull with red horns. */
const mapElite: SpriteDef = {
  palette: { w: BONE, k: '#0d0a1a', r: BAD },
  rows: [
    'r......r',
    'rr.ww.rr',
    '.rwwwwr.',
    '.wwwwww.',
    '.wkwwkw.',
    '..wwww..',
    '..wkkw..',
    '..w..w..',
  ],
};

/** A question mark. */
const mapMystery: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '..wwww..',
    '.ww..ww.',
    '.ww..ww.',
    '....ww..',
    '...ww...',
    '...ww...',
    '........',
    '...ww...',
  ],
};

/** A chest with a gold band and lock. */
const mapCache: SpriteDef = {
  palette: { b: '#a8672f', d: '#7a4720', g: GOLD },
  rows: [
    '.dddddd.',
    'dbbbbbbd',
    'dbbbbbbd',
    'dggggggd',
    'dbbggbbd',
    'dbbbbbbd',
    'dddddddd',
    '........',
  ],
};

/** A small fire on crossed logs. */
const mapCamp: SpriteDef = {
  palette: { f: '#ef6a3a', y: GOLD, l: '#a8672f', d: '#7a4720' },
  rows: [
    '...f....',
    '..ff.f..',
    '..fyff..',
    '.ffyyff.',
    '.fyyyyf.',
    '..fyyf..',
    '.llddll.',
    'dl....ld',
  ],
};

/** A crown with two red jewels. */
const mapBoss: SpriteDef = {
  palette: { g: GOLD, h: GOLD_SHADE, r: BAD },
  rows: [
    '........',
    'g..gg..g',
    'gg.gg.gg',
    'gggggggg',
    'gggggggg',
    'ggrggrgg',
    'gggggggg',
    'hhhhhhhh',
  ],
};

export const DUNGEON_MAP_GLYPHS: Readonly<Record<string, SpriteDef>> = {
  'map-fight': mapFight,
  'map-elite': mapElite,
  'map-mystery': mapMystery,
  'map-cache': mapCache,
  'map-camp': mapCamp,
  'map-boss': mapBoss,
};
