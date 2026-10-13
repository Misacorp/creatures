import { GLOSSARY_IDS } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { cssVars } from './css-vars';
import { nextIndex } from './dnd-core';
import {
  DUNGEON_ZONES,
  DUNGEON_ZONE_NAMES,
  placedCount,
  reduceTap,
  resolveDrop,
  slotIndexOf,
  slotStatuses,
  unplace,
  type Selection,
  type Slots,
  type Tap,
} from './dungeon-team';
import { capitalize, creatureName, elementName, getSpecies, speciesName } from './game';
import { GlossaryTag } from './Glossary';
import { useElementWidth } from './hooks';
import { CANCEL_ANNOUNCEMENT, pickUpAnnouncement, type DropOutcome } from './raid-dnd';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { useDragDrop } from './use-drag-drop';
import { SLOT_FALLBACK_PX, SLOT_LAYOUT, layoutVars, zoneLayout } from './zone-layout';

/** How many creatures the list shows before "Show all". The strongest come first. */
const TRAY_PREVIEW = 6;

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
 * The team and its zones. The three zones are slots, front first, with one creature each; the list
 * under them holds everyone else. A creature moves by dragging (pointer events, so touch works),
 * by tapping it and then a zone, or with the keyboard: Enter picks up, the arrow keys choose a zone,
 * Enter drops, Escape cancels. The drag code and its ghost are the Placement screen's. The server
 * checks the team again when the run starts.
 */
export function DungeonTeam(props: Props) {
  const { creatures, slots, selected, disabled } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const stripWidth = useElementWidth(stripRef, SLOT_FALLBACK_PX);
  const trayRef = useRef<HTMLUListElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const [showAll, setShowAll] = useState(false);
  const refocus = useRef<number | null>(null);

  const byId = new Map(creatures.map((c) => [c.id, c]));
  const nameOf = (id: string): string => {
    const c = byId.get(id);
    return c === undefined ? 'Creature' : creatureName(c);
  };

  const { drag, shakeSlot, ghostRef, startDrag, consumeClick } = useDragDrop({
    disabled,
    stripRef,
    trayRef,
    onDrop: (creatureId, target): DropOutcome => {
      const { slots: next, outcome } = resolveDrop(slots, creatureId, target, nameOf);
      setAnnouncement(outcome.announce);
      props.onChange({ slots: next, selected: null, hint: outcome.hint });
      return outcome;
    },
  });

  useEffect(() => {
    if (selected !== null) setAnnouncement(pickUpAnnouncement(nameOf(selected)));
  }, [selected]);

  useEffect(() => {
    if (disabled || refocus.current === null) return;
    const index = refocus.current;
    refocus.current = null;
    stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(index)}"]`)?.focus();
  }, [disabled]);

  const dragging = drag?.creatureId ?? null;
  const active = dragging ?? selected;
  const statuses = dragging === null ? null : slotStatuses(slots, dragging, nameOf);
  const draggedPlaced = dragging !== null && slotIndexOf(slots, dragging) !== null;
  const draggedCreature = dragging === null ? undefined : byId.get(dragging);

  function tap(t: Tap): void {
    if (consumeClick()) return;
    const result = reduceTap(slots, selected, t);
    if (t.kind === 'slot' && selected !== null && result.slots !== slots) {
      const { outcome } = resolveDrop(slots, selected, { kind: 'slot', slot: t.index }, nameOf);
      setAnnouncement(outcome.announce);
    }
    props.onChange(result);
  }

  function cancel(): void {
    props.onChange({ slots, selected: null, hint: null });
    setAnnouncement(CANCEL_ANNOUNCEMENT);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (selected !== null) cancel();
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    const control = target?.closest<HTMLElement>('[data-slot]') ?? null;
    if (control === null) return;
    if (event.key === 'Enter' || event.key === ' ') {
      if (selected !== null) refocus.current = Number(control.dataset.slot);
      return;
    }
    // The zones are stacked, so up and left go to the zone before, down and right to the one after.
    const key =
      event.key === 'ArrowUp' ? 'ArrowLeft' : event.key === 'ArrowDown' ? 'ArrowRight' : event.key;
    const to = nextIndex(Number(control.dataset.slot), key, DUNGEON_ZONES.length);
    if (to === null) return;
    event.preventDefault();
    stripRef.current?.querySelector<HTMLElement>(`[data-slot="${String(to)}"]`)?.focus();
  }

  const unplaced = creatures.filter((c) => slotIndexOf(slots, c.id) === null);
  const shown = showAll ? unplaced : unplaced.slice(0, TRAY_PREVIEW);
  // A creature that is picked up stays reachable even when the list is folded.
  const picked = selected === null ? undefined : unplaced.find((c) => c.id === selected);
  const listed = picked !== undefined && !shown.includes(picked) ? [...shown, picked] : shown;
  const layout = zoneLayout(1, stripWidth, SLOT_LAYOUT);
  const full = placedCount(slots) === DUNGEON_ZONES.length;

  return (
    <div onKeyDown={onKeyDown}>
      <h4 id="dungeon-zones-heading">Your team</h4>
      <p class="muted">
        Three creatures, one in each zone. Drag a creature to a zone, or tap it and then tap a zone.
        With a keyboard: Enter picks up, arrow keys choose, Enter drops, Escape cancels.
      </p>
      <div
        ref={stripRef}
        class={
          dragging === null ? 'party-strip dungeon-strip' : 'party-strip dungeon-strip dragging'
        }
        role="group"
        aria-labelledby="dungeon-zones-heading"
      >
        {DUNGEON_ZONES.map((zone, index) => {
          const id = slots[index] ?? null;
          const creature = id === null ? undefined : byId.get(id);
          const status = statuses?.get(index) ?? null;
          const classes = ['party-slot', 'dungeon-slot'];
          if (creature === undefined) classes.push('empty');
          else classes.push('mine', 'draggable');
          if (creature !== undefined && selected === creature.id) classes.push('selected');
          if (creature === undefined && active !== null) classes.push('target');
          if (status === 'valid') classes.push('drop-valid');
          if (status === 'invalid') classes.push('drop-invalid');
          if (drag?.over?.kind === 'slot' && drag.over.slot === index && status !== null) {
            if (status !== 'none') classes.push('drop-over');
          }
          if (creature !== undefined && creature.id === dragging) classes.push('dragging-source');
          if (shakeSlot === index) classes.push('shake');
          const species = creature === undefined ? undefined : getSpecies(creature.species);
          return (
            <div key={zone} class="party-zone" ref={cssVars(layoutVars(layout, SLOT_LAYOUT))}>
              <p class="zone-label">
                <GlossaryTag entry={GLOSSARY_IDS.zone(zone)}>
                  {DUNGEON_ZONE_NAMES[zone]}
                </GlossaryTag>
              </p>
              <div class="zone-slots">
                <button
                  type="button"
                  class={classes.join(' ')}
                  data-slot={index}
                  disabled={disabled}
                  aria-pressed={creature === undefined ? undefined : selected === creature.id}
                  aria-label={
                    creature === undefined
                      ? `${DUNGEON_ZONE_NAMES[zone]} zone, empty`
                      : `${DUNGEON_ZONE_NAMES[zone]} zone, ${creatureName(creature)}, ${speciesName(creature.species)} level ${String(creature.level)}`
                  }
                  onPointerDown={
                    creature === undefined
                      ? undefined
                      : (event) => {
                          startDrag(creature.id, event);
                        }
                  }
                  onClick={() => {
                    tap({ kind: 'slot', index });
                  }}
                >
                  {creature === undefined ? (
                    <span class="slot-empty">Empty</span>
                  ) : (
                    <>
                      <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={3} />
                      <span class="dungeon-slot-text">
                        <span class="slot-species">{creatureName(creature)}</span>
                        <span class="slot-meta">
                          Lv {creature.level}
                          {species === undefined
                            ? ''
                            : ` · ${elementName(species.element)} · ${capitalize(species.role)}`}
                        </span>
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
          Take out of zone
        </button>
      </p>
      {props.hint !== null && (
        <p class="muted" role="status">
          {props.hint}
        </p>
      )}

      <h4 id="dungeon-list-heading">Your creatures</h4>
      <ul
        ref={trayRef}
        aria-labelledby="dungeon-list-heading"
        class={[
          'team-list',
          'dungeon-tray',
          draggedPlaced ? 'tray-target' : '',
          drag?.over?.kind === 'tray' ? 'drop-over' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {listed.map((c) => {
          const classes = ['team-chip', 'draggable'];
          if (selected === c.id) classes.push('selected');
          if (dragging === c.id) classes.push('dragging-source');
          const species = getSpecies(c.species);
          return (
            <li key={c.id}>
              <button
                type="button"
                class={classes.join(' ')}
                aria-pressed={selected === c.id}
                disabled={disabled}
                onPointerDown={(event) => {
                  startDrag(c.id, event);
                }}
                onClick={() => {
                  tap({ kind: 'creature', id: c.id });
                }}
              >
                <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                <span class="chip-name">{creatureName(c)}</span>
                <span class="muted">Lv {c.level}</span>
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
        {unplaced.length === 0 && (
          <li class="muted">{full ? 'Everyone else is in the team.' : 'No creatures left.'}</li>
        )}
      </ul>
      {unplaced.length > TRAY_PREVIEW && (
        <p>
          <button
            type="button"
            class={showAll ? 'toggle on' : 'toggle'}
            aria-pressed={showAll}
            onClick={() => {
              setShowAll(!showAll);
            }}
          >
            {showAll ? 'Show fewer' : `Show all ${String(unplaced.length)} creatures`}
          </button>
        </p>
      )}

      <p class="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      {draggedCreature !== undefined && (
        <div ref={ghostRef} class="drag-ghost" aria-hidden="true">
          <Sprite sprite={creatureSpriteOrFallback(draggedCreature.species)} scale={4} />
          <span class="drag-ghost-name">{creatureName(draggedCreature)}</span>
        </div>
      )}
    </div>
  );
}
