/**
 * The visual cues of a placement row, as plain data: the creatures that would react light up as a
 * pair, each with a small badge naming the reaction. The reaction names and the two elements (the
 * mark's and the hit's, which colour the pair) come from the content, never from this file. The
 * pairs come from `slotReactions` of the engine, so a cue is exactly what the fight does. Pure:
 * `SlotRow` and `RaidBoard` draw the result, and the dungeon team and the raid Placement wire it.
 *
 * One creature is in focus at a time: one being carried (dragged, or picked up by a tap or a key),
 * then the one under the pointer or the keyboard focus. A carried creature shows where it WOULD stand:
 * over a slot it can go to, the row is previewed with the creature moved there.
 */
import { content, type Element, type ReactionDef, type Role } from '@creatures/game';
import { slotReactions, type AffectMode, type AffectRow, type AffectSlot } from '@creatures/engine';

/** What a reaction cue says about a tile. */
export interface ReactionCue {
  /** The reaction's content id. */
  id: string;
  /** Its name, from the content ("Steam"). */
  name: string;
  /** What this tile's creature does in it: leaves the mark, or sets it off. */
  role: 'marker' | 'payoff';
  /** The element that colours the tile's ring: the mark's for the marker, the hit's for the payoff. */
  element: Element;
}

/** What is drawn on one tile. */
export interface SlotCue {
  reaction?: ReactionCue;
}

/** The cues of a whole row. */
export interface RowCues {
  slots: ReadonlyMap<number, SlotCue>;
  /**
   * The cue is on and nothing in the row would react (a whole row of the dungeon; for the raid, the
   * creature in focus takes part in no reaction). The row gets its "no reaction" mark.
   */
  none: boolean;
}

export const NO_CUES: RowCues = { slots: new Map(), none: false };

/** How the cues answer "what reacts": all the reactions of the row, or only those of the creature in focus. */
export type CueScope = 'row' | 'focus';

const reactionOf = (id: string, reactions: readonly ReactionDef[]) =>
  reactions.find((r) => r.id === id);

/** The cues for a row with `focus` (a slot, or null for none) in focus. */
export function cuesFor(args: {
  row: AffectRow;
  mode: AffectMode;
  focus: number | null;
  scope: CueScope;
  reactions?: readonly ReactionDef[];
}): RowCues {
  const { row, mode, focus, scope } = args;
  const reactions = args.reactions ?? content.reactions;
  if (focus === null || row[focus] === undefined || row[focus] === null) return NO_CUES;
  const slots = new Map<number, SlotCue>();
  const add = (slot: number, cue: SlotCue): void => {
    slots.set(slot, { ...slots.get(slot), ...cue });
  };
  const pairs = slotReactions(row, mode, reactions).filter(
    (r) => scope === 'row' || r.marker === focus || r.payoff === focus,
  );
  for (const r of pairs) {
    const def = reactionOf(r.reaction, reactions);
    if (def === undefined) continue;
    if (slots.get(r.marker)?.reaction === undefined) {
      add(r.marker, {
        reaction: { id: def.id, name: def.name, role: 'marker', element: def.markElement },
      });
    }
    if (slots.get(r.payoff)?.reaction === undefined) {
      add(r.payoff, {
        reaction: { id: def.id, name: def.name, role: 'payoff', element: def.triggerElement },
      });
    }
  }
  // The dungeon's row judges a whole team: with an empty slot there is no order to call "no reaction".
  const judged = scope === 'focus' || row.every((s) => s !== null);
  return { slots, none: judged && pairs.length === 0 };
}

/** The creature ids by slot (null: empty). */
export type SlotKeys = readonly (string | null)[];

/** `id` moved to `slot`: it swaps with whoever stands there, and a creature from the tray sends that one back to it. */
export function movedKeys(keys: SlotKeys, id: string, slot: number): (string | null)[] {
  const next = [...keys];
  const from = next.indexOf(id);
  const other = next[slot] ?? null;
  if (from >= 0) next[from] = other;
  next[slot] = id;
  return next;
}

/** What the cues are about: the row to read (a preview while carrying) and the slot in focus. */
export interface Scene {
  keys: SlotKeys;
  focus: number | null;
}

/**
 * Picks the scene. `carried` is the creature being dragged or picked up; `pointer` the slot dragged
 * over, or under the mouse or the keyboard focus. `canDrop` says whether the carried creature may go
 * to a slot (the raid refuses another player's tile); without it every slot takes it.
 */
export function sceneOf(args: {
  keys: SlotKeys;
  carried: string | null;
  pointer: number | null;
  canDrop?: (slot: number) => boolean;
}): Scene {
  const { keys, carried, pointer } = args;
  const standing = (slot: number | null): number | null =>
    slot !== null && keys[slot] !== undefined && keys[slot] !== null ? slot : null;
  if (carried !== null) {
    if (
      pointer !== null &&
      pointer >= 0 &&
      pointer < keys.length &&
      args.canDrop?.(pointer) !== false
    ) {
      return { keys: movedKeys(keys, carried, pointer), focus: pointer };
    }
    const at = keys.indexOf(carried);
    return { keys, focus: at >= 0 ? at : null };
  }
  return { keys, focus: standing(pointer) };
}

// --- The class names a tile gets ---

const ELEMENT_SLUG = /^[a-z-]+$/;

/** The class that gives a reaction ring its colour (`--cue`), from the element id. */
export function cueElementClass(element: string): string {
  return ELEMENT_SLUG.test(element) ? `cue-el-${element}` : '';
}

/** The classes a tile gets for its cue (empty for no cue). */
export function cueClasses(cue: SlotCue | undefined): string[] {
  if (cue === undefined) return [];
  const out: string[] = [];
  if (cue.reaction !== undefined) {
    out.push('cue-react', `cue-${cue.reaction.role}`, cueElementClass(cue.reaction.element));
  }
  return out.filter((c) => c !== '');
}

/** The element of a species as the helper wants it, or null for a species the content does not know. */
export function affectSlotOf(
  species: { role: Role; element: Element } | undefined,
  speed?: number,
): AffectSlot | null {
  if (species === undefined) return null;
  return speed === undefined
    ? { role: species.role, element: species.element }
    : { role: species.role, element: species.element, speed };
}
