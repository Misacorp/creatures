/**
 * Pixel art for the boss moves' animations: one generic weapon per form (`Form` in `plan.ts`) and a generic impact, drawn in three
 * placeholder colours (`a` the main colour, `b` its dark, `c` its light; `k` the ink) that `looks.ts` swaps for the boss's element.
 * A boss look (`looks.ts`) may replace any of them with art of its own, drawn with its own palette.
 *
 * Every weapon is drawn pointing UP with its grip at the bottom centre: the frame turns it to fly (down for a column, sideways for a
 * row). Preview the art in the workbench page `BossAnimFrame`.
 */
import type { SpriteDef } from '../sprites/sprite-data';

const PLACEHOLDER = { k: '#0d0a1a', a: '#888888', b: '#333333', c: '#ffffff' } as const;

/** Mirrors the rows top to bottom around the last row: a shape drawn as its top half and its middle row. */
const mirrorDown = (rows: readonly string[]): string[] => [
  ...rows,
  ...[...rows].slice(0, -1).reverse(),
];

/** A spear: a leaf-shaped head on a shaft (a column strike: it comes down the lane). */
export const SPEAR: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '...k...',
    '..kck..',
    '.kcack.',
    '.kcabk.',
    '.kcabk.',
    '..kbk..',
    '..kak..',
    '..kck..',
    '..kak..',
    '..kak..',
    '..kck..',
    '..kak..',
    '..kak..',
    '..kck..',
    '..kak..',
    '..kbk..',
    '..kbk..',
    '...k...',
  ],
};

/** A wave: a wide crescent (a row strike: it sweeps along the row). */
export const WAVE: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '.....kkkkk.....',
    '...kkccccckk...',
    '..kcaaaaaaack..',
    '.kcaabbbbbaack.',
    'kcab.......back',
    'kbk.........kbk',
    'kk...........kk',
  ],
};

/** An orb: a ball with a highlight (a strike on one creature). */
export const ORB: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '..kkkkk..',
    '.kccaaak.',
    'kccaaaabk',
    'kcaaaaabk',
    'kaaaaaabk',
    'kaaaaabbk',
    'kaaabbbbk',
    '.kbbbbbk.',
    '..kkkkk..',
  ],
};

/** A zigzag bolt (a chain: it comes down, then hops from creature to creature). */
export const CHAIN: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '....kkk..',
    '...kcck..',
    '..kcak...',
    '.kcak....',
    '.kcaaaak.',
    '.kkkkcak.',
    '....kcak.',
    '...kcak..',
    '..kcak...',
    '..kak....',
    '..kbk....',
    '...k.....',
  ],
};

/** A star of eight points (a strike on the whole board). */
export const NOVA: SpriteDef = {
  palette: PLACEHOLDER,
  rows: mirrorDown([
    '.......k.......',
    '......kck......',
    '.....kcack.....',
    '....kcaaack....',
    '.kkkcaaaaackkk.',
    'kcccaaabaaaccck',
    '.kkkcaaaaackkk.',
    '....kcaaack....',
  ]),
};

/** The burst on a creature that was hit. */
export const BURST: SpriteDef = {
  palette: PLACEHOLDER,
  rows: mirrorDown([
    '.....k.....',
    '..k..c..k..',
    '...k.c.k...',
    '....kck....',
    '.kcc.a.cck.',
    'kcccaaaccck',
  ]),
};

// --- The Storm Sovereign's own: palette `k` ink, `y` lightning yellow, `w` white-hot, `s` steel, `d` dark steel, `v` storm violet. ---

const STORM = {
  k: '#0d0a1a',
  y: '#f2d43d',
  w: '#fffbe0',
  s: '#9fb2d8',
  d: '#56679a',
  v: '#8a6be0',
} as const;

/** A spear with a lightning bolt for a blade: the Lightning Bolt, a lance down a lane. */
export const STORM_SPEAR: SpriteDef = {
  palette: STORM,
  rows: [
    '.....k.....',
    '....kwk....',
    '...kwyk....',
    '....kywk...',
    '...kwyyk...',
    '..kwyykk...',
    '...kkywk...',
    '..y.kwyk.y.',
    '....kyk....',
    '...ksdsk...',
    '....kyk....',
    '....ksk....',
    '....ksk....',
    '....kdk....',
    '....ksk....',
    '....ksk....',
    '....kyk....',
    '....ksk....',
    '....ksk....',
    '....kdk....',
    '....ksk....',
    '....ksk....',
    '....kyk....',
    '....ksk....',
    '....kdk....',
    '...kdsdk...',
    '....kkk....',
  ],
};

/** A big jagged bolt: the Thunderbolt and the Judgement Bolt, aimed at one creature. */
export const STORM_BOLT: SpriteDef = {
  palette: STORM,
  rows: [
    '.....kk....',
    '....kwyk...',
    '...kwyk....',
    '..kwyk.....',
    '..kwyyyyk..',
    '..kkkkwyk..',
    '......kwyk.',
    '.....kwyk..',
    '....kwyk...',
    '...kwyk....',
    '..kwyyyk...',
    '..kkkkwk...',
    '......kk...',
  ],
};

/** A forked bolt: the Forked Lightning, a few creatures at once. */
export const STORM_FORK: SpriteDef = {
  palette: STORM,
  rows: [
    '..k.....k..',
    '.kwk...kwk.',
    '.kwyk.kywk.',
    '..kwykywk..',
    '...kwywk...',
    '....kwyk...',
    '...kwyk....',
    '...kwyyk...',
    '....kkwk...',
    '......kyk..',
    '.....kyk...',
    '......kk...',
  ],
};

/** A crackling ball of storm: the Storm Front, over the whole board. */
export const STORM_ORB: SpriteDef = {
  palette: STORM,
  rows: [
    '....kkk....',
    '..kkvvvkk..',
    '.kvvvwvvvk.',
    '.kvvwyyvvk.',
    'kvvwyywvvvk',
    'kvvvwyvvvvk',
    'kvvvvwyvvvk',
    '.kvvvvwvvk.',
    '.kdvvvvvdk.',
    '..kkdddkk..',
    '....kkk....',
  ],
};

/** A flash of lightning where it lands. */
export const STORM_BURST: SpriteDef = {
  palette: { k: '#0d0a1a', a: '#f2d43d', b: '#7a5f10', c: '#fffbe0' },
  rows: BURST.rows,
};

// --- The Tidal Colossus's own: palette `k` ink, `g` sea green, `t` deep teal, `f` foam white, `s` sea blue. ---

const TIDE = {
  k: '#0d0a1a',
  g: '#3fc9a5',
  t: '#1c6b66',
  f: '#f1fbff',
  s: '#4f8fe6',
} as const;

/** A trident with three prongs and a foam-wrapped shaft: the Deepwater Spear and the Riptide, lances down a lane. */
export const TIDE_TRIDENT: SpriteDef = {
  palette: TIDE,
  rows: [
    '.....k.....',
    '.k..kfk..k.',
    'kfk.kfk.kfk',
    'kfk.kgk.kfk',
    'kgk.kgk.kgk',
    'kgk.kgk.kgk',
    'kgkkkgkkkgk',
    '.kgggfgggk.',
    '..kktgtkk..',
    '....kgk....',
    '....kfk....',
    '....kgk....',
    '....ktk....',
    '....kgk....',
    '....kgk....',
    '....kfk....',
    '....kgk....',
    '....ktk....',
    '....kgk....',
    '....kgk....',
    '....kfk....',
    '....kgk....',
    '....ktk....',
    '....kgk....',
    '...ktgtk...',
    '....kkk....',
  ],
};

/** A curling wave, crest leading, foam on its lip: the Colossus's rows (it travels across the row, the curl in front). */
export const TIDE_WAVE: SpriteDef = {
  palette: TIDE,
  rows: [
    '.......kkk.......',
    '.....kkfffkk.....',
    '....kfffgggfk....',
    '...kfgggssggfk...',
    '..kfggssttsggfk..',
    '.kfgssttkkttsgfk.',
    '.kgsstk...ktsggk.',
    'kgsstk.....ktsgk.',
    'kssttk.....kttsk.',
    'ksttk.......kttk.',
    'kttk.........ktk.',
    'kkk...........kk.',
  ],
};

/** A cluster of three falling drops, round end leading: the Spray, onto a few creatures. */
export const TIDE_DROPS: SpriteDef = {
  palette: TIDE,
  rows: [
    '...kkk.......',
    '..kfggk..kk..',
    '.kfgggsk.kfk.',
    '.kgggsstk.kk.',
    '..kssttk.....',
    '...kkkk..kk..',
    '.kk.kgk.kgsk.',
    '.kgk.k..kttk.',
    '..k.......kk.',
    '.....kk......',
    '....kgtk.....',
    '.....kk......',
  ],
};

/** Where a drop or wave lands: the splash on a creature that was hit. */
export const TIDE_SPLASH: SpriteDef = {
  palette: { k: '#0d0a1a', a: '#3fc9a5', b: '#1c6b66', c: '#f1fbff' },
  rows: mirrorDown([
    '.....k.....',
    '..k..c..k..',
    '.kck.c.kck.',
    '..k.kck.k..',
    '.kcc.a.cck.',
    'kcaaaaaaack',
  ]),
};

/** A glint of light, where a weapon appears in the boss's hand. */
export const GLINT: SpriteDef = {
  palette: { w: '#ffffff', y: '#fffbe0' },
  rows: ['..w..', '..y..', 'wywyw', '..y..', '..w..'],
};
