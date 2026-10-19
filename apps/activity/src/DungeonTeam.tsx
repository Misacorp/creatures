import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  ROW_PLACES,
  ROW_PLACE_NAMES,
  place,
  placedCount,
  slotIndexOf,
  unplace,
  type Slots,
} from './dungeon-team';
import { ORDER_LINE } from './dungeon-text';
import { creatureName, getSpecies, speciesName } from './game';
import { GlossaryTag } from './Glossary';
import { usePopoverHost } from './PopoverHost';
import {
  IN_TEAM_NOTE,
  SHOW_PICKER_EFFECTS,
  dungeonPickerOptions,
  pickerTitle,
  placedLine,
  type PickerCreature,
} from './roster-picker';
import { PlacedCount } from './ui/PlacedCount';
import { RosterPicker } from './ui/RosterPicker';
import type { SlotModel } from './ui/SlotButton';
import { SingleRowBoard } from './SingleRowBoard';
import { emptySlotLabel, useSingleRowBoard } from './use-single-row-board';

interface Props {
  /** Everything the player owns: the picker offers these. */
  creatures: readonly PickerCreature[];
  slots: Slots;
  /** True while the run is being sent: the tiles are switched off. */
  disabled: boolean;
  onChange: (slots: Slots) => void;
  /** What follows the count inside the same block (the Enter button), centred like the rest. */
  children?: ComponentChildren;
}

/**
 * The dungeon team on the Raid Roster's board, in its single-row mode: three places, left to right,
 * centred, and the order is the choice. Below the board: the count with its check (right under the
 * tiles), the order line (quiet), then `children`. There is no title or section of its own: it sits at the end of the daily
 * dungeon card. Tapping an empty place (or pressing Enter on it) opens the creature
 * picker; tapping a creature opens its popover with "Remove from team"; creatures are moved by
 * dragging them (a finger needs a short press and hold, so a swipe still scrolls the page), and
 * dropping one on another swaps the two. Keyboard users move creatures with the picker. The server
 * checks the team again when the run starts.
 */
export function DungeonTeam(props: Props) {
  const { creatures, slots, disabled } = props;
  const popovers = usePopoverHost();
  /** The empty slot the picker is open for. */
  const [picking, setPicking] = useState<number | null>(null);

  const byId = new Map(creatures.map((c) => [c.id, c]));
  const nameOf = (id: string): string => {
    const c = byId.get(id);
    return c === undefined ? 'Creature' : creatureName(c);
  };
  const placed = placedCount(slots);

  // The picker closes by itself when the run is sent under it.
  useEffect(() => {
    if (disabled) setPicking(null);
  }, [disabled]);

  // The cues read the creature in focus: carried, whose popover is open, or under the pointer.
  const inspectedSlot = popovers?.anchor?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
  const board = useSingleRowBoard({
    slots,
    byId,
    nameOf,
    disabled,
    inspected: inspectedSlot === undefined ? null : Number(inspectedSlot),
    onSlots: props.onChange,
  });
  const { stripRef, dragging } = board;

  // A drag starting (after the hold, for a finger) closes any open popover at once, the one of the
  // creature being carried included, so it cannot sit over the board while a creature is moved.
  useEffect(() => {
    if (dragging !== null) popovers?.close();
  }, [dragging === null]);

  const model = (index: number): SlotModel => {
    const spot = ROW_PLACE_NAMES[ROW_PLACES[index] ?? 'left'];
    const creature = byId.get(slots[index] ?? '');
    if (creature === undefined) {
      return {
        index,
        ariaLabel: emptySlotLabel(index, disabled ? undefined : 'Choose a creature.'),
        occupant: null,
      };
    }
    return {
      index,
      ariaLabel: `${spot} slot, ${creatureName(creature)}, ${speciesName(creature.species)} level ${String(creature.level)}`,
      occupant: {
        species: creature.species,
        name: creatureName(creature),
        level: creature.level,
        ownId: creature.id,
        mine: true,
        element: getSpecies(creature.species)?.element ?? 'unknown',
      },
    };
  };

  /**
   * A tap on a tile. An empty one opens the picker; a creature opens its popover with a "Remove from
   * team" button.
   */
  function tapSlot(slot: number, button: HTMLElement): void {
    if (board.dragDrop.consumeClick()) return;
    const id = slots[slot] ?? null;
    const creature = id === null ? undefined : byId.get(id);
    if (id === null || creature === undefined) {
      board.setHint(null);
      setPicking(slot);
      return;
    }
    const species = getSpecies(creature.species);
    if (species === undefined || popovers === null) return;
    const line = board.effectOf(slots, slot);
    popovers.openCreature(
      `dungeon-slot:${String(slot)}`,
      {
        name: creatureName(creature),
        species: creature.species,
        level: creature.level,
        element: species.element,
        role: species.role,
        ...(line === null ? {} : { effect: line }),
      },
      button,
      {
        label: 'Remove from team',
        onAct: () => {
          board.setHint(null);
          board.announce(`${nameOf(id)} removed from the team.`);
          props.onChange(unplace(slots, id));
        },
      },
    );
  }

  function pick(creatureId: string): void {
    if (picking === null) return;
    const slot = picking;
    // The picker only opens for an empty place, so a new creature always has room; a creature of the
    // team moves here and leaves its old place empty.
    if (slotIndexOf(slots, creatureId) === null && placed >= ROW_PLACES.length) return;
    setPicking(null);
    board.setHint(null);
    board.announce(`${nameOf(creatureId)} placed in the ${ROW_PLACES[slot] ?? ''} slot.`);
    props.onChange(place(slots, creatureId, slot));
  }

  return (
    <SingleRowBoard
      row={board}
      class="dungeon-team"
      label="Your team, left to right"
      emptyLabel="Add"
      disabled={disabled}
      model={model}
      onTap={tapSlot}
      underBoard={<PlacedCount placed={placed} />}
      after={
        picking !== null && (
          <RosterPicker
            title={pickerTitle(`the ${ROW_PLACES[picking] ?? ''} slot`)}
            status={placedLine(placed)}
            options={dungeonPickerOptions({
              creatures,
              slots,
              slot: picking,
              showEffects: SHOW_PICKER_EFFECTS,
            })}
            showEffects={SHOW_PICKER_EFFECTS}
            placedNote={IN_TEAM_NOTE}
            anchor={() =>
              stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(picking)}"]`) ??
              null
            }
            onPick={pick}
            onClose={() => {
              setPicking(null);
            }}
          />
        )
      }
    >
      <p class="muted dungeon-order-line">
        <GlossaryTag entry="dungeon-row">{ORDER_LINE}</GlossaryTag>
      </p>
      {props.children}
    </SingleRowBoard>
  );
}
