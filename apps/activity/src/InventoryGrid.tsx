import type { Creature } from './api';
import { creatureName } from './game';
import type { GearItem } from './gear-types';
import { gearName, rarityName, slotName, sortItems } from './gear-view';
import { ItemTile } from './ItemTile';
import type { MultiSelect } from './ui/multi-select';
import type { SelectHint } from './ui/select-hint';
import { useSelectGrid } from './ui/use-select-grid';

/** The bag's one-time hint about selecting several items (the key is the one players already have). */
export const BAG_HINT: SelectHint = {
  key: 'lc.bag-select-hint.v1',
  touch: 'Press and hold an item to select several',
  mouse: 'Click the box on an item to select several',
};

/**
 * The bag as the one item grid (`ItemTile`, the same as the item picker): the slot's icon in each tile's bottom-left
 * corner (the bag mixes slots), the item level at the bottom right, the small picture of the creature that wears
 * it. It is a list where several items can be selected (decisions.md, 2026-10-27, "Bulk selection replaces
 * marking"): every gesture (a tap opens the card, the corner checkbox and a press and hold select, Ctrl, Shift,
 * the right click's menu, the keys) comes from the shared `useSelectGrid`; this grid only draws the items.
 *
 * Each tile's spoken label has the name, slot, item level, rarity and who wears it; `aria-selected` says whether
 * it is picked. Worn items can be selected too.
 */
export function InventoryGrid({
  items,
  creatures,
  openId,
  onOpen,
  selection,
}: {
  items: readonly GearItem[];
  creatures: readonly Creature[];
  /** The item whose card is up (or was shown last). */
  openId: string | null;
  /** Open the item's card (and close it when it is already the one shown). */
  onOpen: (id: string) => void;
  selection: MultiSelect;
}) {
  const ordered = sortItems(items);
  const nameOf = (id: string): string => {
    const item = ordered.find((i) => i.id === id);
    return item === undefined ? '' : gearName(item.baseId);
  };
  const grid = useSelectGrid({
    order: ordered.map((i) => i.id),
    selection,
    onOpen,
    label: 'Gear in your bag',
    nameOf,
  });

  return (
    <>
      <ul class={`item-grid bag-grid ${grid.listClass}`} {...grid.listProps}>
        {ordered.map((item, index) => {
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
              selected={item.id === openId}
              wearer={wearer?.species ?? null}
              choice={{
                chosen: selection.has(item.id),
                holding: grid.holding === item.id,
                onCheck: () => {
                  selection.toggle(item.id);
                },
                checkLabel: `Select ${gearName(item.baseId)}, item level ${String(item.itemLevel)}`,
              }}
              focusRef={grid.tileRef(index)}
              buttonProps={grid.optionProps(item.id, index)}
              onSelect={(keys) => {
                grid.click(item.id, keys);
              }}
            />
          );
        })}
      </ul>
      {grid.overlay}
    </>
  );
}
