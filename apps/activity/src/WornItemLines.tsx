import { FindItem } from './ui/FindItem';
import { slotName, wornInOrder, type WornItem } from './gear-view';

/**
 * The read-only list of what a creature wears, as the compact item rows finds use (`FindItem`: image with its level in the corner, name,
 * rarity badge and the slot's name; no stats). The living room's popover uses it.
 */
export function WornItemLines({ worn }: { worn: readonly WornItem[] }) {
  return (
    <ul class="stack-list" aria-label="Worn gear">
      {wornInOrder(worn).map((item) => (
        <FindItem
          key={item.slot}
          baseId={item.baseId}
          rarity={item.rarity}
          level={item.itemLevel}
          scale={3}
        >
          <span class="muted pix find-row-slot">{slotName(item.slot)}</span>
        </FindItem>
      ))}
    </ul>
  );
}
