/**
 * Placeholder art for a new set's wallpaper, floor and keepsake (`pnpm housing new-set`): a plain pattern in the
 * style's own palette, so a set made from a style alone is complete and the game and the art cross-check have
 * something to show. Nothing here is meant to ship: the artist replaces it by a hand-drawn `HAND` pack (see
 * `data/house/tidepool.ts`) and the pack file's TODO says so.
 */
import type { HouseArtPack } from '../../housing/house-art';
import type { SpriteDef } from '../sprite-data';
import type { Style } from './style';

/** Rows of digits, `.` and `k` (the ink) to a sprite: `digits[n]` is the palette key of digit n. */
function sprite(rows: readonly string[], digits: readonly string[], style: Style): SpriteDef {
  const keyed = rows.map((row) =>
    [...row].map((ch) => (/\d/.test(ch) ? (digits[Number(ch)] ?? '.') : ch)).join(''),
  );
  const used = new Set(keyed.join(''));
  return {
    rows: keyed,
    palette: Object.fromEntries(Object.entries(style.palette).filter(([key]) => used.has(key))),
  };
}

/** Wallpaper tile, 16x52: plain wood with grooves, small cloth diamonds, a skirting along the foot. */
export function placeholderWall(style: Style): SpriteDef {
  const { wood, cloth } = style;
  const rows: string[] = [];
  for (let y = 0; y < 52; y++) {
    if (y >= 46) {
      // skirting: a light edge, then the dark board
      rows.push((y === 46 ? '1' : y === 47 ? '2' : '3').repeat(16));
      continue;
    }
    const cells = Array.from({ length: 16 }, (_, x) => (x % 8 === 0 ? '2' : '1'));
    const row = y % 12;
    if (row === 4 || row === 6) cells[4] = '4';
    if (row === 5) cells.splice(3, 3, '4', '5', '4');
    const other = (row + 6) % 12;
    if (other === 4 || other === 6) cells[12] = '4';
    if (other === 5) cells.splice(11, 3, '4', '5', '4');
    rows.push(cells.join(''));
  }
  return sprite(rows, ['.', wood.light, wood.mid, wood.dark, cloth.light, cloth.mid], style);
}

/** Floor tile, 16x8: two courses of planks, seams offset. */
export function placeholderFloor(style: Style): SpriteDef {
  const { wood } = style;
  const rows = [
    '1111111111111111',
    '2222222222222222',
    '2222222222222222',
    '3333333333333333',
    '1111111111111111',
    '2222222222222222',
    '2222222222222222',
    '3333333333333333',
  ].map((row, y) => {
    const seam = y < 4 ? 5 : 13;
    return `${row.slice(0, seam)}3${row.slice(seam + 1)}`;
  });
  return sprite(rows, ['.', wood.light, wood.mid, wood.dark], style);
}

/** Keepsake, 12x12: a gem in the accent ramp. */
export function placeholderKeepsake(style: Style): SpriteDef {
  const { accent } = style;
  return sprite(
    [
      '....kkkk....',
      '...k0011k...',
      '..k001111k..',
      '.k00111122k.',
      '.k01111222k.',
      'k0011112222k',
      'k0111122222k',
      '.k11112222k.',
      '.k11122222k.',
      '..k112222k..',
      '...k1222k...',
      '....kkkk....',
    ],
    [accent.light, accent.mid, accent.dark],
    style,
  );
}

/** The set's wallpaper, floor and keepsake as a pack, ids as the content names them (`<set>-wall`, `<set>-floor`, `<set>`). */
export function placeholderHand(style: Style): HouseArtPack {
  return {
    skins: {
      [`${style.id}-wall`]: { tile: placeholderWall(style) },
      [`${style.id}-floor`]: { tile: placeholderFloor(style) },
    },
    keepsakes: { [style.id]: placeholderKeepsake(style) },
  };
}
