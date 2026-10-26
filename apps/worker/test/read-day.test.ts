// A day in the life: the rows read by one realistic game day of a 10-player server, added up from real
// measurements. The read budget (`read-budget.test.ts`) prices one path once; what bit us in the rows_read week
// (decisions.md, 2026-10-25/26) was frequency: cheap-looking work that ran far too often (start-up passes on
// every wake, the object waking every minute while the lounge is open). This test models the frequency too, so
// a path that is cheap once and runs all day shows up in the day's total (testing.md, "Database reads").
//
// The model (the seeded month-old guild of `read-world.ts`, 15 players of whom 10 play today):
// - Each of the 10 players opens the game 4 times: a login and the usual tabs (`/api/me`, `/api/state`,
//   `/api/games`, `/api/raid`, `/api/dungeon/today`, `/api/notifications`, `/api/weather`, `/api/gear`,
//   `/api/room`), a burst of requests on one start of the object. Each of them also looks at the raid board
//   once more later, and 5 placements happen while a teammate has the board open.
// - 5 players lounge together for 3 hours with the lounge alarm every 60 s. The object is evicted between the
//   ticks (a new `GuildCore` and `migrate` with the same build before each alarm, as production does with
//   hibernatable sockets), so every tick is a start and an alarm. Their clients have live sockets, so there is
//   no room polling (a client without a socket polls `/api/room` every 45 s).
// - The alarms of the rest of the day run when the object asks for them (`getAlarm`): the daily reset with its
//   maintenance, the weather and allowance, the Games lock and awards, the rollup. The leet sync is not modelled
//   (it needs the leet API; it is one request a few times a day).
//
// Scaling: to keep the test fast only the first 30 of the 180 lounge ticks are simulated; the other 150 cost the
// average of the last 20 simulated ones each (start and alarm separately, flagged `scaled` in the breakdown).
// Everything else is simulated in full: 10 players x 4 opens, every alarm of the day.
//
// When it fails: the breakdown by source (start, alarm, lounge, request:<area>) shows what grew. Fix the
// query, or the frequency; raise the budget only with a reason in the PR.
import { describe, expect, it } from 'vitest';
import { readSourceOfPath } from '../src/read-meter';
import { RULES, createSeededRng } from '@creatures/game';
import { maintainedDay } from '../src/maintenance';
import { gameDay } from '../src/time';
import { DAY, HELSINKI, HOUR, MINUTE } from './raid-helpers';
import type { ReadReport } from './read-meter';
import {
  BUILD,
  GUILD_ID,
  LOUNGERS,
  LOUNGER_FIRST,
  LOUNGE_INSTANCE,
  boardSwap,
  callAs,
  fakeLounge,
  inGuild,
  loungeOptions,
  seedWorld,
  userId,
  type GuildEnv,
} from './read-world';

/** Budget for the whole day: about 1.5x the measured total, under 5% of the free tier's 5,000,000. */
const DAY_BUDGET = 190_000;
// Measured 124,815 rows (2.5% of the free tier). By source: request:raid 50,046 (55 calls: 50 views at about
// 1,000, the band recomputed after every 5 minutes, and 5 placements), lounge:alarm 20,243 and lounge:start
// 8,640 (180 ticks), request:state 15,652, request:games 8,938, request:gear 4,679, alarm 3,571 (3 alarms
// of the day, with the daily maintenance), request:dungeon 3,199, start 2,832 (59 object starts),
// request:session 2,581, request:room 1,399, request:me 1,357, request:weather 879, request:notifications 799.

const PLAYING = 10;
const OPENS_PER_PLAYER = 4;
const LOUNGE_TICKS = 180;
const SIMULATED_TICKS = 30;
/** The simulated ticks the scaling averages over (the last ones: the room has settled). */
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
  calls: number;
  scaled: number;
}

class DayReads {
  private readonly bySource = new Map<string, Tally>();

  add(source: string, reads: ReadReport, scaledCalls = 0): void {
    const tally = this.bySource.get(source) ?? { rows: 0, calls: 0, scaled: 0 };
    tally.rows += reads.total;
    tally.calls += scaledCalls === 0 ? 1 : scaledCalls;
    if (scaledCalls > 0) tally.scaled += scaledCalls;
    this.bySource.set(source, tally);
  }

  get total(): number {
    let sum = 0;
    for (const t of this.bySource.values()) sum += t.rows;
    return sum;
  }

  describe(): string {
    const lines = [...this.bySource.entries()]
      .sort((a, b) => b[1].rows - a[1].rows)
      .map(
        ([source, t]) =>
          `  ${String(t.rows).padStart(8)} rows  x${String(t.calls)}${t.scaled > 0 ? ` (${String(t.scaled)} scaled)` : ''}  ${source}`,
      );
    return [`${String(this.total)} rows read in the day. By source:`, ...lines].join('\n');
  }
}

type Event =
  | { at: number; kind: 'open'; player: number }
  | { at: number; kind: 'raid-look'; player: number }
  | { at: number; kind: 'placement' }
  | { at: number; kind: 'lounge-join' };

/** The day's player events, from a seeded stream (no two runs differ); none inside the lounge window. */
function playerEvents(start: number, loungeStart: number): Event[] {
  const rng = createSeededRng('read-day');
  const loungeEnd = loungeStart + 3 * HOUR;
  // A moment of the first 13 hours of waking time that is not in the lounge window (a block of its own).
  const moment = (): number => {
    const t = start + (rng.nextU32() % (13 * 60)) * MINUTE;
    return t >= loungeStart && t < loungeEnd ? t + 3 * HOUR : t;
  };
  const events: Event[] = [{ at: loungeStart, kind: 'lounge-join' }];
  for (let player = 1; player <= PLAYING; player++) {
    for (let k = 0; k < OPENS_PER_PLAYER; k++) events.push({ at: moment(), kind: 'open', player });
    events.push({ at: moment(), kind: 'raid-look', player });
  }
  for (let i = 0; i < 5; i++) events.push({ at: moment(), kind: 'placement' });
  return events.sort((a, b) => a.at - b.at);
}

describe('a day in the life of a 10-player server', () => {
  it('reads few rows in a day', async () => {
    const reads = new DayReads();
    await inGuild(async (env: GuildEnv) => {
      const world = await seedWorld(env);
      const dayStart = env.clock.t;
      const dayEnd = dayStart + DAY;
      const lounge = fakeLounge();
      const events = playerEvents(dayStart, dayStart + 4 * HOUR);
      const loungeTicks: { start: ReadReport; alarm: ReadReport }[] = [];
      let skipped = false;

      /** A new object start (the previous one was evicted): its reads are the `start` source. */
      const wake = async (source: string): Promise<ReturnType<GuildEnv['mk']>> => {
        const core = env.mk(BUILD, loungeOptions(lounge));
        reads.add(source, (await env.metered.measure(() => core.migrate())).reads);
        return core;
      };

      /** A player opens the game (a login: sessions end after an hour idle) and looks at `paths`. */
      const open = async (player: number, paths: readonly string[]): Promise<void> => {
        const core = await wake('start');
        const user = { id: userId(player), displayName: `Player ${String(player)}` };
        const session = await env.metered.measure(() => core.createSession(GUILD_ID, user));
        reads.add('request:session', session.reads);
        const secrets = new Map([[userId(player), session.result]]);
        for (const path of paths)
          reads.add(
            readSourceOfPath(path),
            (await env.metered.measure(() => callAs(core, secrets, player, path))).reads,
          );
      };

      const handle = async (event: Event): Promise<void> => {
        if (event.kind === 'open') return open(event.player, TABS);
        if (event.kind === 'raid-look') return open(event.player, ['/api/raid']);
        if (event.kind === 'placement') {
          await wake('start');
          reads.add('request:raid', await boardSwap(env, world));
          return;
        }
        // Five players open the Activity together in one instance and start to lounge.
        const core = await wake('start');
        lounge.instances.set(
          LOUNGE_INSTANCE,
          Array.from({ length: LOUNGERS }, (_, i) => userId(LOUNGER_FIRST + i)),
        );
        for (let n = LOUNGER_FIRST; n < LOUNGER_FIRST + LOUNGERS; n++) {
          const user = { id: userId(n), displayName: `Player ${String(n)}` };
          const session = await env.metered.measure(() =>
            core.createSession(GUILD_ID, user, null, LOUNGE_INSTANCE),
          );
          reads.add('request:session', session.reads);
          const secrets = new Map([[userId(n), session.result]]);
          reads.add(
            'request:me',
            (await env.metered.measure(() => callAs(core, secrets, n, '/api/me'))).reads,
          );
        }
      };

      /** The alarm the object asked for: a new object starts and runs it. */
      const alarm = async (): Promise<void> => {
        const lounging = lounge.instances.size > 0;
        const core = env.mk(BUILD, loungeOptions(lounge));
        const start = (await env.metered.measure(() => core.migrate())).reads;
        const tick = (await env.metered.measure(() => core.alarm())).reads;
        reads.add(lounging ? 'lounge:start' : 'start', start);
        reads.add(lounging ? 'lounge:alarm' : 'alarm', tick);
        if (!lounging) return;
        loungeTicks.push({ start, alarm: tick });
        if (loungeTicks.length < SIMULATED_TICKS || skipped) return;
        // The rest of the 3 hours costs what the settled ticks cost: add it up, and let the lounge end.
        const settled = loungeTicks.slice(-AVERAGED_TICKS);
        const mean = (pick: (t: (typeof settled)[number]) => number): number =>
          Math.round(settled.reduce((sum, t) => sum + pick(t), 0) / settled.length);
        const remaining = LOUNGE_TICKS - loungeTicks.length;
        const scaled = (source: string, perTick: number): void =>
          reads.add(source, { total: perTick * remaining, statements: 0, top: [] }, remaining);
        scaled(
          'lounge:start',
          mean((t) => t.start.total),
        );
        scaled(
          'lounge:alarm',
          mean((t) => t.alarm.total),
        );
        skipped = true;
        env.clock.t += remaining * MINUTE;
        lounge.instances.clear();
      };

      let guard = 0;
      for (;;) {
        if (++guard > 3000) throw new Error('the day did not end');
        const nextAlarm = await env.metered.storage.getAlarm();
        const nextEvent = events[0];
        const due = Math.min(nextEvent?.at ?? Infinity, nextAlarm ?? Infinity);
        if (due >= dayEnd) break;
        env.clock.t = Math.max(env.clock.t, due);
        if (nextEvent !== undefined && nextEvent.at <= (nextAlarm ?? Infinity)) {
          events.shift();
          await handle(nextEvent);
        } else {
          await alarm();
        }
      }
      expect(events, 'every player event of the day ran').toHaveLength(0);
      expect(skipped, 'the lounge ran long enough to be scaled').toBe(true);
      // The day crossed a reset and its alarm did the daily cleanup: the day was not left unmarked.
      const today = gameDay(env.clock.t, HELSINKI, RULES.daily.reset);
      expect(maintainedDay(env.metered.sql), 'the daily maintenance ran').toBe(today);
    });

    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
  }, 120_000);
});
