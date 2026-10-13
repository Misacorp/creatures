/**
 * 8x8 icons for expeditions v2, in the glyph format (draw them with `<Sprite>`): the four kinds of
 * supply (Lure, Map scrap, Lantern, Satchel; the ids are the supply kinds of the content, so
 * `glyph(kind)` finds them), the Journal, familiarity stars, a clock, the end-of-trip choice, explorer
 * rank, the night, a lock, a blueprint and a gear piece. Every icon has its own shape, so meaning never
 * depends on colour alone. Pure data; `glyphs.ts` adds them to the bundled glyphs.
 */
import type { SpriteDef } from './sprites/sprite-data';

/** A cherry-like fruit on a short stalk: the bait on a Lure. */
const lure: SpriteDef = {
  palette: { g: '#5cbf5a', r: '#e8505b', h: '#ffb3b8', d: '#a02a3a' },
  rows: [
    '...gg...',
    '....g...',
    '..rrrr..',
    '.rrhrrr.',
    '.rrrrrr.',
    '.rrrrdr.',
    '..rrrd..',
    '...dd...',
  ],
};

/** A torn sheet with a trail and a red X. */
const mapScrap: SpriteDef = {
  palette: { p: '#e8d9a8', s: '#b89968', t: '#8a5a2a', x: '#d9453b' },
  rows: [
    '.pppppp.',
    'ppppsxpx',
    'pttpspxp',
    'ptpptxpx',
    'ptpspppp',
    'pttspppp',
    '.pppppp.',
    '........',
  ],
};

/** A lantern with a flame behind glass. */
const lantern: SpriteDef = {
  palette: { g: '#c8952b', w: '#fff3b0', y: '#ffd25a', o: '#ff9a3c' },
  rows: [
    '..gggg..',
    '..g..g..',
    '.gwyywg.',
    '.gwooyg.',
    '.gwooyg.',
    '.gwwwwg.',
    '.gggggg.',
    '..gggg..',
  ],
};

/** A bag with a flap and a buckle. */
const satchel: SpriteDef = {
  palette: { b: '#a0693a', d: '#7a4a24', y: '#ffd25a' },
  rows: [
    '...dd...',
    '..dddd..',
    '.dddddd.',
    'bbbyybbb',
    'bbbbbbbb',
    'bbbbbbbb',
    'bddbbddb',
    '.bbbbbb.',
  ],
};

/** A book with a purple cover and pages with lines of writing. */
const journal: SpriteDef = {
  palette: { c: '#8a4fb0', d: '#5b2f80', w: '#f4eedc', h: '#a69fc8' },
  rows: [
    '.cccccc.',
    'cdwwwwwc',
    'cdwhhhwc',
    'cdwwwwwc',
    'cdwhhwwc',
    'cdwwwwwc',
    'cdwhhhwc',
    '.cccccc.',
  ],
};

/** A filled star: one familiarity star earned. */
const star: SpriteDef = {
  palette: { g: '#ffd25a' },
  rows: [
    '...gg...',
    '...gg...',
    'gggggggg',
    '.gggggg.',
    '..gggg..',
    '..gggg..',
    '.gg..gg.',
    '.g....g.',
  ],
};

/** An empty star: one not earned yet. */
const starEmpty: SpriteDef = {
  palette: { h: '#a69fc8' },
  rows: [
    '...hh...',
    '...hh...',
    'hhhhhhhh',
    '.h....h.',
    '..h..h..',
    '..h..h..',
    '.hh..hh.',
    '.h....h.',
  ],
};

/** A clock face: hours. */
const clock: SpriteDef = {
  palette: { w: '#f4eedc', h: '#ffd25a' },
  rows: [
    '..wwww..',
    '.w....w.',
    'w..hh..w',
    'w..hh..w',
    'w..hhh.w',
    'w......w',
    '.w....w.',
    '..wwww..',
  ],
};

/** One road that splits in two: the end-of-trip choice. */
const fork: SpriteDef = {
  palette: { g: '#ffd25a' },
  rows: [
    '.g....g.',
    'ggg..ggg',
    '.g....g.',
    '.gg..gg.',
    '..gggg..',
    '...gg...',
    '...gg...',
    '...gg...',
  ],
};

/** A double chevron pointing up: explorer rank. */
const rank: SpriteDef = {
  palette: { g: '#ffd25a' },
  rows: [
    '...gg...',
    '..gggg..',
    '.gg..gg.',
    'gg....gg',
    '...gg...',
    '..gggg..',
    '.gg..gg.',
    'gg....gg',
  ],
};

/** A crescent moon: places that open at night. */
const moon: SpriteDef = {
  palette: { y: '#d8e2f0' },
  rows: [
    '..yyyy..',
    '.yyy....',
    'yyy.....',
    'yyy.....',
    'yyy.....',
    'yyy.....',
    '.yyy..yy',
    '..yyyy..',
  ],
};

/** A padlock: a place that is closed. */
const lock: SpriteDef = {
  palette: { h: '#a69fc8', g: '#c8952b' },
  rows: [
    '..hhhh..',
    '.h....h.',
    '.h....h.',
    'gggggggg',
    'ggg..ggg',
    'ggg..ggg',
    'gggggggg',
    'gggggggg',
  ],
};

/** A blue sheet with a white plan on it. */
const blueprint: SpriteDef = {
  palette: { b: '#4f8fe6', w: '#f4eedc' },
  rows: [
    'bbbbbbbb',
    'bwwbwwwb',
    'bwbbbbwb',
    'bwbwwbwb',
    'bwbwwbwb',
    'bwbbbbwb',
    'bwwwbwwb',
    'bbbbbbbb',
  ],
};

/** A ring with a gem: a piece of gear. */
const gearPiece: SpriteDef = {
  palette: { g: '#ffd25a', p: '#b48cff' },
  rows: [
    '...gg...',
    '..gppg..',
    '...gg...',
    '.gg..gg.',
    'g......g',
    'g......g',
    '.g....g.',
    '..gggg..',
  ],
};

export const EXPEDITION_GLYPHS: Readonly<Record<string, SpriteDef>> = {
  lure,
  'map-scrap': mapScrap,
  lantern,
  satchel,
  journal,
  star,
  'star-empty': starEmpty,
  clock,
  fork,
  rank,
  moon,
  lock,
  blueprint,
  'gear-piece': gearPiece,
};
