import { useEffect, useRef, useState } from 'preact/hooks';
import { TOUCH_HOLD_MS } from './dnd-core';
import {
  ROW_PLACES,
  ROW_PLACE_NAMES,
  orderHint,
  place,
  placedCount,
  resolveDrop,
  slotIndexOf,
  slotStatuses,
  unplace,
  type Slots,
} from './dungeon-team';
import { ORDER_LINE } from './dungeon-text';
import { boardKeyTarget, type BoardRow } from './raid-board';
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
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { PlacedCount } from './ui/PlacedCount';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import { RosterPicker } from './ui/RosterPicker';
import type { SlotModel } from './ui/SlotButton';
import { affectSlotOf, cuesFor, effectLine, sceneOf } from './ui/slot-cue';
import { useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';

/** The one row of the board: the dungeon's three places, left to right. */
const ROW: BoardRow = { zone: 'front', slots: ROW_PLACES.map((_, index) => index) };

interface Props {
  /** Everything the player owns: the picker offers these. */
  creatures: readonly PickerCreature[];
  slots: Slots;
  /** True while the run is being sent: the tiles are switched off. */
  disabled: boolean;
  onChange: (slots: Slots) => void;
}

/**
 * The dungeon team on the Raid Roster's board, in its single-row mode: three places, left to right,
 * and the order is the choice. Tapping an empty place (or pressing Enter on it) opens the creature
 * picker; tapping a creature opens its popover with "Remove from team"; creatures are moved by
 * dragging them (a finger needs a short press and hold, so a swipe still scrolls the page), and
 * dropping one on another swaps the two. Keyboard users move creatures with the picker. The server
 * checks the team again when the run starts.
 */
export function DungeonTeam(props: Props) {
  const { creatures, slots, disabled } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const popovers = usePopoverHost();
  /** The slot under the mouse or the keyboard focus. */
  const [hovered, setHovered] = useState<number | null>(null);
  /** The empty slot the picker is open for. */
  const [picking, setPicking] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');

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

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    touchHoldMs: TOUCH_HOLD_MS,
    onDrop: (creatureId, target) => {
      const { slots: next, outcome } = resolveDrop(slots, creatureId, target, nameOf);
      announce(outcome.announce);
      setHint(outcome.hint);
      if (next !== slots) props.onChange(next);
      return outcome;
    },
  });
  const { drag, consumeClick } = dragDrop;

  const onKeyDown = useSlotKeyboard({
    stripRef,
    keyTarget: (current, key) => boardKeyTarget([ROW], current, key),
  });

  const dragging = drag?.creatureId ?? null;

  // A drag starting (after the hold, for a finger) closes any open popover at once, the one of the
  // creature being carried included, so it cannot sit over the board while a creature is moved.
  useEffect(() => {
    if (dragging !== null) popovers?.close();
  }, [dragging === null]);

  const statuses = dragging === null ? null : slotStatuses(slots, dragging, nameOf);
  const dragged = dragging === null ? undefined : byId.get(dragging);

  // The row as the cues read it: each creature's role and element, from the content.
  const affectRowOf = (keys: readonly (string | null)[]) =>
    keys.map((id) => {
      const c = id === null ? undefined : byId.get(id);
      return c === undefined ? null : affectSlotOf(getSpecies(c.species));
    });
  const mode = { row: 'dungeon' } as const;

  // The cues: the creature in focus (carried, whose popover is open, or under the pointer) and the
  // row as it would stand.
  const inspectedSlot = popovers?.anchor?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
  const scene = sceneOf({
    keys: slots,
    carried: dragging,
    pointer: drag?.over?.slot ?? hovered,
    inspected: inspectedSlot === undefined ? null : Number(inspectedSlot),
  });
  const affectRow = affectRowOf(scene.keys);
  const cues = cuesFor({ row: affectRow, mode, focus: scene.focus, scope: 'row' });
  const effectOf = (keys: readonly (string | null)[], focus: number): string | null =>
    effectLine({
      row: affectRowOf(keys),
      mode,
      focus,
      nameOf: (slot) => nameOf(keys[slot] ?? ''),
    });
  const effect = scene.focus === null ? null : effectOf(scene.keys, scene.focus);

  // Only a full team has an order to judge. The names are the player's own: text only.
  const team = slots.flatMap((id) => {
    const c = byId.get(id ?? '');
    return c === undefined ? [] : [c];
  });
  const reactionHint =
    team.length === slots.length
      ? orderHint(team.map((c) => ({ name: creatureName(c), species: c.species })))
      : null;

  const model = (index: number): SlotModel => {
    const spot = ROW_PLACE_NAMES[ROW_PLACES[index] ?? 'left'];
    const creature = byId.get(slots[index] ?? '');
    if (creature === undefined) {
      return {
        index,
        ariaLabel: disabled ? `${spot} slot, empty` : `${spot} slot, empty. Choose a creature.`,
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
  const rows: BoardRowModel[] = [
    { zone: ROW.zone, name: 'Team', label: null, slots: ROW.slots.map(model) },
  ];

  /**
   * A tap on a tile. An empty one opens the picker; a creature opens its popover with a "Remove from
   * team" button.
   */
  function tapSlot(slot: number, button: HTMLElement): void {
    if (consumeClick()) return;
    const id = slots[slot] ?? null;
    const creature = id === null ? undefined : byId.get(id);
    if (id === null || creature === undefined) {
      setHint(null);
      setPicking(slot);
      return;
    }
    const species = getSpecies(creature.species);
    if (species === undefined || popovers === null) return;
    const line = effectOf(slots, slot);
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
          setHint(null);
          announce(`${nameOf(id)} removed from the team.`);
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
    setHint(null);
    announce(`${nameOf(creatureId)} placed in the ${ROW_PLACES[slot] ?? ''} slot.`);
    props.onChange(place(slots, creatureId, slot));
  }

  return (
    <div class="placement" onKeyDown={onKeyDown}>
      <h4 id="dungeon-zones-heading">Your team</h4>
      <p class="muted dungeon-order-line">
        <GlossaryTag entry="dungeon-row">{ORDER_LINE}</GlossaryTag>
      </p>
      <PlacedCount placed={placed} />
      <RaidBoard
        single={{ label: 'Your team, left to right' }}
        rows={rows}
        stripRef={stripRef}
        emptyLabel="Add"
        disabled={disabled}
        drag={dragDrop}
        statuses={statuses}
        cues={cues.slots}
        onHoverSlot={setHovered}
        rail={{ none: cues.none, effect }}
        onTap={tapSlot}
      />
      {hint !== null && (
        <p class="muted" role="status">
          {hint}
        </p>
      )}

      <LiveRegion>{announcement}</LiveRegion>
      {/* What the order sets off, for a screen reader: the cues are only visual. */}
      <LiveRegion>{reactionHint}</LiveRegion>
      <DragGhost
        ghostRef={dragDrop.ghostRef}
        creature={
          dragged === undefined
            ? undefined
            : { species: dragged.species, name: creatureName(dragged) }
        }
      />
      {picking !== null && (
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
            stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(picking)}"]`) ?? null
          }
          onPick={pick}
          onClose={() => {
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
