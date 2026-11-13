/**
 * The shared parts of the combat v2 raid weekend (docs/design/combat/integration.md, sections 1, 2 and 4): the rules a week plays under,
 * the server's track, the board's grid, the carry between stages and the locks a weekend puts on a creature. Plain synchronous SQL on the
 * guild's database; every writer runs inside the transaction of its caller. Nothing here runs for a v1 week.
 *
 * **The grid.** A v2 board is `rows` rows (the slot's boss's) by `cols` columns (one per player, R14.1; no floor of four since 2026-11-04). A placement's `slot` is
 * column-major, `slot = col * rows + row`, so a wider board (a player joins) never renumbers a slot someone already holds.
 *
 * **The piece (Misa, 2026-11-03).** The boss's arena piece (`piece` in raid-bosses.json) is what one player adds: today one column of the
 * boss's rows. A player brings as many creatures as the piece has seats (`seatsFor`), and until stage 1 locks the board is the piece per
 * player plus one spare piece (`colsFor(players, true)`), so a newcomer can always place a first creature. Stage 1 drops the spare piece but moves
 * nobody: every creature keeps its seat, and a board with a creature in the spare column is that column wider.
 */
import { content } from '@creatures/game';
import { SHIPPED } from './fighter-v2';
import { combatV2 } from '@creatures/game/combat-v2';
import {
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

/** The boss of a slot: its id, the rows of its arena and the seats of one player's piece (the creatures a player brings). */
export function slotBossInfo(slot: number): { bossId: string; rows: number; seats: number } {
  const { bossId } = slotSpec(combatV2, slot);
  const own = Object.hasOwn(combatV2.raidBosses, bossId) ? combatV2.raidBosses[bossId] : undefined;
  if (own === undefined) throw new Error(`unknown raid boss ${bossId}`);
  return { bossId, rows: own.rows, seats: own.piece.rows };
}

/**
 * The arena of a slot's boss as one week plays it: the board's rows, the creatures one player brings (`seats`) and the creatures the boss's
 * own piece holds (`pieceSeats`). They are the same unless the dev tools' seats-per-player override is set (`seatOverride`, staging only,
 * `dev-tools-raid-seats.ts`): then `seats` is the override and everything that reads the arena (the board's width, the placement cap, the
 * stages, the view) follows it. This is the one place the override enters; there is no second path.
 */
export interface Arena {
  bossId: string;
  rows: number;
  seats: number;
  pieceSeats: number;
}

export function arenaOf(slot: number, seatOverride: number | null): Arena {
  const { bossId, rows, seats } = slotBossInfo(slot);
  return { bossId, rows, seats: seatOverride ?? seats, pieceSeats: seats };
}

/**
 * The columns of a board for `players` players: one piece each, with no floor of four (a party under four fights a smaller boss, Misa
 * 2026-11-04). `spare` adds the spare piece that stays free until stage 1, so a newcomer can always join. Never under one column.
 * With an `arena` a piece is `seats` creatures laid in columns of `rows`, so a piece wider than the boss's own (the seats override)
 * makes the board wider: `ceil(pieces * seats / rows)`. A boss's own piece is one full column (`seats` equals `rows`), the same as before.
 */
export function colsFor(
  players: number,
  spare = false,
  arena?: Pick<Arena, 'rows' | 'seats'>,
): number {
  const pieces = Math.max(1, players + (spare ? 1 : 0));
  return arena === undefined ? pieces : Math.max(1, Math.ceil((pieces * arena.seats) / arena.rows));
}

/**
 * The players a boss is sized for. HP and Attack follow the players of a party under four (Misa, 2026-11-04), and the boss is as wide as
 * the board (one column per player). With the boss's own piece that is the real players. With the seats override (dev tools, a few testers
 * who bring many creatures each) it is **ceil(seats on the board / the boss's own seats per player)**, so three testers bringing eight
 * creatures each (24 seats) against a three-seat piece fight what eight players would. Because a boss's piece is a full column
 * (`seats` equals `rows`, checked by the loader), this equals the board's width without the spare piece: `colsFor(players, false, arena)`.
 */
export const effectivePlayers = (
  players: number,
  arena: Pick<Arena, 'seats' | 'pieceSeats'>,
): number => Math.max(1, Math.ceil((players * arena.seats) / arena.pieceSeats));

/** The creatures a player brings to a slot's boss: the seats of its arena piece. */
export const seatsFor = (slot: number): number => slotBossInfo(slot).seats;

/**
 * The creatures a player may place on a week: the piece's seats on a v2 week (the seats override when one is set), `RULES.raid.teamSize`
 * on a v1 week (or none stored).
 */
export function seatsOfWeek(sql: SqlStorage, weekId: string, seatOverride: number | null): number {
  const row = sql
    .exec<{ rules_version: number; track_slot: number | null }>(
      'SELECT rules_version, track_slot FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .toArray()[0];
  return row?.rules_version === 2
    ? arenaOf(row.track_slot ?? 1, seatOverride).seats
    : RULES.raid.teamSize;
}

/** A slot's place on the grid. */
export const gridPlace = (slot: number, rows: number): { row: number; col: number } => ({
  row: slot % rows,
  col: Math.floor(slot / rows),
});

/** The slot number of a place on the grid. */
export const slotAt = (row: number, col: number, rows: number): number => col * rows + row;

/**
 * The columns a party's board has once stage 1 locked it: stage 1 stores the width it fought on (its input's `boss.cols`), and every later
 * stage, the live finale, the replay and the view read it back, so freeing a knocked-out creature's place never shrinks the board or moves
 * anyone. At stage 1 (nothing stored) it is the width the players need, or further when a creature stands beyond it (the spare column, or
 * past a gap): creatures keep their seats and the boss is not made bigger for it (`widened` changes only its width, never its HP or Attack).
 */
export function boardCols(
  sql: SqlStorage,
  weekId: string,
  party: number,
  players: number,
  arena: Pick<Arena, 'rows' | 'seats'>,
  slots: readonly number[] = [],
): number {
  const row = sql
    .exec<{ input: string }>(
      "SELECT input FROM raid_results WHERE week_id = ? AND party = ? AND phase = 'stage1'",
      weekId,
      party,
    )
    .toArray()[0];
  const stored =
    row === undefined
      ? undefined
      : (JSON.parse(row.input) as { boss?: { cols?: number } }).boss?.cols;
  const base = colsFor(players, false, arena);
  if (typeof stored === 'number') return Math.max(stored, base);
  return slots.reduce((m, slot) => Math.max(m, Math.floor(slot / arena.rows) + 1), base);
}

/** The boss on a board `cols` wide: its width follows the board, its numbers stay those of the players. */
export const widened = (boss: BossDef, cols: number): BossDef =>
  cols > boss.cols ? { ...boss, cols } : boss;

/** The slot's boss for `players` players (see `effectivePlayers`), as it fights: one column per player, also under four (the HP and Attack curves continue). */
export function weekendBoss(slot: number, players: number): BossDef {
  return trackBoss(combatV2, SHIPPED_V2, slot, { players, followSmallParty: true });
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
