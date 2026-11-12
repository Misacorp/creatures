/**
 * The small picture of a house piece, skin or stamp for `GameIcon` (`IconRef` kind `house`), so `RecipeCard`,
 * `CountBadge` and `FindRow` show furniture without a new component. The art itself is looked up through a
 * resolver that `house-art.ts` registers when it loads: `GameIcon` is in the first load of the game and must not
 * pull the furniture art in with it (`HousePlace` is loaded on demand).
 */
import { silhouettePalette } from '../art';
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
 * One item's picture, at the largest whole-pixel scale up to `scale` that keeps it inside a square of `box` CSS px (default: a
 * chip's, `scale` x 16). With `silhouette` it is the flat shape of the art (`silhouettePalette`: an item not found yet). An item with
 * no art yet shows the plain unknown glyph. Decoration: hidden from assistive technology.
 */
export function HouseIcon({
  id,
  scale,
  silhouette = false,
  box,
}: {
  id: string;
  scale: number;
  silhouette?: boolean;
  box?: number | undefined;
}) {
  const sprite = resolver(id);
  if (sprite === undefined) return <Sprite sprite={glyphOrUnknown('unknown')} scale={scale} />;
  return (
    <Sprite
      sprite={sprite}
      scale={fitScale(sprite, box ?? scale * 16, scale)}
      {...(silhouette ? { palette: silhouettePalette(sprite) } : {})}
    />
  );
}
