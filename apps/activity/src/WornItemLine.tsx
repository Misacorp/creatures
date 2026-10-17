import { ItemRow } from './ItemRow';
import { slotName, wornInOrder, type WornItem } from './gear-view';

/**
 * The read-only list of what a creature wears, as compact item rows (image with its level in the corner, name,
 * rarity badge and the slot's name; no stats). The living room's popover uses it.
 */
export function WornItemLines({ worn }: { worn: readonly WornItem[] }) {
  return (
    <ul class="worn-items" aria-label="Worn gear">
      {wornInOrder(worn).map((item) => (
        <ItemRow
          key={item.slot}
          baseId={item.baseId}
          rarity={item.rarity}
          level={item.itemLevel}
          scale={3}
        >
          <span class="muted pix item-row-slot">{slotName(item.slot)}</span>
        </ItemRow>
      ))}
    </ul>
  );
}
