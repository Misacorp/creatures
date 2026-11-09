/**
 * How `ui/GameIcon` draws a piece or a skin of the player's house (`IconRef` kind `house`) without importing the art: the
 * art packs are about 250 sprites, loaded only with the House place (`HousePlace`, a dynamic import). `house-art.ts` registers its
 * lookup when it loads; until then (or for an id nothing knows) the icon is a grey box. Pure.
 */
import type { SpriteDef } from '../sprites/sprite-data';

type Resolver = (id: string) => SpriteDef | null;

let resolver: Resolver | null = null;

/** Called by `house-art.ts` when the art has loaded. */
export function setHouseIconResolver(next: Resolver): void {
  resolver = next;
}

/** The picture of a piece or a skin for an icon, or null while the art is not loaded. */
export function houseIconSprite(id: string): SpriteDef | null {
  return resolver === null ? null : resolver(id);
}
