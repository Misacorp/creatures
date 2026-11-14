/**
 * The Cosy set, the house's starter furniture: the living room as it is (`../room-sprites.ts`, day light),
 * so the hut looks like the room players already know. Fifteen of the eighteen pieces are mapped from the
 * shipped props and share their pixel data (nothing is copied: a mapped piece points at the room's own
 * sprite, and the few that stack two room props, such as the sofa, build the stack once when this module
 * loads). Three are new, drawn in the same hand (the room's wood, coral, cream and gold) so every form
 * has a piece: the bed, the cupboard and the wall shelf. The starter wallpaper and floor are cut from the
 * room's own wall and floor tile.
 *
 * Layers: `sprite` is the whole piece and stands on its bottom row. A `front` layer is the same size and
 * the same origin as `sprite` (transparent where it adds nothing) and is drawn over the creature that
 * sits or sleeps on the piece. `sleep` is the top-left of a 16x16 sleeping creature on a bed, `glow` the
 * sprite drawn behind a lit piece at night, centred on the piece, its top 4 px below the piece's top.
 */
import type { RoomPhase } from '@creatures/game';
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack, PieceArt } from '../../../housing/house-art';
import { ROOM_SPRITE_DATA, type RoomPropName } from '../room-sprites';

/** The pixel rows of the three new pieces (drawn from shapes, then kept as data). */
// <generated>
const PALETTE: Readonly<Record<string, string>> = {
  k: '#0d0a1a',
  a: '#f2ca92',
  b: '#e4b27a',
  c: '#bc8050',
  d: '#915d42',
  e: '#6c4734',
  f: '#f5eedb',
  g: '#d5caa9',
  h: '#e48878',
  i: '#c3655f',
  j: '#984e52',
  m: '#ffd25a',
  n: '#ffb23a',
  o: '#72d4c4',
  p: '#48a5a0',
  r: '#b07bd0',
  s: '#8a5cad',
  u: '#63b166',
  v: '#478857',
};

const BED_BACK: readonly string[] = [
  '..kkkkk.........................................',
  '.kaaaaak........................................',
  'kbaaaaabk.......................................',
  'kbabbbbck.......................................',
  'kbabbbbck.......................................',
  'kbabbbbck.......................................',
  'kbadddbck.......................................',
  'kbaccbbck.......................................',
  'kbaccbbck.......................................',
  'kbaccbbck.......................................',
  'kbaccbbck.......................................',
  'kbaccbbckkkkkkkkkkkkk...........................',
  'kbaccbbckffffffffffffk..........................',
  'kbaccbbcfggggfffffffffk...................kkkk..',
  'kbaccbbcffffffffffffffk..................kaaaak.',
  'kbaaaabcffffffffffffffk.................kbaaaabk',
  'kbabbbbcfggggggggggggfkkkkkkkkkkkkkkkkkkkbabbbck',
  'kbabbbbcfffffffffffffffffffffffffffffffffbabbbck',
  'kbabbbbcfffffffffffffffffffffffffffffffffbabbbck',
  'kbabbbbcfffffffffffffffffffffffffffffffffbabbbck',
  'kbabbbbcgggggggggggggggggggggggggggggggggbabbbck',
  'kbabbbbcaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaababbbck',
  'kbabbbbcbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbabbbck',
  'kbabbbbccccccccccccccccccccccccccccccccccbabbbck',
  'kdddddddkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkddddddk',
  '.kkkkkkk.................................kkkkkk.',
];

const BED_FRONT: readonly string[] = [
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '................................................',
  '..................kkkkkkkkkkkkkkkkkkkkkkk.......',
  '.................khhhhhhhhhhhhhhhhhhhhhhik......',
  '................khhhhhhhhhhhhhhhhhhhhhhhjk......',
  '................khiiiiiiiiiiiiiiiiiiiiiijk......',
  '................khiiiiiiiiiiiiiiiiiiiiiijk......',
  '................khfmfffmfffmfffmfffmfffmjk......',
  '................khffffffffffffffffffffffjk......',
  '................khggggggggggggggggggggggjk......',
  '................khiiiiiiiiiiiiiiiiiiiiiijk......',
  '................khjjjjjjjjjjjjjjjjjjjjjjjk......',
  '................kjjiijjiijjiijjiijjiijjiik......',
  '.................kkkkkkkkkkkkkkkkkkkkkkkk.......',
  '................................................',
  '................................................',
  '................................................',
];

const CUPBOARD: readonly string[] = [
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  'kaaaaaaaaaaaaaaaaaaaaaaaaaaaak',
  'kbbbbbbbbbbbbbbbbbbbbbbbbbbbbk',
  'kcccccccccccccccccccccccccccck',
  '.kabbbbbbbbbbbbbbbbbbbbbbbbck.',
  '.kabbbbbbbbbbbbbbbbbbbbbbbbck.',
  '.kabccccccccccddccccccccccbck.',
  '.kabcddddddddcddcddddddddcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbihbiicddcdbbihbiicbck.',
  '.kabcdbbiiiiicddcdbbiiiiicbck.',
  '.kabcdbbbiiibcddcdbbbiiibcbck.',
  '.kabcdbbbbibbmddmdbbbbibbcbck.',
  '.kabcdbbbbbbbnddndbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabcdbbbbbbbcddcdbbbbbbbcbck.',
  '.kabccccccccccddccccccccccbck.',
  '.kabbbbbbbbbbbbbbbbbbbbbbbbck.',
  '.kabbbbbbbbbbbbbbbbbbbbbbbbck.',
  '.kabccccccccccccccccccccccbck.',
  '.kabcaaaaaaaaaaaaaaaaaaaacbck.',
  '.kabcbbbbbbbbmmmmbbbbbbbbcbck.',
  '.kabcbbbbbbbbnnnnbbbbbbbbcbck.',
  '.kabcbbbbbbbbbbbbbbbbbbbbcbck.',
  '.kabccccccccccccccccccccccbck.',
  '.kabbbbbbbbbbbbbbbbbbbbbbbbck.',
  '.kabbbbbbbbbbbbbbbbbbbbbbbbck.',
  '.kddddddddddddddddddddddddddk.',
  '..keeekkkkkkkkkkkkkkkkkkeeek..',
  '...kkk..................kkk...',
];

const SHELF_WALL: readonly string[] = [
  '......kkk...............................',
  '.....koppk..kkk.........................',
  '...kkkoppk.krssk..............k.k.......',
  '..khiifffkkkrssk.............kukvk......',
  '..khiioppammfffk............kuuvuvk.....',
  '..kfffoppammrssk.............kuuvk......',
  '..khiioppfffrssk...kkkkk......kuk.......',
  '..khiioppammrssk..kffffgkk..kkkvkk......',
  '..khiioppammrssk..khhhhhffkkcccccck.....',
  '..khiioppammrssk..kffffggfkkddddddk.....',
  '..khiioppammrssk..kffffgfgkkddddddk.....',
  '.kkhiioppammrsskkkkffffgkkkkkddddkkkkkk.',
  'kaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaak',
  'kbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbk',
  'kcccccccccccccccccccccccccccccccccccccck',
  '.kkkddkkkkkkkkkkkkkkkkkkkkkkkkkkkkddkkk.',
  '...kddk..........................kddk...',
  '...kdddk........................kdddk...',
  '....kdk..........................kdk....',
  '.....k............................k.....',
];
// </generated>

/** The living room's prop in a light (every prop used here has art in day, twilight and night). */
function prop(name: RoomPropName, phase: RoomPhase): SpriteDef {
  const sprite = ROOM_SPRITE_DATA[name][phase];
  if (sprite === undefined) throw new Error(`Room prop "${name}" has no ${phase} art.`);
  return sprite;
}

type Layer = readonly [sprite: SpriteDef, x: number, y: number];

/**
 * Props stacked on one canvas. A layer after the first has its palette keys upper-cased (the room's
 * props reuse the same letters for different colours), `k` the ink stays. With `only`, just that layer is
 * drawn: the front layer on the same canvas as the whole.
 */
function stack(layers: readonly Layer[], width: number, height: number, only?: number): SpriteDef {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('.'));
  const palette: Record<string, string> = {};
  for (const [index, [sprite, dx, dy]] of layers.entries()) {
    if (only !== undefined && only !== index) continue;
    const rename = (key: string): string => (index === 0 || key === 'k' ? key : key.toUpperCase());
    for (const [key, colour] of Object.entries(sprite.palette)) palette[rename(key)] = colour;
    for (const [y, row] of sprite.rows.entries()) {
      for (const [x, ch] of [...row].entries()) {
        const target = grid[y + dy];
        if (ch !== '.' && target !== undefined && x + dx < width) target[x + dx] = rename(ch);
      }
    }
  }
  const rows = grid.map((row) => row.join(''));
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(palette).filter(([key]) => used.has(key))),
  };
}

/** A sprite from rows and a pack's palette: the palette is cut down to the keys the rows use. */
export function drawn(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): SpriteDef {
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(palette).filter(([key]) => used.has(key))),
  };
}

/** A sprite with the rows of `extra` added under it (the table's feet). */
function below(sprite: SpriteDef, extra: readonly string[]): SpriteDef {
  return { rows: [...sprite.rows, ...extra], palette: sprite.palette };
}

/** Whole rows of a room tile, in the order given, as a tile of their own (palette cut down to what is used). */
function tileOf(tile: SpriteDef, picks: readonly number[]): SpriteDef {
  const rows = picks.map((i) => tile.rows[i] ?? '');
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(tile.palette).filter(([key]) => used.has(key))),
  };
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The Cosy pieces in a light. The three new pieces have day art only. */
export function cosyPieces(phase: RoomPhase): Record<string, PieceArt> {
  const p = (name: RoomPropName): SpriteDef => prop(name, phase);
  const sofa = [
    [p('couchBack'), 0, 0],
    [p('couchFront'), 0, 8],
  ] as const;
  const seat = [
    [p('pouf'), 0, 0],
    [p('poufFront'), 0, 3],
  ] as const;
  const beanbag = [
    [p('beanbag'), 0, 0],
    [p('beanbagFront'), 0, 4],
  ] as const;
  const tableFeet = [`.kkkkk${'.'.repeat(28)}kkkkk.`];
  return {
    'cosy-sofa': { sprite: stack(sofa, 64, 31), front: stack(sofa, 64, 31, 1) },
    'cosy-table': { sprite: below(p('table'), tableFeet) },
    'cosy-chair': { sprite: p('chair') },
    'cosy-stool': { sprite: p('stool') },
    'cosy-lamp': { sprite: p('lamp'), glow: prop('lampGlow', 'night') },
    'cosy-plant': { sprite: p('plant') },
    'cosy-hearth': { sprite: p('fireplace'), glow: prop('fireGlow', 'night') },
    'cosy-rug': { sprite: p('rug') },
    'cosy-seat': { sprite: stack(seat, 16, 8), front: stack(seat, 16, 8, 1) },
    'cosy-beanbag': { sprite: stack(beanbag, 20, 12), front: stack(beanbag, 20, 12, 1) },
    'cosy-cushion': { sprite: p('cushion') },
    'cosy-shelf': { sprite: p('bookshelf') },
    'cosy-clock': { sprite: p('clock') },
    'cosy-frame': { sprite: p('picture') },
    'cosy-curtains': { sprite: p('window') },
    'cosy-bed': {
      sprite: drawn(BED_BACK, PALETTE),
      front: drawn(BED_FRONT, PALETTE),
      sleep: { x: 10, y: 1 },
    },
    'cosy-cupboard': { sprite: drawn(CUPBOARD, PALETTE) },
    'cosy-shelf-wall': { sprite: drawn(SHELF_WALL, PALETTE) },
  };
}

/** The starter wallpaper (16x52, repeats across) and floor (16x8): the room's wall and floor tile cut apart. */
function cosySkins(): NonNullable<HouseArtPack['skins']> {
  const edge = prop('edge', 'day');
  // the room's wall from its top trim down to the baseboard, the stripes run longer to fill 52 rows
  const wall = [
    ...range(12, 14),
    ...range(15, 27),
    ...range(15, 27),
    ...range(15, 24),
    ...range(28, 40),
  ];
  // two planks of four rows, their seams a half board apart
  const floor = [41, 42, 44, 45, 46, 47, 49, 50];
  return { 'cosy-wall': { tile: tileOf(edge, wall) }, 'cosy-floor': { tile: tileOf(edge, floor) } };
}

/**
 * The Cosy set's keepsake, the Hearth Bell (12x12, ink outline like the other sets' keepsakes): a small brass bell on a
 * loop, cream light on its shoulder, the rim and the clapper below. Drawn from the room's own brass and cream.
 */
const HEARTH_BELL: readonly string[] = [
  '.....kk.....',
  '....kmmk....',
  '...kkmmkk...',
  '..kmfmmmnk..',
  '..kmfmmmnk..',
  '..kmfmmmnk..',
  '.kmmfmmmnnk.',
  '.kmmmmmmnnk.',
  'kmmmmmmmnnnk',
  'kcccccccccck',
  '.kkkkmmkkkk.',
  '.....kk.....',
];

function keepsake(rows: readonly string[]): SpriteDef {
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(PALETTE).filter(([key]) => used.has(key))),
  };
}

export const HOUSE_ART: HouseArtPack = {
  pieces: cosyPieces('day'),
  skins: cosySkins(),
  keepsakes: { cosy: keepsake(HEARTH_BELL) },
};
