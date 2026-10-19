import type { RefObject } from 'preact';

interface Args {
  /** The strip holding the `[data-slot]` buttons. */
  stripRef: RefObject<HTMLElement | null>;
  /**
   * Where a key moves from a slot: left and right in a row, up and down in a lane on the raid board.
   * Null: the key does nothing.
   */
  keyTarget: (current: number, key: string) => number | null;
}

/**
 * Keyboard walking for a slot board: once a slot has focus the arrow keys (Home and End too) move
 * focus to another slot. Enter or Space on a slot is a plain button press: an empty slot opens the
 * creature picker, a creature opens its popover. Returns the `onKeyDown` handler for the element
 * around the board.
 */
export function useSlotKeyboard(args: Args): (event: KeyboardEvent) => void {
  const { stripRef } = args;
  return (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const control = target?.closest<HTMLElement>('[data-slot]') ?? null;
    if (control === null) return;
    const to = args.keyTarget(Number(control.dataset.slot), event.key);
    if (to === null) return;
    // Only a key that moves focus is swallowed, so the page still scrolls when there is nowhere to go.
    event.preventDefault();
    stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(to)}"]`)?.focus();
  };
}
