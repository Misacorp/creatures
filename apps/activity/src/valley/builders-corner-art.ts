/**
 * The pieces of the builders' corner (`builders-corner.ts` lays them out, `BonfireCanvas.tsx` draws it), by name: the one place that
 * reads the Art session's set `valley-builders-corner` (night is the set's main palette, `alts.day` the recolour of the same pixels, as
 * the Forge's interior does). Wiring the set into the game was approved by the lead, 2026-11-15, so the concept set stays in the library
 * as it is. Every piece stands on its last row (its base row); the layout places them by it.
 *
 * | name                    | size            | what it is                                                        |
 * | ----------------------- | --------------- | ----------------------------------------------------------------- |
 * | `table`                 | 32x20           | the construction table with the plan (main A, Misa's pick)        |
 * | `tarp`                  | 48x24           | the canvas awning; the table stands under it, at its x 8          |
 * | `sawhorse`              | 16x12           | a sawhorse with a plank                                           |
 * | `planks`                | 20x8            | a stack of planks                                                 |
 * | `toolbox`               | 12x8            | a toolbox                                                         |
 * | `pile-stone-s/m/l`      | 14x5, 22x9, 26x13 | cut stone, by how full the project is                           |
 * | `pile-timber-s/m/l`     | 10x10, 14x14, 23x14 | logs                                                          |
 * | `pile-bags-s/m/l`       | 9x9, 17x13, 25x13 | sacks                                                           |
 * | `help-flag`             | 8x16            | a stake with a teal flag: marks the empty helper spot             |
 * | `ground`                | 16x16           | the site's trodden ground, tiled (the map's dirt tile)            |
 */
import { tileFrame } from '../games/art/tiles';
import { VALLEY_BUILDERS_CORNER_CONCEPTS } from '../sprites/concepts/valley-builders-corner';
import { swapPalette, type SpriteDef } from '../sprites/sprite-data';

export const PILE_MATERIALS = ['timber', 'stone', 'bags'] as const;
export type PileMaterial = (typeof PILE_MATERIALS)[number];
export const PILE_SIZES = ['s', 'm', 'l'] as const;
export type PileSize = (typeof PILE_SIZES)[number];

export type CornerPiece =
  | 'table'
  | 'tarp'
  | 'sawhorse'
  | 'planks'
  | 'toolbox'
  | 'help-flag'
  | 'ground'
  | `pile-${PileMaterial}-${PileSize}`;

const cache = new Map<string, SpriteDef>();

/** A piece of the corner by name, by day. Cached. */
export function cornerSprite(piece: CornerPiece): SpriteDef {
  if (piece === 'ground') return tileFrame('dirt');
  const hit = cache.get(piece);
  if (hit !== undefined) return hit;
  const concept = VALLEY_BUILDERS_CORNER_CONCEPTS.sprites[piece];
  if (concept === undefined) throw new Error(`valley-builders-corner has no ${piece}`);
  const day = concept.alts?.['day'];
  const sprite = day === undefined ? concept.sprite : swapPalette(concept.sprite, day);
  cache.set(piece, sprite);
  return sprite;
}

/** A piece's size in its own pixels. */
export function cornerSize(piece: CornerPiece): { w: number; h: number } {
  const sprite = cornerSprite(piece);
  return { w: sprite.rows[0]?.length ?? 0, h: sprite.rows.length };
}
