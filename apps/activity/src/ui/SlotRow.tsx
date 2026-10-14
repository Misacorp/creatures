import type { ComponentChildren, RefObject } from 'preact';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import type { DropStatus, Selection } from '../slot-outcome';
import type { DragDrop } from '../use-drag-drop';

/** One slot of the row, ready to draw. */
export interface SlotModel {
  /** The slot number, from 0: the `data-slot` of the button and what a tap or drop names. */
  index: number;
  /** What a screen reader says for the button. */
  ariaLabel: string;
  occupant: null | {
    species: string;
    /** The name printed in the slot (a species name in the raid, the creature's name in the dungeon). */
    name: string;
    level: number;
    /** The id of one of the player's own creatures: only those can be picked up and dragged. */
    ownId: string | null;
    mine: boolean;
    /** Raid only: whose it is, as a colour index and the line printed under the level. */
    owner?: { colour: number; line: string };
  };
}

/** Slots drawn together: a zone with its label (raid), or the one plain group (dungeon). */
export interface SlotGroup {
  key: string;
  /** Sprite scale for the group: the raid shrinks sprites in a long zone. */
  scale: number;
  slots: readonly SlotModel[];
  /** A zone row: its label at the left and the sizes of its slots (the layout's CSS variables). */
  zone?: { label: ComponentChildren; vars: (el: HTMLElement | null) => void };
}

interface SlotRowProps {
  groups: readonly SlotGroup[];
  stripRef: RefObject<HTMLDivElement>;
  /** Extra class on the strip (the dungeon draws one row of three in a grid). */
  class?: string;
  label: { 'aria-label': string } | { 'aria-labelledby': string };
  /** What an empty slot says. */
  emptyLabel: string;
  disabled: boolean;
  selected: Selection;
  drag: DragDrop;
  /** Drop status of each slot while a creature is dragged, else null. */
  statuses: ReadonlyMap<number, DropStatus> | null;
  /** Slots to highlight next to the carried creature's (raid). */
  adjacent?: ReadonlySet<number>;
  onTap: (slot: number) => void;
}

/**
 * The row of slots, for the raid's party (three zones) and the dungeon's team (one row of three):
 * every slot is a button that takes a tap or a press (the drag starts from it), says in its classes
 * what a drop would do here, and keeps its `data-slot` for the keyboard and the hit test.
 */
export function SlotRow(props: SlotRowProps) {
  const { drag, selected, statuses } = props;
  const dragging = drag.drag?.creatureId ?? null;
  const hasSelection = (dragging ?? selected) !== null;
  const buttons = (group: SlotGroup) =>
    group.slots.map((slot) => (
      <SlotButton
        key={slot.index}
        slot={slot}
        scale={group.scale}
        emptyLabel={props.emptyLabel}
        disabled={props.disabled}
        selected={selected}
        adjacent={props.adjacent?.has(slot.index) === true}
        hasSelection={hasSelection}
        status={statuses?.get(slot.index) ?? null}
        over={drag.drag?.over?.kind === 'slot' && drag.drag.over.slot === slot.index}
        shaking={drag.shakeSlot === slot.index}
        dragging={dragging}
        onPointerDown={drag.startDrag}
        onTap={props.onTap}
      />
    ));
  const classes = ['party-strip'];
  if (props.class !== undefined) classes.push(props.class);
  if (dragging !== null) classes.push('dragging');
  return (
    <div ref={props.stripRef} class={classes.join(' ')} role="group" {...props.label}>
      {props.groups.map((group) =>
        group.zone === undefined ? (
          buttons(group)
        ) : (
          <div key={group.key} class="party-zone" ref={group.zone.vars}>
            <p class="zone-label">{group.zone.label}</p>
            <div class="zone-slots">{buttons(group)}</div>
          </div>
        ),
      )}
    </div>
  );
}

interface SlotButtonProps {
  slot: SlotModel;
  /** Sprite scale: the layout shrinks the sprites when a zone is long. */
  scale: number;
  emptyLabel: string;
  disabled: boolean;
  selected: Selection;
  adjacent: boolean;
  hasSelection: boolean;
  status: DropStatus | null;
  over: boolean;
  shaking: boolean;
  dragging: string | null;
  onPointerDown: (creatureId: string, event: PointerEvent) => void;
  onTap: (slot: number) => void;
}

/** The one slot markup: number at the top, then the sprite, name, level and (raid) owner, or the empty label. */
export function SlotButton(props: SlotButtonProps) {
  const { slot, scale, status } = props;
  const c = slot.occupant;
  const own = c?.ownId ?? null;
  const isSelected = own !== null && own === props.selected;
  const classes = ['party-slot'];
  if (scale < 3) classes.push('compact');
  if (c === null) classes.push('empty');
  else {
    if (c.owner !== undefined) classes.push(`owner-${String(c.owner.colour)}`);
    if (c.mine) classes.push('mine');
  }
  if (own !== null) classes.push('draggable');
  if (isSelected) classes.push('selected');
  if (props.adjacent) classes.push('adjacent');
  if (c === null && props.hasSelection) classes.push('target');
  if (status === 'valid') classes.push('drop-valid');
  if (status === 'invalid') classes.push('drop-invalid');
  if (props.over && status !== null && status !== 'none') classes.push('drop-over');
  if (own !== null && own === props.dragging) classes.push('dragging-source');
  if (props.shaking) classes.push('shake');
  return (
    <button
      type="button"
      class={classes.join(' ')}
      data-slot={slot.index}
      aria-label={slot.ariaLabel}
      aria-pressed={own !== null ? isSelected : undefined}
      disabled={props.disabled}
      onPointerDown={
        own === null
          ? undefined
          : (event) => {
              props.onPointerDown(own, event);
            }
      }
      onClick={() => {
        props.onTap(slot.index);
      }}
    >
      <span class="slot-num">{slot.index + 1}</span>
      {c === null ? (
        <span class="slot-empty">{props.emptyLabel}</span>
      ) : (
        <>
          <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={scale} />
          <span class="slot-species">{c.name}</span>
          <span class="slot-meta">Lv {c.level}</span>
          {c.owner !== undefined && <span class="slot-owner">{c.owner.line}</span>}
        </>
      )}
    </button>
  );
}
