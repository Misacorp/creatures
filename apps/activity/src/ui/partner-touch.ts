/**
 * The events that make a creature "touched" for the reaction-partner highlight, for a button that has no touch handling of its own (a
 * tray creature, a stander in the Cave): the pointer over it (a mouse or a pen: a finger does not hover) or the keyboard focus on it
 * (`:focus-visible`, so a click that focuses the button does not count). The board's seats report the same through `onHoverSlot`.
 */
export interface PartnerTouchProps {
  onPointerEnter: (event: PointerEvent) => void;
  onPointerLeave: (event: PointerEvent) => void;
  onFocus: (event: FocusEvent) => void;
  onBlur: () => void;
}

/** The handlers for the creature `id`; `touch` is told its id on touch and null when it ends. */
export function partnerTouchProps(
  touch: ((id: string | null) => void) | undefined,
  id: string,
): Partial<PartnerTouchProps> {
  if (touch === undefined) return {};
  return {
    onPointerEnter: (event) => {
      if (event.pointerType !== 'touch') touch(id);
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== 'touch') touch(null);
    },
    onFocus: (event) => {
      if (event.currentTarget instanceof Element && event.currentTarget.matches(':focus-visible'))
        touch(id);
    },
    onBlur: () => {
      touch(null);
    },
  };
}
