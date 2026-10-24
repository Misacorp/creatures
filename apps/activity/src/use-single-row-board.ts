/**
 * The state of the single row of the board (the dungeon's team and the camp's row), shared by
 * `DungeonTeam` and `CampRow`: drag and drop, keyboard walking, the drop statuses, the reaction cues
 * and the effect line, the hint under the row and what a screen reader hears. The two screens add
 * what is their own (the picker, tap-to-swap) and draw the board with `SingleRowBoard`.
 */
import { useRef, useState } from 'preact/hooks';
import { TOUCH_HOLD_MS } from './dnd-core';
import {
  ROW_PLACES,
  ROW_PLACE_NAMES,
  orderHint,
  resolveDrop,
  slotStatuses,
  type Slots,
} from './dungeon-team';
import { getSpecies } from './game';
import { boardKeyTarget, type BoardRow } from './raid-board';
import { affectSlotOf, cuesFor, effectLine, sceneOf } from './ui/slot-cue';
import { useSlotKeyboard } from './ui/use-slot-keyboard';
import { useDragDrop } from './use-drag-drop';

/** The one row of the board: the row's three places, left to right. */
export const ROW: BoardRow = { zone: 'front', slots: ROW_PLACES.map((_, index) => index) };

/** What the row needs to know about a creature standing in it. */
interface RowCreature {
  id: string;
  species: string;
  /** A Guard's reach with its gear (how many creatures it protects on each side); Guards only. */
  guardReach?: { left: number; right: number };
}

/** What a screen reader says for an empty place: "Left slot, empty" (then what a tap does, if anything). */
export function emptySlotLabel(index: number, action?: string): string {
  const spot = ROW_PLACE_NAMES[ROW_PLACES[index] ?? 'left'];
  return action === undefined ? `${spot} slot, empty` : `${spot} slot, empty. ${action}`;
}

interface Options<C extends RowCreature> {
  /** The row now: the creature ids, or null for an empty place. */
  slots: Slots;
  byId: ReadonlyMap<string, C>;
  /** The creature's name as the player sees it (text only). */
  nameOf: (id: string) => string;
  /** True while a request is on its way: no drags can start. */
  disabled: boolean;
  /** The row after a drop that changed it. */
  onSlots: (next: Slots) => void;
  /** Called on every drop (a changed row, or not) before `onSlots`. */
  onDropped?: () => void;
  /** A creature that is carried without a drag (the camp's picked-up one); a drag takes precedence. */
  carried?: string | null;
  /** The slot of the creature whose popover is open. */
  inspected?: number | null;
}

/** Everything the single row needs, from one call. */
export function useSingleRowBoard<C extends RowCreature>(options: Options<C>) {
  const { slots, byId, nameOf, disabled } = options;
  const stripRef = useRef<HTMLDivElement>(null);
  /** The slot under the mouse or the keyboard focus. */
  const [hovered, setHovered] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');

  const dragDrop = useDragDrop({
    disabled,
    stripRef,
    touchHoldMs: TOUCH_HOLD_MS,
    onDrop: (creatureId, target) => {
      const { slots: next, outcome } = resolveDrop(slots, creatureId, target, nameOf);
      announce(outcome.announce);
      setHint(outcome.hint);
      options.onDropped?.();
      if (next !== slots) options.onSlots(next);
      return outcome;
    },
  });
  const dragging = dragDrop.drag?.creatureId ?? null;

  const onKeyDown = useSlotKeyboard({
    stripRef,
    keyTarget: (current, key) => boardKeyTarget([ROW], current, key),
  });

  const statuses = dragging === null ? null : slotStatuses(slots, dragging, nameOf);
  const dragged = dragging === null ? undefined : byId.get(dragging);

  // The row as the cues read it: each creature's role and element, from the content.
  const affectRowOf = (keys: readonly (string | null)[]) =>
    keys.map((id) => {
      const c = id === null ? undefined : byId.get(id);
      return c === undefined ? null : affectSlotOf(getSpecies(c.species), undefined, c.guardReach);
    });
  const mode = { row: 'dungeon' } as const;

  // The cues: the creature in focus (carried, whose popover is open, or under the pointer) and the
  // row as it would stand.
  const scene = sceneOf({
    keys: slots,
    carried: dragging ?? options.carried ?? null,
    pointer: dragDrop.drag?.over?.slot ?? hovered,
    inspected: options.inspected ?? null,
  });
  const cues = cuesFor({ row: affectRowOf(scene.keys), mode, focus: scene.focus, scope: 'row' });
  /** The effect line of the creature at `focus` in the row `keys`. */
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
      ? orderHint(team.map((c) => ({ name: nameOf(c.id), species: c.species })))
      : null;

  return {
    stripRef,
    dragDrop,
    /** The creature being dragged (its id), else null. */
    dragging,
    /** What follows the pointer while a creature is dragged, else undefined. */
    ghost:
      dragged === undefined ? undefined : { species: dragged.species, name: nameOf(dragged.id) },
    onKeyDown,
    statuses,
    cues,
    effect,
    effectOf,
    setHovered,
    hint,
    setHint,
    announcement,
    announce,
    /** What the order sets off, for a screen reader: the cues are only visual. */
    reactionHint,
  };
}

/** What `SingleRowBoard` draws, as `useSingleRowBoard` returns it. */
export type SingleRowBoardState = ReturnType<typeof useSingleRowBoard>;
