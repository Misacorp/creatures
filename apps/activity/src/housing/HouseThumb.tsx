import { GameIcon } from '../ui/GameIcon';
import './house-art';

/**
 * One house item's picture (piece, skin or stamp by id) at the largest whole-pixel scale (up to `max`) that fits a square of
 * `box` px, or its silhouette when it is not found yet: `GameIcon` draws it (`{ kind: 'house' }`, fitted to the box). Decoration:
 * the tile's button carries the spoken name.
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
  return (
    <GameIcon
      icon={{ kind: 'house', id, box, ...(silhouette ? { silhouette } : {}) }}
      scale={max}
    />
  );
}
