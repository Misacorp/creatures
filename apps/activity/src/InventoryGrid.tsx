import type { Creature } from './api';
import { creatureName } from './game';
import type { GearItem } from './gear-types';
import { canMark, gearName, rarityName, slotName, sortItems } from './gear-view';
import { ItemTile } from './ItemTile';

/**
 * The bag as the one item grid (`ItemTile`, the same as the item picker): the slot's icon in each tile's top-left
 * corner (the bag mixes slots), the item level at the bottom right, the small picture of the creature that wears it. Each tile is
 * a real button (Tab and Enter work); its spoken label has the name, slot, item level, rarity, who wears it and
 * whether it is marked for dismantling.
 *
 * Two modes (2026-10-27). In `view` a tap opens the item's card (`onSelect`; the card has the mark action) and a
 * marked item shows its red corner. In `mark` (the selection mode that "Dismantle items" starts) a tap toggles
 * the item's mark (`onToggle`; a worn item cannot be marked and a tap on it says why through `onRefuse`), the tile
 * is pressed when marked, and a small "i" on each tile opens the card (`onSelect`), so a phone can still read
 * an item's stats while it picks.
 */
export function InventoryGrid({
  items,
  creatures,
  selectedId,
  onSelect,
  mode = 'view',
  onToggle,
  onRefuse,
}: {
  items: readonly GearItem[];
  creatures: readonly Creature[];
  selectedId: string | null;
  /** Open the item's card (a tap in `view`, the "i" in `mark`). */
  onSelect: (id: string) => void;
  mode?: 'view' | 'mark';
  /** `mark` only: toggle the mark of an item that can be marked. */
  onToggle?: (item: GearItem) => void;
  /** `mark` only: a tap on an item that cannot be marked (it is worn). */
  onRefuse?: (item: GearItem) => void;
}) {
  const marking = mode === 'mark';
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
          item.markedForDismantle ? 'marked for dismantling' : null,
          marking && !canMark(item) ? 'cannot be marked while worn' : null,
        ]
          .filter((part) => part !== null)
          .join(', ');
        return (
          <ItemTile
            key={item.id}
            item={item}
            label={label}
            selected={item.id === selectedId}
            pressed={marking ? item.markedForDismantle : item.id === selectedId}
            blocked={marking && !canMark(item)}
            wearer={wearer?.species ?? null}
            marked={item.markedForDismantle}
            {...(marking
              ? {
                  onInfo: () => {
                    onSelect(item.id);
                  },
                  infoLabel: `Details of ${gearName(item.baseId)}, item level ${String(item.itemLevel)}`,
                }
              : {})}
            onSelect={() => {
              if (!marking) onSelect(item.id);
              else if (canMark(item)) onToggle?.(item);
              else onRefuse?.(item);
            }}
          />
        );
      })}
    </ul>
  );
}
