/**
 * The frame of the house (`docs/design/housing-interior.md`, layer 4): the posts between rooms and the slab under each
 * floor, in one material for the whole house. Today the posts are the exterior walls skin (two pixels of it between ink
 * edges) and the slab is one fixed timber strip (`data/house/shell.ts`); here both come from one material.
 *
 * A post is a tile 2 wide and 8 tall (repeated down the wall, ink drawn by the scene on both sides, as today); a slab is
 * a tile 16 wide and 4 tall (three rows of the material and an ink row), repeated along the floor.
 */
import type { SpriteDef } from '../../sprite-data';
import { INK, makeTile, paletteOf, type Tones } from './kit';

export interface FrameMaterial {
  readonly id: string;
  readonly name: string;
  readonly post: SpriteDef;
  readonly slab: SpriteDef;
}

type Rows = readonly string[];

interface Kind {
  readonly id: string;
  readonly name: string;
  readonly post: Rows;
  readonly slab: Rows;
}

/** Row sets per material kind. Keys are the four tones of the colourway (`a` face, `b` shade, `c` light, `d` line) and `k` ink. */
const KINDS: readonly Kind[] = [
  {
    id: 'timber',
    name: 'Timber beams',
    post: ['ca', 'ca', 'cb', 'ca', 'ca', 'cd', 'ca', 'ca'],
    slab: ['cccccccccccccccc', 'aaabaaaadaaaaabd', 'bbbbbbbbbbbbbbbb', 'kkkkkkkkkkkkkkkk'],
  },
  {
    id: 'stone',
    name: 'Stone blocks',
    post: ['ca', 'ca', 'ca', 'dd', 'ba', 'ba', 'ba', 'dd'],
    slab: ['cccccccccccccccc', 'aaaaaaadaaaaaaad', 'bbbbbbbbbbbbbbbb', 'kkkkkkkkkkkkkkkk'],
  },
  {
    id: 'painted',
    name: 'Painted',
    post: ['ca', 'ca', 'ca', 'ca', 'ca', 'ca', 'ca', 'ca'],
    slab: ['cccccccccccccccc', 'aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'kkkkkkkkkkkkkkkk'],
  },
  {
    id: 'brick',
    name: 'Brick',
    post: ['ca', 'ca', 'ca', 'dd', 'ac', 'ac', 'ac', 'dd'],
    slab: ['aaaaaaadaaaaaaad', 'dddddddddddddddd', 'aaadaaaaaaadaaaa', 'kkkkkkkkkkkkkkkk'],
  },
  {
    id: 'iron',
    name: 'Dark iron',
    post: ['ca', 'cc', 'ca', 'ca', 'ca', 'cc', 'ca', 'ca'],
    slab: ['cccccccccccccccc', 'baaaabbbbaaaabbb', 'dddddddddddddddd', 'kkkkkkkkkkkkkkkk'],
  },
];

const make = (kind: Kind, tones: Tones, id: string, name: string): FrameMaterial => {
  const palette = { ...paletteOf(tones), k: INK };
  const pat = (rows: Rows) => (x: number, y: number) => rows[y]?.[x] ?? 'a';
  return {
    id,
    name,
    post: makeTile(2, 8, pat(kind.post), palette),
    slab: makeTile(16, 4, pat(kind.slab), palette),
  };
};

const kindOf = (id: string): Kind => {
  const k = KINDS.find((x) => x.id === id);
  if (k === undefined) throw new RangeError(`No frame kind "${id}".`);
  return k;
};

const T = (id: string, name: string, a: string, b: string, c: string, d: string): Tones => ({
  id,
  name,
  a,
  b,
  c,
  d,
});

/** The material colourways: timber in two woods, stone, painted in four colours, brick and dark iron. */
export const FRAMES: readonly FrameMaterial[] = [
  make(
    kindOf('timber'),
    T('oak', 'Oak', '#b07a4c', '#82553a', '#d29c68', '#5e3a28'),
    'timber-oak',
    'Oak beams',
  ),
  make(
    kindOf('timber'),
    T('dark', 'Dark', '#5e3f2e', '#4a3024', '#7c5640', '#2e1d16'),
    'timber-dark',
    'Dark beams',
  ),
  make(
    kindOf('stone'),
    T('grey', 'Grey', '#9a9484', '#706b60', '#c0b9a8', '#4e4a42'),
    'stone-grey',
    'Grey stone',
  ),
  make(
    kindOf('painted'),
    T('white', 'White', '#ece4d2', '#c9bfaa', '#fbf6ea', '#9a8f7a'),
    'painted-white',
    'White paint',
  ),
  make(
    kindOf('painted'),
    T('sage', 'Sage', '#9fbb92', '#7a9a70', '#c2d8b4', '#58765a'),
    'painted-sage',
    'Sage paint',
  ),
  make(
    kindOf('painted'),
    T('blue', 'Blue', '#7fa8c8', '#5b84a6', '#a9cbe0', '#3f6384'),
    'painted-blue',
    'Blue paint',
  ),
  make(
    kindOf('painted'),
    T('rose', 'Rose', '#d99a98', '#b87580', '#f0bdb8', '#8a5260'),
    'painted-rose',
    'Rose paint',
  ),
  make(
    kindOf('brick'),
    T('red', 'Red', '#b45c42', '#8c4232', '#d27e5c', '#dccdb4'),
    'brick-red',
    'Red brick',
  ),
  make(
    kindOf('iron'),
    T('iron', 'Iron', '#5a5e72', '#43465a', '#7c8198', '#2d2f3e'),
    'iron-dark',
    'Dark iron',
  ),
];

export function frameById(id: string): FrameMaterial {
  const f = FRAMES.find((x) => x.id === id);
  if (f === undefined) throw new RangeError(`No frame material "${id}".`);
  return f;
}
