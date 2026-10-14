import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { GlossaryTag } from './Glossary';
import { usePopoverHost } from './PopoverHost';
import { cursorStart, resolveDrop, slotStatuses, type RaidDropOutcome } from './raid-dnd';
import type { RaidView } from './raid-api';
import {
  ROW_NAMES,
  boardCreatureInfo,
  boardKeyTarget,
  boardRows,
  boardSlot,
  placeText,
} from './raid-board';
import { adjacentSlots, canUnplace, type TapContext } from './raid-slots';
import { CANCEL_ANNOUNCEMENT, type DropTarget, type Selection, type Tap } from './slot-outcome';
import { CreatureTray } from './ui/CreatureTray';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { RaidBoard, type BoardRowModel } from './ui/RaidBoard';
import { useSlotAnnouncer, useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';

type Party = NonNullable<RaidView['party']>;
type Team = NonNullable<RaidView['you']['team']>;

interface Props {
  party: Party;
  team: Team;
  ctx: TapContext;
  /** True while a request is in flight or the row is locked. */
  disabled: boolean;
  canEdit: boolean;
  selected: Selection;
  hint: string | null;
  rosterNames: readonly string[];
  /** Controls to show under the team tray (choose team, automatic team). */
  teamControls: ComponentChildren;
  busy: boolean;
  onTap: (tap: Tap) => void;
  onUnplace: () => void;
  /** A drop (by drag or tap): the screen sends the intent and returns what happened. */
  onDrop: (creatureId: string, target: DropTarget | null) => RaidDropOutcome;
  onCancel: () => void;
}

/** The team tray and the party board, with tap, keyboard and drag-and-drop placement. */
export function Placement(props: Props) {
  const { party, team, ctx, disabled, selected, rosterNames } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const popovers = usePopoverHost();
  const trayRef = useRef<HTMLUListElement>(null);

  const nameOf = (creatureId: string): string =>
    team.creatures.find((c) => c.creatureId === creatureId)?.name ?? 'Creature';

  // The board: Front, Middle and Back as rows of slot numbers (the engine's zone sizes).
  const rows = boardRows(party.rowLength);

  // Say it out loud when a creature is picked up (by tap or key).
  const [announcement, announce] = useSlotAnnouncer(selected, nameOf);

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    trayRef,
    onDrop: (creatureId, target) => {
      const outcome = props.onDrop(creatureId, target);
      announce(outcome.announce);
      return outcome;
    },
  });
  const { drag, consumeClick } = dragDrop;

  function cancel(): void {
    props.onCancel();
    announce(CANCEL_ANNOUNCEMENT);
  }

  const onKeyDown = useSlotKeyboard({
    stripRef,
    selected,
    busy: props.busy,
    vertical: true,
    keyTarget: (current, key) => boardKeyTarget(rows, current, key),
    cursorStart: () => cursorStart(ctx.row, selected),
    onCancel: cancel,
  });

  const dragging = drag?.creatureId ?? null;
  const active = dragging ?? selected;
  const adjacent = new Set(adjacentSlots(ctx.row, active, party.rowLength));
  const statuses = dragging === null ? null : slotStatuses(ctx, dragging, nameOf(dragging));
  const draggedPlaced =
    dragging !== null && ctx.row.some((s) => s.creature?.creatureId === dragging);

  function tap(t: Tap): void {
    if (consumeClick()) return;
    if (t.kind === 'slot' && selected !== null) {
      announce(resolveDrop(ctx, selected, nameOf(selected), t).announce);
    }
    props.onTap(t);
  }

  const draggedCreature =
    dragging === null ? undefined : team.creatures.find((c) => c.creatureId === dragging);

  const bySlot = new Map(ctx.row.map((slot) => [slot.slot, slot]));
  const boardModels: BoardRowModel[] = rows.map((row) => ({
    zone: row.zone,
    name: ROW_NAMES[row.zone],
    label: <GlossaryTag entry={GLOSSARY_IDS.zone(row.zone)}>{ROW_NAMES[row.zone]}</GlossaryTag>,
    slots: row.slots.flatMap((n) => {
      const slot = bySlot.get(n);
      return slot === undefined ? [] : [boardSlot(slot, party.rowLength, rosterNames)];
    }),
  }));

  /** A tap on a tile. Another player's creature opens its popover (with the owner's name). */
  function tapSlot(slot: number, button: HTMLElement): void {
    const occupant = bySlot.get(slot)?.creature;
    if (selected === null && occupant != null && !occupant.mine && popovers !== null) {
      const info = boardCreatureInfo(occupant);
      if (info !== null && !consumeClick()) {
        popovers.openCreature(`raid-slot:${String(slot)}`, info, button);
        return;
      }
    }
    tap({ kind: 'slot', slot });
  }

  return (
    <div id="raid-placement" onKeyDown={onKeyDown}>
      <section class="raid-section placement" aria-labelledby="raid-place-heading">
        <h3 id="raid-place-heading">Place your team</h3>
        <p class="muted small place-help">
          Drag your creatures from the tray into the row, or tap one and then tap a slot.
        </p>
        <details class="keys">
          <summary>Keyboard controls</summary>
          <p class="muted small">
            Enter picks up a creature, the arrow keys choose a slot, Enter drops it and Escape
            cancels.
          </p>
        </details>
        <p class="tray-label">
          <span class="pix">Your team</span>
          <span class="muted small">
            {team.mode === 'auto' ? 'automatic: your strongest three' : 'chosen by you'}
          </span>
        </p>
        <CreatureTray
          items={team.creatures.map((c) => ({
            id: c.creatureId,
            species: c.species,
            name: c.name,
            detail: (
              <>
                Lv {c.level} · {c.slot === null ? 'not placed' : placeText(c.slot, party.rowLength)}
              </>
            ),
            placed: c.slot !== null,
          }))}
          trayRef={trayRef}
          disabled={disabled}
          selected={selected}
          drag={dragDrop}
          accepts={draggedPlaced}
          onTap={(id) => {
            tap({ kind: 'creature', id });
          }}
        />
        <RaidBoard
          rows={boardModels}
          stripRef={stripRef}
          emptyLabel="empty"
          disabled={disabled}
          selected={selected}
          drag={dragDrop}
          statuses={statuses}
          adjacent={adjacent}
          onTap={tapSlot}
        />
        <p class="place-actions">
          <button
            type="button"
            disabled={disabled || !canUnplace(ctx.row, selected)}
            onClick={() => {
              props.onUnplace();
            }}
          >
            Unplace
          </button>
          <span class="muted small">Front is closest to the boss.</span>
        </p>
        {props.hint !== null && (
          <p class="muted" role="status">
            {props.hint}
          </p>
        )}
        {!props.canEdit && <p class="locked">The row is locked for this week.</p>}
        {party.guests && (
          <p class="muted">Guest creatures fill the row while fewer than 3 players are in.</p>
        )}
        {props.canEdit && props.teamControls}
      </section>

      <LiveRegion>{announcement}</LiveRegion>
      <DragGhost ghostRef={dragDrop.ghostRef} creature={draggedCreature} />
    </div>
  );
}
