/**
 * A place's builders' corner (the rule is "A place's project lives in a builders' corner" in `ux-patterns.md`; the Bonfire is the first
 * to have one, Misa, 2026-11-15): a small worksite with a construction table, the plans and materials, and the one real helper seat
 * standing at the table. It shows only while the place has a project being built, stands clearly apart from the rest of the scene (on
 * its own patch of trodden ground, near the bottom of the screen), and is where the place's project board opens. Pure: sizes and
 * boxes in art pixels from the corner's top-left, and the placements to draw. Which picture each piece is: `builders-corner-art.ts`.
 *
 * ```
 *   0   22      54    70 71   80
 *   plans  table  helper pail
 *   sawhorse  (mallet on the table)   planks behind the helper
 * ```
 * The pieces' feet are on row `CORNER.feet`, on the ground patch (5 by 2 tiles at row 2).
 */
import { TILE, type Placement } from './valley-art';
import { CORNER_SIZE, cornerSprite, type CornerPiece } from './builders-corner-art';

/** The corner's box in art pixels, and the row its pieces' feet stand on. */
export const CORNER = { w: 80, h: 34, feet: 30 } as const;

type Standing = Exclude<CornerPiece, 'ground'>;

/** Where each piece stands (its top-left) from the corner's top-left. The ground patch is tiled from `GROUND_AT`. */
export const CORNER_AT: Readonly<Record<Standing, { x: number; y: number }>> = {
  planks: { x: 64, y: 12 },
  plans: { x: 0, y: 6 },
  table: { x: 22, y: 10 },
  sawhorse: { x: 2, y: 21 },
  mallet: { x: 33, y: 7 },
  pail: { x: 71, y: 23 },
};
const GROUND_AT = { x: 0, y: 2 };

/** The helper's seat: a creature's box (16 x 16) at the table's right, feet on the corner's feet row. */
export const HELPER_AT = { x: 54, y: CORNER.feet - 16 };

/** What a tap on the table opens the project board from: the plans and the table, whole. */
export const TABLE_BOX = { x: 0, y: 6, w: 54, h: 24 };

/** The corner's ground and pieces as placements, back to front, from its top-left at (`x`, `y`) in scene pixels. */
export function cornerPlacements(x: number, y: number): Placement[] {
  const out: Placement[] = [];
  const ground = cornerSprite('ground');
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < CORNER.w / TILE; col += 1) {
      out.push({
        sprite: ground,
        x: x + GROUND_AT.x + col * TILE,
        y: y + GROUND_AT.y + row * TILE,
      });
    }
  }
  for (const piece of ['planks', 'plans', 'table', 'mallet', 'sawhorse', 'pail'] as const) {
    out.push({ sprite: cornerSprite(piece), x: x + CORNER_AT[piece].x, y: y + CORNER_AT[piece].y });
  }
  return out;
}

/** Every piece's box from the corner's top-left (a test checks they stand inside the corner). */
export function cornerPieceBoxes(): {
  piece: CornerPiece;
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  return [
    ...(Object.keys(CORNER_AT) as Standing[]).map((piece) => ({
      piece,
      ...CORNER_AT[piece],
      ...CORNER_SIZE[piece],
    })),
    { piece: 'ground' as const, ...GROUND_AT, w: CORNER.w, h: 2 * TILE },
  ];
}
