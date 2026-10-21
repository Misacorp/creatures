import { useEffect } from 'preact/hooks';
import { campHp, campSlotLabel, type CampRowCreature } from './dungeon-run';
import type { Slots } from './dungeon-team';
import { usePopoverHost } from './PopoverHost';
import { SingleRowBoard } from './SingleRowBoard';
import type { SlotModel } from './ui/SlotButton';
import { emptySlotLabel, useSingleRowBoard } from './use-single-row-board';

interface Props {
  /** The row now, left to right, each with its HP (null HP: a creature that has just come in, at full HP). */
  creatures: readonly CampRowCreature[];
  /** True while an act is on its way: the tiles are switched off. */
  disabled: boolean;
  /** The row in its new order (the ids, left to right). */
  onChange: (order: string[]) => void;
}

/**
 * The camp's row, on the same board as the dungeon entry (`RaidBoard`, single large row, with the same
 * slot tiles, drag and drop, and reaction cues), with each creature's HP under it: the HP moves with
 * the creature. A creature is moved only by dragging it onto another (a finger needs a short press and
 * hold, so a swipe still scrolls the page). A tap never moves anything: it opens the creature's popover
 * (role, element, what it does in this order and its gear, locked). The server checks the order again
 * when the choice is sent; this only builds it.
 */
export function CampRow({ creatures, disabled, onChange }: Props) {
  const popovers = usePopoverHost();
  const ids = creatures.map((c) => c.id);
  const slots = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null] as const satisfies Slots;
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? 'Creature';

  // The cues read the creature whose popover is open, as on the dungeon's team.
  const inspectedSlot = popovers?.anchor?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
  const board = useSingleRowBoard({
    slots,
    byId,
    nameOf,
    disabled,
    inspected: inspectedSlot === undefined ? null : Number(inspectedSlot),
    onSlots: (next) => {
      onChange(next.filter((id): id is string => id !== null));
    },
  });
  const { dragging } = board;

  // A drag starting closes any open popover at once, so it cannot sit over the board while a creature moves.
  useEffect(() => {
    if (dragging !== null) popovers?.close();
  }, [dragging === null]);

  const model = (index: number): SlotModel => {
    const creature = byId.get(slots[index] ?? '');
    if (creature === undefined) {
      return { index, ariaLabel: emptySlotLabel(index), occupant: null };
    }
    return {
      index,
      ariaLabel: campSlotLabel(creature, index),
      occupant: {
        species: creature.species,
        name: creature.name,
        level: creature.level,
        ownId: creature.id,
        mine: true,
        element: creature.element,
        hp: campHp(creature.hp),
      },
    };
  };

  /** A tap on a tile opens (or closes) the creature's popover; it never changes the order. */
  function tapSlot(slot: number, button: HTMLElement): void {
    if (board.dragDrop.consumeClick()) return;
    const creature = byId.get(slots[slot] ?? '');
    if (creature === undefined || popovers === null) return;
    board.setHint(null);
    const line = board.effectOf(slots, slot);
    popovers.openCreature(
      `camp-slot:${String(slot)}`,
      {
        name: creature.name,
        species: creature.species,
        level: creature.level,
        element: creature.element,
        role: creature.role,
        ...(line === null ? {} : { effect: line }),
        ...(creature.gear.length === 0 ? {} : { gear: creature.gear }),
      },
      button,
    );
  }

  return (
    <SingleRowBoard
      row={board}
      class="camp-row"
      label="Your team, left to right. Drag a creature onto another to swap places."
      emptyLabel=""
      disabled={disabled}
      model={model}
      onTap={tapSlot}
    />
  );
}
