/**
 * Dismantling worn items (decisions.md, 2026-10-27, "Bulk selection replaces marking"): the dismantle takes
 * a worn item off its wearer in the same transaction. A creature that is away on a trip or running a Workshop
 * job has its gear frozen for equipping (`Gear.equip`), because the claim reads some lines live. Dismantling
 * may still take an item off such a creature when that changes nothing a running activity reads:
 *
 * - a trip fixes the time (Quick feet) and its tick count (Crossroads Wanderer's 24 hour roll) when it is sent,
 *   but its claim reads Trail XP, Keen nose, Lucky find, Packer, Second look and the glimmer find live;
 * - a Workshop job fixes its time (Busy paws), Crafting level, odds and the day's mods when it starts, but its
 *   claim reads Apprentice (the Crafting XP) and, for an old dismantle job, Tinker's luck live;
 * - a dungeon run freezes every creature's gear into its fight input (and its `gear` ids), a raid phase or the
 *   live finale stores its fight inputs when it is built, and the Games snapshot their entrants at the lock: none
 *   of them reads the worn items again, so an item on a creature in one of these goes freely.
 *
 * The check is exact, not by item kind: the creature's rules are folded with and without the item, and the item
 * is locked only when a field the running activity reads live differs. Sets and caps are handled by the fold.
 */
import type { GearRules } from '@creatures/game';
import type { CreatureRow } from './gear-access';
import { gearRulesOf } from './gear-worn';
import type { GearRow } from './gear-store';
import { openJobOf } from './gear-store';

/** What a refused item was blocked by: the trip or the Workshop job its wearer is on. */
export type LockReason = 'trip' | 'job';

export interface ItemLock {
  itemId: string;
  /** The creature that wears it. */
  creatureId: string;
  reason: LockReason;
}

/** The rules a trip's claim reads from the worn gear when it pays. */
export const TRIP_LIVE_RULES = [
  'trailXpBp',
  'keenNoseBp',
  'luckyFindBp',
  'packerBp',
  'glimmerFindBp',
  'secondLookBp',
] as const satisfies readonly (keyof GearRules)[];

/** The rules a Workshop job's claim reads from the worn gear when it pays. */
export const JOB_LIVE_RULES = [
  'apprenticeBp',
  'tinkersLuckBp',
] as const satisfies readonly (keyof GearRules)[];

function differs(a: GearRules, b: GearRules, fields: readonly (keyof GearRules)[]): boolean {
  return fields.some((f) => a[f] !== b[f]);
}

/**
 * The items among `rows` that cannot be taken off now: worn by a creature that is away or on a job, where
 * removing the item would change a rule the running activity reads at its claim. Items that are not worn,
 * or whose wearer is free, or whose removal changes nothing running, are never locked. Read only.
 */
export function dismantleLocks(
  sql: SqlStorage,
  userId: string,
  rows: readonly GearRow[],
): ItemLock[] {
  const wearers = new Set<string>();
  for (const row of rows) if (row.equipped_on !== null) wearers.add(row.equipped_on);
  const locks: ItemLock[] = [];
  for (const wearerId of wearers) {
    const creature = sql
      .exec<CreatureRow>(
        'SELECT id, species, level, fusion_count, nickname, away_expedition_id FROM creatures WHERE id = ? AND user_id = ?',
        wearerId,
        userId,
      )
      .toArray()[0];
    if (creature === undefined) continue;
    const reads: { reason: LockReason; fields: readonly (keyof GearRules)[] }[] = [];
    if (creature.away_expedition_id !== null)
      reads.push({ reason: 'trip', fields: TRIP_LIVE_RULES });
    if (openJobOf(sql, creature.id) !== null) reads.push({ reason: 'job', fields: JOB_LIVE_RULES });
    if (reads.length === 0) continue;
    const mine = rows.filter((r) => r.equipped_on === wearerId);
    const now = gearRulesOf(sql, creature);
    const lockedHere = new Map<string, LockReason>();
    for (const row of mine) {
      const after = gearRulesOf(sql, creature, new Set([row.id]));
      const hit = reads.find((r) => differs(now, after, r.fields));
      if (hit !== undefined) lockedHere.set(row.id, hit.reason);
    }
    // Items that are fine one by one may still change a capped rule together: then none of them goes.
    const rest = mine.filter((r) => !lockedHere.has(r.id));
    if (rest.length > 1) {
      const after = gearRulesOf(sql, creature, new Set(rest.map((r) => r.id)));
      const hit = reads.find((r) => differs(now, after, r.fields));
      if (hit !== undefined) for (const row of rest) lockedHere.set(row.id, hit.reason);
    }
    for (const row of mine) {
      const reason = lockedHere.get(row.id);
      if (reason !== undefined) locks.push({ itemId: row.id, creatureId: wearerId, reason });
    }
  }
  return locks;
}
