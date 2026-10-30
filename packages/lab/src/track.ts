/**
 * The boss track: which raid boss a server meets at which Boss Rank, as data (`docs/design/combat/boss-track.md`).
 *
 * The track is an ordered list of slots, each a boss and the strength of its cards. A server starts at slot 1 (Boss Rank 1) and
 * a win moves it one slot on; after the last boss the track starts again with the next, stronger cards (the slot number is the
 * Boss Rank, and the strength follows the rank up to the cap). Failing a boss keeps the slot (`path.ts` plays that out).
 */
import { content } from '@creatures/game';
import { RAID_RANKS, raidBossOf } from './bosses';
import { absoluteOf, nativeOf, type Numbers } from './tuner';
import type { BossDef } from './types';

/**
 * The order of the bosses on the track: the shipped game's boss order (`content.bosses`). It is one line to change: Misa may
 * reorder it, or list a boss twice (every id must be one of `RAID_BOSS_IDS`; `test/track.test.ts` checks it).
 */
export const TRACK_ORDER: readonly string[] = content.bosses.map((b) => b.id);

export interface TrackSlot {
  /** The slot, and the Boss Rank it stands for (slot 1 is Boss Rank 1). */
  readonly slot: number;
  readonly bossId: string;
  /** The strength of every card and gate (bp of the full card). */
  readonly strengthBp: number;
}

/** The numbers a slot may set by hand (absolute, before cards), replacing the ones interpolated from the ranks. */
export type SlotNumbers = Partial<Numbers>;

/**
 * Per-slot numbers, overridable (slot number to HP, Attack and armour). Empty: every slot interpolates the three ranks' numbers
 * (`rankNumbers`). The tuner will fill it in a later step, one entry per slot, tuned for the roster the path says arrives there.
 */
export const SLOT_NUMBERS: Readonly<Record<number, SlotNumbers>> = {};

/** The strength of a slot's cards, by slot, when set by hand (bp). Empty: the rank ladder (`rankStrengthBp`). */
export const SLOT_STRENGTH: Readonly<Record<number, number>> = {};

/** Linear interpolation of `value` over the ranks `[rank, v]`: flat outside them, unless `extend` carries the first segment below. */
function across(
  points: readonly (readonly [rank: number, value: number])[],
  rank: number,
  extend: boolean,
): number {
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (rank >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [r0, v0] = points[i - 1] as readonly [number, number];
    const [r1, v1] = points[i] as readonly [number, number];
    if (rank <= r1 && (rank >= r0 || (i === 1 && extend)))
      return v0 + ((v1 - v0) * (rank - r0)) / (r1 - r0);
  }
  return first[1];
}

/**
 * The strength of the cards at a Boss Rank: the ladder's three settings (30%, 65% and 100% at ranks 2, 5 and 10), straight lines
 * between them, the 2-to-5 line carried down to rank 1 (about 18%), and 100% from rank 10 up.
 */
export function rankStrengthBp(rank: number): number {
  return Math.round(
    Math.max(
      0,
      across(
        RAID_RANKS.map((r) => [r.rank, r.strengthBp] as const),
        rank,
        true,
      ),
    ),
  );
}

/** The level of the lab roster the ladder pairs with a Boss Rank (12, 18 and 25 at ranks 2, 5 and 10, flat outside). */
export function rankLevel(rank: number): number {
  return Math.round(
    across(
      RAID_RANKS.map((r) => [r.rank, r.level] as const),
      rank,
      false,
    ),
  );
}

/**
 * A boss's HP, Attack and armour at a Boss Rank between the three the lab sets up: the ranks' own absolute numbers
 * (`raidBossOf` at low, mid and high), straight lines between them and flat outside (rank 1 has the low rank's, rank 10 and up
 * the high's). The armour is the number before the card's own share is added, as `raidBossOf` takes it.
 */
export function rankNumbers(bossId: string, rank: number): Numbers {
  const at = RAID_RANKS.map(
    (r) => [r.rank, absoluteOf(bossId, r.id, nativeOf(bossId, r.id))] as const,
  );
  const line = (pick: (n: Numbers) => number) =>
    Math.round(
      across(
        at.map(([r, n]) => [r, pick(n)] as const),
        rank,
        false,
      ),
    );
  return { hp: line((n) => n.hp), atk: line((n) => n.atk), armour: line((n) => n.armour) };
}

/** Slot `slot` (1 and up) of the track: the boss in order, repeating after the last, and the strength of its cards. */
export function trackSlot(slot: number, order: readonly string[] = TRACK_ORDER): TrackSlot {
  if (!Number.isInteger(slot) || slot < 1)
    throw new Error(`a track slot is a whole number from 1, not ${slot}`);
  return {
    slot,
    bossId: order[(slot - 1) % order.length] as string,
    strengthBp: SLOT_STRENGTH[slot] ?? rankStrengthBp(slot),
  };
}

/** The first `length` slots as a list. */
export const buildTrack = (length: number, order: readonly string[] = TRACK_ORDER): TrackSlot[] =>
  Array.from({ length }, (_, i) => trackSlot(i + 1, order));

/** The track as the lab plans with it: thirty slots (six laps of five bosses, far more than 24 weeks reach). */
export const TRACK: readonly TrackSlot[] = buildTrack(30);

/**
 * The boss of a slot, built with `raidBossOf`: its numbers interpolated from the ranks (or `SLOT_NUMBERS`), its cards at the slot's
 * strength. `level` is the roster level the boss names for its picks (the lab's creatures at that rank by default); the path gives
 * every creature its own level and does not read it.
 */
export function slotBoss(
  slot: number,
  roster: { readonly level?: number; readonly order?: readonly string[] } = {},
): BossDef {
  const s = trackSlot(slot, roster.order);
  const n = { ...rankNumbers(s.bossId, slot), ...SLOT_NUMBERS[slot] };
  return raidBossOf(s.bossId, {
    ...n,
    strengthBp: s.strengthBp,
    level: roster.level ?? rankLevel(slot),
  });
}
