/**
 * The small picture of a house piece, skin or stamp for `GameIcon` (`IconRef` kind `house`), so `RecipeCard`,
 * `CountBadge` and `FindRow` show furniture without a new component. The art itself is looked up through a
 * resolver that `house-art.ts` registers when it loads: `GameIcon` is in the first load of the game and must not
 * pull the furniture art in with it (`HousePlace` is loaded on demand).
 */
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { spriteSize, type SpriteDef } from '../sprites/sprite-data';

type Resolver = (id: string) => SpriteDef | undefined;

let resolver: Resolver = () => undefined;

/** Called once by `house-art.ts`. */
export function registerHouseIcons(next: Resolver): void {
  resolver = next;
}

/** The picture of an item id, or undefined while no art is registered for it. */
export function houseIconSprite(id: string): SpriteDef | undefined {
  return resolver(id);
}

/** The largest integer scale (up to `max`) at which a sprite fits a square of `box` px. */
export function fitScale(sprite: SpriteDef, box: number, max: number): number {
  const { width, height } = spriteSize(sprite);
  return Math.max(1, Math.min(max, Math.floor(box / Math.max(width, height, 1))));
}

/**
 * One item's picture, at a whole-pixel scale that keeps it inside a chip (an icon scale of 2 is a 32 px box).
 * An item with no art yet shows the plain unknown glyph. Decoration: hidden from assistive technology.
 */
export function HouseIcon({ id, scale }: { id: string; scale: number }) {
  const sprite = resolver(id);
  if (sprite === undefined) return <Sprite sprite={glyphOrUnknown('unknown')} scale={scale} />;
  return <Sprite sprite={sprite} scale={fitScale(sprite, scale * 16, scale)} />;
}
