import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import type { useBagSelection } from './bag-select';
import { creatureName } from './game';
import type { GearItem } from './gear-types';
import { gearName, rarityName, slotName, sortItems } from './gear-view';
import { ItemMenu } from './ItemMenu';
import { ItemTile } from './ItemTile';
import { useHold } from './long-press';
import { LiveRegion } from './ui/LiveRegion';

/** What the grid needs of the bag's selection (`useBagSelection`). */
export type BagSelection = Pick<
  ReturnType<typeof useBagSelection>,
  'active' | 'ids' | 'has' | 'toggle' | 'add' | 'range' | 'clear'
>;

/** How many tiles sit in the first row (the arrow keys' Up and Down move by a row). */
function columnsOf(tiles: readonly (HTMLButtonElement | null)[]): number {
  const first = tiles[0];
  if (first == null) return 1;
  const top = first.getBoundingClientRect().top;
  let n = 0;
  for (const tile of tiles) {
    if (tile != null && tile.getBoundingClientRect().top === top) n++;
    else break;
  }
  return Math.max(1, n);
}

/**
 * The bag as the one item grid (`ItemTile`, the same as the item picker): the slot's icon in each tile's top-left
 * corner (the bag mixes slots), the item level at the bottom right, the small picture of the creature that wears
 * it. The grid is a multi-select listbox (decisions.md, 2026-10-27, "Bulk selection replaces marking"), the
 * one gesture set for picking several items:
 *
 * - A tap or click on a tile opens the item's card (`onOpen`), selecting or not (the card opens over the
 *   selection). The small square checkbox in the tile's corner (a 44 px target) toggles it instead.
 * - Touch: press and hold ~450 ms selects the item and starts selecting (`useHold`; the tile shows a cue, the
 *   device buzzes, scrolling stays native, and the click after the hold is swallowed).
 * - Mouse: the checkbox shows in the tile's corner on hover; a click on it selects. Ctrl or Command click toggles,
 *   Shift click adds the range from the last toggled item (in the grid's order), a right click opens a small menu
 *   with Inspect and Select (an extra: the other ways always work).
 * - Keyboard: arrows (with Home and End) move one tab stop around the grid (roving tabindex), Enter opens the
 *   card, Space toggles, Escape clears the selection and ends the mode. A polite live region says "N selected".
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
  selection: BagSelection;
}) {
  const ordered = sortItems(items);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const [rove, setRove] = useState(0);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const hold = useHold((id) => {
    selection.add(id);
  });
  const count = selection.ids.size;
  // What a screen reader hears: the count, and a word when the selection ends.
  const before = useRef(0);
  useEffect(() => {
    before.current = count;
  }, [count]);
  const announced =
    count > 0 ? `${String(count)} selected` : before.current > 0 ? 'Selection cleared' : '';
  const at = Math.min(rove, ordered.length - 1);

  const focusTile = (index: number): void => {
    const to = Math.max(0, Math.min(ordered.length - 1, index));
    setRove(to);
    tiles.current[to]?.focus();
  };

  const nameOfItem = (item: GearItem): string => gearName(item.baseId);
  const menuItem = menu === null ? undefined : ordered.find((i) => i.id === menu.id);
  const menuIndex = menu === null ? -1 : ordered.findIndex((i) => i.id === menu.id);

  return (
    <>
      <ul
        class={selection.active ? 'item-grid bag-grid selecting' : 'item-grid bag-grid'}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Gear in your bag"
      >
        {ordered.map((item, index) => {
          const wearer = creatures.find((c) => c.id === item.equippedOn);
          const label = [
            nameOfItem(item),
            slotName(item.slot),
            `item level ${String(item.itemLevel)}`,
            rarityName(item.rarity),
            wearer === undefined ? null : `worn by ${creatureName(wearer)}`,
          ]
            .filter((part) => part !== null)
            .join(', ');
          const chosen = selection.has(item.id);
          return (
            <ItemTile
              key={item.id}
              item={item}
              label={label}
              selected={item.id === openId}
              wearer={wearer?.species ?? null}
              choice={{
                selecting: selection.active,
                chosen,
                holding: hold.holding === item.id,
                onCheck: () => {
                  selection.toggle(item.id);
                },
                checkLabel: `Select ${nameOfItem(item)}, item level ${String(item.itemLevel)}`,
              }}
              focusRef={(el) => {
                tiles.current[index] = el;
              }}
              buttonProps={{
                ...hold.bind(item.id),
                tabIndex: index === at ? 0 : -1,
                onFocus: () => {
                  setRove(index);
                },
                onContextMenu: (event) => {
                  // A press and hold is the selection gesture on a finger, so no menu opens for one.
                  event.preventDefault();
                  const kind = hold.lastKind();
                  if (kind === 'touch' || kind === 'pen') return;
                  const rect = tiles.current[index]?.getBoundingClientRect();
                  const typed = (event.clientX ?? 0) !== 0 || (event.clientY ?? 0) !== 0;
                  setMenu({
                    id: item.id,
                    x:
                      typed || rect === undefined
                        ? (event.clientX ?? 0)
                        : rect.left + rect.width / 2,
                    y:
                      typed || rect === undefined
                        ? (event.clientY ?? 0)
                        : rect.top + rect.height / 2,
                  });
                },
                onKeyDown: (event) => {
                  const cols = columnsOf(tiles.current);
                  const move: Record<string, number> = {
                    ArrowRight: index + 1,
                    ArrowLeft: index - 1,
                    ArrowDown: index + cols,
                    ArrowUp: index - cols,
                    Home: 0,
                    End: ordered.length - 1,
                  };
                  const to = move[event.key];
                  if (to !== undefined) {
                    event.preventDefault();
                    if (to >= 0 && to < ordered.length) focusTile(to);
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    onOpen(item.id);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    selection.toggle(item.id);
                  } else if (event.key === 'Escape' && selection.active) {
                    event.preventDefault();
                    event.stopPropagation();
                    selection.clear();
                  } else if (
                    event.key === 'ContextMenu' ||
                    (event.key === 'F10' && event.shiftKey)
                  ) {
                    event.preventDefault();
                    const rect = tiles.current[index]?.getBoundingClientRect();
                    setMenu({
                      id: item.id,
                      x: rect === undefined ? 0 : rect.left + rect.width / 2,
                      y: rect === undefined ? 0 : rect.top + rect.height / 2,
                    });
                  }
                },
                onKeyUp: (event) => {
                  // The click a Space key would make on release: the key already acted on keydown.
                  if (event.key === ' ') event.preventDefault();
                },
              }}
              onSelect={(keys) => {
                if (hold.swallowClick()) return;
                // The tile's body always opens the card; the checkbox (or Ctrl, Command, Shift) selects.
                if (keys.ctrlKey || keys.metaKey) selection.toggle(item.id);
                else if (keys.shiftKey) selection.range(item.id);
                else onOpen(item.id);
              }}
            />
          );
        })}
      </ul>
      <LiveRegion>{announced}</LiveRegion>
      {menu !== null && menuItem !== undefined && (
        <ItemMenu
          x={menu.x}
          y={menu.y}
          chosen={selection.has(menuItem.id)}
          name={nameOfItem(menuItem)}
          onInspect={() => {
            setMenu(null);
            onOpen(menuItem.id);
          }}
          onSelect={() => {
            setMenu(null);
            selection.toggle(menuItem.id);
            tiles.current[menuIndex]?.focus();
          }}
          onClose={(returnFocus) => {
            setMenu(null);
            if (returnFocus) tiles.current[menuIndex]?.focus();
          }}
        />
      )}
    </>
  );
}
