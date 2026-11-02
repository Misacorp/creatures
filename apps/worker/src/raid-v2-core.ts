/**
 * The shared parts of the combat v2 raid weekend (docs/design/combat/integration.md, sections 1, 2 and 4): the rules a week plays under,
 * the server's track, the board's grid, the carry between stages and the locks a weekend puts on a creature. Plain synchronous SQL on the
 * guild's database; every writer runs inside the transaction of its caller. Nothing here runs for a v1 week.
 *
 * **The grid.** A v2 board is `rows` rows (the slot's boss's) by `cols` columns (`max(4, players)`, R14.1). A placement's `slot` is
 * column-major, `slot = col * rows + row`, so a wider board (a player joins) never renumbers a slot someone already holds.
 */
import { content } from '@creatures/game';
import { SHIPPED } from './fighter-v2';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  RAID_COLS,
  createResolver,
  slotSpec,
  trackBoss,
  type BossDef,
  type Shipped,
  type StageCarry,
  type StageInputV2,
} from '@creatures/engine/v2';
import { RULES } from '@creatures/game';
import type { RaidRules } from './raid-schedule';

/** The shipped content the resolver and the track's boss read beside the combat v2 pack (shared with the dungeon: `fighter-v2.ts`). */
export const SHIPPED_V2: Shipped = SHIPPED;

/** One resolver for the worker: its memos (merged effects, stats by form and level) are only derived data, never state that must last. */
export const resolver = createResolver(combatV2, SHIPPED_V2);

/** The elements, the element chart and the rules numbers every v2 input carries (an input is whole). */
export const V2_WORLD = {
  version: 2,
  rules: combatV2.rules,
  elements: content.elements.map((e) => e.id),
  chart: content.elementChart,
} as const satisfies Pick<StageInputV2, 'version' | 'rules' | 'elements' | 'chart'>;

/** The week's rules version: 1 for a week that is not stored (or from before the column). */
export function weekRules(sql: SqlStorage, weekId: string): RaidRules {
  const row = sql
    .exec<{ rules_version: number }>(
      'SELECT rules_version FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .toArray()[0];
  return row?.rules_version === 2 ? 2 : 1;
}

// --- The track ---

/** The server's track: where it stands on the bosses, and what it carries between weekends (R24). */
export interface TrackRow {
  /** The slot, which is the Boss Rank. */
  slot: number;
  /** The most of the slot's HP removed in one weekend so far, bp, never above 10000. */
  bestShareBp: number;
  /** Weekends lost on this slot from the second lap on (Determination's stacks). */
  failedWeekends: number;
  updatedWeek: string | null;
}

export function readTrack(sql: SqlStorage): TrackRow | null {
  const row = sql
    .exec<{
      slot: number;
      best_share_bp: number;
      failed_weekends: number;
      updated_week: string | null;
    }>('SELECT slot, best_share_bp, failed_weekends, updated_week FROM raid_track WHERE id = 1')
    .toArray()[0];
  return row === undefined
    ? null
    : {
        slot: row.slot,
        bestShareBp: row.best_share_bp,
        failedWeekends: row.failed_weekends,
        updatedWeek: row.updated_week,
      };
}

/** The track, made at slot 1 for a server that has none yet (its first v2 week). */
export function ensureTrack(sql: SqlStorage): TrackRow {
  sql.exec(
    'INSERT OR IGNORE INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 1, 0, 0)',
  );
  const row = readTrack(sql);
  if (row === null) throw new Error('the raid track could not be made');
  return row;
}

/** Determination's bonus (bp of damage and healing) for a slot and the failed weekends on it (R24.9): none before the second lap. */
export function determinationBpFor(slot: number, failedWeekends: number): number {
  const { stackBp, maxStacks, fromSlot } = RULES.raid.v2.determination;
  return slot >= fromSlot ? Math.min(failedWeekends, maxStacks) * stackBp : 0;
}

// --- The grid ---

/** The boss of a slot: its id and the rows of its arena. */
export function slotBossInfo(slot: number): { bossId: string; rows: number } {
  const { bossId } = slotSpec(combatV2, slot);
  const own = Object.hasOwn(combatV2.raidBosses, bossId) ? combatV2.raidBosses[bossId] : undefined;
  if (own === undefined) throw new Error(`unknown raid boss ${bossId}`);
  return { bossId, rows: own.rows };
}

/** The columns of a board for `players` players: four at least (a smaller party fights at four, R14.1). */
export const colsFor = (players: number): number => Math.max(RAID_COLS, players);

/** A slot's place on the grid. */
export const gridPlace = (slot: number, rows: number): { row: number; col: number } => ({
  row: slot % rows,
  col: Math.floor(slot / rows),
});

/** The slot number of a place on the grid. */
export const slotAt = (row: number, col: number, rows: number): number => col * rows + row;

/** The slot's boss for `players` players, as it fights. */
export function weekendBoss(slot: number, players: number): BossDef {
  return trackBoss(combatV2, SHIPPED_V2, slot, { players });
}

// --- The carry ---

/** What a party has stored: the carry after its last stage and the players it had at stage 1; null before stage 1. */
export interface PartyCarry {
  carry: StageCarry;
  players: number;
}

export function readPartyCarry(sql: SqlStorage, weekId: string, party: number): PartyCarry | null {
  const row = sql
    .exec<{
      carry_json: string | null;
      v2_players: number | null;
    }>(
      'SELECT carry_json, v2_players FROM raid_parties WHERE week_id = ? AND party = ?',
      weekId,
      party,
    )
    .toArray()[0];
  if (row === undefined || row.carry_json === null || row.v2_players === null) return null;
  return { carry: JSON.parse(row.carry_json) as StageCarry, players: row.v2_players };
}

/** Every carry of a week (parties that played a stage), by party. */
export function weekCarries(sql: SqlStorage, weekId: string): Map<number, PartyCarry> {
  const map = new Map<number, PartyCarry>();
  for (const row of sql
    .exec<{ party: number; carry_json: string; v2_players: number | null }>(
      'SELECT party, carry_json, v2_players FROM raid_parties WHERE week_id = ? AND carry_json IS NOT NULL',
      weekId,
    )
    .toArray()) {
    map.set(row.party, {
      carry: JSON.parse(row.carry_json) as StageCarry,
      players: row.v2_players ?? 0,
    });
  }
  return map;
}

/** The creatures knocked out so far this weekend in a party (a knocked-out creature cannot be placed again). */
export function outOf(sql: SqlStorage, weekId: string, party: number): ReadonlySet<string> {
  return new Set(readPartyCarry(sql, weekId, party)?.carry.out ?? []);
}

// --- The locks ---

/**
 * Whether a creature has fought this weekend: it is in the carry of a party of the latest raid week, standing (it has HP in the carry)
 * or knocked out. The weekend lasts until the next week opens, so a creature that fought on Saturday is locked through Sunday's finale
 * and until the next Monday's start. False for a v1 week, and when no stage has been played.
 */
export function hasFoughtThisWeekend(sql: SqlStorage, creatureId: string): boolean {
  const week = sql
    .exec<{
      week_id: string;
      rules_version: number;
    }>('SELECT week_id, rules_version FROM raid_weeks ORDER BY week_id DESC LIMIT 1')
    .toArray()[0];
  if (week === undefined || week.rules_version !== 2) return false;
  for (const { carry } of weekCarries(sql, week.week_id).values()) {
    if (Object.hasOwn(carry.hp, creatureId) || carry.out.includes(creatureId)) return true;
  }
  return false;
}
