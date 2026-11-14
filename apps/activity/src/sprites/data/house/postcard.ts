/**
 * The postcard's small pieces (`housing/house-postcard.ts`): the outside view of a whole house, drawn at 28 x 16 px a room
 * cell. The facade, roofs and grounds are procedural (they take the player's own roof and wall colours); what is drawn by
 * hand lives here: the window with its shutters, the front door, the chimney and its smoke, the cellar vent, a flower, a
 * round tree, the pool's ladder and diving board, and the terrace's parasol.
 *
 * Keys: `k` ink; a window's `L` and `D` are the wall skin's light and shade, its shutters' `S` and `T` the roof skin's mid and
 * shade (the composer swaps them in, so every house wears its own colours); everything else is fixed.
 * Light falls from the upper left like the rest of the house art.
 */
import type { SpriteDef } from '../../sprite-data';

const INK = '#0d0a1a';

function make(rows: readonly string[], palette: Readonly<Record<string, string>>): SpriteDef {
  return { rows, palette: { k: INK, ...palette } };
}

/** A window with shutters and a sill: 11 x 9. `S`/`T` the shutters, `L`/`D` the sill. */
export const WINDOW = make(
  [
    'SSkkkkkkkSS',
    'SSkgywyykSS',
    'TTkyywyykTT',
    'SSkwwwwwkSS',
    'TTkyywyykTT',
    'SSkyywydkSS',
    'TTkkkkkkkTT',
    '.LLLLLLLLL.',
    '.DDDDDDDDD.',
  ],
  {
    S: '#c8684a',
    T: '#9a4a3a',
    L: '#f2e8d2',
    D: '#c9b8a2',
    g: '#e8f4fa',
    y: '#9cc8e0',
    w: '#f6f0e0',
    d: '#6fb2d6',
  },
);

/** The front door, arched, planks with a brass knob: 8 x 12. */
export const DOOR = make(
  [
    '..kkkk..',
    '.kuuvuk.',
    'kuuvuuvk',
    'kuuvuuvk',
    'kuuvuuvk',
    'kuuvuuvk',
    'kuuvupvk',
    'kuuvuuvk',
    'kuuvuuvk',
    'kuuvuuvk',
    'kuuvuuvk',
    'kkkkkkkk',
  ],
  { u: '#d9a468', v: '#9c6a3c', p: '#f6c64e' },
);

/** A brick chimney with a stone cap: 8 x 9 (the composer sinks its foot into the roof). */
export const CHIMNEY = make(
  [
    'kkkkkkkk',
    'ksssssdk',
    'kkkkkkkk',
    '.kbbcbk.',
    '.kbcbbk.',
    '.kddddk.',
    '.kbbcbk.',
    '.kcbbbk.',
    '.kbbcbk.',
  ],
  { s: '#d8cbb4', d: '#a89c8e', b: '#d27e5c', c: '#b45c42' },
);

/** Two puffs of smoke rising from the chimney: 4 x 3 and 3 x 2. */
export const SMOKE_NEAR: SpriteDef = {
  rows: ['.xx.', 'xxxz', '.zz.'],
  palette: { x: '#f4f0fa', z: '#c9c2ec' },
};
export const SMOKE_FAR: SpriteDef = {
  rows: ['xx.', 'xzz'],
  palette: { x: '#f4f0fa', z: '#c9c2ec' },
};

/** The cellar's little window in the stone course: 8 x 3, barred. */
export const VENT = make(['kkkkkkkk', 'kejejejk', 'kkkkkkkk'], { e: '#55507a', j: '#c8c8d4' });

/** A flower in the grass: 3 x 4, petals round a gold heart, a green stem. One per colour. */
function flower(petal: string): SpriteDef {
  return {
    rows: ['.r.', 'rpr', '.r.', '.s.'],
    palette: { r: petal, p: '#f6c64e', s: '#467a4c' },
  };
}
export const FLOWERS: readonly SpriteDef[] = [
  flower('#e8502a'),
  flower('#ff8fab'),
  flower('#fbf8ec'),
  flower('#b79cf0'),
];

/** A round garden tree: a 9 x 8 crown on a short trunk, ink round it. 9 x 10. */
export const TREE = make(
  [
    '..kkkkk..',
    '.kLLMMMk.',
    'kLLMMMMMk',
    'kLMMMMMDk',
    'kMMMMMMDk',
    'kMMMMMDDk',
    '.kDDDDDk.',
    '..kkkkk..',
    '...kwk...',
    '...kwk...',
  ],
  { L: '#9ccc6c', M: '#5a9a58', D: '#467a4c', w: '#85603f' },
);

/** The pool's ladder: two rails over the edge with rungs, 4 x 8. */
export const LADDER = {
  rows: ['.jj.', 'j..j', 'j..j', 'jjjj', 'j..j', 'j..j', 'jjjj', 'j..j'],
  palette: { j: '#c8c8d4' },
} satisfies SpriteDef;

/** The diving board: a plank with a foot, 10 x 5. */
export const BOARD = make(['LLLLLLLLLL', 'DDDDDDDDDD', 'jj........', 'jj........', 'kk........'], {
  L: '#fbfdf8',
  D: '#92c0c8',
  j: '#c8c8d4',
});

/** A striped parasol on its pole: 11 x 9. */
export const PARASOL = make(
  [
    '...rcrcr...',
    '.rcrcrcrcr.',
    'rcrcrcrcrcr',
    'kkkkkkkkkkk',
    '.....p.....',
    '.....p.....',
    '.....p.....',
    '.....p.....',
    '.....p.....',
  ],
  { r: '#e8502a', c: '#fbf8ec', p: '#6a4630' },
);

/**
 * The panes of a window with its light on (twilight and night only): the key swap that turns `WINDOW`'s sky-blue glass warm. The
 * four are flame colours, so the lighting pass keeps them glowing.
 */
export const LIT_PANES: Readonly<Record<string, string>> = {
  g: '#fff0a8',
  y: '#ffcf6a',
  w: '#ffe9a0',
  d: '#f0a848',
};

/** The porch lamp by the front door, lit (night only): 3 x 4. */
export const PORCH_LAMP = make(['kkk', 'kfk', 'kyk', '.k.'], { f: '#fff0a8', y: '#ffcf6a' });

/** A lantern post on the lawn, lit (night only): 5 x 11, its foot on the ground line. */
export const LANTERN_POST = make(
  [
    '.kkk.',
    'kfyfk',
    'kyyyk',
    '.kkk.',
    '..p..',
    '..p..',
    '..p..',
    '..p..',
    '..p..',
    '.kpk.',
    'kkkkk',
  ],
  { f: '#fff0a8', y: '#ffcf6a', p: '#6a6478' },
);

/** The tower's round window with a sill: 9 x 10. `S`/`T` the frame (the roof skin's), `L`/`D` the sill (the wall skin's). */
export const TOWER_WINDOW = make(
  [
    '..kkkkk..',
    '.kSSSSSk.',
    'kSggwyySk',
    'kSggwyySk',
    'kSwwwwwSk',
    'kSyywddSk',
    'kSyywddSk',
    '.kSSSSSk.',
    '.LLLLLLL.',
    '.DDDDDDD.',
  ],
  {
    S: '#c8684a',
    T: '#9a4a3a',
    L: '#f2e8d2',
    D: '#c9b8a2',
    g: '#e8f4fa',
    y: '#9cc8e0',
    w: '#f6f0e0',
    d: '#6fb2d6',
  },
);

/** The spire's pennant and ball: 3 x 6. */
export const FINIAL = make(['.RR', '.k.', '.k.', 'kmk', 'kmk', '.k.'], {
  R: '#d83a4a',
  m: '#ffd25a',
});

/** A fruit tree on the orchard's lawn: 11 x 12. `L M D` the leaves, `f` the fruit, `w` the trunk; the composer swaps by variety. */
export const FRUIT_TREE = make(
  [
    '...kkkkk...',
    '..kLLMMMk..',
    '.kLLMMMMMk.',
    '.kLMMMfMMk.',
    'kLMfMMMMMDk',
    'kMMMMMMfMDk',
    'kMMfMMMMDDk',
    '.kMMMMMDDk.',
    '..kDDDDDk..',
    '...kkwkk...',
    '....kwk....',
    '....kwk....',
  ],
  { L: '#9ccc6c', M: '#5a9a58', D: '#467a4c', w: '#85603f', f: '#d83a4a' },
);

/** What a variety of tree changes in `FRUIT_TREE`'s palette. */
export const FRUIT_SWAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  apple: {},
  plum: { L: '#8ee0a8', M: '#388a62', D: '#27604f', f: '#8a5cad' },
  pear: { L: '#c8f08a', M: '#5aa850', D: '#3a7a3c', f: '#d6d04a' },
};

/** A reed with a brown head on the pond's bank: 2 x 7. */
export const REED = {
  rows: ['.t', 'tt', 'jt', 'j.', 'j.', 'j.', 'j.'],
  palette: { t: '#7a5a34', j: '#43924f' },
} satisfies SpriteDef;

/** Every hand-drawn piece by name (the concept wrapper and the tests list them). */
export const POSTCARD_ART: Readonly<Record<string, SpriteDef>> = {
  'porch-lamp': PORCH_LAMP,
  'lantern-post': LANTERN_POST,
  window: WINDOW,
  door: DOOR,
  chimney: CHIMNEY,
  'smoke-near': SMOKE_NEAR,
  'smoke-far': SMOKE_FAR,
  vent: VENT,
  'flower-red': FLOWERS[0] as SpriteDef,
  'flower-pink': FLOWERS[1] as SpriteDef,
  'flower-white': FLOWERS[2] as SpriteDef,
  'flower-violet': FLOWERS[3] as SpriteDef,
  tree: TREE,
  ladder: LADDER,
  'diving-board': BOARD,
  parasol: PARASOL,
  'tower-window': TOWER_WINDOW,
  finial: FINIAL,
  'fruit-tree': FRUIT_TREE,
  reed: REED,
};
