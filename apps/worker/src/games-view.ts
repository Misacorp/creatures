/**
 * What `GET /api/games` answers: one payload for the Games tab (docs/design/valley-games.md). A day's
 * results are never in it before that day's show starts (`show_at`); the client seeks into the show with
 * `serverNow - show.showAt`. Read-only apart from drawing the next day's lineup the first time it is
 * needed (the caller's transaction).
 */
import { gamesAptitude } from '@creatures/engine';
import {
  RULES,
  gamesEventDef,
  showTimeline,
  type GamesEventDef,
  type GamesMedal,
  type ShowSegment,
} from '@creatures/game';
import type { GamesEventResult } from '@creatures/engine';
import { gamesLockAt, gamesShowAt, nextShowDay } from './games-calendar';
import {
  ensureLineup,
  gamesRoster,
  lineupDefs,
  timelineInputs,
  type GamesDeps,
} from './games-lock';
import { stallView, type StallView } from './games-stall';
import {
  creatureRecords,
  isBot,
  lastAwardedDay,
  lastShownDay,
  playerEntries,
  playerNames,
  readCreatureMedals,
  readDay,
  readMedals,
  readPlayer,
  readResults,
  type DayRow,
} from './games-store';

/** How many players the medal table lists. */
const BOARD_SIZE = 15;

export interface LineupEventView {
  id: string;
  name: string;
  kind: GamesEventDef['kind'];
  scene: GamesEventDef['scene'];
  team: 1 | 3;
  line: string;
  favours: GamesEventDef['favours'];
}

export interface GamesShowView {
  day: string;
  showAt: number;
  endsAt: number;
  lineup: LineupEventView[];
  timeline: ShowSegment[];
  /** The events that played, in show order (a skipped event has none). */
  events: GamesEventResult[];
  /** Events nobody entered (their intro card says so). */
  skipped: string[];
  /** Everyone in the show, with their display name (plain text) and whether they are a bot. */
  players: { id: string; name: string; bot: boolean }[];
}

export interface GamesResultView {
  eventId: string;
  creatureIds: string[];
  place: number;
  medal: GamesMedal | null;
  /** True when one of the creatures beat its own record (`pins` lists them). */
  pin: boolean;
  pins: string[];
  /** Experience the entry's creatures earned, together. */
  xp: number;
}

export interface GamesView {
  serverNow: number;
  timezone: string;
  phase: 'entries' | 'locked' | 'show' | 'after';
  next: {
    day: string;
    lockAt: number;
    showAt: number;
    /** Entries can be changed now. */
    open: boolean;
    lineup: LineupEventView[];
    entries: Record<string, string[]>;
    /** The player has entered once (auto-entry acts only for a player who has). */
    joined: boolean;
    auto: boolean;
    /** 1 to 5 pips per event per creature: how well it fits, against the player's own roster. */
    fit: Record<string, Record<string, number>>;
  };
  show: GamesShowView | null;
  you: {
    medals: { gold: number; silver: number; bronze: number; pins: number };
    pocket: number;
    /** The player's results of the last awarded show (after it ended). */
    lastResults?: { day: string; results: GamesResultView[] };
  };
  stall: StallView;
  board: { userId: string; name: string; gold: number; silver: number; bronze: number }[];
}

export function lineupView(def: GamesEventDef): LineupEventView {
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    scene: def.scene,
    team: def.team,
    line: def.line,
    favours: def.favours,
  };
}

/**
 * Pips by aptitude (`gamesAptitude`) across the player's whole roster: the best fit is 5, the worst 1,
 * the rest in between on a straight line. A roster of one (or all equal) is all 5.
 */
export function fitPips(
  sql: SqlStorage,
  userId: string,
  defs: readonly GamesEventDef[],
): Record<string, Record<string, number>> {
  const roster = gamesRoster(sql, userId);
  const out: Record<string, Record<string, number>> = {};
  for (const def of defs) {
    const apt = roster.map((c) => [c.creature.id, gamesAptitude(def, c.entrant)] as const);
    const values = apt.map(([, a]) => a);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    out[def.id] = Object.fromEntries(
      apt.map(([id, a]) => [id, hi === lo ? 5 : 1 + Math.round((4 * (a - lo)) / (hi - lo))]),
    );
  }
  return out;
}

/** A locked day's show, for a reader at or after its start. */
export function showView(sql: SqlStorage, row: DayRow): GamesShowView {
  const events = readResults(sql, row.day);
  const ids = events.flatMap((e) => e.entrants.map((x) => x.playerId));
  const names = playerNames(sql, ids);
  const showAt = row.showAt ?? 0;
  return {
    day: row.day,
    showAt,
    endsAt: row.endsAt ?? showAt,
    lineup: lineupDefs(row.lineup).map(lineupView),
    timeline: showTimeline(timelineInputs(events)),
    events: events.flatMap((e) => (e.result === null ? [] : [e.result])),
    skipped: events.filter((e) => e.result === null).map((e) => e.eventId),
    players: [...new Set(ids)].map((id) => ({
      id,
      name: names.get(id) ?? 'Unknown',
      bot: isBot(id),
    })),
  };
}

function lastResults(sql: SqlStorage, userId: string): GamesView['you']['lastResults'] {
  const day = lastAwardedDay(sql);
  if (day === null) return undefined;
  const rows = sql
    .exec<{
      event_id: string;
      creature_ids: string;
      place: number;
      medal: GamesMedal | null;
      pins: string | null;
      xp: number | null;
    }>(
      'SELECT event_id, creature_ids, place, medal, pins, xp FROM games_placings WHERE day = ? AND user_id = ?',
      day.day,
      userId,
    )
    .toArray();
  if (rows.length === 0) return undefined;
  const order = new Map(day.lineup.map((id, i) => [id, i]));
  return {
    day: day.day,
    results: rows
      .sort((a, b) => (order.get(a.event_id) ?? 0) - (order.get(b.event_id) ?? 0))
      .map((r) => {
        const pins = r.pins === null ? [] : (JSON.parse(r.pins) as string[]);
        return {
          eventId: r.event_id,
          creatureIds: JSON.parse(r.creature_ids) as string[],
          place: r.place,
          medal: r.medal,
          pin: pins.length > 0,
          pins,
          xp: r.xp ?? 0,
        };
      }),
  };
}

function board(sql: SqlStorage): GamesView['board'] {
  const rows = sql
    .exec<{ user_id: string; gold: number; silver: number; bronze: number }>(
      `SELECT user_id, gold, silver, bronze FROM games_medals WHERE gold + silver + bronze > 0
       ORDER BY gold DESC, silver DESC, bronze DESC, user_id LIMIT ?`,
      BOARD_SIZE,
    )
    .toArray();
  const names = playerNames(
    sql,
    rows.map((r) => r.user_id),
  );
  return rows.map((r) => ({
    userId: r.user_id,
    name: names.get(r.user_id) ?? 'Unknown',
    gold: r.gold,
    silver: r.silver,
    bronze: r.bronze,
  }));
}

/** The show day entries are for now (stored show times count: see `nextShowDay`). */
export function nextDay(sql: SqlStorage, now: number, tz: string): string {
  return nextShowDay(now, tz, (day) => readDay(sql, day)?.showAt ?? null);
}

/** The next show day's part of the tab: lineup, the player's entries, auto-entry and fit. */
export function nextView(deps: GamesDeps, userId: string): GamesView['next'] {
  const sql = deps.storage.sql;
  const now = deps.now();
  const tz = deps.timezone();
  const day = nextDay(sql, now, tz);
  const row = ensureLineup(deps, day);
  const defs = lineupDefs(row.lineup);
  const lockAt = gamesLockAt(day, tz);
  const player = readPlayer(sql, userId);
  return {
    day,
    lockAt,
    showAt: row.showAt ?? gamesShowAt(day, tz),
    open: row.lockedAt === null && now < lockAt,
    lineup: defs.map(lineupView),
    entries: playerEntries(sql, day, userId),
    joined: player.joined,
    auto: player.auto,
    fit: fitPips(sql, userId, defs),
  };
}

/** The player's medal counts and pocket. */
export function youView(sql: SqlStorage, userId: string): GamesView['you'] {
  const medals = readMedals(sql, userId);
  const results = lastResults(sql, userId);
  return {
    medals: { gold: medals.gold, silver: medals.silver, bronze: medals.bronze, pins: medals.pins },
    pocket: medals.pocket,
    ...(results === undefined ? {} : { lastResults: results }),
  };
}

/** The whole tab for `userId`. Call inside a transaction (it may draw the next lineup). */
export function gamesView(deps: GamesDeps, userId: string): GamesView {
  const sql = deps.storage.sql;
  const now = deps.now();
  const tz = deps.timezone();
  const next = nextView(deps, userId);
  const locked = readDay(sql, next.day)?.lockedAt != null;
  const last = lastShownDay(sql, now);
  const phase: GamesView['phase'] = locked
    ? 'locked'
    : last !== null && now < (last.endsAt ?? 0)
      ? 'show'
      : last !== null
        ? 'after'
        : 'entries';
  return {
    serverNow: now,
    timezone: tz,
    phase,
    next,
    show: last === null ? null : showView(sql, last),
    you: youView(sql, userId),
    stall: stallView(sql, userId, now, tz),
    board: board(sql),
  };
}

/** A creature's medals and records (`GET /api/games/creature/:id`). Null: not the player's. */
export function creatureGamesView(
  sql: SqlStorage,
  userId: string,
  creatureId: string,
): {
  medals: { gold: number; silver: number; bronze: number; pins: number };
  records: { eventId: string; name: string; best: number; unit: string; day: string }[];
} | null {
  const owned = sql
    .exec('SELECT 1 FROM creatures WHERE id = ? AND user_id = ?', creatureId, userId)
    .toArray();
  if (owned.length === 0) return null;
  const medals = readCreatureMedals(sql, creatureId);
  const records = creatureRecords(sql, creatureId).flatMap((r) => {
    const def = gamesEventDef(r.eventId);
    if (def === undefined) return [];
    return [
      { eventId: r.eventId, name: def.name, best: r.best, unit: SCORE_UNITS[def.kind], day: r.day },
    ];
  });
  return { medals, records };
}

/**
 * What a kind's score counts (the engine's `scores`): endure and shove the ticks lasted, chase metres,
 * feast peppers eaten, swim hundredths of a lap.
 */
export const SCORE_UNITS: Record<GamesEventDef['kind'], string> = {
  endure: 'ticks',
  shove: 'ticks',
  chase: 'm',
  feast: 'peppers',
  swim: 'centilaps',
};

/** The team size of an event (for the entry check). */
export const teamSizeOf = (def: GamesEventDef): number =>
  def.team === 3 ? RULES.games.teamSize : 1;
