/**
 * House furniture pack: Fairground. The nine pieces are drawn from the style (`../../workshop/styles/fairground.ts`,
 * with its part hooks: the bed's awning, the cupboard's tent roof, the stall table's cloth, the pennants, the string of
 * bulbs, and the awning valance); nothing is overridden. The wallpaper, floor and keepsake are
 * drawn here: the wallpaper is a red and cream striped awning with a scalloped hem over a string of pennants and
 * confetti on cream, the floor trodden boardwalk planks, the keepsake a prize rosette with two ribbon tails. `.` is
 * transparent, `k` the ink; the tiles have no outline.
 */
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack } from '../../../housing/house-art';
import { setPack, type SetSource } from '../../workshop/pack';
import { FAIRGROUND } from '../../workshop/styles/fairground';

const PALETTE: Readonly<Record<string, string>> = FAIRGROUND.palette;

/** A sprite with only the palette keys its rows use. */
function art(rows: readonly string[]): SpriteDef {
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(PALETTE).filter(([key]) => used.has(key))),
  };
}

/** One row of the awning: stripes four wide, `a` then `b`, twice. */
const band = (a: string, b: string): string => `${a.repeat(4)}${b.repeat(4)}`.repeat(2);

/** The keepsake, 12x12: a prize rosette (red, a gold middle) on a blue and a cream ribbon tail. */
const KEEPSAKE: readonly string[] = [
  '...kkkkkk...',
  '..krrssssk..',
  '.krsssssstk.',
  'krsssyyysstk',
  'krssyggysstk',
  'ksssyggysstk',
  'ksssyyyysstk',
  '.kssssssstk.',
  '..kttttttk..',
  '..kbbkkjjk..',
  '..kcdk.kjjk.',
  '..kkk...kkk.',
];

const WALL: readonly string[] = [
  // the awning: stripes of red and cream, lit on top and dark at the hem, then the scalloped tabs
  band('r', 'w'),
  ...Array.from({ length: 5 }, () => band('s', 'i')),
  band('t', 'j'),
  band('s', 'i'),
  'jsstjiijjsstjiij',
  'jjjjjjjjjjjjjjjj',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  // a string of pennants: red and blue
  'qqqqqqqqqqqqqqqq',
  'irssssiiibccccii',
  'iisssiiiiiccciii',
  'iiisiiiiiiiciiii',
  'iiiiiiiiiiiiiiii',
  // confetti on cream
  'iiiiiiiiiiiiiiii',
  'iiigiiiiiiiiciii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'isiiiiiiiiiigiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiciiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiisiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiigiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiciiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiisiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'iiiiiiiiiiiiiiii',
  'jjjjjjjjjjjjjjjj',
  // skirting: a blue plank edge, the board and its shadow
  'pppppppppppppppp',
  'bbbbbbbbpbbbbbbb',
  'cccccccccccccccc',
  'cccccccccccccccc',
  'dddddddddddddddd',
  'qqqqqqqqqqqqqqqq',
];

const HAND: HouseArtPack = {
  skins: {
    'fairground-wall': { tile: art(WALL) },
    'fairground-floor': {
      tile: art([
        'jjjjjjjjjjjjjjjq',
        'jjijjjjjjjjjjjjq',
        'jjjjjjjjjsjjjjjq',
        'qqqqqqqqqqqqqqqq',
        'jjjjjjjqjjjjjjjj',
        'jjjjjcjjqjjijjjj',
        'jjjjjjjjqjjjjjjj',
        'qqqqqqqqqqqqqqqq',
      ]),
    },
  },
  keepsakes: { fairground: art(KEEPSAKE) },
};

export const SOURCE: SetSource = { style: FAIRGROUND, hand: HAND };

export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
