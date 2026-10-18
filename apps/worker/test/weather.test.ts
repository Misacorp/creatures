import { RULES, createSeededRng, seasonOf, weatherDef, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import forecastFixture from '../../activity/src/fixtures/weather-forecast.json';
import { formatBossReveal, formatPhasePost } from '../src/discord-format';
import { addWeeks, eventTimes, weekIdFor, weekIndex } from '../src/raid-schedule';
import { addDays, gameDay, zonedTimeToEpoch } from '../src/time';
import { readWeatherDay, type ForecastView } from '../src/weather';
import {
  LATEST_SCHEMA_VERSION,
  T0,
  USER_ID,
  runCore,
  undoWeatherMigration,
  type CoreContext,
} from './helpers';
import { DAY, HELSINKI, HOUR, MINUTE, count, nextGuild, rows } from './raid-helpers';

const USER = { id: USER_ID, displayName: 'Misa' };

/** The guild-local game day of the test clock. */
const dayOf = (ctx: Pick<CoreContext, 'clock'>): string =>
  gameDay(ctx.clock.t, HELSINKI, RULES.daily.reset);

/** A random source that counts its draws. */
function counting(seed: string): Rng & { drawn: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    nextU32() {
      n += 1;
      return inner.nextU32();
    },
    drawn: () => n,
  };
}

interface StoredDay {
  day: string;
  boon: string;
  omen: string | null;
  wild: number;
  boon_bp: number;
  omen_bp: number;
  rank: number;
  week_id: string;
  festival: number;
  drawn_at: number;
}

const stored = (ctx: Pick<CoreContext, 'sql'>): StoredDay[] =>
  rows<StoredDay & Record<string, string | number | null>>(
    ctx.sql,
    'SELECT * FROM weather_days ORDER BY day',
  );

const setRank = (ctx: Pick<CoreContext, 'sql'>, rank: number): void => {
  ctx.sql.exec('UPDATE raid_ladder SET rank = ? WHERE id = 1', rank);
};

/** Moves the clock a game day on (to just after the reset) and lets the alarm do what it does. */
async function nextDay(ctx: CoreContext): Promise<void> {
  const next = addDays(dayOf(ctx), 1);
  ctx.clock.t =
    zonedTimeToEpoch(next, RULES.daily.reset.hour, RULES.daily.reset.minute, HELSINKI) + 3 * MINUTE;
  await ctx.core.alarm();
}

describe('migration 31 (the weather)', () => {
  it('creates the days table and the trips column, keeps the rest, and can be replayed', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const columns = (table: string): string[] =>
          rows<{ name: string }>(ctx.sql, 'SELECT name FROM pragma_table_info(?)', table).map(
            (r) => r.name,
          );
        expect(columns('weather_days')).toEqual(
          expect.arrayContaining([
            'day',
            'boon',
            'omen',
            'wild',
            'boon_bp',
            'omen_bp',
            'rank',
            'week_id',
            'festival',
            'drawn_at',
          ]),
        );
        expect(columns('expeditions')).toContain('weather_json');
        ctx.sql.exec(
          `INSERT INTO weather_days (day, boon, omen, wild, boon_bp, omen_bp, rank, week_id, festival, drawn_at)
         VALUES ('2027-01-14', 'fair-winds', NULL, 0, 10000, 0, 1, '2027-W02', 0, 0)`,
        );
        // The way a database from before looks: both are gone, and the migration puts them back.
        undoWeatherMigration(ctx.sql);
        expect(columns('weather_days')).toEqual([]);
        expect(columns('expeditions')).not.toContain('weather_json');
        expect(ctx.sql.exec('SELECT MAX(version) AS v FROM schema_version').one()['v']).toBe(30);
        ctx.core.migrate();
        expect(columns('weather_days')).toContain('boon_bp');
        expect(columns('expeditions')).toContain('weather_json');
        expect(ctx.sql.exec('SELECT MAX(version) AS v FROM schema_version').one()['v']).toBe(
          LATEST_SCHEMA_VERSION,
        );
        // The check constraints hold: a wild flag is 0 or 1, a strength is never 0.
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO weather_days (day, boon, omen, wild, boon_bp, omen_bp, rank, week_id, festival, drawn_at)
           VALUES ('2027-01-15', 'fair-winds', NULL, 2, 10000, 0, 1, 'w', 0, 0)`,
          ),
        ).toThrow();
        expect(() =>
          ctx.sql.exec(
            `INSERT INTO weather_days (day, boon, omen, wild, boon_bp, omen_bp, rank, week_id, festival, drawn_at)
           VALUES ('2027-01-15', 'fair-winds', NULL, 0, 0, 0, 1, 'w', 0, 0)`,
          ),
        ).toThrow();
        return Promise.resolve();
      },
      { weather: true },
    );
  });
});

describe('drawing the days', () => {
  it('draws today and tomorrow at the first request, stores them with their strength, and never again', async () => {
    const rng = counting('first-draw');
    await runCore(
      nextGuild(),
      async (ctx) => {
        expect(rng.drawn()).toBe(0);
        await ctx.core.createSession(ctx.guildId, USER);
        const today = dayOf(ctx);
        const days = stored(ctx);
        expect(days.map((d) => d.day)).toEqual([today, addDays(today, 1)]);
        for (const d of days) {
          expect(weatherDef(d.boon)?.kind).toBe('boon');
          // A new server is at Boss Rank 1: Boons at x1, no Omens yet.
          expect(d).toMatchObject({ omen: null, wild: 0, boon_bp: 10_000, omen_bp: 0, rank: 1 });
        }
        expect(days[0]?.week_id).toBe(weekIdFor(ctx.clock.t, HELSINKI));
        const drawn = rng.drawn();
        expect(drawn).toBe(2);
        // Another request and another alarm in the same game day draw nothing and change nothing.
        await ctx.core.createSession(ctx.guildId, USER);
        await ctx.core.alarm();
        expect(rng.drawn()).toBe(drawn);
        expect(stored(ctx)).toEqual(days);
      },
      { weather: true, weatherRng: rng },
    );
  });

  it('arms the alarm for the daily reset, and the alarm that fires there draws the day after tomorrow', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        await ctx.core.createSession(ctx.guildId, USER);
        const reset = zonedTimeToEpoch(
          addDays(dayOf(ctx), 1),
          RULES.daily.reset.hour,
          RULES.daily.reset.minute,
          HELSINKI,
        );
        const armed = await ctx.storage.getAlarm();
        expect(armed).not.toBeNull();
        // Whatever else is due (a raid event, the 13:40 slots), the reset is not later than the alarm.
        expect(armed as number).toBeLessThanOrEqual(reset);
        const before = stored(ctx).map((d) => d.day);
        ctx.clock.t = reset;
        await ctx.core.alarm();
        const after = stored(ctx).map((d) => d.day);
        expect(after).toEqual([...before, addDays(before[1] as string, 1)]);
        expect(dayOf(ctx)).toBe(before[1]);
      },
      { weather: true },
    );
  });

  it('draws nothing and arms no weather alarm in a valley without weather', async () => {
    await runCore(nextGuild(), async (ctx) => {
      await ctx.core.createSession(ctx.guildId, USER);
      expect(count(ctx.sql, 'weather_days')).toBe(0);
      expect(ctx.core.weather.forecast()).toEqual({ today: null, tomorrow: null });
      expect(ctx.core.weather.at()).toBeNull();
    });
  });

  it('keeps two days known at all times, never repeats an Omen and never pairs a cancelling Omen with a Boon (Boss Rank 5, 60 days)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        setRank(ctx, 5);
        await ctx.core.createSession(ctx.guildId, USER);
        // The days are forgotten after a while, so each one is read when it is drawn.
        const seen = new Map<string, StoredDay>();
        for (let i = 0; i < 60; i++) {
          // Today's and tomorrow's weather are always stored before the day turns.
          expect(readWeatherDay(ctx.sql, dayOf(ctx))).not.toBeNull();
          expect(readWeatherDay(ctx.sql, addDays(dayOf(ctx), 1))).not.toBeNull();
          for (const d of stored(ctx)) seen.set(d.day, d);
          await nextDay(ctx);
        }
        const days = [...seen.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
        expect(days.length).toBeGreaterThanOrEqual(60);
        let previous: string | null = null;
        let omens = 0;
        let festivalDays = 0;
        for (const d of days) {
          if (d.festival === 1) {
            festivalDays += 1;
            expect(d.omen).toBeNull();
            continue;
          }
          expect(d.omen).not.toBeNull();
          omens += 1;
          expect(d.omen).not.toBe(previous);
          expect(weatherDef(d.boon)?.cancels).not.toContain(d.omen);
          expect(weatherDef(d.omen as string)?.kind).toBe('omen');
          expect(d).toMatchObject({ wild: 0, boon_bp: 10_000, omen_bp: 10_000, rank: 5 });
          previous = d.omen;
        }
        expect(omens).toBeGreaterThan(40);
        expect(festivalDays).toBeGreaterThan(0);
      },
      { weather: true, weatherRng: createSeededRng('sixty-days') },
    );
  });

  it('draws the Boon and the Omen at the strength of the Boss Rank (x1, x1.25, x1.5 and x1.5 / x1 to x2.5)', async () => {
    const strengths: [number, number | null, number][] = [
      [1, null, 10_000],
      [2, null, 10_000],
      [3, 10_000, 10_000],
      [6, 15_000, 12_500],
      [10, 20_000, 15_000],
      [14, 25_000, 15_000],
    ];
    for (const [rank, omenBp, boonBp] of strengths) {
      await runCore(
        nextGuild(),
        async (ctx) => {
          setRank(ctx, rank);
          // A Wednesday in a normal week, so no Festival gets in the way.
          ctx.clock.t = Date.parse('2027-01-13T12:00:00Z');
          await ctx.core.createSession(ctx.guildId, USER);
          for (const d of stored(ctx)) {
            expect(d.festival).toBe(0);
            expect(d.boon_bp).toBe(boonBp);
            if (omenBp === null) {
              expect(d.omen).toBeNull();
              expect(d.omen_bp).toBe(0);
            } else {
              // Today's cannot be a wild one (it is drawn the moment it starts), so it is a plain Omen.
              expect(d.omen_bp).toBe(omenBp);
            }
          }
        },
        { weather: true, weatherRng: createSeededRng(`strength-${String(rank)}`) },
      );
    }
  });

  it('uses the strength a day was drawn at, whatever the rank is when the day comes', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        setRank(ctx, 7);
        await ctx.core.createSession(ctx.guildId, USER);
        const tomorrow = addDays(dayOf(ctx), 1);
        const before = readWeatherDay(ctx.sql, tomorrow);
        expect(before).toMatchObject({ boonBp: 12_500 });
        // The server falls to Boss Rank 2 before the day starts: what was drawn stays what it was.
        setRank(ctx, 2);
        await ctx.core.createSession(ctx.guildId, USER);
        expect(readWeatherDay(ctx.sql, tomorrow)).toEqual(before);
      },
      { weather: true },
    );
  });

  it('gives Boons only in a Festival week', async () => {
    // The Wednesday of the first Festival week from the one the tests live in.
    let weekId = '2027-W02';
    while (!seasonOf(weekIndex(weekId)).festival) weekId = addWeeks(weekId, 1);
    const wednesday = eventTimes(weekId, HELSINKI).weekStart + 2 * DAY + 2 * HOUR;
    await runCore(
      nextGuild(),
      async (ctx) => {
        setRank(ctx, 12);
        ctx.clock.t = wednesday;
        expect(weekIdFor(ctx.clock.t, HELSINKI)).toBe(weekId);
        await ctx.core.createSession(ctx.guildId, USER);
        for (let i = 0; i < 4; i++) await nextDay(ctx);
        const days = stored(ctx).filter((d) => d.week_id === weekId);
        expect(days.length).toBeGreaterThanOrEqual(5);
        for (const d of days) {
          expect(d.festival).toBe(1);
          expect(d.omen).toBeNull();
          expect(d.wild).toBe(0);
        }
      },
      { weather: true, weatherRng: createSeededRng('festival-week') },
    );
  });

  it('a wild Omen comes only from Boss Rank 10, at most one a week, never in a Festival week, and always a day ahead', async () => {
    const play = async (rank: number, seed: string): Promise<StoredDay[]> =>
      runCore(
        nextGuild(),
        async (ctx) => {
          setRank(ctx, rank);
          await ctx.core.createSession(ctx.guildId, USER);
          // The days are forgotten after a while, so each one is read when it is drawn.
          const seen = new Map<string, StoredDay>();
          for (let i = 0; i < 120; i++) {
            for (const d of stored(ctx)) seen.set(d.day, d);
            await nextDay(ctx);
          }
          return [...seen.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
        },
        { weather: true, weatherRng: createSeededRng(seed) },
      );
    expect((await play(9, 'wild-9')).filter((d) => d.wild === 1)).toEqual([]);
    const days = await play(12, 'wild-12');
    const wild = days.filter((d) => d.wild === 1);
    expect(wild.length).toBeGreaterThan(4);
    const perWeek = new Map<string, number>();
    for (const d of wild) {
      perWeek.set(d.week_id, (perWeek.get(d.week_id) ?? 0) + 1);
      expect(weatherDef(d.omen as string)?.wild).toBe(true);
      expect(d.festival).toBe(0);
      expect(d.rank).toBeGreaterThanOrEqual(RULES.weather.wildFromRank);
      // Drawn before the day started: it is shown a day ahead.
      const start = zonedTimeToEpoch(
        d.day,
        RULES.daily.reset.hour,
        RULES.daily.reset.minute,
        HELSINKI,
      );
      expect(d.drawn_at).toBeLessThan(start);
    }
    for (const n of perWeek.values()) expect(n).toBe(1);
    // A plain Omen is never a wild one.
    for (const d of days.filter((x) => x.wild === 0 && x.omen !== null)) {
      expect(weatherDef(d.omen as string)?.wild).not.toBe(true);
    }
    // The very first day of a server is drawn as it starts, so it cannot be wild.
    expect(days[0]?.wild).toBe(0);
  });

  it('forgets days older than the keep time and keeps the rest', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        await ctx.core.createSession(ctx.guildId, USER);
        for (let i = 0; i < RULES.weather.keepDays + 10; i++) await nextDay(ctx);
        const days = stored(ctx).map((d) => d.day);
        const oldest = addDays(dayOf(ctx), -RULES.weather.keepDays);
        expect((days[0] as string) >= oldest).toBe(true);
        expect(days).toContain(dayOf(ctx));
        expect(days).toContain(addDays(dayOf(ctx), 1));
      },
      { weather: true },
    );
  });
});

describe('the forecast', () => {
  it('sends today and tomorrow with the real numbers at the day strength, the same for everyone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        setRank(ctx, 7);
        const secret = await ctx.core.createSession(ctx.guildId, USER);
        const today = dayOf(ctx);
        ctx.core.weather.force(today, 'fair-winds', 'heavy-rain');
        ctx.core.weather.force(addDays(today, 1), 'market-day', null);
        const res = await ctx.request(secret, '/api/weather');
        expect(res.status).toBe(200);
        const body = await res.json<ForecastView>();
        expect(body.today).toMatchObject({
          day: today,
          wild: false,
          startsAt: zonedTimeToEpoch(today, 13, 37, HELSINKI),
          endsAt: zonedTimeToEpoch(addDays(today, 1), 13, 37, HELSINKI),
          boon: {
            id: 'fair-winds',
            name: 'Fair Winds',
            // Boss Rank 7: Boons x1.25, Omens x1.5.
            fight: ["Every creature's first hit deals 12.5% more."],
            trips: ['Trips take 12.5% less time.'],
          },
          omen: {
            id: 'heavy-rain',
            name: 'Heavy Rain',
            fight: ['Area hits deal 15% more.'],
            trips: ['Trips take 15% longer.'],
          },
        });
        expect(body.tomorrow?.boon.id).toBe('market-day');
        expect(body.tomorrow?.omen).toBeNull();
        expect(body.today?.boon.bubbles.length).toBeGreaterThan(0);
        // Text only: no markup anywhere in what is sent.
        expect(JSON.stringify(body)).not.toMatch(/[<>]/);
      },
      { weather: true },
    );
  });

  it('is a plain read: asking changes nothing and a later request draws nothing new', async () => {
    const rng = counting('read-only');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, USER);
        const days = stored(ctx);
        const drawn = rng.drawn();
        for (let i = 0; i < 3; i++)
          expect((await ctx.request(secret, '/api/weather')).status).toBe(200);
        expect(stored(ctx)).toEqual(days);
        expect(rng.drawn()).toBe(drawn);
        // Only GET exists, and it needs a session.
        expect((await ctx.request(secret, '/api/weather', 'POST', {})).status).toBe(405);
      },
      { weather: true, weatherRng: rng },
    );
  });

  it('is empty (null days) in a valley without weather, and a day with an unknown Boon is not shown', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, USER);
        ctx.sql.exec("UPDATE weather_days SET boon = 'gone-from-the-content'");
        const body = await (await ctx.request(secret, '/api/weather')).json<ForecastView>();
        expect(body).toEqual({ today: null, tomorrow: null });
      },
      { weather: true },
    );
  });
});

describe('the forecast fixture of the client', () => {
  it('has the shape and the words the server sends (the client parses this file)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        setRank(ctx, 5);
        const secret = await ctx.core.createSession(ctx.guildId, USER);
        const today = dayOf(ctx);
        ctx.core.weather.force(today, 'fair-winds', 'static-sky');
        ctx.core.weather.force(addDays(today, 1), 'market-day', null);
        const live = await (
          await ctx.request(secret, '/api/weather')
        ).json<Record<string, Record<string, unknown> | null>>();
        const keys = (o: unknown): string[] => Object.keys(o as object).sort();
        expect(keys(live)).toEqual(keys(forecastFixture));
        expect(keys(live['today'])).toEqual(keys(forecastFixture.today));
        expect(keys(live['today']?.['boon'])).toEqual(keys(forecastFixture.today.boon));
        // Names, lines and bubbles are content: the fixture says what players read at Boss Rank 5.
        for (const key of ['today', 'tomorrow'] as const) {
          const want = forecastFixture[key];
          const got = live[key] as Record<string, unknown>;
          expect(got['boon']).toEqual(want.boon);
          expect(got['omen']).toEqual(want.omen);
          expect(got['wild']).toBe(want.wild);
        }
      },
      { weather: true },
    );
  });
});

describe('the dev tool', () => {
  it('sets today or tomorrow by hand and is logged as a dev action', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        await ctx.core.createSession(ctx.guildId, USER);
        const dev = ctx.core.dev;
        if (dev === null) throw new Error('dev tools are off');
        const ok = await dev.run('set-weather', USER_ID, {
          day: 'tomorrow',
          boon: 'high-water',
          omen: 'static-sky',
        });
        expect(ok).toMatchObject({ ok: true });
        const tomorrow = readWeatherDay(ctx.sql, addDays(dayOf(ctx), 1));
        expect(tomorrow).toMatchObject({ boon: 'high-water', omen: 'static-sky', wild: false });
        // Planned ones, unknown ones and extra keys are refused, and nothing changes.
        for (const body of [
          { day: 'today', boon: 'kind-rain', omen: null },
          { day: 'today', boon: 'fair-winds', omen: 'morning-haze' },
          { day: 'today', boon: 'nope', omen: null },
          { day: 'yesterday', boon: 'fair-winds', omen: null },
          { day: 'today', boon: 'fair-winds', omen: null, extra: 1 },
          { day: 'today', boon: 'fair-winds' },
        ]) {
          expect(await dev.run('set-weather', USER_ID, body)).toMatchObject({ ok: false });
        }
        expect(readWeatherDay(ctx.sql, addDays(dayOf(ctx), 1))).toEqual(tomorrow);
        const logged = rows<{ props_json: string }>(
          ctx.sql,
          "SELECT props_json FROM analytics_events WHERE kind = 'dev_action'",
        );
        expect(logged.map((r) => JSON.parse(r.props_json) as unknown)).toContainEqual({
          tool: 'set-weather',
        });
      },
      { weather: true, devTools: true },
    );
  });
});

describe('analytics', () => {
  it('logs each draw once, with ids and numbers only, and no player', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        setRank(ctx, 4);
        await ctx.core.createSession(ctx.guildId, USER);
        const events = rows<{ props_json: string; actor_hash: string | null }>(
          ctx.sql,
          "SELECT props_json, actor_hash FROM analytics_events WHERE kind = 'weather_draw' ORDER BY id",
        );
        expect(events).toHaveLength(2);
        const [first, second] = stored(ctx);
        events.forEach((e, i) => {
          const day = i === 0 ? first : second;
          expect(JSON.parse(e.props_json)).toEqual({
            boon: day?.boon,
            omen: day?.omen,
            wild: false,
            rank: 4,
            festival: day?.festival === 1,
            boonBp: 10_000,
            omenBp: day?.omen === null ? 0 : 10_000,
          });
          expect(e.actor_hash).toBeNull();
        });
        await ctx.core.createSession(ctx.guildId, USER);
        expect(count(ctx.sql, 'analytics_events', "kind = 'weather_draw'")).toBe(2);
      },
      { weather: true },
    );
  });
});

describe('the Discord posts', () => {
  const reveal = {
    bossName: 'Tidal Colossus',
    elementName: 'Tide',
    gimmicks: [],
    turnOrder: 'left_to_right',
    schedule: { phase1: T0, phase2: T0, finale: T0 },
    players: 3,
    parties: 1,
    rank: 5,
    festivalCreature: null,
  } as const;
  const phase = {
    phase: 'phase1',
    bossName: 'Tidal Colossus',
    party: null,
    cleared: true,
    hpLeftPercent: 40,
    top: [],
    reaction: null,
    keyMoment: null,
    essenceFlat: null,
    counterMove: null,
  } as const;

  it('mention the day in one short line, escaped, and nothing when there is no weather', () => {
    expect(formatBossReveal({ ...reveal, sky: ['Fair Winds', 'Heavy Rain'] })).toContain(
      "Today's sky: Fair Winds and Heavy Rain.",
    );
    expect(formatBossReveal({ ...reveal, sky: ['Fair Winds'] })).toContain(
      "Today's sky: Fair Winds.",
    );
    expect(formatBossReveal({ ...reveal, sky: [] })).not.toContain('sky');
    expect(formatBossReveal(reveal)).not.toContain('sky');
    expect(formatPhasePost({ ...phase, sky: ['Market Day', 'Cold Snap'] })).toContain(
      'Sky: Market Day and Cold Snap.',
    );
    expect(formatPhasePost(phase)).not.toContain('Sky');
    // Whatever a name holds is made inert like any other text in a post.
    const nasty = formatPhasePost({ ...phase, sky: ['@everyone **x**'] });
    expect(nasty).toContain('@​everyone \\*\\*x\\*\\*');
  });
});
