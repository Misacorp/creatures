import {
  content,
  rowReactions,
  type Element,
  type ReactionDef,
  type Role,
  type TurnOrder,
} from '@creatures/game';
import { turnOrder } from './fight';
import { neighbours, zoneIndices, zoneNeighbours, zoneOfIndex } from './zones';

/**
 * Who a creature affects in its row, worked out from the engine's own rules so a screen that shades
 * the tiles can never drift from the fight: a Support's buff reaches `besides` (the plain line in the
 * dungeon, the same zone in the raid), a Guard covers whoever it would take a hit for, and a reaction
 * needs the order creatures act in. Pure: no I/O, no dice.
 */

/** What the helper needs to know about a creature standing in a slot. */
export interface AffectSlot {
  role: Role;
  element: Element;
  /**
   * Speed, only read when the row acts in speed order (a raid boss whose turn order is `speed`).
   * Missing counts as 0, so a screen that does not know the real speeds is only a guess there.
   */
  speed?: number;
}

/** A row slot: a creature, or null for a slot nobody stands in yet. */
export type AffectRow = readonly (AffectSlot | null)[];

/** The two kinds of row: the dungeon (a row of three, always left to right) and the raid (zones, the boss's turn order). */
export type AffectMode = { row: 'dungeon' } | { row: 'raid'; turnOrder: TurnOrder };

/** One reaction of the row, in slot numbers: the creature that leaves the mark and the one that sets it off. */
export interface SlotReaction {
  marker: number;
  payoff: number;
  /** The reaction's content id (`steam`...). */
  reaction: string;
}

/** A slot a creature affects, and how. */
export type Affect =
  | { slot: number; kind: 'buff' }
  | { slot: number; kind: 'cover' }
  | {
      slot: number;
      kind: 'reaction';
      reaction: string;
      /** What the other creature does in the reaction: it leaves the mark, or sets it off. */
      partner: 'marker' | 'payoff';
    };

/** Slots directly beside `index` for the Support's buff, as `simulateFight` counts them. */
function besides(index: number, length: number, mode: AffectMode): number[] {
  return mode.row === 'dungeon' ? neighbours(index, length) : zoneNeighbours(index, length);
}

/**
 * The reactions of a row (null slots are skipped), as `rowReactions` plays the marks in the order the
 * row acts: left to right in the dungeon, the boss's turn order in the raid (speed order: fastest
 * first, ties by position; serpentine: round 1's order). Slot numbers, not positions in the acting order. Each marker, payoff and
 * reaction triple appears once.
 */
export function slotReactions(
  row: AffectRow,
  mode: AffectMode,
  reactions: readonly ReactionDef[] = content.reactions,
): SlotReaction[] {
  const present = row.flatMap((s, idx) => (s === null ? [] : [{ idx, spd: s.speed ?? 0 }]));
  // Serpentine shows round 1's order (the rows flip every round).
  const slotAt = turnOrder(present, mode.row === 'dungeon' ? 'left_to_right' : mode.turnOrder, {
    round: 1,
    board: { length: row.length, slots: present.map((p) => p.idx) },
  });
  const acting = slotAt.map((idx) => row[idx] as AffectSlot);
  const out: SlotReaction[] = [];
  const seen = new Set<string>();
  for (const r of rowReactions(acting, reactions)) {
    const marker = slotAt[r.marker];
    const payoff = slotAt[r.payoff];
    if (marker === undefined || payoff === undefined) continue;
    const key = `${String(marker)}:${String(payoff)}:${r.reaction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ marker, payoff, reaction: r.reaction });
  }
  return out;
}

/**
 * The slots the creature at `index` affects:
 *
 * - `buff` (a Support): the slots beside it. Their next hit gets the Support's bonus.
 * - `cover` (a Guard): the slots whose hits it takes. In the raid, every other slot of its zone (the
 *   boss's hit on a creature goes to a Guard of that zone); in the dungeon, the slots right beside
 *   it. A slot with a Guard in it is never covered.
 * - `reaction` (any role): the creatures it sets off a reaction with, or that set one off with it.
 *
 * Empty slots count where a creature standing there would be affected. The result is empty for an
 * empty slot or a slot that is not in the row. A slot can appear more than once (a neighbour that is
 * also a reaction partner).
 */
export function affects(
  row: AffectRow,
  index: number,
  mode: AffectMode,
  reactions: readonly ReactionDef[] = content.reactions,
): Affect[] {
  const me = row[index];
  if (me === undefined || me === null) return [];
  const length = row.length;
  const out: Affect[] = [];
  if (me.role === 'support') {
    for (const slot of besides(index, length, mode)) out.push({ slot, kind: 'buff' });
  }
  if (me.role === 'guard') {
    const reach =
      mode.row === 'dungeon'
        ? neighbours(index, length)
        : zoneIndices(zoneOfIndex(index, length), length).filter((i) => i !== index);
    for (const slot of reach) {
      if (row[slot]?.role !== 'guard') out.push({ slot, kind: 'cover' });
    }
  }
  for (const r of slotReactions(row, mode, reactions)) {
    if (r.marker === index) {
      out.push({ slot: r.payoff, kind: 'reaction', reaction: r.reaction, partner: 'payoff' });
    } else if (r.payoff === index) {
      out.push({ slot: r.marker, kind: 'reaction', reaction: r.reaction, partner: 'marker' });
    }
  }
  return out;
}
