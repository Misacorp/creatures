/**
 * The pieces of the Forge's workshop interior (`ForgeScenes.tsx`), by name: the one place that reads the Art session's set
 * `valley-forge-interior` (night is the set's main palette, `alts.day` the recolour of the same pixels), as the valley's sky does.
 * Wiring this set into the game was approved for the interior (lead, 2026-11-11), so the concept set stays in the library as it is
 * (it is still a draft: Misa has not rated it) instead of moving into `sprites/data/`.
 *
 * Sizes in pixels: back-wall 128x56 (tiles sideways), furnace 48x52 (base on row 51), furnace-glow 128x40 (a floor overlay over the
 * floor tiles, under the props; its origin sits on a tile corner), shelf 32x16, tool-rack 32x24, hanging-tools 24x16, workbench 32x20
 * (the top starts at row 4), floor 16x16 (tiles both ways), barrel 12x16, quench-trough 24x12, coal-heap 16x10. Clickable, drawn bold
 * (2026-11-14): door 20x32 and door-mat 20x4 (the way out), plans-board 24x24, finished-crate 20x16. Quiet dressing: barrel-stack 24x24,
 * sacks 18x13, gear-rack 22x26, rug 48x16, woodpile 28x19, cat 12x8, bucket 10x10, window-2 12x31, lantern-hanging 24x40.
 * Where each stands in the room is `forge-interior.ts` (`ROOM_AT`).
 */
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
  'door',
  'door-mat',
  'plans-board',
  'finished-crate',
  'barrel-stack',
  'sacks',
  'gear-rack',
  'rug',
  'woodpile',
  'cat',
  'bucket',
  'window-2',
  'lantern-hanging',
] as const;
export const INTERIOR_PIECES = SET_PIECES;
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
  door: { w: 20, h: 32 },
  'door-mat': { w: 20, h: 4 },
  'plans-board': { w: 24, h: 24 },
  'finished-crate': { w: 20, h: 16 },
  'barrel-stack': { w: 24, h: 24 },
  sacks: { w: 18, h: 13 },
  'gear-rack': { w: 22, h: 26 },
  rug: { w: 48, h: 16 },
  woodpile: { w: 28, h: 19 },
  cat: { w: 12, h: 8 },
  bucket: { w: 10, h: 10 },
  'window-2': { w: 12, h: 31 },
  'lantern-hanging': { w: 24, h: 40 },
};

const cache = new Map<string, SpriteDef>();

/** A piece of the interior by name: at night (the set's main palette) or by day. Cached. */
export function interiorSprite(piece: InteriorPiece, night: boolean): SpriteDef {
  const key = `${piece}:${night ? 'n' : 'd'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const concept = VALLEY_FORGE_INTERIOR_CONCEPTS.sprites[piece];
  if (concept === undefined) throw new Error(`valley-forge-interior has no ${piece}`);
  const day = concept.alts?.['day'];
  const sprite = night || day === undefined ? concept.sprite : swapPalette(concept.sprite, day);
  cache.set(key, sprite);
  return sprite;
}
