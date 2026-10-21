import { bagFull, bagFullDetail } from '../gear-view';
import { glyphOrUnknown } from '../glyphs';
import type { GearState } from '../gear-types';
import { Sprite } from '../sprites/Sprite';
import { Alert } from './Alert';

type Inventory = GearState['inventory'];

/**
 * The warning shown where the player sets off (the dungeon, an expedition, the raid) while the bag is
 * full: gear found then becomes parts. It never blocks; going anyway is the player's choice. Nothing
 * when the bag has room or has not loaded yet.
 */
export function BagFullNote({
  inventory,
  onOpenWorkshop,
}: {
  inventory: Inventory | null | undefined;
  /** Opens the Workshop, where items are dismantled. */
  onOpenWorkshop?: (() => void) | undefined;
}) {
  if (inventory === null || inventory === undefined || !bagFull(inventory)) return null;
  return (
    <Alert level="warning" title="Your bag is full." class="bag-full-note">
      {bagFullDetail(inventory)}
      {onOpenWorkshop !== undefined && (
        <>
          <br />
          <button type="button" class="bag-full-open" onClick={onOpenWorkshop}>
            <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
            Workshop
          </button>
        </>
      )}
    </Alert>
  );
}
