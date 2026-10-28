import { useState } from 'preact/hooks';

/**
 * A selection of several things in a list (decisions.md, 2026-10-27, "Bulk selection replaces marking"; shared since
 * 2026-10-28, the Workshop bag is the first user): the ids the player picked and the last one they toggled (where a
 * Shift-click range starts). It lives only on the client; nothing is stored or sent until an action (Dismantle) names
 * the things. Selecting is a mode: it is on while at least one thing is selected, so deselecting the last one ends it.
 * `useMultiSelect` holds it for a page; `useSelectGrid` wires a list's gestures to it; `BulkBar` shows its actions.
 */
export interface Selection {
  readonly ids: ReadonlySet<string>;
  /** The item last toggled by a click or a tap, or null. */
  readonly anchor: string | null;
}

export const NO_SELECTION: Selection = { ids: new Set(), anchor: null };

/** Flips one item and makes it the anchor of the next range. */
export function toggled(selection: Selection, id: string): Selection {
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, anchor: id };
}

/** Selects one item without flipping it (a long press, "Select"): already selected stays selected. */
export function withItem(selection: Selection, id: string): Selection {
  const ids = new Set(selection.ids);
  ids.add(id);
  return { ids, anchor: id };
}

/**
 * Shift-click: adds every item from the anchor to `id` in the grid's shown order (`order`, both ends included),
 * and keeps the anchor. With no anchor, or one that is no longer in the list, it is just `id`.
 */
export function rangeTo(selection: Selection, id: string, order: readonly string[]): Selection {
  const to = order.indexOf(id);
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  if (to < 0) return selection;
  if (from < 0) return withItem(selection, id);
  const ids = new Set(selection.ids);
  for (const between of order.slice(Math.min(from, to), Math.max(from, to) + 1)) ids.add(between);
  return { ids, anchor: selection.anchor };
}

/** The selection without ids that are not in `valid` any more (a thing left the list: an item was dismantled). */
export function pruned(selection: Selection, valid: ReadonlySet<string>): Selection {
  const ids = [...selection.ids].filter((id) => valid.has(id));
  if (ids.length === selection.ids.size) {
    return selection.anchor === null || valid.has(selection.anchor)
      ? selection
      : { ids: selection.ids, anchor: null };
  }
  return {
    ids: new Set(ids),
    anchor: selection.anchor !== null && valid.has(selection.anchor) ? selection.anchor : null,
  };
}

/** The keys held down at a click (a Ctrl or Command click toggles, a Shift click takes a range). */
export interface ClickKeys {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** What a list needs of its page's selection (`useMultiSelect`). */
export type MultiSelect = ReturnType<typeof useMultiSelect>;

/**
 * The selection's state and moves for a list whose things are `order` (ids, in the shown order). `initial` is the
 * selection a page opens with (the workbench shows one); the game starts with none. Ids that leave `order` drop out
 * of the selection by themselves.
 */
export function useMultiSelect(
  order: readonly string[],
  initial: readonly string[] = [],
): {
  /** The selected ids that are still in the list. */
  ids: ReadonlySet<string>;
  /** Whether the selection mode is on (something is selected). */
  active: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Selects the item and starts the mode (a long press, the corner checkbox's first tap, "Select"). */
  add: (id: string) => void;
  range: (id: string) => void;
  clear: () => void;
} {
  const [raw, setRaw] = useState<Selection>(() =>
    initial.length === 0
      ? NO_SELECTION
      : { ids: new Set(initial), anchor: initial[initial.length - 1] ?? null },
  );
  const valid = new Set(order);
  const selection = pruned(raw, valid);
  return {
    ids: selection.ids,
    active: selection.ids.size > 0,
    has: (id) => selection.ids.has(id),
    toggle: (id) => {
      setRaw((now) => toggled(pruned(now, valid), id));
    },
    add: (id) => {
      setRaw((now) => withItem(pruned(now, valid), id));
    },
    range: (id) => {
      setRaw((now) => rangeTo(pruned(now, valid), id, order));
    },
    clear: () => {
      setRaw(NO_SELECTION);
    },
  };
}
