import type { Creature } from './api';
import { creatureName } from './game';
import type { GearItem } from './gear-types';
import { gearName, rarityName, slotName, sortItems } from './gear-view';
import { ItemTile } from './ItemTile';

/**
 * The bag as the one item grid (`ItemTile`, the same as the item picker): the slot's icon in each tile's top-left
 * corner (the bag mixes slots), the item level at the bottom right, "Worn" when a creature wears it. Each tile is
 * a real button (Tab and Enter work); its spoken label has the name, slot, item level, rarity and who wears it.
 */
export function InventoryGrid({
  items,
  creatures,
  selectedId,
  onSelect,
}: {
  items: readonly GearItem[];
  creatures: readonly Creature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul class="item-grid" aria-label="Gear in your bag">
      {sortItems(items).map((item) => {
        const wearer = creatures.find((c) => c.id === item.equippedOn);
        const label = [
          gearName(item.baseId),
          slotName(item.slot),
          `item level ${String(item.itemLevel)}`,
          rarityName(item.rarity),
          wearer === undefined ? null : `worn by ${creatureName(wearer)}`,
        ]
          .filter((part) => part !== null)
          .join(', ');
        return (
          <ItemTile
            key={item.id}
            item={item}
            label={label}
            selected={item.id === selectedId}
            flag={wearer === undefined ? null : 'Worn'}
            onSelect={() => {
              onSelect(item.id);
            }}
          />
        );
      })}
    </ul>
  );
}
