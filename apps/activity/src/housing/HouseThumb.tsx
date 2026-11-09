import { expandRows, type SpriteDef } from '../sprites/sprite-data';
import { Sprite } from '../sprites/Sprite';
import { glyphOrUnknown } from '../glyphs';
import './house-art';
import { fitScale, houseIconSprite } from './house-icon';

/** The colour of a silhouette: a shade darker than the tile it sits on, so the shape reads and the colours do not. */
export const SILHOUETTE = '#15112c';

/** The same picture in one flat colour: the shape of something not found yet. */
export function silhouetteOf(sprite: SpriteDef, colour: string = SILHOUETTE): SpriteDef {
  return {
    rows: expandRows(sprite).map((row) => row.replace(/[^.]/g, 's')),
    palette: { s: colour },
  };
}

/**
 * One house item's picture (piece, skin or stamp by id) at the largest whole-pixel scale that fits a square of `box`
 * px, or its silhouette when it is not found yet. Decoration: the tile's button carries the spoken name.
 */
export function HouseThumb({
  id,
  silhouette = false,
  box = 40,
  max = 3,
}: {
  id: string;
  silhouette?: boolean;
  box?: number;
  max?: number;
}) {
  const sprite = houseIconSprite(id);
  if (sprite === undefined) return <Sprite sprite={glyphOrUnknown('unknown')} scale={2} />;
  const shown = silhouette ? silhouetteOf(sprite) : sprite;
  return <Sprite sprite={shown} scale={fitScale(sprite, box, max)} />;
}
