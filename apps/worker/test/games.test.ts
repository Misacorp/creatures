/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call --
   These tests read parts of many response bodies (`Json.body` is `any` on purpose): typing each body
   would only repeat the server's view types. */
import {
  RULES,
  createSeededRng,
  gamesContent,
  gamesEventDef,
  type GamesEventDef,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { capTeams } from '../src/games-lock';
import type { EntryRow } from '../src/games-store';
import { ON, player, type Dev } from './dev-helpers';
import { SCHEMA_VERSION } from '../src/migrations';
import { gamesMigration } from '../src/games-migration';
import {
  runCore,
  undoGamesBadgesMigration,
  undoGamesMigration,
  undoMaintenanceMigration,
  type CoreContext,
} from './helpers';
import { MINUTE, newKey } from './kit';
import { count, nextGuild, rows } from './raid-helpers';

/** Tuesday 2027-01-12, 10:00 in Helsinki (UTC+2): entries are open for that day's show. */
const TUE_10 = Date.parse('2027-01-12T08:00:00Z');
const TUE_LOCK = Date.parse('2027-01-12T11:37:00Z');
const TUE_SHOW = Date.parse('2027-01-12T11:40:00Z');
/** Wednesday 2027-01-13, 14:00 in Helsinki: the stall's game day. */
const WED_14 = Date.parse('2027-01-13T12:00:00Z');
const CHANNEL = '123456789012345678';

function run<R>(fn: (ctx: CoreContext) => Promise<R>, options: { dev?: boolean } = {}) {
  return runCore(
    nextGuild(),
    async (ctx) => {
      ctx.clock.t = TUE_10;
      return fn(ctx);
    },
    {
      gamesRng: createSeededRng('games-tests'),
      gearRng: createSeededRng('games-gear'),
      raidRng: createSeededRng('games-raid'),
      ...(options.dev === true ? ON : {}),
    },
  );
}

/** A player with six creatures, so every event can have its own. */
const sixer = (ctx: CoreContext, n = 1, name?: string): Promise<Dev> =>
  player(ctx, n, { creatures: 6, ...(name === undefined ? {} : { name }) });

const lineupOf = async (p: Dev) => {
  const res = await p.call('GET', '/api/games');
  expect(res.status).toBe(200);
  return res.body.next as {
    day: string;
    lineup: { id: string; team: 1 | 3 }[];
    entries: Record<string, string[]>;
  };
};

describe('migrations 39 and 40', () => {
  const version = (ctx: { sql: SqlStorage }): number | undefined =>
    rows<{ v: number }>(ctx.sql, 'SELECT MAX(version) AS v FROM schema_version')[0]?.v;
  const has = (ctx: { sql: SqlStorage }, name: string): boolean =>
    count(ctx.sql, 'sqlite_master', `name = '${name}'`) > 0;

  it('43 is the last version; an undo adds the Games tables and the badges again', async () => {
    expect(SCHEMA_VERSION).toBe(43);
    await run(async (ctx) => {
      const p = await sixer(ctx);
      undoGamesMigration(ctx.sql);
      expect(has(ctx, 'games_days')).toBe(false);
      ctx.core.migrate();
      ctx.core.migrate();
      expect(version(ctx)).toBe(43);
      expect(has(ctx, 'games_days')).toBe(true);
      expect(has(ctx, 'games_badges')).toBe(true);
      expect((await p.call('GET', '/api/games')).status).toBe(200);
    });
  });

  it('repairs a staging database that ran the Games as migration 38: it gains the maintenance mark', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      // The staging shape: the Games tables at 38, no maintenance mark.
      undoMaintenanceMigration(ctx.sql);
      gamesMigration(ctx.sql);
      ctx.sql.exec('INSERT INTO schema_version (version) VALUES (38)');
      expect(has(ctx, 'maintenance')).toBe(false);
      ctx.core.migrate();
      expect(version(ctx)).toBe(43);
      expect(has(ctx, 'maintenance')).toBe(true);
      expect(has(ctx, 'games_days')).toBe(true);
      expect((await p.call('GET', '/api/games')).status).toBe(200);
    });
  });
});

describe('event badges', () => {
  it('migration 40 back-fills them from awarded gold placings: each team member once per win, never bots', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      const [a, b, c] = p.creatureIds as [string, string, string];
      const day = (d: string, awarded: boolean) =>
        ctx.sql.exec(
          'INSERT INTO games_days (day, lineup_json, created_at, locked_at, awarded_at) VALUES (?, ?, 1, 1, ?)',
          d,
          '[]',
          awarded ? 2 : null,
        );
      const placing = (
        d: string,
        eventId: string,
        userId: string,
        ids: string[],
        medal: string | null,
        bot = 0,
      ) =>
        ctx.sql.exec(
          `INSERT INTO games_placings (day, event_id, user_id, creature_ids, place, medal, score, bot)
           VALUES (?, ?, ?, ?, 1, ?, 0, ?)`,
          d,
          eventId,
          userId,
          JSON.stringify(ids),
          medal,
          bot,
        );
      day('2027-01-01', true);
      day('2027-01-02', true);
      day('2027-01-03', false);
      placing('2027-01-01', 'pepper-panic', p.id, [a], 'gold');
      placing('2027-01-02', 'pepper-panic', p.id, [a], 'gold');
      placing('2027-01-01', 'log-carry', p.id, [a, b, c], 'gold');
      placing('2027-01-02', 'log-carry', p.id, [a, b], 'silver');
      // Not shown yet (a spoiler) and a bot's win: neither counts.
      placing('2027-01-03', 'melon-run', p.id, [b], 'gold');
      placing('2027-01-01', 'melon-run', 'dev-guest-1', ['dev-guest-1-c'], 'gold', 1);
      undoGamesBadgesMigration(ctx.sql);
      ctx.core.migrate();
      const got = rows<{ creature_id: string; event_id: string; wins: number; user_id: string }>(
        ctx.sql,
        'SELECT creature_id, event_id, wins, user_id FROM games_badges ORDER BY creature_id, event_id',
      );
      expect(got).toEqual(
        [
          { creature_id: a, event_id: 'log-carry', wins: 1, user_id: p.id },
          { creature_id: a, event_id: 'pepper-panic', wins: 2, user_id: p.id },
          { creature_id: b, event_id: 'log-carry', wins: 1, user_id: p.id },
          { creature_id: c, event_id: 'log-carry', wins: 1, user_id: p.id },
        ].sort((x, y) =>
          x.creature_id === y.creature_id
            ? x.event_id.localeCompare(y.event_id)
            : x.creature_id.localeCompare(y.creature_id),
        ),
      );
      // The creature page lists a creature's badges; the tab lists them for the next day's events.
      const page = await p.call('GET', `/api/games/creature/${a}`);
      expect(page.body.badges).toEqual([
        { eventId: 'log-carry', wins: 1 },
        { eventId: 'pepper-panic', wins: 2 },
      ]);
      const next = (await p.call('GET', '/api/games')).body.next;
      const ids = (next.lineup as { id: string }[]).map((e) => e.id);
      ctx.sql.exec(
        'INSERT INTO games_badges (creature_id, event_id, user_id, wins) VALUES (?, ?, ?, 3)',
        b,
        ids[0],
        p.id,
      );
      const again = (await p.call('GET', '/api/games')).body.next;
      expect(again.badges[ids[0] as string][b]).toBe(3);
      const own = new Set(p.creatureIds);
      for (const byCreature of Object.values(again.badges as Record<string, object>)) {
        expect(Object.keys(byCreature).every((id) => own.has(id))).toBe(true);
      }
    });
  });
});

describe('good fits', () => {
  it("list, per event, only the player's own creatures that pass the event's bar", async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      const next = (await p.call('GET', '/api/games')).body.next;
      const own = new Set(p.creatureIds);
      for (const e of next.lineup as { id: string }[]) {
        const fits = next.goodFit[e.id] as string[];
        expect(Array.isArray(fits)).toBe(true);
        expect(fits.every((id) => own.has(id))).toBe(true);
      }
      expect(next).not.toHaveProperty('fit');
    });
  });
});

describe('entries', () => {
  it('validate the day, event, team size, ownership and one event per creature', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      const other = await sixer(ctx, 2);
      const next = await lineupOf(p);
      expect(next.day).toBe('2027-01-12');
      expect(next.lineup).toHaveLength(RULES.games.eventsPerDay);
      const solo = next.lineup.find((e) => e.team === 1)?.id as string;
      const solo2 = next.lineup.filter((e) => e.team === 1)[1]?.id as string;
      const team = next.lineup.find((e) => e.team === 3)?.id as string;
      const [a, b, c] = p.creatureIds as [string, string, string];
      const put = (body: unknown) => p.call('PUT', '/api/games/entry', body);
      const entry = (eventId: string, creatureIds: string[]) => ({
        day: next.day,
        eventId,
        creatureIds,
      });

      // Strict body: unknown keys, a user id and too many creatures are refused.
      expect((await put({ ...entry(solo, [a]), userId: other.id })).status).toBe(400);
      expect((await put(entry(solo, [a, b, c, a]))).status).toBe(400);
      expect((await put({ day: next.day, eventId: solo })).status).toBe(400);
      // The wrong day, an event not in the lineup.
      expect((await put({ ...entry(solo, [a]), day: '2027-01-13' })).body.error).toBe(
        'entries_closed',
      );
      const absent = ['sauna-showdown', 'frost-bath', 'melon-run', 'shark-derby'].find(
        (id) => !next.lineup.some((e) => e.id === id),
      ) as string;
      expect((await put(entry(absent, [a]))).body.error).toBe('not_in_lineup');
      // Team sizes: one in a solo event, up to three in a team event; no creature twice.
      expect((await put(entry(solo, [a, b]))).body.error).toBe('invalid_team');
      expect((await put(entry(team, [a, a]))).body.error).toBe('invalid_team');
      // Someone else's creature.
      expect((await put(entry(solo, [other.creatureIds[0] as string]))).status).toBe(404);

      const ok = await put(entry(solo, [a]));
      expect(ok.status).toBe(200);
      expect(ok.body.next.entries).toEqual({ [solo]: [a] });
      expect(ok.body.next).not.toHaveProperty('joined');
      expect(ok.body.next).not.toHaveProperty('auto');
      // One event per creature per day.
      expect((await put(entry(solo2, [a]))).body.error).toBe('already_entered');
      expect((await put(entry(team, [b, c]))).body.next.entries).toEqual({
        [solo]: [a],
        [team]: [b, c],
      });
      // Re-setting an event replaces it; an empty list clears it.
      expect((await put(entry(solo, [b]))).body.error).toBe('already_entered');
      expect((await put(entry(solo, []))).body.next.entries).toEqual({ [team]: [b, c] });

      // After the lock the day is closed.
      ctx.clock.t = TUE_LOCK + MINUTE;
      const closed = await put(entry(solo, [a]));
      expect(closed).toMatchObject({ status: 409, body: { error: 'entries_closed' } });
    });
  });
});

describe('the show', () => {
  it('locks once, hides results until the show, awards once after the end, and never posts', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx, 1, '@everyone **Misa**');
      const quiet = await sixer(ctx, 2);
      ctx.sql.exec('UPDATE guild_meta SET announce_channel_id = ? WHERE id = 1', CHANNEL);
      const next = await lineupOf(p);
      const solo = next.lineup.find((e) => e.team === 1)?.id as string;
      const solo2 = next.lineup.filter((e) => e.team === 1)[1]?.id as string;
      const team = next.lineup.find((e) => e.team === 3)?.id as string;
      const [a, b, c, d, e] = p.creatureIds as [string, string, string, string, string];
      const enter = (who: Dev, eventId: string, creatureIds: string[]) =>
        who.call('PUT', '/api/games/entry', { day: next.day, eventId, creatureIds });
      await enter(p, solo, [a]);
      await enter(p, solo2, [e]);
      await enter(p, team, [b, c, d]);
      // The quiet player enters one event: only what they set runs (there is no auto-entry).
      await enter(quiet, solo, [quiet.creatureIds[0] as string]);
      expect((await quiet.call('PUT', '/api/games/auto', { on: false })).status).toBe(404);
      // A record from before for creature `a`, so it pins whatever it scores.
      ctx.sql.exec(
        "INSERT INTO games_records (creature_id, event_id, user_id, best, day) VALUES (?, ?, ?, -1, '2027-01-01')",
        a,
        solo,
        p.id,
      );
      const exp = () =>
        rows<{ id: string; exp: number; level: number }>(
          ctx.sql,
          'SELECT id, exp, level FROM creatures WHERE user_id = ? ORDER BY caught_at',
          p.id,
        );
      const before = exp();

      // The lock: only the entries players made.
      ctx.clock.t = TUE_LOCK + 5_000;
      const locked = await p.call('GET', '/api/games');
      expect(locked.body.phase).toBe('locked');
      expect(locked.body.show).toBeNull();
      expect(count(ctx.sql, 'games_results', "day = '2027-01-12'")).toBe(RULES.games.eventsPerDay);
      const entries = rows<{ user_id: string; auto: number }>(
        ctx.sql,
        "SELECT user_id, auto FROM games_entries WHERE day = '2027-01-12'",
      );
      expect(entries.filter((x) => x.user_id === p.id)).toHaveLength(
        RULES.games.eventsPerDay - 1 + RULES.games.teamSize,
      );
      expect(entries.filter((x) => x.user_id === quiet.id)).toEqual([
        { user_id: quiet.id, auto: 0 },
      ]);
      const day = rows<{ seed: string; show_at: number; ends_at: number }>(
        ctx.sql,
        "SELECT seed, show_at, ends_at FROM games_days WHERE day = '2027-01-12'",
      )[0];
      expect(day?.seed).toMatch(/^[0-9a-f]{32}$/);
      expect(day?.show_at).toBe(TUE_SHOW);
      // A second run of the schedule changes nothing.
      ctx.core.games.runDue();
      expect(count(ctx.sql, 'games_results')).toBe(RULES.games.eventsPerDay);
      expect(count(ctx.sql, 'games_placings', `user_id = '${p.id}'`)).toBe(
        RULES.games.eventsPerDay,
      );
      expect(count(ctx.sql, 'discord_posts')).toBe(0);
      // The next day's entries are not open before the show: the locked day is still next.
      expect(locked.body.next.day).toBe('2027-01-12');
      expect(locked.body.next.open).toBe(false);

      // The show: results from its start, tomorrow's lineup with it.
      ctx.clock.t = TUE_SHOW;
      const show = await p.call('GET', '/api/games');
      expect(show.body.phase).toBe('show');
      expect(show.body.show.events.length).toBe(RULES.games.eventsPerDay);
      expect(show.body.show.endsAt).toBe(day?.ends_at);
      expect(show.body.show.timeline).toHaveLength(RULES.games.eventsPerDay);
      expect(show.body.show.players.map((x: { id: string }) => x.id).sort()).toEqual(
        [p.id, quiet.id].sort(),
      );
      expect(show.body.next.day).toBe('2027-01-13');
      expect(show.body.next.open).toBe(true);
      // Nothing is paid or posted before the end.
      expect(count(ctx.sql, 'discord_posts')).toBe(0);
      expect(show.body.you.lastResults).toBeUndefined();

      // The end: the awards, once.
      ctx.clock.t = (day?.ends_at ?? 0) + 1;
      await ctx.core.alarm();
      await ctx.core.alarm();
      ctx.core.games.runDue();
      const after = (await p.call('GET', '/api/games')).body;
      expect(after.phase).toBe('after');
      const results = after.you.lastResults.results as {
        eventId: string;
        place: number;
        medal: string | null;
        pin: boolean;
        xp: number;
        creatureIds: string[];
      }[];
      expect(results).toHaveLength(RULES.games.eventsPerDay);
      const soloResult = results.find((r) => r.eventId === solo);
      expect(soloResult?.pin).toBe(true);
      const totalXp = results.reduce((n, r) => n + r.xp, 0);
      const minXp = (RULES.games.eventsPerDay - 1 + RULES.games.teamSize) * RULES.games.xp.enter;
      expect(totalXp).toBeGreaterThanOrEqual(minXp + RULES.games.xp.pin);
      // Experience reached the creatures once (the extra alarms paid nothing).
      const gained = exp().reduce((n, c, i) => {
        const was = before[i];
        return n + (c.level === was?.level ? c.exp - (was?.exp ?? 0) : 1);
      }, 0);
      expect(gained).toBeGreaterThan(0);
      expect(count(ctx.sql, 'games_days', 'awarded_at IS NOT NULL')).toBe(1);
      const medals = results.filter((r) => r.medal !== null).length;
      const pins = results.filter((r) => r.pin).length;
      expect(after.you.medals.pins).toBe(pins);
      expect(after.you.medals.gold + after.you.medals.silver + after.you.medals.bronze).toBe(
        medals,
      );
      // Records: the first entry of every other creature set one (no pin), `a` beat its own.
      expect(count(ctx.sql, 'games_records', `user_id = '${p.id}'`)).toBe(
        RULES.games.eventsPerDay - 1 + RULES.games.teamSize,
      );
      // No podium post: it would spoil the replay for anyone who watches later.
      expect(count(ctx.sql, 'discord_posts')).toBe(0);

      // Event badges: one win of the event for every member of each real first place, once.
      const golds = rows<{ event_id: string; creature_ids: string }>(
        ctx.sql,
        "SELECT event_id, creature_ids FROM games_placings WHERE medal = 'gold' AND bot = 0",
      );
      const expected = new Map<string, number>();
      for (const g of golds) {
        for (const id of JSON.parse(g.creature_ids) as string[]) {
          expected.set(`${id}:${g.event_id}`, (expected.get(`${id}:${g.event_id}`) ?? 0) + 1);
        }
      }
      const badges = rows<{ creature_id: string; event_id: string; wins: number }>(
        ctx.sql,
        'SELECT creature_id, event_id, wins FROM games_badges',
      );
      expect(new Map(badges.map((x) => [`${x.creature_id}:${x.event_id}`, x.wins]))).toEqual(
        expected,
      );
      expect(golds.length).toBeGreaterThan(0);

      // The creature page: its medals, badges and records, own creatures only.
      const page = await p.call('GET', `/api/games/creature/${a}`);
      expect(page.status).toBe(200);
      expect(page.body.badges).toEqual(
        badges
          .filter((x) => x.creature_id === a)
          .map((x) => ({ eventId: x.event_id, wins: x.wins })),
      );
      expect(page.body.records).toEqual([
        expect.objectContaining({ eventId: solo, unit: expect.any(String) }),
      ]);
      expect(page.body.medals.pins).toBe(1);
      expect((await quiet.call('GET', `/api/games/creature/${a}`)).status).toBe(404);
      expect((await p.call('GET', '/api/games/creature/nope')).status).toBe(400);
    });
  });

  it('skips a day nobody could enter, and draws the next lineup when it is needed', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      ctx.clock.t = TUE_LOCK + MINUTE;
      // Nobody entered: nothing locks, and the next show day is still open after its own reset.
      const view = (await p.call('GET', '/api/games')).body;
      expect(count(ctx.sql, 'games_days', 'locked_at IS NOT NULL')).toBe(0);
      expect(view.phase).toBe('entries');
      expect(view.show).toBeNull();
      const today = rows<{ lineup_json: string }>(
        ctx.sql,
        "SELECT lineup_json FROM games_days WHERE day = '2027-01-12'",
      );
      expect(today).toHaveLength(1);
      ctx.clock.t = TUE_SHOW + MINUTE;
      const res = await p.call('GET', '/api/games');
      const next = res.body.next;
      expect(next.day).toBe('2027-01-13');
      // Wednesday, the bonus day: one event more.
      expect(new Set((next.lineup as { id: string }[]).map((e) => e.id)).size).toBe(
        RULES.games.eventsPerDay + 1,
      );
      expect(count(ctx.sql, 'games_days')).toBe(2);
    });
  });
});

describe('the bonus day', () => {
  /** Wednesday 2027-01-13 in Helsinki: 10:00, the lock and the show. */
  const WED_10 = Date.parse('2027-01-13T08:00:00Z');
  const WED_LOCK = Date.parse('2027-01-13T11:37:00Z');

  /** Enters a creature in every event, locks, plays and awards Wednesday's show. */
  async function playWednesday(ctx: CoreContext, p: Dev) {
    ctx.clock.t = WED_10;
    const next = await lineupOf(p);
    expect(next.day).toBe('2027-01-13');
    for (const [i, e] of next.lineup.entries()) {
      await p.call('PUT', '/api/games/entry', {
        day: next.day,
        eventId: e.id,
        creatureIds: [p.creatureIds[i]],
      });
    }
    ctx.clock.t = WED_LOCK + 5_000;
    ctx.core.games.runDue();
    const ends = rows<{ ends_at: number }>(
      ctx.sql,
      "SELECT ends_at FROM games_days WHERE day = '2027-01-13'",
    )[0]?.ends_at;
    ctx.clock.t = (ends ?? 0) + 1;
    await ctx.core.alarm();
    ctx.core.games.runDue();
    return p.call('GET', '/api/games');
  }

  it('Wednesday has one bonus solo event more, other days none', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      const tuesday = await lineupOf(p);
      expect(tuesday.lineup).toHaveLength(RULES.games.eventsPerDay);
      expect(tuesday.lineup.some((e) => 'bonus' in e)).toBe(false);
      ctx.clock.t = WED_10;
      const wed = (await lineupOf(p)).lineup as { id: string; team: 1 | 3; bonus?: true }[];
      expect(wed).toHaveLength(RULES.games.eventsPerDay + 1);
      const bonus = wed.filter((e) => e.bonus === true);
      expect(bonus).toHaveLength(1);
      expect(bonus[0]?.team).toBe(1);
      expect(wed.filter((e) => e.team === 3)).toHaveLength(1);
      // Stored in the lineup's JSON with the ids.
      const stored = rows<{ lineup_json: string }>(
        ctx.sql,
        "SELECT lineup_json FROM games_days WHERE day = '2027-01-13'",
      )[0]?.lineup_json;
      expect(JSON.parse(stored ?? 'null')).toEqual({
        ids: wed.map((e) => e.id),
        bonus: bonus[0]?.id,
      });
      // Thursday is an ordinary day again.
      ctx.clock.t = Date.parse('2027-01-14T08:00:00Z');
      expect((await lineupOf(p)).lineup).toHaveLength(RULES.games.eventsPerDay);
    });
  });

  it("pays the bonus event's medal points to the pocket twice, the medals once", async () => {
    await run(async (ctx) => {
      // The only player: every event is a gold (first entries: no pins).
      const p = await sixer(ctx);
      const after = (await playWednesday(ctx, p)).body;
      const results = after.you.lastResults.results as {
        eventId: string;
        medal: string | null;
        pin: boolean;
        bonus?: true;
      }[];
      expect(results).toHaveLength(RULES.games.eventsPerDay + 1);
      expect(results.every((r) => r.medal === 'gold' && !r.pin)).toBe(true);
      expect(results.filter((r) => r.bonus === true)).toHaveLength(1);
      expect(after.show.lineup.filter((e: { bonus?: true }) => e.bonus === true)).toHaveLength(1);
      const gold = RULES.games.medalPoints.gold;
      expect(after.you.medals.gold).toBe(RULES.games.eventsPerDay + 1);
      expect(after.you.pocket).toBe(RULES.games.eventsPerDay * gold + 2 * gold);
    });
  });

  it('a day stored with four events and no bonus (before the bonus day) still plays and pays', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      const solos = ['sauna-showdown', 'frost-bath', 'melon-run'];
      for (const id of solos) expect(gamesEventDef(id)?.team).toBe(1);
      const team = gamesContent.events.find((e) => e.team === 3)?.id as string;
      ctx.sql.exec(
        "INSERT INTO games_days (day, lineup_json, created_at) VALUES ('2027-01-13', ?, ?)",
        JSON.stringify([...solos, team]),
        TUE_10,
      );
      const after = (await playWednesday(ctx, p)).body;
      const results = after.you.lastResults.results as { eventId: string; bonus?: true }[];
      expect(results.map((r) => r.eventId)).toEqual([...solos, team]);
      expect(results.some((r) => r.bonus === true)).toBe(false);
      expect(after.show.lineup).toHaveLength(4);
      expect(after.you.medals.gold).toBe(4);
      expect(after.you.pocket).toBe(4 * RULES.games.medalPoints.gold);
    });
  });

  it('a retired event in a stored day still shows, under its old name, with its result and its records', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      // Play a day, then make it a day stored before the team event was retired: its id becomes
      // Sauna Stack's everywhere the day is kept.
      const played = (await playWednesday(ctx, p)).body;
      const team = (played.show.lineup as { id: string; team: number }[]).find((e) => e.team === 3)
        ?.id as string;
      for (const table of ['games_results', 'games_placings', 'games_records']) {
        ctx.sql.exec(`UPDATE ${table} SET event_id = 'sauna-stack' WHERE event_id = ?`, team);
      }
      ctx.sql.exec(
        `UPDATE games_results SET result_json = replace(result_json, ?, '"eventId":"sauna-stack"')
         WHERE event_id = 'sauna-stack'`,
        `"eventId":"${team}"`,
      );
      const day = rows<{ lineup_json: string }>(
        ctx.sql,
        "SELECT lineup_json FROM games_days WHERE day = '2027-01-13'",
      )[0]?.lineup_json;
      ctx.sql.exec(
        "UPDATE games_days SET lineup_json = ? WHERE day = '2027-01-13'",
        (day ?? '').replace(team, 'sauna-stack'),
      );
      const view = (await p.call('GET', '/api/games')).body;
      const lineup = view.show.lineup as { id: string; name: string; team: number }[];
      expect(lineup.find((e) => e.id === 'sauna-stack')).toMatchObject({
        name: 'Sauna Stack',
        team: 3,
      });
      // The lineup, the timeline and the played events still line up.
      expect(lineup.map((e) => e.id)).toEqual(
        (view.show.timeline as { eventId: string }[]).map((s) => s.eventId),
      );
      expect((view.show.events as { eventId: string }[]).map((e) => e.eventId)).toContain(
        'sauna-stack',
      );
      expect(
        (view.you.lastResults.results as { eventId: string }[]).map((r) => r.eventId),
      ).toContain('sauna-stack');
      // The next day never offers it.
      expect((view.next.lineup as { id: string }[]).some((e) => e.id === 'sauna-stack')).toBe(
        false,
      );
      const member = rows<{ creature_id: string }>(
        ctx.sql,
        "SELECT creature_id FROM games_records WHERE event_id = 'sauna-stack'",
      )[0]?.creature_id;
      if (member === undefined) throw new Error('no record');
      const page = (await p.call('GET', `/api/games/creature/${member}`)).body;
      expect(page.records).toContainEqual(
        expect.objectContaining({ eventId: 'sauna-stack', name: 'Sauna Stack', unit: 'ticks' }),
      );
    });
  });
});

describe('capTeams', () => {
  const def = (team: 1 | 3): GamesEventDef => ({
    ...(gamesEventDef('sauna-showdown') as GamesEventDef),
    team,
  });
  const row = (userId: string, slot: number, at: number): EntryRow => ({
    userId,
    eventId: 'sauna-showdown',
    slot,
    creatureId: `${userId}-${String(slot)}`,
    enteredAt: at,
  });

  it('keeps players before bots, each in entry order, up to the cap', () => {
    const max = RULES.games.maxEntrants;
    const rowsIn = [
      ...Array.from({ length: 5 }, (_, i) => row(`dev-guest-${String(i + 1)}`, 0, i)),
      ...Array.from({ length: max }, (_, i) => row(`8${String(i).padStart(17, '0')}`, 0, 100 + i)),
    ];
    const kept = capTeams(def(1), rowsIn).flat();
    expect(kept).toHaveLength(max);
    expect(kept.some((r) => r.userId.startsWith('dev-guest-'))).toBe(false);
    expect(kept[0]?.enteredAt).toBe(100);
  });

  it('keeps whole teams', () => {
    const max = RULES.games.maxTeamEntrants;
    const teams = Math.floor(max / 3) + 1;
    const rowsIn = Array.from({ length: teams }, (_, t) =>
      [0, 1, 2].map((slot) => row(`8${String(t).padStart(17, '0')}`, slot, t)),
    ).flat();
    const kept = capTeams(def(3), rowsIn);
    expect(kept.every((t) => t.length === 3)).toBe(true);
    expect(kept.flat().length).toBeLessThanOrEqual(max);
  });
});

describe('the Prize Stall', () => {
  const fund = (ctx: CoreContext, userId: string, pocket: number) =>
    ctx.sql.exec(
      `INSERT INTO games_medals (user_id, pocket) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET pocket = excluded.pocket`,
      userId,
      pocket,
    );

  it('is open on Wednesdays only, checks the pocket and the limit, and replays a key', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      const buy = (offerId: string, idempotencyKey = newKey('stall')) =>
        p.call('POST', '/api/games/stall/buy', { offerId, idempotencyKey });
      fund(ctx, p.id, 20);
      const tuesday = await p.call('GET', '/api/games');
      expect(tuesday.body.stall.open).toBe(false);
      expect(tuesday.body.stall.week).toBe('2027-01-13');
      expect((await buy('bait-sack')).body.error).toBe('stall_closed');

      ctx.clock.t = WED_14;
      expect((await p.call('GET', '/api/games')).body.stall.open).toBe(true);
      expect((await buy('nope-offer')).status).toBe(404);
      expect((await p.call('POST', '/api/games/stall/buy', { offerId: 'bait-sack' })).status).toBe(
        400,
      );
      const bait = () =>
        rows<{ n: number | null }>(
          ctx.sql,
          "SELECT SUM(amount) AS n FROM ledger WHERE user_id = ? AND source = 'games'",
          p.id,
        )[0]?.n ?? 0;
      const key = newKey('stall');
      const first = await buy('bait-sack', key);
      expect(first.status).toBe(200);
      expect(first.body.purchase).toMatchObject({ offerId: 'bait-sack', bait: 30 });
      expect(first.body.you.pocket).toBe(17);
      const again = await buy('bait-sack', key);
      expect(again.body.purchase).toEqual(first.body.purchase);
      expect(again.body.you.pocket).toBe(17);
      expect(bait()).toBe(30);
      // The same key on another offer is a conflict.
      expect((await buy('glimmer-jar', key)).body.error).toBe('key_conflict');
      expect((await buy('bait-sack')).status).toBe(200);
      expect((await buy('bait-sack')).body.error).toBe('limit_reached');
      expect(bait()).toBe(60);

      // A gear piece, rolled at the purchase, from the Games.
      const gear = await buy('mystery-gear');
      expect(gear.body.purchase.grant.gear).toHaveLength(1);
      const origin = rows<{ origin_json: string; source: string }>(
        ctx.sql,
        'SELECT origin_json, source FROM gear_items WHERE user_id = ?',
        p.id,
      );
      expect(origin).toEqual([{ origin_json: '{"kind":"games"}', source: 'games' }]);
      expect(gear.body.you.pocket).toBe(14 - 9);
      const supply = await buy('fine-supply');
      expect(supply.body.purchase.grant.supplies).toHaveLength(1);
      expect(supply.body.you.pocket).toBe(1);
      // Not enough points left.
      expect((await buy('glimmer-jar')).body.error).toBe('insufficient_medals');
      expect(gear.body.stall.offers.find((o: { id: string }) => o.id === 'bait-sack').left).toBe(0);
    });
  });
});

describe('dev tools', () => {
  it('answer 404 when the dev tools are off', async () => {
    await run(async (ctx) => {
      const p = await sixer(ctx);
      for (const tool of ['games-bots', 'games-run-now', 'games-reset']) {
        expect((await p.dev(tool, {})).status).toBe(404);
      }
    });
  });

  it('add bots, run a show now and reset it, without moving the next day', async () => {
    await run(
      async (ctx) => {
        const p = await sixer(ctx);
        expect(await p.tool('games-bots', { count: 3 })).toEqual({ bots: 3 });
        expect((await p.dev('games-bots', { count: 13 })).status).toBe(400);
        const botCreatures = rows<{ n: number }>(
          ctx.sql,
          "SELECT COUNT(*) AS n FROM creatures WHERE user_id LIKE 'dev-guest-%' GROUP BY user_id",
        );
        expect(botCreatures.map((r) => r.n)).toEqual([6, 6, 6]);
        // Each bot is entered in every event of the next show day (a team event with three).
        expect(count(ctx.sql, 'games_entries', "user_id LIKE 'dev-guest-%'")).toBe(
          3 * (RULES.games.eventsPerDay - 1 + RULES.games.teamSize),
        );
        // A second call adds no entries for an event a bot already has.
        await p.tool('games-bots', { count: 3 });
        expect(count(ctx.sql, 'games_entries', "user_id LIKE 'dev-guest-%'")).toBe(
          3 * (RULES.games.eventsPerDay - 1 + RULES.games.teamSize),
        );

        const next = await lineupOf(p);
        const solo = next.lineup.find((e) => e.team === 1)?.id as string;
        await p.call('PUT', '/api/games/entry', {
          day: next.day,
          eventId: solo,
          creatureIds: [p.creatureIds[0]],
        });
        const ran = await p.tool('games-run-now', {});
        expect(ran).toMatchObject({ day: '2027-01-12', showAt: TUE_10 + 15_000 });
        // Before the show starts: locked, hidden.
        const waiting = (await p.call('GET', '/api/games')).body;
        expect(waiting.phase).toBe('locked');
        expect(waiting.show).toBeNull();
        ctx.clock.t = TUE_10 + 15_000;
        const live = (await p.call('GET', '/api/games')).body;
        expect(live.phase).toBe('show');
        expect(live.show.players.filter((x: { bot: boolean }) => x.bot)).toHaveLength(3);
        // Entries for the next day opened early; its lock stays at its own reset.
        expect(live.next.day).toBe('2027-01-13');
        expect(live.next.lockAt).toBe(Date.parse('2027-01-13T11:37:00Z'));
        ctx.clock.t = (ran.endsAt as number) + 1;
        await ctx.core.alarm();
        expect(count(ctx.sql, 'games_days', 'awarded_at IS NOT NULL')).toBe(1);
        // Bots get nothing.
        expect(count(ctx.sql, 'games_medals', "user_id LIKE 'dev-guest-%'")).toBe(0);
        expect(count(ctx.sql, 'games_records', "user_id LIKE 'dev-guest-%'")).toBe(0);
        // The normal 13:37 of the same day does not lock it again.
        ctx.clock.t = TUE_LOCK + MINUTE;
        ctx.core.games.runDue();
        expect(count(ctx.sql, 'games_results')).toBe(RULES.games.eventsPerDay);
        // Nobody entered the next day yet: the bots enter it (no auto-entry), and it locks at its own reset.
        await p.tool('games-bots', { count: 3 });
        ctx.clock.t = Date.parse('2027-01-13T11:38:00Z');
        ctx.core.games.runDue();
        expect(count(ctx.sql, 'games_days', 'locked_at IS NOT NULL')).toBe(2);

        // Reset forgets the latest locked day (its entries stay); past its lock time it is locked again at once.
        const entered = count(ctx.sql, 'games_entries', "day = '2027-01-13'");
        expect(await p.tool('games-reset', {})).toEqual({ day: '2027-01-13' });
        // Wednesday is the bonus day: one event more.
        expect(count(ctx.sql, 'games_results', "day = '2027-01-13'")).toBe(
          RULES.games.eventsPerDay + 1,
        );
        expect(count(ctx.sql, 'games_entries', "day = '2027-01-13'")).toBe(entered);
        expect(
          rows<{ show_at: number }>(
            ctx.sql,
            "SELECT show_at FROM games_days WHERE day = '2027-01-13'",
          ),
        ).toEqual([{ show_at: Date.parse('2027-01-13T11:40:00Z') }]);
      },
      { dev: true },
    );
  });
});
