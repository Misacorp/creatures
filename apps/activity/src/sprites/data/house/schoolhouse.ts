/**
 * House furniture pack: Schoolhouse. The nine pieces are drawn from the style (`../../workshop/styles/schoolhouse.ts`,
 * with one part hook: the blackboard frame); nothing is overridden. The wallpaper, floor and keepsake are drawn here:
 * the wallpaper is a classroom wall (an oak picture rail, a slate-green board with chalk marks, a chalk ledge, a green
 * beaded wainscot and a dark oak skirting), the floor chalk-grey linoleum squares, the keepsake a polished apple.
 * `.` is transparent, `k` the ink; the tiles have no outline.
 */
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack } from '../../../housing/house-art';
import { canvas, put, toSprite } from '../../draw/canvas';
import { inEllipse, solid } from '../../draw/solid';
import { setPack, type SetSource } from '../../workshop/pack';
import { SCHOOLHOUSE } from '../../workshop/styles/schoolhouse';

const PALETTE: Readonly<Record<string, string>> = SCHOOLHOUSE.palette;

/** A sprite with only the palette keys its rows use. */
function art(rows: readonly string[]): SpriteDef {
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(PALETTE).filter(([key]) => used.has(key))),
  };
}

/** The keepsake, 12x12: a polished red apple with a brass-dark stem, a leaf and a chalk-white shine. */
function keepsake(): SpriteDef {
  const s = SCHOOLHOUSE;
  const c = canvas(12, 12);
  solid(c, { x: 1, y: 3, w: 10, h: 9 }, inEllipse(1, 3, 10, 9), s.accent, { shade: 'tl' });
  put(c, 6, 3, 'k');
  for (const [x, y] of [
    [6, 1],
    [6, 2],
  ] as const) {
    put(c, x, y, 'u');
  }
  for (const [x, y] of [
    [7, 1],
    [8, 1],
    [8, 2],
  ] as const) {
    put(c, x, y, 'n');
  }
  for (const [x, y] of [
    [5, 1],
    [5, 2],
    [6, 0],
    [7, 0],
    [8, 0],
    [9, 1],
    [9, 2],
    [7, 2],
  ] as const) {
    put(c, x, y, 'k');
  }
  put(c, 3, 5, 'w');
  put(c, 3, 6, 'w');
  return toSprite(c, PALETTE);
}

const WALL: readonly string[] = [
  // the picture rail: oak, lit on top
  'oooooooooooooooo',
  'llllllllllllllll',
  'dddddddddddddddd',
  // the board: slate green with chalk, sums and a few stars; the join does not show
  'ssssssssssssssss',
  'ssssssssssssssss',
  'sscssssssssscsss',
  'sssssssssssssssh',
  'sshcccssssssssss',
  'ssssssssssshhcss',
  'ssssssssssssssss',
  'ssssssscsssssssw',
  'ssssssssssssssss',
  'sswssssshhhhssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'sshhssssssssssss',
  'ssssssssssscsssc',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssscccssssssss',
  'ssssssssssssssss',
  'sssssssssssssswh',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'sshhhssssssshsss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'sssscsssssssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  // the chalk ledge: oak with a chalk stub on it
  'oooooooooooooooo',
  'llllccllllllllll',
  'dddddddddddddddd',
  // the wainscot: green beadboard
  'gggggggggggggggg',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'nnngnnngnnngnnng',
  'ssssssssssssssss',
  // the skirting behind the floor pieces' feet: dark oak
  'llllllllllllllll',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'dddddddddddddddd',
  'eeeeeeeeeeeeeeee',
  'eeeeeeeeeeeeeeee',
];

const HAND: HouseArtPack = {
  skins: {
    'schoolhouse-wall': { tile: art(WALL) },
    'schoolhouse-floor': {
      tile: art([
        'cccwcccchhhhhhhh',
        'cccccccchhhhhhhh',
        'cccccccchhhhhhhh',
        'cccccccchhhhhhhh',
        'hhhhhhhhcccccccc',
        'hhhhhhhhcccccccc',
        'hhhhhhhhccccwccc',
        'hhhhhhhhcccccccc',
      ]),
    },
  },
  keepsakes: { schoolhouse: keepsake() },
};

export const SOURCE: SetSource = { style: SCHOOLHOUSE, hand: HAND };

export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
