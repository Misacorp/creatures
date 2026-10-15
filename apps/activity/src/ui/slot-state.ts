import type { SlotButtonProps, SlotModel, SlotRowProps } from './SlotRow';

/** What a slot button needs besides its model: the state of the whole strip, as it concerns this slot. */
export function slotState(
  props: Pick<
    SlotRowProps,
    'emptyLabel' | 'disabled' | 'selected' | 'drag' | 'statuses' | 'cues' | 'onHoverSlot' | 'onTap'
  >,
  slot: SlotModel,
): Omit<SlotButtonProps, 'slot' | 'scale'> {
  const { drag, selected, statuses } = props;
  const dragging = drag.drag?.creatureId ?? null;
  return {
    emptyLabel: props.emptyLabel,
    disabled: props.disabled,
    selected,
    hasSelection: (dragging ?? selected) !== null,
    status: statuses?.get(slot.index) ?? null,
    over: drag.drag?.over?.kind === 'slot' && drag.drag.over.slot === slot.index,
    shaking: drag.shakeSlot === slot.index,
    dragging,
    cue: props.cues?.get(slot.index),
    onHover: props.onHoverSlot,
    onPointerDown: drag.startDrag,
    onTap: props.onTap,
  };
}
