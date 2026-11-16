/**
 * A place's builders' corner (the rule is "A place's project lives in a builders' corner" in `ux-patterns.md`; the Bonfire is the first
 * to have one, Misa, 2026-11-15): a small worksite with a construction table under a tarp, a pile of materials that grows with the
 * project, tools, and the one real helper seat. It shows only while the place has a project being built, stands clearly apart from the
 * rest of the scene (on its own patch of trodden ground, near the bottom of the screen), and is where the place's project board opens.
 * Pure: boxes in art pixels from the corner's top-left, and the placements to draw. Which picture each piece is: `builders-corner-art.ts`.
 *
 * ```
 *   0              48 52   56      80
 *   tarp over table      pile (by progress)      back row stands on row 24 (the pile on 22)
 *   sawhorse  planks  toolbox  helper + flag      front row stands on row 40
 * ```
 * The helper's spot has clear ground of its own: the pile is behind it, a row above its flag, never touching it (the Art session: a flag
 * in front of a pile reads as a tree).
 */
import { TILE, type Placement } from './valley-art';
import {
  PILE_MATERIALS,
  cornerSize,
  cornerSprite,
  type CornerPiece,
  type PileMaterial,
  type PileSize,
} from './builders-corner-art';

/** The corner's box in art pixels (its ground patch: 5 by 3 tiles), and the row its front row stands on (the helper's feet). */
export const CORNER = { w: 80, h: 48, feet: 40 } as const;

/** The group the corner's two targets (the table and the helper spot) share: a drawer opened from one keeps both in view (`CanvasTarget` `group`). */
export const CORNER_GROUP = 'builders-corner';

/** The rows the back row (tarp, table) and the pile stand on. */
const BACK = 24;
const PILE_BASE = 22;

/** Where each piece stands (its top-left) from the corner's top-left; a piece's base row is its last. */
export const CORNER_AT = {
  tarp: { x: 0, y: BACK - 23 },
  table: { x: 8, y: BACK - 19 },
  sawhorse: { x: 0, y: CORNER.feet - 11 },
  planks: { x: 33, y: CORNER.feet - 7 },
  toolbox: { x: 52, y: CORNER.feet - 7 },
} as const satisfies Partial<Record<CornerPiece, { x: number; y: number }>>;

/** The helper's seat: a creature's box (16 x 16) right of the tools, feet on the front row; its flag stands inside it while it is empty. */
export const HELPER_AT = { x: 64, y: CORNER.feet - 16 };
/** The empty spot's flag (8 x 16), in the middle of the helper's box. */
export const FLAG_AT = { x: HELPER_AT.x + 4, y: CORNER.feet - 16 };

/** What a tap on the table opens the project board from: the tarp with the table under it. */
export const TABLE_BOX = { x: 0, y: 1, w: 48, h: 23 };

/** The slot the pile stands in, right of the tarp, centred (its base row is `PILE_BASE`). */
const PILE_SLOT = { x: 54, w: 26 };

/** The material of a place's pile by its level: timber for the first two levels, cut stone at the third, sacks after (the tiers' materials). */
export function pileMaterial(level: number): PileMaterial {
  return PILE_MATERIALS[level >= 4 ? 2 : level >= 3 ? 1 : 0] ?? 'timber';
}

/** The pile's size by how much of the project is filled (whole percent): small, then medium from a third, large from two thirds. */
export function pileSize(percent: number): PileSize {
  return percent >= 67 ? 'l' : percent >= 34 ? 'm' : 's';
}

export interface Pile {
  material: PileMaterial;
  size: PileSize;
}

/** The corner's ground and pieces as placements, back to front, from its top-left at (`x`, `y`) in scene pixels. */
export function cornerPlacements(x: number, y: number, pile: Pile): Placement[] {
  const out: Placement[] = [];
  const ground = cornerSprite('ground');
  for (let row = 0; row < CORNER.h / TILE; row += 1) {
    for (let col = 0; col < CORNER.w / TILE; col += 1) {
      out.push({ sprite: ground, x: x + col * TILE, y: y + row * TILE });
    }
  }
  const name: CornerPiece = `pile-${pile.material}-${pile.size}`;
  const size = cornerSize(name);
  out.push({
    sprite: cornerSprite(name),
    x: x + PILE_SLOT.x + Math.floor((PILE_SLOT.w - size.w) / 2),
    y: y + PILE_BASE + 1 - size.h,
  });
  for (const piece of ['tarp', 'table', 'sawhorse', 'planks', 'toolbox'] as const) {
    out.push({ sprite: cornerSprite(piece), x: x + CORNER_AT[piece].x, y: y + CORNER_AT[piece].y });
  }
  return out;
}

/** Every piece's box from the corner's top-left, the largest pile of each material included (a test checks they stand inside it). */
export function cornerPieceBoxes(): {
  piece: CornerPiece;
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  const fixed = (Object.keys(CORNER_AT) as (keyof typeof CORNER_AT)[]).map((piece) => ({
    piece: piece as CornerPiece,
    ...CORNER_AT[piece],
    ...cornerSize(piece),
  }));
  const piles = PILE_MATERIALS.map((m) => {
    const piece: CornerPiece = `pile-${m}-l`;
    const size = cornerSize(piece);
    return {
      piece,
      x: PILE_SLOT.x + Math.floor((PILE_SLOT.w - size.w) / 2),
      y: PILE_BASE + 1 - size.h,
      ...size,
    };
  });
  return [...fixed, ...piles, { piece: 'help-flag', ...FLAG_AT, ...cornerSize('help-flag') }];
}
