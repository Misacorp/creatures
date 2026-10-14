import { useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import {
  ROW_PLACES,
  ROW_PLACE_NAMES,
  placedCount,
  reduceTap,
  resolveDrop,
  slotIndexOf,
  slotStatuses,
  unplace,
  type Slots,
} from './dungeon-team';
import { creatureName, speciesName } from './game';
import { CANCEL_ANNOUNCEMENT, type DropOutcome, type Selection, type Tap } from './slot-outcome';
import { CreatureTray } from './ui/CreatureTray';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { SlotRow, type SlotGroup } from './ui/SlotRow';
import { ToggleButton } from './ui/ToggleButton';
import { useSlotAnnouncer, useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';

/** How many creatures the list shows before "Show all". The strongest come first. */
const TRAY_PREVIEW = 6;

/** The sprites in the three slots: one size, there is room in a row of three. */
const SLOT_SCALE = 3;

interface Props {
  /** All the player's creatures, strongest first. */
  creatures: readonly Creature[];
  slots: Slots;
  selected: Selection;
  hint: string | null;
  /** True while the run is being sent. */
  disabled: boolean;
  onChange: (next: { slots: Slots; selected: Selection; hint: string | null }) => void;
  onStrongest: () => void;
}

/**
 * The team in its row. The fight is one row of three, left to right, and the order the player
 * stands them in is the choice: three slots side by side, with the list of everyone else under them.
 * A creature moves by dragging (pointer events, so touch works), by tapping it and then a slot, or
 * with the keyboard: Enter picks up, the arrow keys choose a slot, Enter drops, Escape cancels. The
 * slot row, the tray, the drag code and the keyboard are the ones the raid Placement uses. The
 * server checks the team again when the run starts.
 */
export function DungeonTeam(props: Props) {
  const { creatures, slots, selected, disabled } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLUListElement>(null);
  const [showAll, setShowAll] = useState(false);

  const byId = new Map(creatures.map((c) => [c.id, c]));
  const nameOf = (id: string): string => {
    const c = byId.get(id);
    return c === undefined ? 'Creature' : creatureName(c);
  };

  const [announcement, announce] = useSlotAnnouncer(selected, nameOf);

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    trayRef,
    onDrop: (creatureId, target): DropOutcome => {
      const { slots: next, outcome } = resolveDrop(slots, creatureId, target, nameOf);
      announce(outcome.announce);
      props.onChange({ slots: next, selected: null, hint: outcome.hint });
      return outcome;
    },
  });
  const { drag, consumeClick } = dragDrop;

  function cancel(): void {
    props.onChange({ slots, selected: null, hint: null });
    announce(CANCEL_ANNOUNCEMENT);
  }

  const onKeyDown = useSlotKeyboard({
    stripRef,
    selected,
    busy: disabled,
    vertical: false,
    onCancel: cancel,
  });

  const dragging = drag?.creatureId ?? null;
  const statuses = dragging === null ? null : slotStatuses(slots, dragging, nameOf);
  const draggedPlaced = dragging !== null && slotIndexOf(slots, dragging) !== null;
  const draggedCreature = dragging === null ? undefined : byId.get(dragging);

  function tap(t: Tap): void {
    if (consumeClick()) return;
    const result = reduceTap(slots, selected, t);
    if (t.kind === 'slot' && selected !== null && result.slots !== slots) {
      const { outcome } = resolveDrop(slots, selected, t, nameOf);
      announce(outcome.announce);
    }
    props.onChange(result);
  }

  const unplaced = creatures.filter((c) => slotIndexOf(slots, c.id) === null);
  const shown = showAll ? unplaced : unplaced.slice(0, TRAY_PREVIEW);
  // A creature that is picked up stays reachable even when the list is folded.
  const picked = selected === null ? undefined : unplaced.find((c) => c.id === selected);
  const listed = picked !== undefined && !shown.includes(picked) ? [...shown, picked] : shown;
  const full = placedCount(slots) === ROW_PLACES.length;

  const group: SlotGroup = {
    key: 'row',
    scale: SLOT_SCALE,
    slots: ROW_PLACES.map((place, index) => {
      const creature = byId.get(slots[index] ?? '');
      return {
        index,
        ariaLabel:
          creature === undefined
            ? `${ROW_PLACE_NAMES[place]} slot, empty`
            : `${ROW_PLACE_NAMES[place]} slot, ${creatureName(creature)}, ${speciesName(creature.species)} level ${String(creature.level)}`,
        occupant:
          creature === undefined
            ? null
            : {
                species: creature.species,
                name: creatureName(creature),
                level: creature.level,
                ownId: creature.id,
                mine: true,
              },
      };
    }),
  };

  return (
    <div onKeyDown={onKeyDown}>
      <h4 id="dungeon-zones-heading">Your team</h4>
      <SlotRow
        groups={[group]}
        stripRef={stripRef}
        class="dungeon-strip"
        label={{ 'aria-labelledby': 'dungeon-zones-heading' }}
        emptyLabel="Empty"
        disabled={disabled}
        selected={selected}
        drag={dragDrop}
        statuses={statuses}
        onTap={(slot) => {
          tap({ kind: 'slot', slot });
        }}
      />
      <p class="button-row">
        <button type="button" disabled={disabled} onClick={props.onStrongest}>
          Use my strongest three
        </button>
        <button
          type="button"
          disabled={disabled || selected === null || slotIndexOf(slots, selected) === null}
          onClick={() => {
            if (selected !== null) {
              props.onChange({ slots: unplace(slots, selected), selected: null, hint: null });
            }
          }}
        >
          Take out
        </button>
      </p>
      {props.hint !== null && (
        <p class="muted" role="status">
          {props.hint}
        </p>
      )}

      <h4 id="dungeon-list-heading">Your creatures</h4>
      <CreatureTray
        items={listed.map((c) => ({
          id: c.id,
          species: c.species,
          name: creatureName(c),
          detail: <>Lv {c.level}</>,
        }))}
        trayRef={trayRef}
        class="dungeon-tray"
        labelledBy="dungeon-list-heading"
        disabled={disabled}
        selected={selected}
        drag={dragDrop}
        accepts={draggedPlaced}
        onTap={(id) => {
          tap({ kind: 'creature', id });
        }}
      >
        {unplaced.length === 0 && (
          <li class="muted">{full ? 'Everyone else is in the team.' : 'No creatures left.'}</li>
        )}
      </CreatureTray>
      {unplaced.length > TRAY_PREVIEW && (
        <p>
          <ToggleButton
            pressed={showAll}
            onToggle={() => {
              setShowAll(!showAll);
            }}
          >
            {showAll ? 'Show fewer' : `Show all ${String(unplaced.length)} creatures`}
          </ToggleButton>
        </p>
      )}

      <LiveRegion>{announcement}</LiveRegion>
      <DragGhost
        ghostRef={dragDrop.ghostRef}
        creature={
          draggedCreature === undefined
            ? undefined
            : { species: draggedCreature.species, name: creatureName(draggedCreature) }
        }
      />
    </div>
  );
}
