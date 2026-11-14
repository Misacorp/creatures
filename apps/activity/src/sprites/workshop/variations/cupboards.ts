/**
 * Two new silhouettes for Fenkeeper's cupboard, which is nearly the outline of Ancient's (overlap 0.87, colour 0.048) and of
 * Plain Pine's. Both are the shipped hand piece's own pixels, cut and rejoined, so the paint, the reed bands and the opal stay
 * the set's; only the outline changes. A review option: nothing in the game imports this file.
 */
import type { PieceArt } from '../../../housing/house-art';
import { SOURCE as FENKEEPER } from '../../data/house/fenkeeper';
import type { Variation } from './types';

const base = FENKEEPER.hand?.pieces?.['fenkeeper-cupboard'];
if (base === undefined) throw new Error('fenkeeper-cupboard has no hand art');
const ROWS = base.sprite.rows;
const W = 30;
const H = 36;

const dots = (n: number): string => '.'.repeat(n);

/** `rows` as a sprite of the base piece's palette; it must be exactly the form's box (30 x 36). */
function piece(rows: readonly string[]): PieceArt {
  for (const r of rows)
    if (r.length !== W) throw new Error(`row of ${String(r.length)}, wanted ${String(W)}`);
  if (rows.length !== H) throw new Error(`${String(rows.length)} rows, wanted ${String(H)}`);
  return { sprite: { rows, palette: base.sprite.palette } };
}

const row = (i: number): string => ROWS[i] ?? '';

/**
 * Stilts: a fen house stands out of the water. The rounded crown and the doors stay, the body is shorter by seven rows, and the
 * cupboard stands on two tall legs bound with a reed cross-bar.
 */
function stilts(): PieceArt {
  const body = [...ROWS.slice(0, 18), ...ROWS.slice(25, 32)];
  const leg = `...kaak${dots(16)}kaak...`;
  const brace = `...kaak${'de'.repeat(8)}kaak...`;
  const legs = [
    leg,
    leg,
    leg,
    leg,
    brace,
    leg,
    leg,
    leg,
    leg,
    `..kcccck${dots(14)}kcccck..`,
    `..kkkkkk${dots(14)}kkkkkk..`,
  ];
  return piece([...body, ...legs]);
}

/**
 * A reed-thatched hutch: a roof that peaks and overhangs a narrower cabinet (four columns taken out of each side of the
 * body, where the doors are uniform), on a plinth. It reads as a little house, not a wardrobe.
 */
function hutch(): PieceArt {
  const roof: string[] = [];
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const hw = Math.min(14, 1 + 2 * r);
    const left = 15 - hw;
    const width = 2 * hw;
    const inner = Array.from({ length: width }, (_, i) => {
      if (i === 0 || i === width - 1) return 'k';
      if (r === rows - 1) return i % 2 === 0 ? 'c' : 'a';
      return r % 2 === 0 ? 'd' : 'b';
    }).join('');
    roof.push(`${dots(left)}${inner}${dots(30 - left - width)}`);
  }
  const narrow = (s: string): string =>
    `${dots(4)}${s.slice(0, 8)}${s.slice(12, 18)}${s.slice(22)}${dots(4)}`;
  const body = ROWS.slice(8).map(narrow);
  return piece([...roof, ...body]);
}

export const CUPBOARD_VARIATIONS: readonly Variation[] = [
  {
    id: 'fenkeeper-cupboard-stilts',
    set: 'fenkeeper',
    name: 'B3a: cupboard on reed-bound stilts',
    pieces: { cupboard: stilts() },
  },
  {
    id: 'fenkeeper-cupboard-hutch',
    set: 'fenkeeper',
    name: 'B3b: reed-thatched hutch',
    pieces: { cupboard: hutch() },
  },
];
