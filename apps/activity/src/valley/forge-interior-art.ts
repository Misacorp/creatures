/**
 * The pieces of the Forge's workshop interior (`ForgeScenes.tsx`), by name: the one place that reads the Art session's set
 * `valley-forge-interior` (night is the set's main palette, `alts.day` the recolour of the same pixels), as the valley's sky does.
 * Wiring this set into the game was approved for the interior (lead, 2026-11-11), so the concept set stays in the library as it is
 * (it is still a draft: Misa has not rated it) instead of moving into `sprites/data/`.
 *
 * Sizes in pixels: back-wall 128x56 (tiles sideways), furnace 48x52 (base on row 51), furnace-glow 128x40 (a floor overlay over the
 * floor tiles, under the props; its origin sits on a tile corner), shelf 32x16, tool-rack 32x24, hanging-tools 24x16, workbench 32x20
 * (the top starts at row 4), floor 16x16 (tiles both ways), barrel 12x16, quench-trough 24x12, coal-heap 16x10. `doormat` (24x8) is
 * the game's own stand-in, not the set's: the way back outside is drawn on it, until the set has a door.
 * Where each stands in the room is `forge-interior.ts` (`ROOM_AT`).
 */
import { PixelGrid } from '../games/art/pixel';
import type { SpriteDef } from '../sprites/sprite-data';
import { swapPalette } from '../sprites/sprite-data';
import { VALLEY_FORGE_INTERIOR_CONCEPTS } from '../sprites/concepts/valley-forge-interior';

/** The set's pieces the interior draws. */
export const SET_PIECES = [
  'back-wall',
  'furnace',
  'furnace-glow',
  'shelf',
  'tool-rack',
  'workbench',
  'floor',
  'barrel',
  'quench-trough',
  'hanging-tools',
  'coal-heap',
] as const;
export const INTERIOR_PIECES = [...SET_PIECES, 'doormat'] as const;
export type InteriorPiece = (typeof INTERIOR_PIECES)[number];

/** The size of each piece in pixels. */
export const PIECE_SIZE: Readonly<Record<InteriorPiece, { w: number; h: number }>> = {
  'back-wall': { w: 128, h: 56 },
  furnace: { w: 48, h: 52 },
  'furnace-glow': { w: 128, h: 40 },
  shelf: { w: 32, h: 16 },
  'tool-rack': { w: 32, h: 24 },
  workbench: { w: 32, h: 20 },
  floor: { w: 16, h: 16 },
  barrel: { w: 12, h: 16 },
  'quench-trough': { w: 24, h: 12 },
  'hanging-tools': { w: 24, h: 16 },
  'coal-heap': { w: 16, h: 10 },
  doormat: { w: 24, h: 8 },
};

/** A welcome mat in the props' ink and wood colours, with a little arrow: the door out. */
const DOORMAT: SpriteDef = (() => {
  const g = new PixelGrid(24, 8);
  g.rect(0, 1, 24, 7, 'k');
  g.rect(1, 2, 22, 5, 'm');
  g.rect(1, 2, 22, 1, 'n');
  g.rect(1, 6, 22, 1, 'o');
  g.rect(8, 4, 8, 1, 'k');
  g.rect(8, 3, 1, 3, 'k');
  return g.toSprite({ k: '#0d0a1a', m: '#8a5a34', n: '#b07a45', o: '#5e3b22' });
})();
const DOORMAT_DAY: Readonly<Record<string, string>> = { m: '#946038', n: '#c08850', o: '#60402a' };

const cache = new Map<string, SpriteDef>();

/** A piece of the interior by name: at night (the set's main palette) or by day. Cached. */
export function interiorSprite(piece: InteriorPiece, night: boolean): SpriteDef {
  const key = `${piece}:${night ? 'n' : 'd'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let sprite: SpriteDef;
  if (piece === 'doormat') {
    sprite = night ? DOORMAT : swapPalette(DOORMAT, DOORMAT_DAY);
  } else {
    const concept = VALLEY_FORGE_INTERIOR_CONCEPTS.sprites[piece];
    if (concept === undefined) throw new Error(`valley-forge-interior has no ${piece}`);
    const day = concept.alts?.['day'];
    sprite = night || day === undefined ? concept.sprite : swapPalette(concept.sprite, day);
  }
  cache.set(key, sprite);
  return sprite;
}
