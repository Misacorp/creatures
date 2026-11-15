/**
 * The place canvases' props (the art library's `valley-place-props` set): the visitor's blueprint, the School's graduation stage, the
 * Market under construction and the Paddock's gate sign, drawn in the valley's day light. Which variant of each is drawn is Misa's pick,
 * kept in one named constant per prop in the set itself (`PLACE_PROP_PICKS`), so a change of pick is a one-line edit there.
 * Pure: no clock, no randomness.
 */
import { PLACE_PROP_PICKS } from '../sprites/concepts/valley-place-props';
import { swapPalette, type SpriteDef } from '../sprites/sprite-data';

export type PlaceProp = keyof typeof PLACE_PROP_PICKS;

const cache = new Map<PlaceProp, SpriteDef>();

/** A prop's sprite by day (its main palette is night; its `day` recolour is the one used here). */
export function propArt(name: PlaceProp): SpriteDef {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const pick = PLACE_PROP_PICKS[name];
  const sprite = swapPalette(pick.sprite, pick.day);
  cache.set(name, sprite);
  return sprite;
}

/** A prop's size in art pixels. */
export function propSize(name: PlaceProp): { width: number; height: number } {
  const sprite = PLACE_PROP_PICKS[name].sprite;
  return { width: sprite.rows[0]?.length ?? 0, height: sprite.rows.length };
}
