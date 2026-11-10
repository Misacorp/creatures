import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * The keyboard of a pick list (`role="listbox"` with `role="option"` rows): one tab stop that moves with the arrow keys,
 * Home and End, Enter or Space choosing the row that has it. The creature list, the depth list and the stamp list all use it.
 * Give the `<ul>` `ref={listRef}` and `onKeyDown`, and each option `tabIndex={index === active ? 0 : -1}`. On mount the first
 * row (`initial`) takes focus; with `center` it is scrolled into the middle first (a long list that starts where the player is).
 */
export function useRovingList({
  count,
  initial,
  center = false,
  onChoose,
}: {
  /** How many rows the list has. */
  count: number;
  /** The row that starts with the focus. */
  initial: number;
  center?: boolean;
  /** Enter or Space on a row (the caller decides whether that row can be chosen). */
  onChoose: (index: number) => void;
}): {
  listRef: RefObject<HTMLUListElement | null>;
  active: number;
  onKeyDown: (event: KeyboardEvent) => void;
  /** Moves the tab stop to a row and focuses it (a click on a row that cannot be chosen keeps the focus there). */
  focusRow: (index: number) => void;
} {
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(initial);
  function focusOption(index: number, scroll: boolean): void {
    setActive(index);
    const el = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index];
    if (el === undefined) return;
    if (scroll) el.scrollIntoView?.({ block: 'center' });
    el.focus({ preventScroll: scroll });
  }
  useEffect(() => {
    focusOption(active, center);
  }, []);
  function onKeyDown(event: KeyboardEvent): void {
    const last = count - 1;
    const keys: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    const to = keys[event.key];
    if (to !== undefined) {
      event.preventDefault();
      focusOption(to, false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChoose(active);
    }
  }
  return {
    listRef,
    active,
    onKeyDown,
    focusRow: (index) => {
      focusOption(index, false);
    },
  };
}
