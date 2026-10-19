import { useState } from 'preact/hooks';
import { campHp, campSlotLabel, tapToSwap, type CampRowCreature } from './dungeon-run';
import type { Slots } from './dungeon-team';
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
 * the creature. A creature is moved by dragging it onto another (a finger needs a short press and hold,
 * so a swipe still scrolls the page) or, for anyone who cannot drag, by tapping it and then another one
 * (the picked-up one is framed). Keyboard users walk with the arrow keys and press Enter on two
 * creatures. The server checks the order again when the choice is sent; this only builds it.
 */
export function CampRow({ creatures, disabled, onChange }: Props) {
  /** The creature picked up by a tap (waiting for the one to swap with). */
  const [selected, setSelected] = useState<string | null>(null);

  const ids = creatures.map((c) => c.id);
  const slots = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null] as const satisfies Slots;
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? 'Creature';

  const board = useSingleRowBoard({
    slots,
    byId,
    nameOf,
    disabled,
    // The cues read the row as it would stand: the creature carried (or picked up) and where it hovers.
    carried: selected,
    onDropped: () => {
      setSelected(null);
    },
    onSlots: (next) => {
      onChange(next.filter((id): id is string => id !== null));
    },
  });

  const model = (index: number): SlotModel => {
    const creature = byId.get(slots[index] ?? '');
    if (creature === undefined) {
      return { index, ariaLabel: emptySlotLabel(index), occupant: null };
    }
    return {
      index,
      ariaLabel: campSlotLabel(creature, index, selected === creature.id),
      selected: selected === creature.id,
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

  /** A tap on a tile: pick the creature up, put it down, or swap it with the one picked up. */
  function tapSlot(slot: number): void {
    if (board.dragDrop.consumeClick()) return;
    const id = slots[slot] ?? null;
    if (id === null) return;
    const result = tapToSwap(ids, selected, id);
    board.setHint(null);
    setSelected(result.selected);
    if (result.selected !== null) {
      board.announce(`${nameOf(id)} picked up. Tap another creature to swap places.`);
    } else if (selected === id) {
      board.announce(`${nameOf(id)} put down.`);
    } else {
      board.announce(`Swapped ${nameOf(selected ?? '')} with ${nameOf(id)}.`);
      onChange(result.order);
    }
  }

  return (
    <SingleRowBoard
      row={board}
      class="camp-row"
      label="Your team, left to right. You can change the order."
      emptyLabel=""
      disabled={disabled}
      model={model}
      onTap={tapSlot}
    />
  );
}
