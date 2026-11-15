// A week in the life: the rows read and written by one production-like week (Monday to Sunday by the guild's calendar) of a
// 10-player server with COMBAT_V2, VALLEY and VALLEY_SYSTEMS on (housing stays off, as in production). `read-day.test.ts` prices
// single days; this one adds them up in the order a real week has them, so a path that only costs on one day of the week (the
// stage-1 Saturday, the finale Sunday, the day the visitor stays) shows in that day's number, and the worst day is checked against
// Cloudflare's free tier (5,000,000 rows read a day; 100,000 written).
//
// The model (the seeded month-old guild of `read-world.ts`, 15 players, flags on, 10 of them playing):
// - Players 1 to 6 play every day (four openings); players 7 to 10 come on three days of the week (three openings) and all ten
//   on Sunday for the finale. An opening is a login and the usual tabs; the first opening of a player's day also looks at the
//   visitor and the School (seating a student when a teacher is in), closes the Gazette, gives to the commons and runs the
//   day's dungeon (a v2 run through its camp to the end, plus a look at the replay). Each player looks at the raid board once a day.
// - The valley is posted as in the valley day tests: scouts (six seats for three players, two for the rest), two anvils each with
//   orders and a stocked shelf, a communal seat at the bonfire for all, and the Market (a broker at every player's seat, anvils
//   waiting on tide shards) built at the first look.
// - Monday to Friday five placements happen a day while a teammate has the raid board open.
// - On Tuesday, Thursday and Saturday five players lounge together for 3 hours (the lounge alarm every 60 s, the object evicted
//   between ticks). To keep the test fast the first 30 of the 180 ticks are simulated and the rest cost the average of the last 20.
// - The alarms run when the object asks for them (`getAlarm`): the daily reset and its maintain pass, weather and allowance, the
//   Games, the rollup, the School's and the visitor's calendar, stage 1 on Saturday and stage 2 on Sunday. The Sunday finale is the
//   one of `read-day.test.ts`'s weekend: lobby, start at 20:00, 8 live rounds with ten snapshots and two pollers, the settle.
// - Not modelled: the leet sync (it needs the leet API), housing (off), the DMs' network calls, a client without a socket polling
//   the room.
//
// The clock starts Monday 14:00 (after the week opened and the raid's board was joined). The seeded history that the world made
// for that Monday is removed so Monday plays its games, allowance and dungeon like any other day.
import { RULES, createSeededRng } from '@creatures/game';
import { knownKnacks } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { readSourceOfPath } from '../src/read-meter';
import { maintainedDay } from '../src/maintenance';
import { gameDay } from '../src/time';
import { playV2Day, scaleV2Foes } from './dungeon-v2-reads';
import { DAY, HELSINKI, HOUR, MINUTE, W02 } from './raid-helpers';
import { V2_WEEK } from './raid-v2-helpers';
import type { ReadReport } from './read-meter';
import {
  BUILD,
  GUILD_ID,
  LOUNGERS,
  LOUNGER_FIRST,
  LOUNGE_INSTANCE,
  PLAYERS,
  boardSwap,
  callAs,
  fakeLounge,
  inGuild,
  loungeOptions,
  seedAnvils,
  seedSeats,
  seedWorld,
  userId,
  type GuildEnv,
} from './read-world';

/** Cloudflare's free tier, per day for the whole account (rows read, rows written). */
const FREE_READS = 5_000_000;
const FREE_WRITES = 100_000;

// Measured 2026-11-14 (rows read / written): Mon 128,034 / 5,853, Tue 144,976 / 5,347 (lounge), Wed 116,057 / 5,298, Thu 119,444 / 4,711 (lounge),
// Fri 114,017 / 5,338, Sat 99,787 / 4,650 (lounge, stage 1), Sun 108,196 / 6,404 (stage 2, finale). Week 830,511 read, 37,601 written. Worst day Tuesday:
// 2.9% of the free 5,000,000 (Sunday's writes are 6.4% of the free 100,000). The budgets below are about 1.5x each measured figure.
/** Budget for the worst day's reads: about 1.5x the measured worst day. */
const WORST_DAY_READ_BUDGET = 218_000;
/** Budget for the worst day's writes: about 1.5x the measured. */
const WORST_DAY_WRITE_BUDGET = 9_500;
/** Budget for the week's reads and writes: about 1.5x the measured. */
const WEEK_READ_BUDGET = 1_250_000;
const WEEK_WRITE_BUDGET = 56_000;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** Monday 00:00 in the guild (UTC+2 in January). */
const MONDAY_START = W02.monday - 14 * HOUR;
const WEEK_END = MONDAY_START + 7 * DAY;
const DAILY_PLAYERS = 6;
const PLAYING = 10;
const LOUNGE_DAYS = [1, 3, 5];
const LOUNGE_TICKS = 180;
const SIMULATED_TICKS = 30;
const AVERAGED_TICKS = 20;
const TABS = [
  '/api/me',
  '/api/state',
  '/api/games',
  '/api/raid',
  '/api/dungeon/today',
  '/api/notifications',
  '/api/weather',
  '/api/gear',
  '/api/room',
];

interface Tally {
  rows: number;
  written: number;
  calls: number;
}

/** The reads and writes of one day, by source. */
class DayTally {
  readonly bySource = new Map<string, Tally>();
  add(source: string, reads: ReadReport, calls = 1): void {
    const t = this.bySource.get(source) ?? { rows: 0, written: 0, calls: 0 };
    t.rows += reads.total;
    t.written += reads.written;
    t.calls += calls;
    this.bySource.set(source, t);
  }
  get rows(): number {
    return [...this.bySource.values()].reduce((s, t) => s + t.rows, 0);
  }
  get written(): number {
    return [...this.bySource.values()].reduce((s, t) => s + t.written, 0);
  }
  describe(top = 8): string {
    return [...this.bySource.entries()]
      .sort((a, b) => b[1].rows - a[1].rows)
      .slice(0, top)
      .map(
        ([source, t]) =>
          `    ${String(t.rows).padStart(8)} rows (${String(t.written)} written) x${String(t.calls)}  ${source}`,
      )
      .join('\n');
  }
}

class WeekTally {
  readonly days = DAY_NAMES.map(() => new DayTally());
  /** The optional actions that were refused (a closed School, a visitor away): what they were and how often. */
  readonly refused = new Map<string, number>();
  readonly done = new Map<string, number>();
  private clock: () => number = () => MONDAY_START;
  bind(clock: () => number): void {
    this.clock = clock;
  }
  get today(): DayTally {
    const index = Math.min(6, Math.max(0, Math.floor((this.clock() - MONDAY_START) / DAY)));
    return this.days[index] as DayTally;
  }
  add(source: string, reads: ReadReport, calls = 1): void {
    this.today.add(source, reads, calls);
  }
  get rows(): number {
    return this.days.reduce((s, d) => s + d.rows, 0);
  }
  get written(): number {
    return this.days.reduce((s, d) => s + d.written, 0);
  }
  worst(pick: (d: DayTally) => number): { index: number; value: number } {
    let best = { index: 0, value: -1 };
    this.days.forEach((d, index) => {
      if (pick(d) > best.value) best = { index, value: pick(d) };
    });
    return best;
  }
  describe(): string {
    const w = this.worst((d) => d.rows);
    const lines = this.days.map(
      (d, i) =>
        `  ${DAY_NAMES[i] as string}: ${String(d.rows).padStart(8)} read, ${String(d.written).padStart(6)} written`,
    );
    return [
      `Week: ${String(this.rows)} rows read, ${String(this.written)} written. Worst day ${DAY_NAMES[w.index] as string} with ${String(w.value)} read (${((w.value / FREE_READS) * 100).toFixed(2)}% of the free ${String(FREE_READS)}).`,
      ...lines,
      `Worst day by source:\n${(this.days[w.index] as DayTally).describe(12)}`,
      `Refused optional actions: ${JSON.stringify([...this.refused])}; done: ${JSON.stringify([...this.done])}`,
    ].join('\n');
  }
}

type Event =
  | { at: number; kind: 'open'; player: number }
  | { at: number; kind: 'raid-look'; player: number }
  | { at: number; kind: 'placement' }
  | { at: number; kind: 'lounge-join' }
  | { at: number; kind: 'finale' };

/** The week's player events from a seeded stream (the same every run). */
function weekEvents(): Event[] {
  const rng = createSeededRng('read-week');
  const events: Event[] = [];
  // The occasional players (7 to 10) come on three days each, always on Sunday for the finale.
  const comes = new Map<number, Set<number>>();
  for (let p = DAILY_PLAYERS + 1; p <= PLAYING; p++) {
    const days = new Set<number>([6]);
    while (days.size < 4) days.add(rng.nextU32() % 6);
    comes.set(p, days);
  }
  for (let d = 0; d < 7; d++) {
    const dayStart = MONDAY_START + d * DAY;
    // Monday is joined at 14:00, so its first moment is half past two; other days start at 08:00 (13 hours of waking time).
    const from = d === 0 ? dayStart + 14 * HOUR + 30 * MINUTE : dayStart + 8 * HOUR;
    const span = d === 0 ? 6 * 60 : 13 * 60;
    const loungeStart = dayStart + 16 * HOUR;
    const lounging = LOUNGE_DAYS.includes(d);
    const moment = (): number => {
      const t = from + (rng.nextU32() % span) * MINUTE;
      return lounging && t >= loungeStart && t < loungeStart + 3 * HOUR ? t + 3 * HOUR : t;
    };
    const active: number[] = [];
    for (let p = 1; p <= PLAYING; p++) {
      if (p <= DAILY_PLAYERS || comes.get(p)?.has(d) === true) active.push(p);
    }
    for (const player of active) {
      const opens = (p: number): number => (p <= DAILY_PLAYERS ? 4 : 3);
      for (let i = 0; i < opens(player); i++) events.push({ at: moment(), kind: 'open', player });
      events.push({ at: moment(), kind: 'raid-look', player });
    }
    if (d <= 4) for (let i = 0; i < 5; i++) events.push({ at: moment(), kind: 'placement' });
    if (lounging) events.push({ at: loungeStart, kind: 'lounge-join' });
  }
  events.push({ at: V2_WEEK.finale - 3 * MINUTE, kind: 'finale' });
  return events.sort((a, b) => a.at - b.at);
}

async function simulateWeek(): Promise<WeekTally> {
  const tally = new WeekTally();
  const flag = { combatV2: true, valleySystems: true } as const;
  await inGuild(
    async (env: GuildEnv) => {
      const { metered, clock, mk } = env;
      tally.bind(() => clock.t);
      // The week opens: the clock is a moment after Monday 13:37, when the raid week 2027-W02 began.
      clock.t = W02.monday;
      const world = await seedWorld(env, flag);
      // The world's own Monday history out of the way (it was made for a Tuesday), and nothing in its future.
      const monday = gameDayOf(W02.monday);
      for (const table of ['games_results', 'games_entries', 'games_placings', 'games_days']) {
        metered.sql.exec(`DELETE FROM ${table} WHERE day = ?`, monday);
      }
      metered.sql.exec('DELETE FROM dungeon_runs WHERE day = ?', monday);
      metered.sql.exec('DELETE FROM gear_grants WHERE key = ?', `dungeon:${monday}`);
      metered.sql.exec(
        'DELETE FROM ledger WHERE idempotency_key IN (?, ?)',
        `allowance:${monday}`,
        `train:${monday}`,
      );
      for (let n = 1; n <= PLAYERS; n++) {
        const mine = world.creatures[userId(n)] ?? [];
        seedSeats(metered.sql, userId(n), mine, n <= 3 ? 6 : 2);
        seedAnvils(metered.sql, userId(n), mine, 2);
        metered.sql.exec(
          `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, creature_id,
             communal, passed_at) VALUES (?, ?, 'commons', 'communal', 0, 'bonfire', 'bonfire', ?, 1, ?)`,
          crypto.randomUUID(),
          userId(n),
          mine[5] ?? null,
          clock.t,
        );
      }
      // A player's book of a line that is still open (a third of the talents a creature does not carry yet, as a player mid-collection
      // has), so the School's teacher of this week has something to teach; the week's row made at the first alarm is drawn again.
      metered.sql.exec(
        `DELETE FROM line_talents WHERE (unicode(talent_id) + length(talent_id)) % 3 = 0 AND NOT EXISTS (
           SELECT 1 FROM creature_talents_v2 t JOIN creatures c ON c.id = t.creature_id
           WHERE c.user_id = line_talents.user_id AND t.talent_id = line_talents.talent_id)`,
      );
      metered.sql.exec('DELETE FROM school_weeks');
      // Seats and the players' last look were stamped with the seeded Tuesday: bring them back to Monday.
      metered.sql.exec(
        'UPDATE valley_seats SET passed_at = ? WHERE passed_at > ?',
        clock.t,
        clock.t,
      );
      metered.sql.exec(
        'UPDATE players SET last_seen_at = ? WHERE last_seen_at > ?',
        clock.t,
        clock.t,
      );

      const lounge = fakeLounge();
      const events = weekEvents();
      let marketBuilt = false;
      const gave = new Set<string>();
      const dungeonDone = new Set<string>();
      const firstOf = new Set<string>();
      const loungeTicks: { start: ReadReport; alarm: ReadReport }[] = [];
      let skipped = false;
      const count = (map: Map<string, number>, key: string): void => {
        map.set(key, (map.get(key) ?? 0) + 1);
      };

      const wake = async (source: string): Promise<ReturnType<GuildEnv['mk']>> => {
        const core = mk(BUILD, { ...loungeOptions(lounge), ...flag });
        tally.add(source, (await metered.measure(() => core.migrate())).reads);
        return core;
      };

      /** An optional action: a refusal (the School closed, the visitor away) is counted, not an error. */
      const attempt = async (
        source: string,
        label: string,
        run: () => Promise<unknown>,
      ): Promise<unknown> => {
        try {
          const measured = await metered.measure(run);
          tally.add(source, measured.reads);
          count(tally.done, label);
          return measured.result;
        } catch (error) {
          if (error instanceof Error && /answered (4\d\d)/.test(error.message)) {
            count(tally.refused, label);
            return null;
          }
          throw error;
        }
      };

      const open = async (player: number, paths: readonly string[]): Promise<void> => {
        const core = await wake('start');
        const user = { id: userId(player), displayName: `Player ${String(player)}` };
        const session = await metered.measure(() => core.createSession(GUILD_ID, user));
        tally.add('request:session', session.reads);
        const secrets = new Map([[userId(player), session.result]]);
        const call = (path: string, method?: string, body?: unknown) =>
          callAs(core, secrets, player, path, {
            ...(method === undefined ? {} : { method }),
            ...(body === undefined ? {} : { body }),
          });
        for (const path of paths)
          tally.add(readSourceOfPath(path), (await metered.measure(() => call(path))).reads);
        if (!paths.includes('/api/state')) return;
        const mine = world.creatures[userId(player)] ?? [];
        const today = Math.floor((clock.t - MONDAY_START) / DAY);
        if (!marketBuilt) {
          // The valley has opened with this look: the Market is built, every player's anvils wait on tide shards.
          marketBuilt = true;
          metered.sql.exec("UPDATE valley_places SET level = 2 WHERE place = 'market'");
          for (let n = 1; n <= PLAYERS; n++) {
            metered.sql.exec(
              "UPDATE parts SET amount = 0 WHERE user_id = ? AND kind = 'tide-shard'",
              userId(n),
            );
            metered.sql.exec(
              `INSERT INTO valley_seats (seat_id, user_id, place, kind, position, destination_id, prev_destination_id, creature_id,
                 passed_at) VALUES (?, ?, 'market', 'broker', 0, 'any', 'any', ?, ?)`,
              crypto.randomUUID(),
              userId(n),
              world.creatures[userId(n)]?.[8] ?? null,
              clock.t,
            );
          }
        }
        // The Gazette: every opening that finds an unread paper closes it.
        const paper = metered.sql
          .exec<{ paper_id: string }>(
            'SELECT paper_id FROM valley_gazette WHERE user_id = ? AND read_at IS NULL',
            userId(player),
          )
          .toArray()[0];
        if (paper !== undefined)
          await attempt('request:valley', 'gazette', () =>
            call('/api/valley/gazette/close', 'POST', { paperId: paper.paper_id }),
          );
        // The first opening of the player's game day (the day turns at 13:37, not at midnight).
        const key = `${String(player)}-${gameDayOf(clock.t)}`;
        if (!firstOf.has(key)) firstOf.add(key);
        else return;
        const knack = knownKnacks(creatureSpecies(metered.sql, mine[0] as string))[0] ?? null;
        await attempt('request:creatures', 'knack', () =>
          call(`/api/creatures/${mine[0] as string}/knack`, 'PUT', {
            knack: today % 2 === 0 ? knack : null,
          }),
        );
        if (!gave.has(key)) {
          gave.add(key);
          core.credit({
            userId: userId(player),
            currency: 'bait',
            amount: 50,
            source: 'test',
            idempotencyKey: `week-credit-${key}`,
          });
          await attempt('request:valley', 'commons gift', () =>
            call('/api/valley/gift', 'POST', {
              place: 'bonfire',
              currency: 'acorns',
              amount: 3,
              idempotencyKey: `week-gift-${key}`,
            }),
          );
        }
        await attempt('request:valley', 'visitor look', () => call('/api/valley/visitor'));
        const school = (await attempt('request:valley', 'school look', () =>
          call('/api/valley/school'),
        )) as { wouldLearn?: string[] } | null;
        const learner = school?.wouldLearn?.[0];
        if (learner !== undefined)
          await attempt('request:valley', 'school seat', () =>
            call('/api/valley/school/seat', 'POST', { index: 0, creatureId: learner }),
          );
        if (!dungeonDone.has(key)) {
          dungeonDone.add(key);
          await playV2Day(
            (method, path, body) => call(path, method, body),
            mine.slice(10, 13),
            `read-week-dungeon-${key}`,
            async (_label, run) => {
              const measured = await metered.measure(run);
              tally.add('request:dungeon', measured.reads);
              return measured.result;
            },
          );
        }
      };

      /** The Sunday finale: the lobby, the 20:00 start, the live rounds, the settle (as `read-day.test.ts`'s weekend). */
      const finale = async (): Promise<void> => {
        const look = async (core: ReturnType<GuildEnv['mk']>, player: number): Promise<void> => {
          tally.add(
            'request:raid',
            (
              await metered.measure(() =>
                Promise.resolve(core.raid.liveView(userId(player), HELSINKI)),
              )
            ).reads,
          );
        };
        clock.t = Math.max(clock.t, V2_WEEK.finale - 3 * MINUTE);
        const core = await wake('start');
        for (let p = 1; p <= PLAYING; p++) await look(core, p);
        clock.t = V2_WEEK.finale + 2000;
        tally.add('alarm:finale start', (await metered.measure(() => core.alarm())).reads);
        const live = mk(BUILD, flag);
        live.migrate();
        const rounds = 8;
        for (let r = 0; r < rounds; r++) {
          clock.t = V2_WEEK.finale + r * 30_000 + 1000;
          for (let p = 1; p <= PLAYING; p++) await look(live, p);
          for (let tick = 0; tick < 14; tick++) {
            clock.t += 2000;
            for (const p of [1, 2]) await look(live, p);
          }
        }
        clock.t = V2_WEEK.finale + rounds * 30_000 + 1000;
        tally.add(
          'settle',
          (await metered.measure(() => Promise.resolve(live.raid.liveView(userId(1), HELSINKI))))
            .reads,
        );
        for (let p = 1; p <= PLAYING; p++) await look(live, p);
      };

      const handle = async (event: Event): Promise<void> => {
        switch (event.kind) {
          case 'open':
            return open(event.player, TABS);
          case 'raid-look':
            return open(event.player, ['/api/raid']);
          case 'placement': {
            await wake('start');
            tally.add('request:raid', await boardSwap(env, world));
            return;
          }
          case 'finale':
            return finale();
          case 'lounge-join': {
            const core = await wake('start');
            loungeTicks.length = 0;
            skipped = false;
            lounge.instances.set(
              LOUNGE_INSTANCE,
              Array.from({ length: LOUNGERS }, (_, i) => userId(LOUNGER_FIRST + i)),
            );
            for (let n = LOUNGER_FIRST; n < LOUNGER_FIRST + LOUNGERS; n++) {
              const user = { id: userId(n), displayName: `Player ${String(n)}` };
              const session = await metered.measure(() =>
                core.createSession(GUILD_ID, user, null, LOUNGE_INSTANCE),
              );
              tally.add('request:session', session.reads);
              const secrets = new Map([[userId(n), session.result]]);
              tally.add(
                'request:me',
                (await metered.measure(() => callAs(core, secrets, n, '/api/me'))).reads,
              );
            }
          }
        }
      };

      const alarm = async (): Promise<void> => {
        const lounging = lounge.instances.size > 0;
        const core = mk(BUILD, { ...loungeOptions(lounge), ...flag });
        const start = (await metered.measure(() => core.migrate())).reads;
        const tick = (await metered.measure(() => core.alarm())).reads;
        tally.add(lounging ? 'lounge:start' : 'start', start);
        tally.add(lounging ? 'lounge:alarm' : 'alarm', tick);
        if (!lounging) return;
        loungeTicks.push({ start, alarm: tick });
        if (loungeTicks.length < SIMULATED_TICKS || skipped) return;
        // The rest of the 3 hours costs what the settled ticks cost: add it up, and let the lounge end.
        const settled = loungeTicks.slice(-AVERAGED_TICKS);
        const mean = (pick: (t: (typeof settled)[number]) => number): number =>
          Math.round(settled.reduce((sum, t) => sum + pick(t), 0) / settled.length);
        const remaining = LOUNGE_TICKS - loungeTicks.length;
        tally.add(
          'lounge:start',
          {
            total: mean((t) => t.start.total) * remaining,
            written: 0,
            statements: 0,
            top: [],
          },
          remaining,
        );
        tally.add(
          'lounge:alarm',
          {
            total: mean((t) => t.alarm.total) * remaining,
            written: 0,
            statements: 0,
            top: [],
          },
          remaining,
        );
        skipped = true;
        clock.t += remaining * MINUTE;
        lounge.instances.clear();
      };

      let guard = 0;
      for (;;) {
        if (++guard > 6000) throw new Error('the week did not end');
        const nextAlarm = await metered.storage.getAlarm();
        const nextEvent = events[0];
        const due = Math.min(nextEvent?.at ?? Infinity, nextAlarm ?? Infinity);
        if (due >= WEEK_END) break;
        clock.t = Math.max(clock.t, due);
        if (nextEvent !== undefined && nextEvent.at <= (nextAlarm ?? Infinity)) {
          events.shift();
          await handle(nextEvent);
        } else {
          await alarm();
        }
      }
      expect(events, 'every player event of the week ran').toHaveLength(0);
      expect(maintainedDay(metered.sql), 'the daily maintenance ran on the last day').toBe(
        gameDayOf(WEEK_END - 1),
      );
      expect(
        metered.sql
          .exec<{ n: number }>("SELECT COUNT(*) AS n FROM ledger WHERE source = 'raid'")
          .one().n,
        'the raid weekend settled and paid',
      ).toBeGreaterThan(0);
      expect(
        metered.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM valley_server').one().n,
        'the daily maintenance wrote the middle',
      ).toBe(1);
    },
    { fresh: true },
  );
  return tally;
}

const creatureSpecies = (sql: SqlStorage, id: string): string =>
  sql.exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', id).one().species;

const gameDayOf = (t: number): string => gameDay(t, HELSINKI, RULES.daily.reset);

describe('a week in the life of a 10-player server (combat v2, valley and valley systems on)', () => {
  it('reads and writes few rows in a week, and the worst day is a small share of the free tier', async () => {
    // Easy v2 foes, so every dungeon run reaches its camp whatever the seeded levels (the reads of a fight do not depend on it).
    const restore = scaleV2Foes(500, 500);
    let week: WeekTally;
    try {
      week = await simulateWeek();
    } finally {
      restore();
    }
    const text = week.describe();
    console.log(text);
    const worstRead = week.worst((d) => d.rows);
    const worstWrite = week.worst((d) => d.written);
    expect(
      worstRead.value,
      `${text}\nBudget: ${String(WORST_DAY_READ_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(WORST_DAY_READ_BUDGET);
    expect(
      worstWrite.value,
      `${text}\nWrite budget: ${String(WORST_DAY_WRITE_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(WORST_DAY_WRITE_BUDGET);
    expect(
      week.rows,
      `${text}\nWeek budget: ${String(WEEK_READ_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(WEEK_READ_BUDGET);
    expect(
      week.written,
      `${text}\nWeek write budget: ${String(WEEK_WRITE_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(WEEK_WRITE_BUDGET);
    // The worst day is far below the free tier: under 5% of the reads and of the writes.
    expect(worstRead.value).toBeLessThan(FREE_READS * 0.05);
    expect(worstWrite.value).toBeLessThan(FREE_WRITES * 0.1);
  }, 600_000);
});
