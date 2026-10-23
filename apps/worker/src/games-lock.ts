/**
 * The Valley Games' lineup and lock (docs/design/valley-games.md, "Server (worker) design").
 *
 * - The lineup of a show day is drawn once, the first time it is needed (live RNG, `chooseLineup`,
 *   avoiding the day before's events; the bonus day gets its bonus event), and stored.
 * - The lock (at the day's reset, or now from the dev tools) is one transaction: every entrant is
 *   snapshotted (`gamesEntrantFrom`: its species' base strengths, no level, and its gear's chance and
 *   trigger lines), a seed is drawn from the live RNG, the events are resolved by the engine with a
 *   seeded RNG from that seed, and the inputs, results and placings are stored. Only what players
 *   entered runs: there is no auto-entry. Nothing is sent before the show.
 */
import {
  RULES,
  chooseLineup,
  createSeededRng,
  gamesContent,
  gamesEventDef,
  placesToMedals,
  showLengthMs,
  type GamesEventDef,
  type Rng,
  type ShowTimelineInput,
} from '@creatures/game';
import {
  gamesEntrantFrom,
  runGamesEvent,
  type GamesEntrant,
  type GamesEventResult,
} from '@creatures/engine';
import type { Analytics } from './analytics';
import type { LedgerStorage } from './ledger';
import { drawSeed } from './raid-resolve';
import { loadCreatures, type TeamCreature } from './raid-teams';
import { gamesShowAt, isGamesBonusDay } from './games-calendar';
import {
  dayEntries,
  insertDay,
  isBot,
  readDay,
  type DayRow,
  type EntryRow,
  type StoredEvent,
} from './games-store';
import { addDays } from './time';

export interface GamesDeps {
  storage: LedgerStorage;
  /** The game clock. */
  now: () => number;
  /** Live randomness for lineups and show seeds. */
  rng: Rng;
  /** Live randomness for what the stall grants (gear, supplies, shards). */
  gearRng: Rng;
  timezone: () => string;
  analytics?: Analytics | undefined;
}

/** A day locked after its scheduled show time shows this long after the lock. */
export const LATE_SHOW_DELAY_MS = 15_000;

/** The event definitions of a stored lineup (an id the content no longer has is left out). */
export function lineupDefs(lineup: readonly string[]): GamesEventDef[] {
  return lineup.flatMap((id) => {
    const def = gamesEventDef(id);
    return def === undefined ? [] : [def];
  });
}

/** The day's row, drawing and storing its lineup first if it has none. Call inside a transaction. */
export function ensureLineup(deps: GamesDeps, day: string): DayRow {
  const sql = deps.storage.sql;
  const have = readDay(sql, day);
  if (have !== null) return have;
  const before = readDay(sql, addDays(day, -1));
  const picks = chooseLineup(
    gamesContent.events,
    deps.rng,
    before?.lineup ?? [],
    RULES.games.eventsPerDay,
    RULES.games.teamEventsPerDay,
    isGamesBonusDay(day),
  );
  insertDay(
    sql,
    day,
    picks.map((e) => e.id),
    picks.find((e) => e.bonus === true)?.id ?? null,
    deps.now(),
  );
  return readDay(sql, day) as DayRow;
}

/** A creature as the Games see it: the raid's fold, plus what the show shows. */
export interface GamesCreature {
  creature: TeamCreature;
  entrant: GamesEntrant;
}

/**
 * The player's creatures with their entrants, oldest first: `gamesEntrantFrom` reads the current
 * species and the chance and trigger lines of the gear sheet (the raid's fold); level, fusion and the
 * sheet's stat lines are not read.
 */
export function gamesRoster(sql: SqlStorage, userId: string): GamesCreature[] {
  const shiny = new Set(
    sql
      .exec<{ id: string }>('SELECT id FROM creatures WHERE user_id = ? AND shiny = 1', userId)
      .toArray()
      .map((r) => r.id),
  );
  const bot = isBot(userId);
  return loadCreatures(sql, userId).map((c) => ({
    creature: c,
    entrant: gamesEntrantFrom({
      id: c.id,
      playerId: userId,
      name: c.nickname ?? c.species.name,
      species: c.species,
      mods: c.mods,
      ...(shiny.has(c.id) ? { shiny: true } : {}),
      ...(bot ? { bot: true } : {}),
    }),
  }));
}

/**
 * The teams of one event, at most `RULES.games.maxEntrants` creatures (`maxTeamEntrants` in a team
 * event): players first, then bots, each in the order they entered (a team counts from its first
 * entry). A team that would go over the cap is left out whole.
 */
export function capTeams(def: GamesEventDef, rows: readonly EntryRow[]): EntryRow[][] {
  const byUser = new Map<string, EntryRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const teams = [...byUser.values()].map((list) => [...list].sort((a, b) => a.slot - b.slot));
  const first = (t: EntryRow[]): number => Math.min(...t.map((r) => r.enteredAt));
  teams.sort(
    (a, b) =>
      Number(isBot((a[0] as EntryRow).userId)) - Number(isBot((b[0] as EntryRow).userId)) ||
      first(a) - first(b),
  );
  const max = def.team === 3 ? RULES.games.maxTeamEntrants : RULES.games.maxEntrants;
  const kept: EntryRow[][] = [];
  let total = 0;
  for (const t of teams) {
    if (total + t.length > max) continue;
    kept.push(t);
    total += t.length;
  }
  return kept;
}

/** What the show's timeline is built from (the lineup's order, a skipped event as its intro only). */
export function timelineInputs(events: readonly StoredEvent[]): ShowTimelineInput[] {
  return events.map((e) => {
    const def = gamesEventDef(e.eventId);
    return {
      eventId: e.eventId,
      ticks: e.result?.ticks ?? 0,
      tickMs: e.result?.tickMs ?? def?.tickMs ?? 1_000,
      skipped: e.result === null,
    };
  });
}

/**
 * Locks show day `day` now: one transaction (see the module comment). `showAt` is when the show starts
 * (default: the day's scheduled show, or `LATE_SHOW_DELAY_MS` from now when that has passed). Does nothing for a day that is already locked; returns whether it
 * locked.
 */
export function lockDay(deps: GamesDeps, day: string, showAt?: number): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const row = ensureLineup(deps, day);
    if (row.lockedAt !== null) return false;
    const now = deps.now();
    const defs = lineupDefs(row.lineup);

    const rosters = new Map<string, Map<string, GamesEntrant>>();
    const entrantOf = (userId: string, creatureId: string): GamesEntrant | undefined => {
      let roster = rosters.get(userId);
      if (roster === undefined) {
        roster = new Map(gamesRoster(sql, userId).map((c) => [c.creature.id, c.entrant]));
        rosters.set(userId, roster);
      }
      return roster.get(creatureId);
    };
    // Entries of creatures the player no longer owns (released, fused away) do not run.
    const entries = dayEntries(sql, day).filter(
      (e) => entrantOf(e.userId, e.creatureId) !== undefined,
    );
    const seed = drawSeed(deps.rng);
    const stored: StoredEvent[] = [];
    defs.forEach((def, idx) => {
      const teams = capTeams(
        def,
        entries.filter((e) => e.eventId === def.id),
      );
      const entrants = teams.flat().map((e) => entrantOf(e.userId, e.creatureId) as GamesEntrant);
      const result: GamesEventResult | null =
        entrants.length === 0
          ? null
          : runGamesEvent(def, entrants, createSeededRng(`${seed}:${def.id}`));
      stored.push({ idx, eventId: def.id, entrants, result });
      sql.exec(
        'INSERT INTO games_results (day, idx, event_id, input_json, result_json) VALUES (?, ?, ?, ?, ?)',
        day,
        idx,
        def.id,
        JSON.stringify(entrants),
        result === null ? null : JSON.stringify(result),
      );
      if (result !== null) storePlacings(sql, day, result);
    });
    // A late lock (a missed alarm, a reset day) starts its show a little after now, not in the past.
    const start = showAt ?? Math.max(gamesShowAt(day, deps.timezone()), now + LATE_SHOW_DELAY_MS);
    const endsAt = start + showLengthMs(timelineInputs(stored));
    sql.exec(
      'UPDATE games_days SET locked_at = ?, seed = ?, show_at = ?, ends_at = ? WHERE day = ?',
      now,
      seed,
      start,
      endsAt,
      day,
    );
    deps.analytics?.record({
      kind: 'games_show',
      events: stored.filter((e) => e.result !== null).length,
      skipped: stored.filter((e) => e.result === null).length,
      entrants: stored.reduce((n, e) => n + e.entrants.length, 0),
      players: new Set(stored.flatMap((e) => e.entrants.map((x) => x.playerId))).size,
    });
    return true;
  });
}

function storePlacings(sql: SqlStorage, day: string, result: GamesEventResult): void {
  const medals = placesToMedals(result.standings);
  result.standings.forEach((s, i) => {
    const creatureIds = s.actors.map((a) => result.actors[a]?.entrantId ?? '');
    sql.exec(
      `INSERT INTO games_placings (day, event_id, user_id, creature_ids, place, medal, score, bot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      day,
      result.eventId,
      s.teamId,
      JSON.stringify(creatureIds),
      s.place,
      medals[i] ?? null,
      s.score,
      isBot(s.teamId) ? 1 : 0,
    );
  });
}
