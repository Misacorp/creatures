import { content, createSeededRng, pickQuirk, ribbonsForLevel, type Rng } from '@creatures/game';
import { runCore, type CoreContext } from './helpers';
import type { GuildCoreOptions } from '../src/guild-core';

export const HELSINKI = 'Europe/Helsinki';
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const MINUTE = 60_000;

/** Fixed instants of week 2027-W02 in Europe/Helsinki (UTC+2), where the boss is known (see tests). */
export const W02 = {
  id: '2027-W02',
  monday: Date.parse('2027-01-11T12:00:00Z'),
  friday: Date.parse('2027-01-15T12:00:00Z'),
  afterPhase1: Date.parse('2027-01-15T12:00:00Z'),
  afterPhase2: Date.parse('2027-01-16T12:00:00Z'),
  afterFinale: Date.parse('2027-01-17T19:00:00Z'),
};

let guildCounter = 0;
/** A fresh snowflake-shaped guild id per test, so Durable Object storage never overlaps. */
export const nextGuild = (): string => String(760000000000000000n + BigInt(++guildCounter));

/** The stage-1 species that exist in the content, in a fixed order, for varied seeded players. */
const POOL = [
  'splashet',
  'cindle',
  'sproutle',
  'zipmouse',
  'mistnewt',
  'ashmole',
  'stormray',
  'mossback',
  'coralynx',
  'solmane',
  'gaiadrake',
  'aurorix',
];

export interface SeedOptions {
  name?: string;
  /** Level of every creature (capped by the species' level cap). Default 5 + n % 20. */
  level?: number;
  /** Number of creatures. Default 3. */
  creatures?: number;
  fusion?: number;
  /** `players.last_seen_at`. Default: the test's clock now. */
  lastSeenAt?: number;
  /** Species to use instead of the rotating pool. */
  species?: string[];
}

export interface Seeded {
  id: string;
  name: string;
  creatureIds: string[];
}

/** Inserts a player with creatures straight into the tables (no API), like a long-running game. */
export function seedPlayer(
  ctx: Pick<CoreContext, 'sql' | 'clock'>,
  n: number,
  o: SeedOptions = {},
): Seeded {
  const id = `8${String(n).padStart(17, '0')}`;
  const name = o.name ?? `Player ${n}`;
  ctx.sql.exec(
    `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    id,
    name,
    ctx.clock.t,
    o.lastSeenAt ?? ctx.clock.t,
  );
  const count = o.creatures ?? 3;
  const creatureIds: string[] = [];
  for (let k = 0; k < count; k++) {
    const speciesId = o.species?.[k] ?? POOL[(n + k) % POOL.length];
    const species = content.creatures.find((c) => c.id === speciesId);
    if (species === undefined) throw new Error(`unknown species ${speciesId}`);
    const level = Math.min(o.level ?? 5 + (n % 20), species.levelCap);
    const creatureId = crypto.randomUUID();
    ctx.sql.exec(
      `INSERT INTO creatures (id, user_id, line, species, level, fusion_count, origin, caught_at, quirk_id, ribbons)
       VALUES (?, ?, ?, ?, ?, ?, 'test', ?, ?, ?)`,
      creatureId,
      id,
      species.line,
      species.id,
      level,
      o.fusion ?? 0,
      ctx.clock.t + k,
      pickQuirk(species.id, createSeededRng(`seed-quirk:${String(n)}:${String(k)}`)),
      ribbonsForLevel(level),
    );
    creatureIds.push(creatureId);
  }
  return { id, name, creatureIds };
}

/** An RNG that returns scripted values first, then falls back to a seeded stream. */
export function scriptedThenSeeded(
  values: number[],
  seed = 'raid-tests',
): Rng & { drawn: () => number } {
  const rest = createSeededRng(seed);
  let i = 0;
  return {
    nextU32() {
      const v = values[i++];
      return v ?? rest.nextU32();
    },
    drawn: () => i,
  };
}

export const rows = <T extends Record<string, SqlStorageValue>>(
  sql: SqlStorage,
  query: string,
  ...bindings: (string | number | null)[]
): T[] => sql.exec<T>(query, ...bindings).toArray();

export const count = (sql: SqlStorage, table: string, where = '1 = 1'): number =>
  sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).one().n;

/** Runs `fn` in a fresh guild with the raid RNG seeded and the clock at `start`. */
export function runRaid<R>(
  fn: (ctx: CoreContext) => Promise<R> | R,
  options: { start?: number; core?: GuildCoreOptions } = {},
): Promise<R> {
  return runCore(
    nextGuild(),
    (ctx) => {
      ctx.clock.t = options.start ?? W02.friday - 2 * HOUR;
      return fn(ctx);
    },
    { raidRng: createSeededRng('raid-tests'), ...options.core },
  );
}

export interface StoredRun {
  weekId: string;
  party: number;
  phase: 'phase1' | 'phase2' | 'finale';
  seed: string;
  input: import('@creatures/engine').FightInput;
  result: import('@creatures/engine').FightResult;
  summary: import('../src/raid-resolve').StoredSummary;
}

/** Every stored raid result, in the order they were resolved. */
export function storedRuns(sql: SqlStorage, weekId?: string): StoredRun[] {
  return rows<{
    week_id: string;
    party: number;
    phase: StoredRun['phase'];
    seed: string;
    input: string;
    result: string;
    summary: string;
  }>(
    sql,
    `SELECT week_id, party, phase, seed, input, result, summary FROM raid_results
     ${weekId === undefined ? '' : `WHERE week_id = '${weekId}'`} ORDER BY rowid`,
  ).map((r) => ({
    weekId: r.week_id,
    party: r.party,
    phase: r.phase,
    seed: r.seed,
    input: JSON.parse(r.input) as StoredRun['input'],
    result: JSON.parse(r.result) as StoredRun['result'],
    summary: JSON.parse(r.summary) as StoredRun['summary'],
  }));
}

/** Overrides the boss pool of every party of a week (before phase 1 resolves). */
export function forcePool(sql: SqlStorage, max: number, current = max, atk = 30): void {
  sql.exec('UPDATE raid_parties SET hp_max = ?, hp_current = ?, boss_atk = ?', max, current, atk);
}

/** The party's members in the order the engine sees them (m1, m2, ...). */
export function membersOf(sql: SqlStorage, party = 1, weekId = W02.id): string[] {
  return rows<{ user_id: string }>(
    sql,
    'SELECT user_id FROM raid_party_members WHERE week_id = ? AND party = ? ORDER BY joined_at, rowid',
    weekId,
    party,
  ).map((r) => r.user_id);
}

export const raidLedger = (sql: SqlStorage) =>
  rows<{ user_id: string; amount: number; idempotency_key: string }>(
    sql,
    "SELECT user_id, amount, idempotency_key FROM ledger WHERE source = 'raid' ORDER BY id",
  );

/** The rank and Festival flag the (only) week of a test pays out with, as stored. */
export function weekPayout(sql: SqlStorage, weekId = W02.id): { rank: number; festival: boolean } {
  const week = rows<{ rank: number | null; festival: number | null }>(
    sql,
    'SELECT rank, festival FROM raid_weeks WHERE week_id = ?',
    weekId,
  )[0];
  return { rank: week?.rank ?? 1, festival: week?.festival === 1 };
}
