/**
 * The pieces of the builders' corner (a place's project site: `builders-corner.ts` lays them out, `BonfireCanvas.tsx` draws it), by name:
 * the one place that says where each one's picture comes from, so the Art session's set `valley-builders-corner` drops in by changing
 * this table and nothing else (Misa, 2026-11-15; the rule is in `ux-patterns.md`, "A place's project lives in a builders' corner").
 *
 * Until that set lands the pieces are the ones already in the game: the ground work that rises round a flat place while its project
 * fills (`scaffold.ts`: sawhorse, pail, mallet, planks) and the Forge's workbench and plans-board (`forge-interior-art.ts`, by day), on
 * the valley map's dirt tile. Sizes are in art pixels; every piece's anchor is its top-left, and the layout puts its feet on a row.
 *
 * | name       | size  | what it is                                                    |
 * | ---------- | ----- | ------------------------------------------------------------- |
 * | `table`    | 32x20 | the construction table (top starts on row 4)                  |
 * | `plans`    | 24x24 | the plans board standing beside the table                     |
 * | `sawhorse` | 16x9  | a sawhorse with a plank across it                             |
 * | `planks`   | 15x10 | a stack of planks                                             |
 * | `pail`     | 7x7   | a pail                                                        |
 * | `mallet`   | 10x6  | a mallet lying on the table                                   |
 * | `ground`   | 16x16 | the site's trodden ground, tiled                              |
 */
import { tileFrame } from '../games/art/tiles';
import type { SpriteDef } from '../sprites/sprite-data';
import { interiorSprite } from './forge-interior-art';
import { groundPiece } from './scaffold';

export const CORNER_PIECES = [
  'table',
  'plans',
  'sawhorse',
  'planks',
  'pail',
  'mallet',
  'ground',
] as const;
export type CornerPiece = (typeof CORNER_PIECES)[number];

/** Each piece's size in art pixels. */
export const CORNER_SIZE: Readonly<Record<CornerPiece, { w: number; h: number }>> = {
  table: { w: 32, h: 20 },
  plans: { w: 24, h: 24 },
  sawhorse: { w: 16, h: 9 },
  planks: { w: 15, h: 10 },
  pail: { w: 7, h: 7 },
  mallet: { w: 10, h: 6 },
  ground: { w: 16, h: 16 },
};

/** A piece of the corner by name (the picture itself comes from one of these lines). */
export function cornerSprite(piece: CornerPiece): SpriteDef {
  switch (piece) {
    case 'table':
      return interiorSprite('workbench', false);
    case 'plans':
      return interiorSprite('plans-board', false);
    case 'sawhorse':
      return groundPiece('sawhorse');
    case 'planks':
      return groundPiece('planks');
    case 'pail':
      return groundPiece('pail');
    case 'mallet':
      return groundPiece('mallet');
    case 'ground':
      return tileFrame('dirt');
  }
}
