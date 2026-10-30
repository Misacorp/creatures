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

/** A table of per-slot numbers (slot number to HP, Attack and armour), like `SLOT_NUMBERS`. */
export type SlotTable = Readonly<Record<number, SlotNumbers>>;

/**
 * Per-slot numbers (slot number to HP, Attack and armour, absolute before cards), data. A slot without an entry interpolates the
 * three ranks' numbers (`rankNumbers`). Tuned by `node scripts/report.mjs --tune --track` (`trackTuner.ts`) for the roster the path
 * says arrives at each slot; slots 1 to 15 (three laps), later laps follow the high rank's numbers but never fall below the lap before
 * (`slotNumbers`).
 */
export const SLOT_NUMBERS: SlotTable = {
  1: { hp: 15_400, atk: 83, armour: 25 }, // tidal-colossus
  2: { hp: 10_900, atk: 118, armour: 39 }, // cinder-wyrm
  3: { hp: 9_400, atk: 54, armour: 187 }, // thornmother
  4: { hp: 8_600, atk: 96, armour: 7 }, // storm-sovereign
  5: { hp: 37_400, atk: 58, armour: 13 }, // old-bogback
  6: { hp: 17_000, atk: 128, armour: 29 }, // tidal-colossus
  7: { hp: 21_000, atk: 125, armour: 51 }, // cinder-wyrm
  8: { hp: 9_400, atk: 69, armour: 258 }, // thornmother
  9: { hp: 8_600, atk: 105, armour: 8 }, // storm-sovereign
  10: { hp: 37_400, atk: 96, armour: 19 }, // old-bogback
  11: { hp: 17_000, atk: 128, armour: 30 }, // tidal-colossus
  12: { hp: 22_500, atk: 130, armour: 59 }, // cinder-wyrm
  13: { hp: 9_400, atk: 87, armour: 261 }, // thornmother
  14: { hp: 8_600, atk: 109, armour: 8 }, // storm-sovereign
  15: { hp: 37_400, atk: 96, armour: 24 }, // old-bogback
};

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
 * A slot's own numbers: its `table` entry (any number the entry leaves out comes from the ranks' lines, `rankNumbers`), without the
 * lap rule.
 */
export function ownNumbers(
  slot: number,
  table: SlotTable = SLOT_NUMBERS,
  order: readonly string[] = TRACK_ORDER,
): Numbers {
  return { ...rankNumbers(trackSlot(slot, order).bossId, slot), ...table[slot] };
}

/**
 * A slot's HP, Attack and armour: its own numbers, but never below the same boss's on the lap before (a later lap is never
 * easier; Misa, 2026-10-30), checked up the laps (slot - n, slot - 2n, ... for a track of n bosses).
 */
export function slotNumbers(
  slot: number,
  table: SlotTable = SLOT_NUMBERS,
  order: readonly string[] = TRACK_ORDER,
): Numbers {
  const own = ownNumbers(slot, table, order);
  if (slot <= order.length) return own;
  const before = slotNumbers(slot - order.length, table, order);
  return {
    hp: Math.max(own.hp, before.hp),
    atk: Math.max(own.atk, before.atk),
    armour: Math.max(own.armour, before.armour),
  };
}

/**
 * The boss of a slot, built with `raidBossOf`: its numbers (`slotNumbers`: the table, else interpolated from the ranks), its cards at
 * the slot's strength. `level` is the roster level the boss names for its picks (the lab's creatures at that rank by default); the
 * path gives every creature its own level and does not read it. `table` replaces `SLOT_NUMBERS` (the tuner tries numbers this way).
 */
export function slotBoss(
  slot: number,
  roster: {
    readonly level?: number;
    readonly order?: readonly string[];
    readonly table?: SlotTable;
  } = {},
): BossDef {
  const s = trackSlot(slot, roster.order);
  return raidBossOf(s.bossId, {
    ...slotNumbers(slot, roster.table, roster.order),
    strengthBp: s.strengthBp,
    level: roster.level ?? rankLevel(slot),
  });
}
