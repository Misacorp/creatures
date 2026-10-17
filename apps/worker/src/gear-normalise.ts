/**
 * Brings gear rows written by an earlier shape of gear v2 up to today's shape, at every Durable Object
 * start (idempotent: rows that are already right are not touched, so a second run changes nothing).
 *
 * Why it exists: staging ran b9cb38d (the first gear v2), then commit 20b9c42 changed migration 27 and the
 * item shape in place, which a released migration must never do. A database that ran the first one holds
 * rows the new code cannot read (the Workshop answered 500 for the one player who had used it):
 *
 * - items with a line that no longer exists (`sturdy-blow`), and Hats and Scarves with `attack`, `hp` or
 *   `thick-coat`, which are Charm and talent lines now (the item's own stat is a "local" line);
 * - items of the rarity `festival` (Festival is a base now, not a rarity: an old piece reads as Epic);
 * - job inputs and results (dismantle item snapshots) and loot records that carry the rarity `festival`.
 *
 * Items keep their id, worn state, level and tiers. A removed line becomes its nearest current one at the
 * same tier (`sturdy-blow` becomes the item's own flat Attack, `attack` its own percent Attack, `hp` and
 * `thick-coat` the same for HP; on a Charm they become the Charm's Creature Attack and Creature HP). A
 * line that has no nearest one is dropped. An unknown base becomes the best base of the same slot and tag
 * the item's level unlocks. Item stats are not stored (they are computed from the base and the lines), so
 * there is nothing else to recompute. One unreadable row never stops the guild from starting: it is
 * counted, logged by kind only, and left as it is (the views skip a row they cannot read).
 */
import {
  GEAR_RARITIES,
  GEAR_SLOTS,
  GEAR_TAGS,
  baseMinLevel,
  basesFor,
  eligibleBases,
  gearBase,
  gearLine,
  type GearBase,
  type GearSlot,
  type GearTag,
} from '@creatures/game';
import type { GearRow } from './gear-store';

type Line = { id: string; tier: number };

/**
 * What each removed or moved line becomes on a Hat or Scarf (the item's own stat) and, where it differs, on a
 * Charm (the creature's: a Charm keeps `attack` and `hp` as they are).
 */
const LINE_MAP: ReadonlyMap<string, { item: string; charm: string }> = new Map([
  ['sturdy-blow', { item: 'attack-local-flat', charm: 'attack' }],
  ['attack', { item: 'attack-local-pct', charm: 'attack' }],
  ['hp', { item: 'hp-local-pct', charm: 'hp' }],
  ['thick-coat', { item: 'hp-local-flat', charm: 'hp' }],
]);

/** A rolled line as it is read today: moved to its current id when needed, null when nothing is left of it. */
function mapLine(line: Line, slot: GearSlot): Line | null {
  const moved = LINE_MAP.get(line.id);
  const id = moved === undefined ? line.id : slot === 'charm' ? moved.charm : moved.item;
  return gearLine(id) === undefined ? null : { id, tier: line.tier };
}

/** The lines of an item after mapping: no repeats (the higher tier stays), tiers inside 0 to 4. */
export function normaliseLines(lines: readonly Line[], slot: GearSlot): Line[] {
  const byId = new Map<string, Line>();
  for (const line of lines) {
    const mapped = mapLine(line, slot);
    if (mapped === null || !Number.isInteger(mapped.tier)) continue;
    const tier = Math.min(4, Math.max(0, mapped.tier));
    const had = byId.get(mapped.id);
    if (had === undefined || tier > had.tier) byId.set(mapped.id, { id: mapped.id, tier });
  }
  return [...byId.values()];
}

const isTag = (tag: unknown): tag is GearTag => (GEAR_TAGS as readonly unknown[]).includes(tag);
const isSlot = (slot: unknown): slot is GearSlot =>
  (GEAR_SLOTS as readonly unknown[]).includes(slot);

/**
 * The base a row should have: its own when it exists and its level unlocks it, else the best base of the
 * same slot and tag (a Festival piece stays one) that the level unlocks, else the plainest of the slot.
 */
export function normaliseBase(row: {
  base_id: string;
  slot: string;
  tag: string;
  item_level: number;
}): GearBase | undefined {
  const own = gearBase(row.base_id);
  const slot = own?.slot ?? (isSlot(row.slot) ? row.slot : undefined);
  const tag = own?.tag ?? (isTag(row.tag) ? row.tag : 'neutral');
  if (slot === undefined) return own;
  const festival = own?.festival === true;
  if (own !== undefined && baseMinLevel(own) <= row.item_level) return own;
  const unlocked = eligibleBases(slot, tag, row.item_level, festival);
  return unlocked[unlocked.length - 1] ?? own ?? basesFor(slot, 'neutral')[0];
}

/** The rarity as today's code knows it: an old Festival piece is Epic, anything else unknown is Common. */
export function normaliseRarity(rarity: unknown): 'common' | 'rare' | 'epic' {
  if ((GEAR_RARITIES as readonly unknown[]).includes(rarity)) return rarity as 'common';
  return rarity === 'festival' ? 'epic' : 'common';
}

/** Every `rarity: 'festival'` anywhere in a stored value becomes `epic`. Returns true when something changed. */
export function fixFestivalRarity(value: unknown): boolean {
  let changed = false;
  if (Array.isArray(value)) {
    for (const entry of value) changed = fixFestivalRarity(entry) || changed;
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record)) {
      if (key === 'rarity' && entry === 'festival') {
        record[key] = 'epic';
        changed = true;
      } else {
        changed = fixFestivalRarity(entry) || changed;
      }
    }
  }
  return changed;
}

/** What a run changed, by count. */
export interface NormaliseReport {
  items: number;
  jobs: number;
  grants: number;
  /** Rows that could not be read at all and were left as they are. */
  unreadable: number;
}

function logUnreadable(kind: string, err: unknown): void {
  // Kind and error name only: nothing about the player goes in the log.
  console.error(
    `gear normalise: ${kind} row left as is`,
    err instanceof Error ? err.name : 'unknown',
  );
}

function normaliseItems(sql: SqlStorage, report: NormaliseReport): void {
  const rows = sql.exec<GearRow>('SELECT * FROM gear_items ORDER BY rowid').toArray();
  for (const row of rows) {
    try {
      const base = normaliseBase(row);
      if (base === undefined) throw new Error('no base for this slot');
      let lines: Line[];
      try {
        const parsed: unknown = JSON.parse(row.lines_json);
        if (!Array.isArray(parsed)) throw new Error('lines are not a list');
        lines = parsed.filter(
          (l): l is Line =>
            l !== null &&
            typeof l === 'object' &&
            typeof (l as Line).id === 'string' &&
            typeof (l as Line).tier === 'number',
        );
      } catch {
        lines = [];
      }
      const next = {
        base_id: base.id,
        slot: base.slot,
        tag: base.tag,
        rarity: normaliseRarity(row.rarity),
        lines_json: JSON.stringify(normaliseLines(lines, base.slot)),
      };
      if (
        next.base_id === row.base_id &&
        next.slot === row.slot &&
        next.tag === row.tag &&
        next.rarity === row.rarity &&
        next.lines_json === row.lines_json
      ) {
        continue;
      }
      sql.exec(
        'UPDATE gear_items SET base_id = ?, slot = ?, tag = ?, rarity = ?, lines_json = ? WHERE id = ?',
        next.base_id,
        next.slot,
        next.tag,
        next.rarity,
        next.lines_json,
        row.id,
      );
      report.items += 1;
    } catch (err) {
      report.unreadable += 1;
      logUnreadable('item', err);
    }
  }
}

/** Rewrites the JSON column of every row that holds a Festival rarity. */
function fixJsonColumn(
  sql: SqlStorage,
  table: 'workshop_jobs' | 'gear_grants',
  keyColumns: readonly string[],
  column: string,
  report: NormaliseReport,
  counter: 'jobs' | 'grants',
): void {
  const rows = sql
    .exec<Record<string, string | number | null>>(
      `SELECT ${[...keyColumns, column].join(', ')} FROM ${table} WHERE ${column} LIKE '%festival%'`,
    )
    .toArray();
  for (const row of rows) {
    try {
      const raw = row[column];
      if (typeof raw !== 'string') continue;
      const value: unknown = JSON.parse(raw);
      if (!fixFestivalRarity(value)) continue;
      sql.exec(
        `UPDATE ${table} SET ${column} = ? WHERE ${keyColumns.map((k) => `${k} = ?`).join(' AND ')}`,
        JSON.stringify(value),
        ...keyColumns.map((k) => row[k] as string | number),
      );
      report[counter] += 1;
    } catch (err) {
      report.unreadable += 1;
      logUnreadable(table, err);
    }
  }
}

/**
 * Normalises every row of the earlier v2 shape. Safe on every start; with nothing to fix it only reads.
 * Never throws: a failure of one row is counted in `unreadable`.
 */
export function normaliseGearRows(storage: {
  sql: SqlStorage;
  transactionSync: <T>(fn: () => T) => T;
}): NormaliseReport {
  const report: NormaliseReport = { items: 0, jobs: 0, grants: 0, unreadable: 0 };
  const sql = storage.sql;
  try {
    storage.transactionSync(() => {
      normaliseItems(sql, report);
      fixJsonColumn(sql, 'workshop_jobs', ['id'], 'input_json', report, 'jobs');
      fixJsonColumn(sql, 'workshop_jobs', ['id'], 'result_json', report, 'jobs');
      fixJsonColumn(sql, 'gear_grants', ['user_id', 'key'], 'result_json', report, 'grants');
    });
  } catch (err) {
    // A failure of the pass as a whole (a missing table in an odd test database): the guild still starts.
    report.unreadable += 1;
    logUnreadable('pass', err);
  }
  return report;
}
