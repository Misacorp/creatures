import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { speciesName } from './game';
import { GlossaryTag } from './Glossary';
import { cssVars } from './css-vars';
import { useElementWidth } from './hooks';
import {
  ZONE_LABELS,
  cursorStart,
  resolveDrop,
  slotLabel,
  slotStatuses,
  type RaidDropOutcome,
} from './raid-dnd';
import type { RaidView } from './raid-api';
import { adjacentSlots, canUnplace, ownerColour, type TapContext } from './raid-slots';
import { CANCEL_ANNOUNCEMENT, type DropTarget, type Selection, type Tap } from './slot-outcome';
import { CreatureTray } from './ui/CreatureTray';
import { DragGhost } from './ui/DragGhost';
import { LiveRegion } from './ui/LiveRegion';
import { SlotRow, type SlotGroup } from './ui/SlotRow';
import { useSlotAnnouncer, useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';
import { SLOT_FALLBACK_PX, SLOT_LAYOUT, layoutVars, zoneLayout } from './zone-layout';

const ZONES = ['front', 'middle', 'back'] as const;

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

/** The team tray and the party row, with tap, keyboard and drag-and-drop placement. */
export function Placement(props: Props) {
  const { party, team, ctx, disabled, selected, rosterNames } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const stripWidth = useElementWidth(stripRef, SLOT_FALLBACK_PX);
  const trayRef = useRef<HTMLUListElement>(null);

  const nameOf = (creatureId: string): string =>
    team.creatures.find((c) => c.creatureId === creatureId)?.name ?? 'Creature';

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

  const groups: SlotGroup[] = [];
  for (const zone of ZONES) {
    const slots = ctx.row.filter((s) => s.zone === zone);
    if (slots.length === 0) continue;
    const layout = zoneLayout(slots.length, stripWidth, SLOT_LAYOUT);
    groups.push({
      key: zone,
      scale: layout.tier.scale,
      zone: {
        label: <GlossaryTag entry={GLOSSARY_IDS.zone(zone)}>{ZONE_LABELS[zone]}</GlossaryTag>,
        vars: cssVars(layoutVars(layout, SLOT_LAYOUT)),
      },
      slots: slots.map((s) => {
        const c = s.creature;
        return {
          index: s.slot,
          ariaLabel: slotLabel(s, speciesName),
          occupant:
            c === null
              ? null
              : {
                  species: c.species,
                  name: speciesName(c.species),
                  level: c.level,
                  ownId: c.mine && c.creatureId !== undefined ? c.creatureId : null,
                  mine: c.mine,
                  owner: {
                    colour: ownerColour(c.ownerName, rosterNames),
                    line: c.mine ? 'You' : c.ownerName,
                  },
                },
        };
      }),
    });
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
                Lv {c.level} · {c.slot === null ? 'not placed' : `slot ${String(c.slot + 1)}`}
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
        <SlotRow
          groups={groups}
          stripRef={stripRef}
          label={{ 'aria-label': 'Party row, front to back, each zone left to right' }}
          emptyLabel="empty"
          disabled={disabled}
          selected={selected}
          drag={dragDrop}
          statuses={statuses}
          adjacent={adjacent}
          onTap={(slot) => {
            tap({ kind: 'slot', slot });
          }}
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
