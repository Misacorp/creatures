import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { LiveRegion } from './LiveRegion';
import { useHold } from './long-press';
import type { ClickKeys, MultiSelect } from './multi-select';
import { SelectMenu } from './SelectMenu';

/** How many tiles sit in the first row (the arrow keys' Up and Down move by a row). */
function columnsOf(tiles: readonly (HTMLElement | null)[]): number {
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
 * The one gesture set for selecting several things in a list or grid (decisions.md, 2026-10-27, "Bulk selection
 * replaces marking"; `docs/design/ux-patterns.md`, "Bulk actions"). Every list where several things can be acted on
 * uses it, so they all behave the same; the Workshop bag (`InventoryGrid`) is the first. The page holds the selection
 * (`useMultiSelect`) and shows its actions in a `BulkBar`; the list draws its own tiles and wires them with this hook:
 *
 * - A tap or click on a tile opens the thing's card (`onOpen`), selecting or not (the card opens over the selection).
 *   The tile's `SelectCheck` (in its top left corner) toggles it instead.
 * - Touch: press and hold ~450 ms selects the thing and starts selecting (`useHold`: the tile gets `holding` for its
 *   cue, the device buzzes, scrolling stays native, and the click after the hold is swallowed).
 * - Mouse: the checkbox shows on hover. Ctrl or Command click toggles, Shift click adds the range from the last
 *   toggled thing (in `order`), a right click opens `SelectMenu` (Inspect, Select; an extra, the other ways always
 *   work). A finger's long press never opens that menu.
 * - Keyboard: arrows (with Home and End) move one tab stop around the grid (roving tabindex), Enter opens the card,
 *   Space toggles, Escape clears the selection and ends the mode, the menu key (or Shift F10) opens the menu. A polite
 *   live region says "N selected".
 *
 * How to draw the list: spread `listProps` on the `<ul>` and add `listClass` to its classes (the CSS of
 * `select-grid.css` keys on them); each tile is an `<li role="presentation">` holding the tile's `<button>` (spread
 * `optionProps(id, index)` on it, pass `tileRef(index)` as its ref, call `click(id, keys)` from its click) and, beside
 * it, a `SelectCheck`. Render `overlay` after the list. The tile's own chosen and holding look (a ring, the hold cue)
 * belongs to the tile's stylesheet, since every kind of tile has its own frame.
 */
export function useSelectGrid({
  order,
  selection,
  onOpen,
  label,
  nameOf,
}: {
  /** The ids of the things, in the order they are shown. */
  order: readonly string[];
  /** The page's selection (`useMultiSelect`). */
  selection: MultiSelect;
  /** Open the thing's card (a tap on the tile, Enter, the menu's Inspect). */
  onOpen: (id: string) => void;
  /** The list's spoken name ("Gear in your bag"). */
  label: string;
  /** A thing's name, for the menu's spoken label. */
  nameOf: (id: string) => string;
}): {
  /** Spread on the list (`<ul>`). */
  listProps: {
    role: 'listbox';
    'aria-multiselectable': 'true';
    'aria-label': string;
  };
  /** Add to the list's classes: `select-grid`, and `selecting` while the mode is on. */
  listClass: string;
  /** Spread on the tile's button: the role, the long press, the roving tabindex, the keys and the right click. */
  optionProps: (id: string, index: number) => JSX.IntrinsicElements['button'];
  /** The tile button's ref. */
  tileRef: (index: number) => (el: HTMLButtonElement | null) => void;
  /** The tile's click: opens the card, or toggles (Ctrl, Command) or takes a range (Shift). */
  click: (id: string, keys: ClickKeys) => void;
  /** The id whose long press is being held (its tile plays the cue), or null. */
  holding: string | null;
  /** Render after the list: the spoken count and the right click's menu. */
  overlay: ComponentChildren;
} {
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
  const at = Math.min(rove, order.length - 1);

  const focusTile = (index: number): void => {
    const to = Math.max(0, Math.min(order.length - 1, index));
    setRove(to);
    tiles.current[to]?.focus();
  };
  const menuAt = (index: number, id: string): void => {
    const rect = tiles.current[index]?.getBoundingClientRect();
    setMenu({
      id,
      x: rect === undefined ? 0 : rect.left + rect.width / 2,
      y: rect === undefined ? 0 : rect.top + rect.height / 2,
    });
  };

  const menuIndex = menu === null ? -1 : order.indexOf(menu.id);

  return {
    listProps: { role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': label },
    listClass: selection.active ? 'select-grid selecting' : 'select-grid',
    optionProps: (id, index) => ({
      ...hold.bind(id),
      role: 'option',
      'aria-selected': selection.has(id),
      tabIndex: index === at ? 0 : -1,
      onFocus: () => {
        setRove(index);
      },
      onContextMenu: (event) => {
        // A press and hold is the selection gesture on a finger, so no menu opens for one.
        event.preventDefault();
        const kind = hold.lastKind();
        if (kind === 'touch' || kind === 'pen') return;
        // A menu key's event has no position: the menu then opens over the tile.
        const typed = (event.clientX ?? 0) !== 0 || (event.clientY ?? 0) !== 0;
        if (typed) setMenu({ id, x: event.clientX, y: event.clientY });
        else menuAt(index, id);
      },
      onKeyDown: (event) => {
        const cols = columnsOf(tiles.current);
        const move: Record<string, number> = {
          ArrowRight: index + 1,
          ArrowLeft: index - 1,
          ArrowDown: index + cols,
          ArrowUp: index - cols,
          Home: 0,
          End: order.length - 1,
        };
        const to = move[event.key];
        if (to !== undefined) {
          event.preventDefault();
          if (to >= 0 && to < order.length) focusTile(to);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(id);
        } else if (event.key === ' ') {
          event.preventDefault();
          selection.toggle(id);
        } else if (event.key === 'Escape' && selection.active) {
          event.preventDefault();
          event.stopPropagation();
          selection.clear();
        } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault();
          menuAt(index, id);
        }
      },
      onKeyUp: (event) => {
        // The click a Space key would make on release: the key already acted on keydown.
        if (event.key === ' ') event.preventDefault();
      },
    }),
    tileRef: (index) => (el) => {
      tiles.current[index] = el;
    },
    click: (id, keys) => {
      if (hold.swallowClick()) return;
      // The tile's body always opens the card; the checkbox (or Ctrl, Command, Shift) selects.
      if (keys.ctrlKey || keys.metaKey) selection.toggle(id);
      else if (keys.shiftKey) selection.range(id);
      else onOpen(id);
    },
    holding: hold.holding,
    overlay: (
      <>
        <LiveRegion>{announced}</LiveRegion>
        {menu !== null && menuIndex >= 0 && (
          <SelectMenu
            x={menu.x}
            y={menu.y}
            chosen={selection.has(menu.id)}
            name={nameOf(menu.id)}
            onInspect={() => {
              setMenu(null);
              onOpen(menu.id);
            }}
            onSelect={() => {
              setMenu(null);
              selection.toggle(menu.id);
              tiles.current[menuIndex]?.focus();
            }}
            onClose={(returnFocus) => {
              setMenu(null);
              if (returnFocus) tiles.current[menuIndex]?.focus();
            }}
          />
        )}
      </>
    ),
  };
}
