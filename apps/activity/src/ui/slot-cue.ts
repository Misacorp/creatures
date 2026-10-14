/**
 * The visual cues of a placement row, as plain data. Two things draw on the tiles:
 *
 * - **Reaction cues** (what the placement sets off): the creatures that would react light up as a
 *   pair, each with a small badge naming the reaction. The reaction names and the two elements
 *   (the mark's and the hit's, which colour the pair) come from the content, never from this file.
 * - **Influence** (what a creature affects): a soft shade on the tiles a Support buffs and a Guard
 *   covers.
 *
 * Both come from `affects` and `slotReactions` of the engine, so a cue is exactly what the fight does.
 * Pure: `SlotRow` and `RaidBoard` draw the result, and the dungeon team and the raid Placement wire it.
 *
 * Precedence (one rule per question, so the cues never fight):
 *
 * 1. Whose cues show (one creature at a time): a creature being carried (dragged, or picked up by a
 *    tap or a key), then the creature whose popover is open, then the one under the pointer or the
 *    keyboard focus. A carried creature shows where it WOULD stand: over a slot it can go to, the row
 *    is previewed with the creature moved there.
 * 2. Where they draw: a reaction cue is a coloured ring and a badge on the tile; influence is a
 *    shade of the tile's fill. A tile can carry both, so neither hides the other, and a drop's
 *    valid or refused outline (the drag) and the gold ring of a selected tile stay as they are.
 */
import { RULES, content, type Element, type ReactionDef, type Role } from '@creatures/game';
import {
  affects,
  slotReactions,
  type AffectMode,
  type AffectRow,
  type AffectSlot,
} from '@creatures/engine';

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
  /** A Support's buff reaches this tile. */
  buff?: true;
  /** A Guard would take this tile's hits. */
  cover?: true;
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
  for (const a of affects(row, focus, mode, reactions)) {
    if (a.kind === 'buff') add(a.slot, { buff: true });
    else if (a.kind === 'cover') add(a.slot, { cover: true });
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
 * Picks the scene (precedence rule 1 above). `carried` is the creature being dragged or picked up;
 * `pointer` the slot dragged over, or under the mouse or the keyboard focus; `inspected` the slot of the
 * creature whose popover is open. `canDrop` says whether the carried creature may go to a slot (the
 * raid refuses another player's tile); without it every slot takes it.
 */
export function sceneOf(args: {
  keys: SlotKeys;
  carried: string | null;
  pointer: number | null;
  inspected?: number | null;
  canDrop?: (slot: number) => boolean;
}): Scene {
  const { keys, carried, pointer } = args;
  const inspected = args.inspected ?? null;
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
  return { keys, focus: standing(inspected) ?? standing(pointer) };
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
  if (cue.buff === true) out.push('cue-buff');
  if (cue.cover === true) out.push('cue-cover');
  return out.filter((c) => c !== '');
}

// --- Words ---

const percent = (bp: number): string => `${String(Math.floor(bp / 100))}%`;

/** A multiplier in basis points as "4.5" (45000), whole numbers without the point. */
function times(bp: number): string {
  const whole = bp / 10_000;
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(1).replace(/\.0$/, '');
}

/**
 * One short plain line about what the creature in `focus` does for the row, with the real numbers
 * (`RULES`), or null when it does nothing special. The popover and the row's caption show it. Names are
 * the players' own: text only.
 */
export function effectLine(args: {
  row: AffectRow;
  mode: AffectMode;
  focus: number;
  /** The name to print for a slot's creature. */
  nameOf: (slot: number) => string;
  reactions?: readonly ReactionDef[];
}): string | null {
  const { row, mode, focus } = args;
  const reactions = args.reactions ?? content.reactions;
  const me = row[focus];
  if (me === undefined || me === null) return null;
  const parts: string[] = [];
  const role: Role = me.role;
  if (role === 'support') {
    parts.push(`Boosts its neighbours' next hit by ${percent(RULES.combat.supportBuffBp)}.`);
  } else if (role === 'guard') {
    const who = mode.row === 'dungeon' ? 'the creatures beside it' : 'the others in its row';
    parts.push(
      `Takes the boss's hits for ${who}, with ${percent(RULES.combat.guardHpBp)} more HP.`,
    );
  }
  const partners = affects(row, focus, mode, reactions).flatMap((a) =>
    a.kind === 'reaction' ? [a] : [],
  );
  const first = partners[0];
  const def = first === undefined ? undefined : reactionOf(first.reaction, reactions);
  if (first !== undefined && def !== undefined) {
    const other = args.nameOf(first.slot);
    const more = partners.length > 1 ? ` (and ${String(partners.length - 1)} more)` : '';
    parts.push(
      first.partner === 'payoff'
        ? `Sets up ${def.name} (x${times(def.multiplierBp)}) for ${other}${more}.`
        : `Sets off ${def.name} (x${times(def.multiplierBp)}) on ${other}'s mark${more}.`,
    );
  }
  return parts.length === 0 ? null : parts.join(' ');
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
