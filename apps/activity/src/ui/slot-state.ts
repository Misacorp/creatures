import type { SlotButtonProps, SlotModel, SlotStripProps } from './SlotButton';

/** What a slot button needs besides its model: the state of the whole strip, as it concerns this slot. */
export function slotState(
  props: SlotStripProps,
  slot: SlotModel,
): Omit<SlotButtonProps, 'slot' | 'scale'> {
  const { drag, statuses } = props;
  return {
    emptyLabel: props.emptyLabel,
    disabled: props.disabled,
    status: statuses?.get(slot.index) ?? null,
    over: drag.drag?.over?.slot === slot.index,
    shaking: drag.shakeSlot === slot.index,
    dragging: drag.drag?.creatureId ?? null,
    cue: props.cues?.get(slot.index),
    onHover: props.onHoverSlot,
    onPointerDown: drag.startDrag,
    onTap: props.onTap,
  };
}
