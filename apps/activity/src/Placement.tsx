import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { nextIndex, verticalNeighbour } from './dnd-core';
import { capitalize, getSpecies, speciesName } from './game';
import { GlossaryTag } from './Glossary';
import { cssVars } from './css-vars';
import { useElementWidth } from './hooks';
import {
  CANCEL_ANNOUNCEMENT,
  ZONE_LABELS,
  cursorStart,
  pickUpAnnouncement,
  resolveDrop,
  slotLabel,
  slotStatuses,
  type DropOutcome,
  type DropTarget,
} from './raid-dnd';
import type { RaidView, RowSlotView } from './raid-api';
import {
  adjacentSlots,
  canUnplace,
  ownerColour,
  type Selection,
  type Tap,
  type TapContext,
} from './raid-slots';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
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
  onDrop: (creatureId: string, target: DropTarget | null) => DropOutcome;
  onCancel: () => void;
}

/** The team tray and the party row, with tap, keyboard and drag-and-drop placement. */
export function Placement(props: Props) {
  const { party, team, ctx, disabled, selected, rosterNames } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const stripWidth = useElementWidth(stripRef, SLOT_FALLBACK_PX);
  const trayRef = useRef<HTMLUListElement>(null);
  const [announcement, setAnnouncement] = useState('');
  /** Slot to focus again once a keyboard drop has finished (buttons are disabled meanwhile). */
  const refocus = useRef<number | null>(null);

  const nameOf = (creatureId: string): string =>
    team.creatures.find((c) => c.creatureId === creatureId)?.name ?? 'Creature';

  const { drag, shakeSlot, ghostRef, startDrag, consumeClick } = useDragDrop({
    disabled,
    stripRef,
    trayRef,
    onDrop: (creatureId, target) => {
      const outcome = props.onDrop(creatureId, target);
      setAnnouncement(outcome.announce);
      return outcome;
    },
  });

  // Say it out loud when a creature is picked up (by tap or key).
  useEffect(() => {
    if (selected !== null) setAnnouncement(pickUpAnnouncement(nameOf(selected)));
  }, [selected]);

  useEffect(() => {
    if (props.busy || refocus.current === null) return;
    const slot = refocus.current;
    refocus.current = null;
    stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(slot)}"]`)?.focus();
  }, [props.busy]);

  const dragging = drag?.creatureId ?? null;
  const active = dragging ?? selected;
  const adjacent = new Set(adjacentSlots(ctx.row, active, party.rowLength));
  const statuses = dragging === null ? null : slotStatuses(ctx, dragging, nameOf(dragging));
  const draggedPlaced =
    dragging !== null && ctx.row.some((s) => s.creature?.creatureId === dragging);
  const slotButtons = (): HTMLElement[] =>
    [...(stripRef.current?.querySelectorAll<HTMLElement>('[data-slot]') ?? [])].sort(
      (a, b) => Number(a.dataset.slot) - Number(b.dataset.slot),
    );

  function tap(t: Tap): void {
    if (consumeClick()) return;
    if (t.kind === 'slot' && selected !== null) {
      setAnnouncement(resolveDrop(ctx, selected, nameOf(selected), t).announce);
    }
    props.onTap(t);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (selected !== null) cancel();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    const control = target?.closest<HTMLElement>('[data-slot], .team-chip') ?? null;
    if (control === null) return;
    if (event.key === 'Enter' || event.key === ' ') {
      // The buttons are disabled while the move is sent; bring focus back to the slot afterwards.
      if (selected !== null && control.dataset.slot !== undefined) {
        refocus.current = Number(control.dataset.slot);
      }
      return;
    }
    // Arrow keys walk along the slots: always when a slot has focus, and while carrying a creature.
    // Left and right step through the slots in order; up and down move to the line above or below.
    if (control.dataset.slot === undefined && selected === null) return;
    const buttons = slotButtons();
    const current =
      control.dataset.slot === undefined
        ? cursorStart(ctx.row, selected)
        : Number(control.dataset.slot);
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const rects = buttons.map((b) => ({
        id: Number(b.dataset.slot),
        rect: b.getBoundingClientRect(),
      }));
      const slot = verticalNeighbour(rects, current, event.key === 'ArrowUp' ? 'up' : 'down');
      if (slot === null) return;
      event.preventDefault();
      buttons.find((b) => Number(b.dataset.slot) === slot)?.focus();
      return;
    }
    const to = nextIndex(
      Math.max(
        0,
        buttons.findIndex((b) => Number(b.dataset.slot) === current),
      ),
      event.key,
      buttons.length,
    );
    if (to === null) return;
    event.preventDefault();
    buttons[to]?.focus();
  }

  function cancel(): void {
    props.onCancel();
    setAnnouncement(CANCEL_ANNOUNCEMENT);
  }

  const draggedCreature =
    dragging === null ? undefined : team.creatures.find((c) => c.creatureId === dragging);

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
        <ul
          ref={trayRef}
          class={[
            'team-list',
            draggedPlaced ? 'tray-target' : '',
            drag?.over?.kind === 'tray' ? 'drop-over' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {team.creatures.map((c) => {
            const classes = ['team-chip', 'draggable'];
            if (selected === c.creatureId) classes.push('selected');
            if (dragging === c.creatureId) classes.push('dragging-source');
            if (c.slot !== null) classes.push('placed');
            const species = getSpecies(c.species);
            return (
              <li key={c.creatureId}>
                <button
                  type="button"
                  class={classes.join(' ')}
                  aria-pressed={selected === c.creatureId}
                  disabled={disabled}
                  onPointerDown={(event) => {
                    startDrag(c.creatureId, event);
                  }}
                  onClick={() => {
                    tap({ kind: 'creature', creatureId: c.creatureId });
                  }}
                >
                  <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                  <span class="chip-name">{c.name}</span>
                  <span class="muted">
                    Lv {c.level} · {c.slot === null ? 'not placed' : `slot ${String(c.slot + 1)}`}
                  </span>
                </button>
                {/* Tags sit under the button, never inside it: a tag must not start a drag. */}
                {species !== undefined && (
                  <p class="tags team-tags">
                    <ElementChip element={species.element} role={capitalize(species.role)} />
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div
          ref={stripRef}
          class={dragging === null ? 'party-strip' : 'party-strip dragging'}
          role="group"
          aria-label="Party row, front to back, each zone left to right"
        >
          {ZONES.map((zone) => {
            const slots = ctx.row.filter((s) => s.zone === zone);
            if (slots.length === 0) return null;
            const layout = zoneLayout(slots.length, stripWidth, SLOT_LAYOUT);
            return (
              <div key={zone} class="party-zone" ref={cssVars(layoutVars(layout, SLOT_LAYOUT))}>
                <p class="zone-label">
                  <GlossaryTag entry={GLOSSARY_IDS.zone(zone)}>{ZONE_LABELS[zone]}</GlossaryTag>
                </p>
                <div class="zone-slots">
                  {slots.map((s) => (
                    <SlotButton
                      key={s.slot}
                      slot={s}
                      scale={layout.tier.scale}
                      rosterNames={rosterNames}
                      disabled={disabled}
                      selected={selected}
                      adjacent={adjacent.has(s.slot)}
                      hasSelection={active !== null}
                      status={statuses?.get(s.slot) ?? null}
                      over={drag?.over?.kind === 'slot' && drag.over.slot === s.slot}
                      shaking={shakeSlot === s.slot}
                      dragging={dragging}
                      onPointerDown={startDrag}
                      onTap={tap}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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

      <p class="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      {draggedCreature !== undefined && (
        <div ref={ghostRef} class="drag-ghost" aria-hidden="true">
          <Sprite sprite={creatureSpriteOrFallback(draggedCreature.species)} scale={4} />
          <span class="drag-ghost-name">{draggedCreature.name}</span>
        </div>
      )}
    </div>
  );
}

function SlotButton({
  slot: s,
  scale,
  rosterNames,
  disabled,
  selected,
  adjacent,
  hasSelection,
  status,
  over,
  shaking,
  dragging,
  onPointerDown,
  onTap,
}: {
  slot: RowSlotView;
  /** Sprite scale: the layout shrinks the sprites when a zone is long. */
  scale: number;
  rosterNames: readonly string[];
  disabled: boolean;
  selected: Selection;
  adjacent: boolean;
  hasSelection: boolean;
  status: 'valid' | 'invalid' | 'none' | null;
  over: boolean;
  shaking: boolean;
  dragging: string | null;
  onPointerDown: (creatureId: string, event: PointerEvent) => void;
  onTap: (tap: Tap) => void;
}) {
  const c = s.creature;
  const own = c?.mine === true && c.creatureId !== undefined ? c.creatureId : null;
  const isSelected = own !== null && own === selected;
  const classes = ['party-slot'];
  if (scale < 3) classes.push('compact');
  if (c === null) classes.push('empty');
  else {
    classes.push(`owner-${String(ownerColour(c.ownerName, rosterNames))}`);
    if (c.mine) classes.push('mine');
  }
  if (own !== null) classes.push('draggable');
  if (isSelected) classes.push('selected');
  if (adjacent) classes.push('adjacent');
  if (c === null && hasSelection) classes.push('target');
  if (status === 'valid') classes.push('drop-valid');
  if (status === 'invalid') classes.push('drop-invalid');
  if (over && status !== null && status !== 'none') classes.push('drop-over');
  if (own !== null && own === dragging) classes.push('dragging-source');
  if (shaking) classes.push('shake');
  return (
    <button
      type="button"
      class={classes.join(' ')}
      data-slot={s.slot}
      aria-label={slotLabel(s, speciesName)}
      aria-pressed={own !== null ? isSelected : undefined}
      disabled={disabled}
      onPointerDown={
        own === null
          ? undefined
          : (event) => {
              onPointerDown(own, event);
            }
      }
      onClick={() => {
        onTap({ kind: 'slot', slot: s.slot });
      }}
    >
      <span class="slot-num">{s.slot + 1}</span>
      {c === null ? (
        <span class="slot-empty">empty</span>
      ) : (
        <>
          <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={scale} />
          <span class="slot-species">{speciesName(c.species)}</span>
          <span class="slot-meta">Lv {c.level}</span>
          <span class="slot-owner">{c.mine ? 'You' : c.ownerName}</span>
        </>
      )}
    </button>
  );
}
