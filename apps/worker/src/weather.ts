/**
 * Boons and Omens in the guild's Durable Object (docs/design/gear-and-creatures-v2.md section 10): the
 * valley's daily sky. At every daily reset (13:37 guild-local, `RULES.daily.reset`) there is one Boon and,
 * from Boss Rank 3, one Omen, drawn a day ahead with the live crypto random source and stored in
 * `weather_days`, so today's and tomorrow's are always known. This module draws and reads them; what a
 * day does to a fight, a trip, a job or a run is the pure functions of `@creatures/game`
 * (`rules/weather.ts`), applied where each of those is started and stored with it.
 *
 * Idempotent and race-safe: a day is drawn at most once (the primary key is the guard, and the draw runs
 * inside one transaction in the object, which serialises all requests). The alarm calls `ensure` at the
 * reset, and every authenticated request calls it too (it costs nothing once the day is known), so the
 * stored days exist whether or not the alarm woke the object on time.
 *
 * The strength a day was drawn at (the Boss Rank's multiplier) is stored with it: a rank change between
 * the draw and the day never changes what players were shown.
 */
import {
  RULES,
  drawWeather,
  seasonOf,
  weatherDef,
  weatherLines,
  weatherStrength,
  type Rng,
  type WeatherDay,
} from '@creatures/game';
import type { Analytics } from './analytics';
import { readLadder } from './raid-ladder';
import { eventTimes, weekIdFor, weekIndex, type RaidPhase } from './raid-schedule';
import {
  DEFAULT_GUILD_TIMEZONE,
  addDays,
  gameDay,
  gameDayEnd,
  isValidTimeZone,
  zonedTimeToEpoch,
} from './time';

type DayRow = {
  day: string;
  boon: string;
  omen: string | null;
  wild: number;
  boon_bp: number;
  omen_bp: number;
};

const toDay = (row: DayRow): WeatherDay => ({
  day: row.day,
  boon: row.boon,
  omen: row.omen,
  wild: row.wild === 1,
  boonBp: row.boon_bp,
  omenBp: row.omen_bp,
});

/** One stored game day's weather, or null when the day has none (never drawn, or older than the keep time). */
export function readWeatherDay(sql: SqlStorage, day: string): WeatherDay | null {
  const row = sql
    .exec<DayRow>(
      'SELECT day, boon, omen, wild, boon_bp, omen_bp FROM weather_days WHERE day = ?',
      day,
    )
    .toArray()[0];
  return row === undefined ? null : toDay(row);
}

/**
 * The guild's timezone as the guild object reads it: the stored one, or the default for a guild that is not
 * bound yet or whose stored name is not a real zone (`GuildCore.timezone`).
 */
export function storedTimezone(sql: SqlStorage): string {
  const stored = sql
    .exec<{ timezone: string }>('SELECT timezone FROM guild_meta WHERE id = 1')
    .toArray()[0]?.timezone;
  return stored !== undefined && isValidTimeZone(stored) ? stored : DEFAULT_GUILD_TIMEZONE;
}

/**
 * The weather a raid stage fights under: the weather of the game day the stage is scheduled in (a stage
 * that runs late still fights under its own day's weather). Null when the day has none.
 */
export function stageWeather(sql: SqlStorage, weekId: string, phase: RaidPhase): WeatherDay | null {
  const tz = storedTimezone(sql);
  const at = eventTimes(weekId, tz)[phase];
  return readWeatherDay(sql, gameDay(at, tz, RULES.daily.reset));
}

/** The weather of the game day of an instant, or null. */
export function weatherAt(sql: SqlStorage, at: number, tz: string): WeatherDay | null {
  return readWeatherDay(sql, gameDay(at, tz, RULES.daily.reset));
}

// --- Views ---

/** A Boon or an Omen as the player reads it: the real numbers are in the lines. */
export interface WeatherEntryView {
  id: string;
  name: string;
  flavor: string;
  /** A few words a creature or the calendar may say about it. */
  bubbles: string[];
  /** What it does in the raid and the dungeon, and on trips, in the Workshop and for experience. */
  fight: string[];
  trips: string[];
}

export interface WeatherDayView {
  /** The game day, named by the guild-local date it starts on. */
  day: string;
  /** When it starts and ends (UTC epoch ms): the reset times. */
  startsAt: number;
  endsAt: number;
  boon: WeatherEntryView;
  omen: WeatherEntryView | null;
  wild: boolean;
}

export interface ForecastView {
  today: WeatherDayView | null;
  tomorrow: WeatherDayView | null;
}

function entryView(id: string, strengthBp: number): WeatherEntryView | null {
  const def = weatherDef(id);
  if (def === undefined || def.status !== 'live') return null;
  const lines = weatherLines(id, strengthBp);
  return {
    id: def.id,
    name: def.name,
    flavor: def.flavor,
    bubbles: [...def.bubbles],
    fight: lines.fight,
    trips: lines.trips,
  };
}

/** A stored day as the player sees it; null when its Boon is no longer in the content. */
export function dayView(day: WeatherDay, tz: string): WeatherDayView | null {
  const boon = entryView(day.boon, day.boonBp);
  if (boon === null) return null;
  const omen = day.omen === null ? null : entryView(day.omen, day.omenBp);
  return {
    day: day.day,
    startsAt: zonedTimeToEpoch(day.day, RULES.daily.reset.hour, RULES.daily.reset.minute, tz),
    endsAt: gameDayEnd(day.day, tz, RULES.daily.reset),
    boon,
    omen,
    wild: day.wild && omen !== null,
  };
}

// --- The draw ---

export interface WeatherDeps {
  storage: Pick<DurableObjectStorage, 'sql' | 'transactionSync'>;
  /** The game clock. */
  now: () => number;
  /** Live randomness (crypto in production). Drawn at the moment a day is drawn, never earlier. */
  rng: Rng;
  timezone: () => string;
  analytics?: Analytics | undefined;
  /** False: the valley has no weather (tests of other features): nothing is drawn and nothing is read. */
  enabled?: boolean;
}

export class Weather {
  /** The game day `ensure` last made sure of: the common case is then a string comparison. */
  private ensured: string | null = null;

  constructor(private readonly deps: WeatherDeps) {}

  /** Whether the valley has weather at all (always, outside tests). */
  get enabled(): boolean {
    return this.deps.enabled !== false;
  }

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The weather of the game day of `at` (default: now), or null. Reads only. */
  at(at: number = this.deps.now()): WeatherDay | null {
    if (!this.enabled) return null;
    return weatherAt(this.sql, at, this.deps.timezone());
  }

  /** When the game day of `at` (default: now) starts and ends, in UTC epoch ms (the reset times). */
  dayBounds(at: number = this.deps.now()): { startsAt: number; endsAt: number } {
    const tz = this.deps.timezone();
    const day = gameDay(at, tz, RULES.daily.reset);
    return {
      startsAt: zonedTimeToEpoch(day, RULES.daily.reset.hour, RULES.daily.reset.minute, tz),
      endsAt: gameDayEnd(day, tz, RULES.daily.reset),
    };
  }

  /** Today's weather, or null. Reads only. */
  today(): WeatherDay | null {
    return this.at();
  }

  /**
   * Makes sure today's and tomorrow's weather are stored, drawing the missing ones now (today's first,
   * so tomorrow's Omen knows today's). Old days are forgotten. Cheap when the day is known. Never
   * throws: a failure here must never fail a request, the next call tries again.
   */
  ensure(): void {
    if (!this.enabled) return;
    try {
      const now = this.deps.now();
      const tz = this.deps.timezone();
      const today = gameDay(now, tz, RULES.daily.reset);
      if (this.ensured === today) return;
      this.deps.storage.transactionSync(() => {
        for (const day of [today, addDays(today, 1)]) {
          if (readWeatherDay(this.sql, day) === null) this.draw(day, now, tz);
        }
        this.sql.exec(
          'DELETE FROM weather_days WHERE day < ?',
          addDays(today, -RULES.weather.keepDays),
        );
      });
      this.ensured = today;
    } catch (err) {
      console.error('weather draw failed', err instanceof Error ? err.name : 'unknown');
    }
  }

  /** Draws and stores one day. Call inside a transaction, for a day that has no row. */
  private draw(day: string, now: number, tz: string): void {
    const start = zonedTimeToEpoch(day, RULES.daily.reset.hour, RULES.daily.reset.minute, tz);
    const weekId = weekIdFor(start, tz);
    const festival = seasonOf(weekIndex(weekId)).festival;
    const rank = Math.max(1, readLadder(this.sql).rank ?? 1);
    const previous = readWeatherDay(this.sql, addDays(day, -1));
    const wildThisWeek =
      this.sql
        .exec<{ n: number }>(
          'SELECT COUNT(*) AS n FROM weather_days WHERE week_id = ? AND wild = 1',
          weekId,
        )
        .one().n > 0;
    const draw = drawWeather(this.deps.rng, {
      rank,
      festival,
      previousOmen: previous?.omen ?? null,
      // At most one a week, and only when the day has not started: it is always known a day ahead.
      wildAllowed: !wildThisWeek && now < start,
    });
    this.store({ day, ...draw }, { rank, weekId, festival, now });
    this.deps.analytics?.record({
      kind: 'weather_draw',
      boon: draw.boon,
      omen: draw.omen,
      wild: draw.wild,
      rank,
      festival,
      boonBp: draw.boonBp,
      omenBp: draw.omenBp,
    });
  }

  private store(
    day: WeatherDay,
    meta: { rank: number; weekId: string; festival: boolean; now: number },
  ): void {
    this.sql.exec(
      `INSERT INTO weather_days (day, boon, omen, wild, boon_bp, omen_bp, rank, week_id, festival, drawn_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET boon = excluded.boon, omen = excluded.omen, wild = excluded.wild,
         boon_bp = excluded.boon_bp, omen_bp = excluded.omen_bp`,
      day.day,
      day.boon,
      day.omen,
      day.wild ? 1 : 0,
      day.boonBp,
      day.omenBp,
      meta.rank,
      meta.weekId,
      meta.festival ? 1 : 0,
      meta.now,
    );
  }

  /**
   * Staging only (the dev tool `set-weather`): sets a day's Boon and Omen by hand, at the strength the
   * current Boss Rank gives. An Omen is stored even at ranks and in weeks that would not draw one: this
   * is for testing what each looks like.
   */
  force(day: string, boon: string, omen: string | null): void {
    const tz = this.deps.timezone();
    const start = zonedTimeToEpoch(day, RULES.daily.reset.hour, RULES.daily.reset.minute, tz);
    const weekId = weekIdFor(start, tz);
    const rank = Math.max(1, readLadder(this.sql).rank ?? 1);
    const strength = weatherStrength(rank);
    this.store(
      {
        day,
        boon,
        omen,
        wild: omen !== null && weatherDef(omen)?.wild === true,
        boonBp: strength.boonBp,
        omenBp: strength.omenBp > 0 ? strength.omenBp : 10_000,
      },
      {
        rank,
        weekId,
        festival: seasonOf(weekIndex(weekId)).festival,
        now: this.deps.now(),
      },
    );
  }

  /** Today's and tomorrow's weather as the player reads it (drawing them first if they are missing). */
  forecast(): ForecastView {
    if (!this.enabled) return { today: null, tomorrow: null };
    this.ensure();
    const tz = this.deps.timezone();
    const today = gameDay(this.deps.now(), tz, RULES.daily.reset);
    const view = (day: string): WeatherDayView | null => {
      const stored = readWeatherDay(this.sql, day);
      return stored === null ? null : dayView(stored, tz);
    };
    return { today: view(today), tomorrow: view(addDays(today, 1)) };
  }
}
