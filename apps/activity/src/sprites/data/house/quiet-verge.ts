/**
 * House furniture pack: Quiet Verge. The nine pieces are drawn from the style (`../../workshop/styles/quiet-verge.ts`,
 * with its part hooks: the standing-stone headboard, the arch door, the floating table, shelf and stool, the dark
 * moon and the still pool); nothing is overridden. The wallpaper, floor and keepsake are drawn here: the wallpaper is
 * the Verge's dusk sky over the lilac dust (`concepts/void-place.ts`), the floor its calm dust flags, the keepsake a
 * small stone window with the warm star in it. `.` transparent, `k` the ink; the tiles have no outline.
 */
import type { SpriteDef } from '../../sprite-data';
import type { HouseArtPack } from '../../../housing/house-art';
import { canvas, put, toSprite } from '../../draw/canvas';
import { motif } from '../../draw/parts';
import { box } from '../../draw/shapes';
import { inArch, shrink, solid } from '../../draw/solid';
import { setPack, type SetSource } from '../../workshop/pack';
import { QUIET_VERGE } from '../../workshop/styles/quiet-verge';

const PALETTE: Readonly<Record<string, string>> = QUIET_VERGE.palette;

/** A sprite with only the palette keys its rows use. */
function art(rows: readonly string[]): SpriteDef {
  const used = new Set(rows.join(''));
  return {
    rows,
    palette: Object.fromEntries(Object.entries(PALETTE).filter(([key]) => used.has(key))),
  };
}

/** The keepsake, 12x12: a pocket window, a little stone arch on a sill, the warm star inside and a cool glint. */
function keepsake(): SpriteDef {
  const s = QUIET_VERGE;
  const c = canvas(12, 12);
  const arch = inArch(1, 0, 10, 10, 4);
  solid(c, { x: 1, y: 0, w: 10, h: 11 }, arch, s.wood, { shade: 'tl' });
  const pane = shrink(arch, 2);
  for (let y = 0; y < 11; y++) {
    for (let x = 1; x < 11; x++) {
      if (!pane(x, y)) continue;
      put(c, x, y, pane(x, y - 1) && pane(x - 1, y) ? s.glass.mid : 'k');
    }
  }
  motif(c, 5, 4, 'star', s.accent);
  put(c, 4, 3, s.glass.hi ?? s.glass.light);
  box(c, 0, 9, 12, 3, s.wood, { shade: 'rows' });
  return toSprite(c, PALETTE);
}

const HAND: HouseArtPack = {
  skins: {
    'quiet-verge-wall': {
      tile: art([
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaahaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaapaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaahaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaaaaaaaaaaa',
        'aaaaaaahaaaaaaaa',
        'aaaaaahphaaaaaaa',
        'aaaaaaahaaaaaaaa',
        'cacacacacacacaca',
        'acacacacacacacac',
        'cccccccccccccccc',
        'cccccccccccccccc',
        'cccccgcccccccccc',
        'cccccccccccccccc',
        'ccccccccccccccpc',
        'cccccccccccccccc',
        'cccccccccccccccc',
        'cccccccccccccccc',
        'cchccccccccccccc',
        'cccccccccccccccc',
        'cccccccccccccccc',
        'cccccccccpcccccc',
        'cccccccccccccccc',
        'cccccccccccccccc',
        'ecececececececec',
        'cececececececece',
        'eccceccceccceccc',
        'ccceccceccceccce',
        'eeceeeceeeceeece',
        'eceeeceeeceeecee',
        'hhhhhhhhhhhhhhhh',
        'bbbbpbbbbbbpbbbb',
        'ssssssssssssssss',
        'ssbsssssssbsssss',
        'ssssssssssssssss',
        'ssssssssssssshss',
        'cccccccccccccccc',
        'cccccccccccccccc',
        'cccccscccccccscc',
        'cccccccccccccccc',
        'kkkkkkkkkkkkkkkk',
        'hhhhhhhhhhhhhhhh',
        'bbbbbbbbbbbbbbbb',
        'bbbbbbbbbbbbbbbb',
        'ssssssssssssssss',
        'cccccccccccccccc',
      ]),
    },
    'quiet-verge-floor': {
      tile: art([
        'hhhhhhhhhhhhhhhs',
        'bbbbbbpbbbbbbbbs',
        'bbbbbbbbbbbbhbbs',
        'ssssssssssssssss',
        'hhhhhhhshhhhhhhh',
        'bbbbbbbsbbbpbbbb',
        'bbpbbbbsbbbbbbbb',
        'ssssssssssssssss',
      ]),
    },
  },
  keepsakes: { 'quiet-verge': keepsake() },
};

/** Every piece is generated from the style (with its part hooks); no override. */
export const SOURCE: SetSource = { style: QUIET_VERGE, hand: HAND };

export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
