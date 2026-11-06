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
import { knownKnacks, v2Pool } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { readSourceOfPath } from '../src/read-meter';
import { RULES, createSeededRng } from '@creatures/game';
import { maintainedDay } from '../src/maintenance';
import { gameDay } from '../src/time';
import { playV2Day, scaleV2Foes } from './dungeon-v2-reads';
import { DAY, HELSINKI, HOUR, MINUTE } from './raid-helpers';
import { V2_WEEK } from './raid-v2-helpers';
import type { ReadReport } from './read-meter';
import {
  BUILD,
  GUILD_ID,
  LOUNGERS,
  LOUNGER_FIRST,
  LOUNGE_INSTANCE,
  PLAYERS,
  seedAnvils,
  seedSeats,
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
// Today (51 migrations: the start reads one row of schema_version per migration): 126,011. With combat v2 on
// (the second test, the same budget): 157,044 rows. The extra is the v2 creature page on every state request
// (request:state 24,428, was 15,652) and the 50 Knack saves and talent learns, each of which answers with the
// state (request:creatures 22,216). With each of the 10 players also running a v2 dungeon day on their first opening
// (start, the rooms, the camp, the rest of the run, a look at the replay: about 1,000 rows a run): 167,736 rows, the
// extra 10,600 rows in request:dungeon (13,160, was 3,199 with the `/api/dungeon/today` looks).

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
  written: number;
  calls: number;
  scaled: number;
}

class DayReads {
  private readonly bySource = new Map<string, Tally>();

  add(source: string, reads: ReadReport, scaledCalls = 0): void {
    const tally = this.bySource.get(source) ?? { rows: 0, written: 0, calls: 0, scaled: 0 };
    tally.rows += reads.total;
    tally.written += reads.written;
    tally.calls += scaledCalls === 0 ? 1 : scaledCalls;
    if (scaledCalls > 0) tally.scaled += scaledCalls;
    this.bySource.set(source, tally);
  }

  get total(): number {
    let sum = 0;
    for (const t of this.bySource.values()) sum += t.rows;
    return sum;
  }

  /** The rows written in the day (Cloudflare's free tier allows 100,000 a day, apart from the reads). */
  get written(): number {
    let sum = 0;
    for (const t of this.bySource.values()) sum += t.written;
    return sum;
  }

  describe(): string {
    const lines = [...this.bySource.entries()]
      .sort((a, b) => b[1].rows - a[1].rows)
      .map(
        ([source, t]) =>
          `  ${String(t.rows).padStart(8)} rows (${String(t.written)} written)  x${String(t.calls)}${t.scaled > 0 ? ` (${String(t.scaled)} scaled)` : ''}  ${source}`,
      );
    return [
      `${String(this.total)} rows read and ${String(this.written)} written in the day. By source:`,
      ...lines,
    ].join('\n');
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

/**
 * One simulated day. `combatV2` is the same day with the flag on: the guild's creatures carry v2 talents and
 * Knacks, the creature page is the v2 one on every `/api/state`, each playing player saves a Knack on each
 * opening and learns a talent from their line's book once.
 */
async function simulateDay(options: {
  combatV2?: boolean;
  valleySystems?: boolean;
  /** Scouts are posted (the valley's step 2): every player has two seats, the first three players six. */
  scouts?: boolean;
  /** Anvils are posted (the valley's step 3): every player has two, the first three players two as well, with scouts too when `scouts` is on. */
  smiths?: boolean;
  /** The welcome-back Gazette (the valley's step 4): a player who finds an unread paper closes it, as every opening of the day does. */
  gazette?: boolean;
  fresh?: boolean;
}): Promise<DayReads> {
  const reads = new DayReads();
  // The valley systems need combat v2 on (`valley-flag.ts`).
  const flag = {
    ...(options.combatV2 === true || options.valleySystems === true ? { combatV2: true } : {}),
    ...(options.valleySystems === true ? { valleySystems: true } : {}),
  };
  await inGuild(
    async (env: GuildEnv) => {
      const world = await seedWorld(env, options);
      if (options.scouts === true) {
        for (let n = 1; n <= PLAYERS; n++)
          seedSeats(env.metered.sql, userId(n), world.creatures[userId(n)] ?? [], n <= 3 ? 6 : 2);
      }
      if (options.smiths === true) {
        for (let n = 1; n <= PLAYERS; n++)
          seedAnvils(env.metered.sql, userId(n), world.creatures[userId(n)] ?? [], 2);
      }
      const dayStart = env.clock.t;
      const dayEnd = dayStart + DAY;
      const lounge = fakeLounge();
      const events = playerEvents(dayStart, dayStart + 4 * HOUR);
      const loungeTicks: { start: ReadReport; alarm: ReadReport }[] = [];
      let skipped = false;
      /** The players who have opened the game once already today (the v2 day learns on the first opening). */
      const opens = new Set<number>();

      /** A new object start (the previous one was evicted): its reads are the `start` source. */
      const wake = async (source: string): Promise<ReturnType<GuildEnv['mk']>> => {
        const core = env.mk(BUILD, { ...loungeOptions(lounge), ...flag });
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
        if (options.gazette === true && paths.includes('/api/state')) {
          const paper = env.metered.sql
            .exec<{ paper_id: string }>(
              'SELECT paper_id FROM valley_gazette WHERE user_id = ? AND read_at IS NULL',
              userId(player),
            )
            .toArray()[0];
          if (paper !== undefined) {
            reads.add(
              'request:valley',
              (
                await env.metered.measure(() =>
                  callAs(core, secrets, player, '/api/valley/gazette/close', {
                    method: 'POST',
                    body: { paperId: paper.paper_id },
                  }),
                )
              ).reads,
            );
          }
        }
        if (options.combatV2 !== true || !paths.includes('/api/state')) return;
        // Combat v2: a Knack saved on the creature page, and (the first opening of a player) a talent learned.
        const mine = world.creatures[userId(player)] ?? [];
        const first = mine[0] as string;
        const knack = knownKnacks(creatureSpecies(env.metered.sql, first))[0] ?? null;
        reads.add(
          readSourceOfPath('/api/creatures'),
          (
            await env.metered.measure(() =>
              callAs(core, secrets, player, `/api/creatures/${first}/knack`, {
                method: 'PUT',
                body: { knack: opens.has(player) ? null : knack },
              }),
            )
          ).reads,
        );
        if (opens.has(player)) return;
        opens.add(player);
        // Combat v2: each playing player runs the day's dungeon on their first opening (start, the rooms, the camp,
        // the rest of the run, a look at the replay).
        await playV2Day(
          (method, path, body) => callAs(core, secrets, player, path, { method, body }),
          mine.slice(0, 3),
          `read-day-dungeon-${String(player)}`,
          async (_label, run) => {
            const measured = await env.metered.measure(run);
            reads.add('request:dungeon', measured.reads);
            return measured.result;
          },
        );
        const line = env.metered.sql
          .exec<{ line: string }>('SELECT line FROM creatures WHERE id = ?', first)
          .one().line;
        const learned = new Set(
          env.metered.sql
            .exec<{ talent_id: string }>(
              'SELECT talent_id FROM creature_talents_v2 WHERE creature_id = ?',
              first,
            )
            .toArray()
            .map((r) => r.talent_id),
        );
        const other = v2Pool(line).find((id) => !learned.has(id));
        if (other === undefined) throw new Error('nothing to learn');
        reads.add(
          readSourceOfPath('/api/creatures'),
          (
            await env.metered.measure(() =>
              callAs(core, secrets, player, `/api/creatures/${first}/talents-v2/learn`, {
                method: 'POST',
                body: {
                  talentId: other,
                  idempotencyKey: `read-day-learn-${String(player).padStart(4, '0')}`,
                },
              }),
            )
          ).reads,
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
        const core = env.mk(BUILD, { ...loungeOptions(lounge), ...flag });
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
          reads.add(
            source,
            { total: perTick * remaining, written: 0, statements: 0, top: [] },
            remaining,
          );
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
      // Step 5: with the valley on that cleanup also wrote the server's middle (one row; priced in `read-budget.test.ts`, "the bonfire").
      if (options.valleySystems === true) {
        expect(
          env.metered.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM valley_server').one().n,
          'the daily maintenance wrote the middle',
        ).toBe(1);
      }
    },
    { fresh: options.fresh === true },
  );
  return reads;
}

const creatureSpecies = (sql: SqlStorage, id: string): string =>
  sql.exec<{ species: string }>('SELECT species FROM creatures WHERE id = ?', id).one().species;

describe('a day in the life of a 10-player server', () => {
  it('reads few rows in a day', async () => {
    const reads = await simulateDay({});
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
  }, 120_000);

  // The same budget, not a new one: the flag on must fit in what the day was allowed.
  it('reads few rows in a day with combat v2 on (Knack saves, talent learns and a dungeon run each included)', async () => {
    // Easy v2 foes, so every run reaches its camp whatever the seeded levels (the reads of a fight do not depend on it).
    const restore = scaleV2Foes(500, 500);
    let reads: DayReads;
    try {
      reads = await simulateDay({ combatV2: true, fresh: true });
    } finally {
      restore();
    }
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
  }, 120_000);
});

/**
 * The same day with the valley's systems on (phase 5 step 1): every opening of the game settles the player's valley (30 creatures
 * each in the seeded guild: an arrival pays them all, a later look in the same hour writes the carries), the daily allowance claim,
 * the lounge's company XP and the lounge's own ticks stay as they are (the lounge message still runs). Same reads budget as the flag-off
 * day, and a rows-written budget (plan risk 2: rows written have their own allowance, 100,000 a day on the free tier).
 */
// Measured 117,941 rows read (request:state 31,392 of them, 15,652 without the valley's pass) and 3,901 written (request:state 2,571, request:raid 132, request:session 409).
const VALLEY_DAY_WRITE_BUDGET = 6000;
// With scouts posted (step 2: two seats each, six for three players): measured 120,284 rows read (request:state 33,482) and 4,225 written (request:state 2,883).
const VALLEY_SCOUT_DAY_WRITE_BUDGET = 6000;
// With smiths as well (step 3: two anvils each, a queue of two orders, a stocked shelf, two pieces on each floor; scouts as above): measured 123,488 rows read and 4,541 written.
const VALLEY_SMITH_DAY_WRITE_BUDGET = 6500;

// With the Gazette (step 4): every arrival writes a paper (a read of the unread one, a write of the log) and each player closes it.
// Measured 124,132 rows read (123,488 without the Gazette: the papers add about 650, the ten closes about 10 each) and 4,617 written (4,541 without).
const VALLEY_GAZETTE_DAY_WRITE_BUDGET = 6600;

describe('a day in the life with the valley on', () => {
  it('reads and writes few rows in a day with the Gazette: scouts and smiths posted, every arrival writes a paper and the player closes it', async () => {
    const reads = await simulateDay({
      valleySystems: true,
      scouts: true,
      smiths: true,
      gazette: true,
      fresh: true,
    });
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
    expect(
      reads.written,
      `${reads.describe()}\nWrite budget: ${String(VALLEY_GAZETTE_DAY_WRITE_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(VALLEY_GAZETTE_DAY_WRITE_BUDGET);
  }, 120_000);

  it('reads and writes few rows in a day with smiths and scouts posted (two anvils each, scouts as above)', async () => {
    const reads = await simulateDay({
      valleySystems: true,
      scouts: true,
      smiths: true,
      fresh: true,
    });
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
    expect(
      reads.written,
      `${reads.describe()}\nWrite budget: ${String(VALLEY_SMITH_DAY_WRITE_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(VALLEY_SMITH_DAY_WRITE_BUDGET);
  }, 120_000);

  it('reads and writes few rows in a day (every opening settles 30 creatures)', async () => {
    const reads = await simulateDay({ valleySystems: true, fresh: true });
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
    expect(
      reads.written,
      `${reads.describe()}\nWrite budget: ${String(VALLEY_DAY_WRITE_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(VALLEY_DAY_WRITE_BUDGET);
  }, 120_000);

  it('reads and writes few rows in a day with scouts posted (two seats each, six for the first three players)', async () => {
    const reads = await simulateDay({ valleySystems: true, scouts: true, fresh: true });
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(DAY_BUDGET);
    expect(
      reads.written,
      `${reads.describe()}\nWrite budget: ${String(VALLEY_SCOUT_DAY_WRITE_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(VALLEY_SCOUT_DAY_WRITE_BUDGET);
  }, 120_000);
});

/** Budget for a v2 raid weekend's Sunday: about 1.5x the measured total (the breakdown is in the comment below). */
const WEEKEND_DAY_BUDGET = 56_000;
// Measured 37,149 rows: request:raid 10,576 (344 calls: the live finale's snapshots at about 30 rows each, served from the rounds kept in the row), request:state 9,664, request:games 4,505, alarm:stage 2 3,502 (the party resolved, 15 players paid and the stage stored), request:gear 2,557.
// A combat v2 raid Sunday (the seeded 15-player party, all in one party of 45 creatures): the day's rows come from stage 2 at 13:37 (one
// alarm that resolves the party, pays 15 players and stores the stage), 10 players opening the game twice (a login and the usual tabs,
// `/api/raid` among them), the finale at 20:00 (one alarm that starts the live fight), the live finale's 8 rounds (ten players take a
// snapshot at every round start, two poll every 2 seconds all through it), the read that settles it (one transaction: the payout of 15
// players, the jackpot rolls, the track's move) and a last look at the raid. Saturday's stage 1 is played first and is not part of the day.

/** The rows of a v2 raid Sunday, by source. */
async function simulateWeekendDay(): Promise<DayReads> {
  const reads = new DayReads();
  await inGuild(
    async (env: GuildEnv) => {
      await seedWorld(env, { combatV2: true });
      const { metered, clock, mk } = env;
      const flag = { combatV2: true } as const;
      const wake = async (source: string): Promise<ReturnType<GuildEnv['mk']>> => {
        const core = mk(BUILD, flag);
        reads.add(source, (await metered.measure(() => core.migrate())).reads);
        return core;
      };
      // Saturday, stage 1 (its own day: not counted).
      clock.t = V2_WEEK.stage1 + 30_000;
      await mk(BUILD, flag).alarm();
      // Sunday, from the morning.
      clock.t = V2_WEEK.stage2 - 3 * HOUR;
      const open = async (player: number): Promise<void> => {
        const core = await wake('start');
        const user = { id: userId(player), displayName: `Player ${String(player)}` };
        const session = await metered.measure(() => core.createSession(GUILD_ID, user));
        reads.add('request:session', session.reads);
        const secrets = new Map([[userId(player), session.result]]);
        for (const path of TABS)
          reads.add(
            readSourceOfPath(path),
            (await metered.measure(() => callAs(core, secrets, player, path))).reads,
          );
      };
      for (let p = 1; p <= PLAYING; p++) await open(p);
      // Stage 2 at 13:37.
      clock.t = V2_WEEK.stage2 + 30_000;
      {
        const core = mk(BUILD, flag);
        reads.add('start', (await metered.measure(() => core.migrate())).reads);
        reads.add('alarm:stage 2', (await metered.measure(() => core.alarm())).reads);
      }
      for (let p = 1; p <= PLAYING; p++) await open(p);
      // The finale: the lobby, the start at 20:00, the rounds.
      clock.t = V2_WEEK.finale - 3 * MINUTE;
      const look = async (core: ReturnType<GuildEnv['mk']>, player: number): Promise<void> => {
        reads.add(
          'request:raid',
          (
            await metered.measure(() =>
              Promise.resolve(core.raid.liveView(userId(player), HELSINKI)),
            )
          ).reads,
        );
      };
      {
        const core = await wake('start');
        for (let p = 1; p <= PLAYING; p++) await look(core, p);
        clock.t = V2_WEEK.finale + 2000;
        reads.add('alarm:finale start', (await metered.measure(() => core.alarm())).reads);
      }
      const live = mk(BUILD, flag);
      live.migrate();
      const rounds = 8;
      for (let r = 0; r < rounds; r++) {
        clock.t = V2_WEEK.finale + r * 30_000 + 1000;
        // Ten players take a snapshot at the round's start (the socket's push), two poll every 2 seconds through the round.
        for (let p = 1; p <= PLAYING; p++) await look(live, p);
        for (let tick = 0; tick < 14; tick++) {
          clock.t += 2000;
          for (const p of [1, 2]) await look(live, p);
        }
      }
      // The end: the first read after the last round settles the fight.
      clock.t = V2_WEEK.finale + rounds * 30_000 + 1000;
      reads.add(
        'settle',
        (await metered.measure(() => Promise.resolve(live.raid.liveView(userId(1), HELSINKI))))
          .reads,
      );
      for (let p = 1; p <= PLAYING; p++) await look(live, p);
    },
    { fresh: true },
  );
  return reads;
}

describe('a v2 raid weekend day', () => {
  it('reads few rows on the Sunday of a combat v2 weekend (stage 2, the live finale and its settle included)', async () => {
    const reads = await simulateWeekendDay();
    expect(
      reads.total,
      `${reads.describe()}\nBudget: ${String(WEEKEND_DAY_BUDGET)} rows.`,
    ).toBeLessThanOrEqual(WEEKEND_DAY_BUDGET);
  }, 180_000);
});
