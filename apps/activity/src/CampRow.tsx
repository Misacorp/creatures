import { useRef, useState } from 'preact/hooks';
import { TOUCH_HOLD_MS } from './dnd-core';
import { campHp, campSlotLabel, tapToSwap, type CampRowCreature } from './dungeon-run';
import { ROW_PLACES, resolveDrop, slotStatuses, type Slots } from './dungeon-team';
import { getSpecies } from './game';
import { boardKeyTarget, type BoardRow } from './raid-board';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import type { SlotModel } from './ui/SlotButton';
import { affectSlotOf, cuesFor, effectLine, sceneOf } from './ui/slot-cue';
import { useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';

/** The one row of the board: the row's three places, left to right. */
const ROW: BoardRow = { zone: 'front', slots: ROW_PLACES.map((_, index) => index) };

/** What the line under the row says: how the order is changed. */
export const CAMP_ROW_HINT =
  'Drag a creature onto another to swap places, or tap one and then another. Downed creatures can stand anywhere.';

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
  const stripRef = useRef<HTMLDivElement>(null);
  /** The slot under the mouse or the keyboard focus. */
  const [hovered, setHovered] = useState<number | null>(null);
  /** The creature picked up by a tap (waiting for the one to swap with). */
  const [selected, setSelected] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');

  const ids = creatures.map((c) => c.id);
  const slots = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null] as const satisfies Slots;
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const nameOf = (id: string): string => byId.get(id)?.name ?? 'Creature';

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    touchHoldMs: TOUCH_HOLD_MS,
    onDrop: (creatureId, target) => {
      const { slots: next, outcome } = resolveDrop(slots, creatureId, target, nameOf);
      announce(outcome.announce);
      setHint(outcome.hint);
      setSelected(null);
      if (next !== slots) onChange(next.filter((id): id is string => id !== null));
      return outcome;
    },
  });
  const { drag, consumeClick } = dragDrop;
  const dragging = drag?.creatureId ?? null;

  const onKeyDown = useSlotKeyboard({
    stripRef,
    keyTarget: (current, key) => boardKeyTarget([ROW], current, key),
  });

  const statuses = dragging === null ? null : slotStatuses(slots, dragging, nameOf);
  const dragged = dragging === null ? undefined : byId.get(dragging);

  // The cues read the row as it would stand: the creature carried (or picked up) and where it hovers.
  const affectRowOf = (keys: readonly (string | null)[]) =>
    keys.map((id) => {
      const c = id === null ? undefined : byId.get(id);
      return c === undefined ? null : affectSlotOf(getSpecies(c.species));
    });
  const mode = { row: 'dungeon' } as const;
  const scene = sceneOf({
    keys: slots,
    carried: dragging ?? selected,
    pointer: drag?.over?.slot ?? hovered,
  });
  const cues = cuesFor({ row: affectRowOf(scene.keys), mode, focus: scene.focus, scope: 'row' });
  const effect =
    scene.focus === null
      ? null
      : effectLine({
          row: affectRowOf(scene.keys),
          mode,
          focus: scene.focus,
          nameOf: (slot) => nameOf(scene.keys[slot] ?? ''),
        });

  const model = (index: number): SlotModel => {
    const creature = byId.get(slots[index] ?? '');
    if (creature === undefined) {
      return { index, ariaLabel: 'Empty slot', occupant: null };
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
  const rows: BoardRowModel[] = [
    { zone: ROW.zone, name: 'Team', label: null, slots: ROW.slots.map(model) },
  ];

  /** A tap on a tile: pick the creature up, put it down, or swap it with the one picked up. */
  function tapSlot(slot: number): void {
    if (consumeClick()) return;
    const id = slots[slot] ?? null;
    if (id === null) return;
    const result = tapToSwap(ids, selected, id);
    setHint(null);
    setSelected(result.selected);
    if (result.selected !== null) {
      announce(`${nameOf(id)} picked up. Tap another creature to swap places.`);
    } else if (selected === id) {
      announce(`${nameOf(id)} put down.`);
    } else {
      announce(`Swapped ${nameOf(selected ?? '')} with ${nameOf(id)}.`);
      onChange(result.order);
    }
  }

  return (
    <div class="placement camp-row" onKeyDown={onKeyDown}>
      <RaidBoard
        single={{ label: 'Your team, left to right. You can change the order.' }}
        size="large"
        rows={rows}
        stripRef={stripRef}
        emptyLabel=""
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
      <p class="muted camp-row-hint">{CAMP_ROW_HINT}</p>
      <LiveRegion>{announcement}</LiveRegion>
      <DragGhost
        ghostRef={dragDrop.ghostRef}
        creature={
          dragged === undefined ? undefined : { species: dragged.species, name: dragged.name }
        }
      />
    </div>
  );
}
