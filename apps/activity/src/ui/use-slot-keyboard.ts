import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { slotKeyTarget } from '../dnd-core';
import { pickUpAnnouncement, type Selection } from '../slot-outcome';

interface Args {
  /** The strip holding the `[data-slot]` buttons. */
  stripRef: RefObject<HTMLElement>;
  selected: Selection;
  /** True while a move is being sent: the buttons are disabled, and focus returns when it ends. */
  busy: boolean;
  /** Up and down move between the lines of a strip that wraps; off for a single row. */
  vertical: boolean;
  /**
   * Where a key moves from a slot, when the strip has its own map (the raid board: left and right in
   * a row, up and down in a lane). Null: the key does nothing. Without it the keys follow the order
   * and the position of the buttons (`slotKeyTarget`).
   */
  keyTarget?: (current: number, key: string) => number | null;
  /**
   * Where the cursor starts when an arrow key is pressed on a tray chip while a creature is picked
   * up. Without it the arrow keys only work once a slot has focus.
   */
  cursorStart?: () => number;
  /** Escape with a creature picked up. */
  onCancel: () => void;
}

/**
 * Keyboard placement for a slot strip: Enter or Space on a creature picks it up, the arrow keys
 * (Home and End too) walk the slots, Enter or Space on a slot drops it and Escape cancels. Returns
 * the `onKeyDown` handler for the element around the tray and the strip. Focus goes back to the slot
 * after a drop, once the buttons are enabled again.
 */
export function useSlotKeyboard(args: Args): (event: KeyboardEvent) => void {
  const { stripRef, selected, busy } = args;
  /** Slot to focus again once a keyboard drop has finished (buttons are disabled meanwhile). */
  const refocus = useRef<number | null>(null);

  useEffect(() => {
    if (busy || refocus.current === null) return;
    const slot = refocus.current;
    refocus.current = null;
    stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(slot)}"]`)?.focus();
  }, [busy]);

  return (event) => {
    if (event.key === 'Escape') {
      if (selected !== null) args.onCancel();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    const control = target?.closest<HTMLElement>('[data-slot], .team-chip') ?? null;
    if (control === null) return;
    const onSlot = control.dataset.slot !== undefined;
    if (event.key === 'Enter' || event.key === ' ') {
      if (selected !== null && onSlot) refocus.current = Number(control.dataset.slot);
      return;
    }
    // Arrow keys walk along the slots: always when a slot has focus, and (where there is a cursor
    // start) while carrying a creature from the tray.
    if (!onSlot && (args.cursorStart === undefined || selected === null)) return;
    const buttons = [...(stripRef.current?.querySelectorAll<HTMLElement>('[data-slot]') ?? [])];
    const current = onSlot ? Number(control.dataset.slot) : (args.cursorStart?.() ?? 0);
    const to =
      args.keyTarget !== undefined
        ? args.keyTarget(current, event.key)
        : slotKeyTarget(
            buttons.map((b) => ({ slot: Number(b.dataset.slot), rect: b.getBoundingClientRect() })),
            current,
            event.key,
            args.vertical,
          );
    if (to === null) return;
    // Only a key that moves focus is swallowed, so the page still scrolls when there is nowhere to go.
    event.preventDefault();
    buttons.find((b) => Number(b.dataset.slot) === to)?.focus();
  };
}

/**
 * The text for the screen reader live region: it says who was picked up (by tap or key) and what each
 * drop or cancel did. `announce` sets any other sentence.
 */
export function useSlotAnnouncer(
  selected: Selection,
  nameOf: (id: string) => string,
): [string, (text: string) => void] {
  const [announcement, announce] = useState('');
  useEffect(() => {
    if (selected !== null) announce(pickUpAnnouncement(nameOf(selected)));
  }, [selected]);
  return [announcement, announce];
}
