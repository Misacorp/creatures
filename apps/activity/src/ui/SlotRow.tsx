import type { RefObject } from 'preact';
import { elementClass } from '../art';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import type { DropStatus, Selection } from '../slot-outcome';
import type { DragDrop } from '../use-drag-drop';
import { slotState } from './slot-state';

/** One slot of the row, ready to draw. */
export interface SlotModel {
  /** The slot number, from 0: the `data-slot` of the button and what a tap or drop names. */
  index: number;
  /** What a screen reader says for the button. */
  ariaLabel: string;
  /** Leave the slot number off the tile (the raid board names places by row and lane instead). */
  hideNumber?: boolean;
  occupant: null | {
    species: string;
    /** The name printed in the slot (a species name in the raid, the creature's name in the dungeon). */
    name: string;
    level: number;
    /** The id of one of the player's own creatures: only those can be picked up and dragged. */
    ownId: string | null;
    mine: boolean;
    /** Raid only: whose it is, as a colour index and the initial printed on the tile (text only). */
    owner?: { colour: number; initial: string };
    /** Raid only: the creature's element id; its colour rings the tile. */
    element?: string;
  };
}

/** Slots drawn together: the dungeon's one plain group of three. */
export interface SlotGroup {
  key: string;
  /** Sprite scale for the group. */
  scale: number;
  slots: readonly SlotModel[];
}

export interface SlotRowProps {
  groups: readonly SlotGroup[];
  stripRef: RefObject<HTMLDivElement>;
  /** Extra class on the strip (the dungeon draws its row of three in a grid). */
  class?: string;
  label: { 'aria-label': string } | { 'aria-labelledby': string };
  /** What an empty slot says. */
  emptyLabel: string;
  disabled: boolean;
  selected: Selection;
  drag: DragDrop;
  /** Drop status of each slot while a creature is dragged, else null. */
  statuses: ReadonlyMap<number, DropStatus> | null;
  /** Slots to highlight next to the carried creature's. */
  adjacent?: ReadonlySet<number>;
  onTap: SlotTap;
}

/** A tap on a slot: its number, and the button, for anything that opens next to it. */
type SlotTap = (slot: number, button: HTMLElement) => void;

/**
 * The dungeon's team: one row of three. Every slot is a button that takes a tap or a press (the drag
 * starts from it), says in its classes what a drop would do here, and keeps its `data-slot` for the
 * keyboard and the hit test. The raid's party is drawn by `RaidBoard`, with the same buttons.
 */
export function SlotRow(props: SlotRowProps) {
  const { drag } = props;
  const dragging = drag.drag?.creatureId ?? null;
  const classes = ['party-strip'];
  if (props.class !== undefined) classes.push(props.class);
  if (dragging !== null) classes.push('dragging');
  return (
    <div ref={props.stripRef} class={classes.join(' ')} role="group" {...props.label}>
      {props.groups.map((group) =>
        group.slots.map((slot) => (
          <SlotButton
            key={slot.index}
            slot={slot}
            scale={group.scale}
            {...slotState(props, slot)}
          />
        )),
      )}
    </div>
  );
}

export interface SlotButtonProps {
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
  onTap: SlotTap;
}

/**
 * The one slot markup: number at the top (the dungeon), then the sprite, name and level, or the empty
 * label. In the raid the owner's initial sits in the corner in the owner's colour, and the element
 * colours the ring round the tile.
 */
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
    const element = c.element === undefined ? '' : elementClass(c.element);
    if (element !== '') classes.push(element);
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
      onClick={(event) => {
        props.onTap(slot.index, event.currentTarget);
      }}
    >
      {slot.hideNumber !== true && <span class="slot-num">{slot.index + 1}</span>}
      {c === null ? (
        <span class="slot-empty">{props.emptyLabel}</span>
      ) : (
        <>
          <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={scale} />
          <span class="slot-species">{c.name}</span>
          <span class="slot-meta">Lv {c.level}</span>
          {c.owner !== undefined && (
            <span class="slot-owner" aria-hidden="true">
              {c.owner.initial}
            </span>
          )}
        </>
      )}
    </button>
  );
}
