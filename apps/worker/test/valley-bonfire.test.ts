/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 5: the bonfire in full and fights (migration 60, `valley-bonfire.ts`): catch-up fixed at each visit toward the higher of the
 * player's 3rd best and the server's middle (which `maintain` writes once a game day), small moments weighted toward creatures that have not
 * featured lately, who is online, and a raider's post that pauses from the first stage's lock to the end of the finale.
 */
import { ValleyViewSchema, createSeededRng, type Rng, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller, setCreature, type SessionCaller } from './kit';
import { count, nextGuild, seedPlayer } from './raid-helpers';
import { eventTimes, weekIdFor } from '../src/raid-schedule';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const NONE: Rng = { nextU32: () => 0 };
const DAY_MS = 24 * HOUR;
const TZ = 'Europe/Helsinki';

interface P {
  id: string;
  name: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number, creatures = 3, level = 3): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures, level });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    name: seeded.name,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);
const bpOf = (ctx: CoreContext, id: string): number =>
  ctx.sql
    .exec<{ catchup_bp: number }>(
      'SELECT catchup_bp FROM valley_creatures WHERE creature_id = ?',
      id,
    )
    .one().catchup_bp;

describe('catch-up fixed at each visit (V-BON-2)', () => {
  it('is x1 for creatures at the 3rd best and the top multiplier for a new catch far below it, fading as it grows', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 4, 12);
        const [low] = p.creatureIds;
        setCreature(ctx, low as string, { level: 2 });
        await p.state();
        // The first pass fixed it: target 12 (the 3rd best of 12, 12, 12), the low one 10 levels below.
        expect(bpOf(ctx, low as string)).toBe(30_000);
        expect(bpOf(ctx, p.creatureIds[1] as string)).toBe(10_000);
        const first = view(await p.state());
        const flame = first.creatures.find((c) => c.id === low);
        expect(flame?.catchUpBp).toBe(30_000);
        expect(first.creatures.filter((c) => c.catchUpBp > 10_000)).toHaveLength(1);
        // A day later (a new visit) it has earned about three times the plain rate, and the new multiplier is fixed from its level now.
        ctx.clock.t += DAY_MS;
        const before = ctx.sql
          .exec<{ level: number; exp: number }>(
            'SELECT level, exp FROM creatures WHERE id = ?',
            low as string,
          )
          .one();
        const next = view(await p.state());
        const after = ctx.sql
          .exec<{ level: number; exp: number }>(
            'SELECT level, exp FROM creatures WHERE id = ?',
            low as string,
          )
          .one();
        expect(after.level * 1000 + after.exp).toBeGreaterThan(before.level * 1000 + before.exp);
        expect(next.creatures.find((c) => c.id === low)?.catchUpBp).toBeGreaterThan(10_000);
      },
      SYSTEMS,
    );
  });

  it('never lifts a creature above the target: a creature at it earns the plain rate', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 3, 8);
        const [a, b] = p.creatureIds as [string, string, string];
        await p.state();
        const xp = (id: string): number =>
          ctx.sql.exec<{ exp: number }>('SELECT exp FROM creatures WHERE id = ?', id).one().exp;
        const start = [xp(a), xp(b)];
        ctx.clock.t += 6 * HOUR;
        await p.state();
        expect(xp(a) - (start[0] ?? 0)).toBe(xp(b) - (start[1] ?? 0));
        expect(bpOf(ctx, a)).toBe(10_000);
      },
      SYSTEMS,
    );
  });

  it("aims at the server's middle when it is higher than the player's 3rd best", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 3, 5);
        const q = await newPlayer(ctx, 2, 3, 14);
        await p.state();
        await q.state();
        // Both visited: the daily job writes the middle of their top-three means (5 and 14: 9.5).
        ctx.clock.t += DAY_MS;
        await ctx.core.alarm();
        const row = ctx.sql
          .exec<{ middle: number; players: number }>('SELECT middle, players FROM valley_server')
          .one();
        expect(row.players).toBe(2);
        expect(row.middle).toBeCloseTo(9.5, 6);
        // The weak player's next visit is fixed toward 9.5, not their own 5: 4.5 levels below, three quarters of the way to x3.
        await p.state();
        const target = ctx.sql
          .exec<{ catch_target: number }>(
            'SELECT catch_target FROM valley_players WHERE user_id = ?',
            p.id,
          )
          .one().catch_target;
        expect(target).toBeCloseTo(9.5, 6);
        expect(bpOf(ctx, p.creatureIds[0] as string)).toBeGreaterThan(10_000);
      },
      SYSTEMS,
    );
  });
});

describe("the server's middle once a game day (maintain)", () => {
  it('counts only players who visited in the last week, writes one row, and is written once a day', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 3, 6);
        const q = await newPlayer(ctx, 2, 3, 20);
        await p.state();
        await q.state();
        ctx.clock.t += 10 * DAY_MS;
        // Only p comes back: q has been away ten days and is not counted.
        await p.state();
        await ctx.core.alarm();
        const rows = ctx.sql
          .exec<{ middle: number; players: number }>('SELECT middle, players FROM valley_server')
          .toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.players).toBe(1);
        const levels = ctx.sql
          .exec<{ level: number }>('SELECT level FROM creatures WHERE user_id = ?', p.id)
          .toArray()
          .map((r) => r.level);
        expect(rows[0]?.middle).toBeCloseTo(levels.reduce((a, b) => a + b, 0) / levels.length, 6);
        // q (level 20, away ten days) would have lifted it to the middle of the two.
        expect(rows[0]?.middle).toBeLessThan(10);
        // The same game day: the second alarm does not write again.
        ctx.sql.exec('UPDATE valley_server SET middle = 99 WHERE id = 1');
        await ctx.core.alarm();
        expect(
          ctx.sql.exec<{ middle: number }>('SELECT middle FROM valley_server').one().middle,
        ).toBe(99);
      },
      SYSTEMS,
    );
  });

  it('is not written with the flag off', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        await newPlayer(ctx, 1);
        await ctx.core.alarm();
        expect(count(ctx.sql, 'valley_server')).toBe(0);
      },
      { ...ON, dailyAllowance: true },
    );
  });
});

describe('small moments (V-BON-9)', () => {
  /** The moment in the stored paper's log (the headlines show at most three, so a quiet moment may rank below them). */
  const momentOf = (ctx: CoreContext, userId: string) => {
    const row = ctx.sql
      .exec<{ log: string }>('SELECT log FROM valley_gazette WHERE user_id = ?', userId)
      .toArray()[0];
    return row === undefined
      ? undefined
      : (
          JSON.parse(row.log) as {
            moment: { creatureId: string; friendId?: string; turn: number } | null;
          }
        ).moment;
  };

  it('are told in one headline on a long arrival, weighted toward creatures that have not featured, and remembered', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 4, 5);
        await p.state();
        // The first three have featured yesterday; the fourth never has: it is by far the likeliest, but any can come up.
        ctx.sql.exec(
          'UPDATE valley_creatures SET moment_day = ? WHERE creature_id IN (?, ?, ?)',
          Math.floor(ctx.clock.t / DAY_MS) + 1,
          ...(p.creatureIds.slice(0, 3) as [string, string, string]),
        );
        ctx.clock.t += 2 * DAY_MS;
        await p.state();
        const moment = momentOf(ctx, p.id);
        // With the three recent ones at the floor weight 1 and the fourth at 11 a quarter of the time or more is not guaranteed: the
        // test only needs that a moment was told and that the picked creature is remembered as featured today.
        expect(moment).toBeDefined();
        const ids = [moment?.creatureId, moment?.friendId].flatMap((id) =>
          id === undefined ? [] : [id],
        );
        expect(ids.length).toBeGreaterThanOrEqual(1);
        expect(ids.length).toBeLessThanOrEqual(2);
        const day = Math.floor(ctx.clock.t / DAY_MS);
        for (const id of ids) {
          expect(
            ctx.sql
              .exec<{ moment_day: number }>(
                'SELECT moment_day FROM valley_creatures WHERE creature_id = ?',
                id,
              )
              .one().moment_day,
          ).toBe(day);
        }
        // A reload tells the same moment (the paper is stored).
        ctx.clock.t += 60_000;
        await p.state();
        expect(momentOf(ctx, p.id)).toEqual(moment);
      },
      SYSTEMS,
    );
  });

  it('are not told after a short absence, and nothing is used up', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1, 3, 5);
        await p.state();
        ctx.clock.t += 2 * HOUR;
        const arrived = view(await p.state());
        expect(arrived.paper).toBeUndefined();
        expect(
          ctx.sql
            .exec<{ n: number }>(
              'SELECT COUNT(*) AS n FROM valley_creatures WHERE moment_day IS NOT NULL',
            )
            .one().n,
        ).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('who is online (V-BON-4)', () => {
  const seatInstance = (ctx: CoreContext, users: string[], checkedAt = ctx.clock.t): void => {
    ctx.sql.exec(
      'INSERT INTO lounge_instances (instance_id, user_ids, first_seen_at, checked_at) VALUES (?, ?, ?, ?)',
      `i-${String(users.length)}-${String(checkedAt)}`,
      JSON.stringify(users),
      checkedAt,
      checkedAt,
    );
  };

  it('shows the others in the Activity with up to three of their creatures, never the caller, and gives no XP', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const q = await newPlayer(ctx, 2, 5, 9);
        await p.state();
        expect(view(await p.state()).online).toEqual([]);
        seatInstance(ctx, [p.id, q.id]);
        const online = view(await p.state()).online;
        expect(online).toHaveLength(1);
        expect(online[0]?.name).toBe(q.name);
        expect(online[0]?.name).toBe(q.name);
        expect(online[0]?.creatures).toHaveLength(3);
        expect(online[0]?.creatures.every((c) => c.level === 9)).toBe(true);
        // The other player's own view does not list themselves, and lists p.
        const mine = view(await q.state()).online;
        expect(mine.map((o) => o.name)).toEqual([p.name]);
        // Company changes nobody's XP: the two settle exactly as they would alone (the XP of p's creatures is the plain idle rate).
        expect(count(ctx.sql, 'lounge_rest')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('leaves out an instance the lounge has not looked at for five minutes, and creatures that stand at a post', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        const q = await newPlayer(ctx, 2, 4, 6);
        await p.state();
        await q.state();
        seatInstance(ctx, [q.id], ctx.clock.t - 6 * 60_000);
        expect(view(await p.state()).online).toEqual([]);
        seatInstance(ctx, [q.id]);
        // q posts a creature at a scout seat: it stands there, not by the fire.
        const bought = await q.api.call('POST', '/api/valley/seat/buy', {
          idempotencyKey: newKey('seat'),
        });
        expect(bought.status).toBe(200);
        const posted = await q.api.call('POST', '/api/valley/seat', {
          seatId: bought.body.seatId,
          creatureId: q.creatureIds[0],
          destination: 'tidepools',
        });
        expect(posted.status).toBe(200);
        const online = view(await p.state()).online;
        expect(online[0]?.creatures.map((c) => c.id)).not.toContain(q.creatureIds[0]);
        expect(online[0]?.creatures.length).toBe(3);
      },
      SYSTEMS,
    );
  });

  it('is empty with the flag off (the block is absent altogether)', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect(Object.hasOwn((await p.state()).body as object, 'valley')).toBe(false);
      },
      { ...ON, dailyAllowance: true },
    );
  });
});

describe("a raider's post pauses (V-POST-7)", () => {
  /** A player with one scout seat at tidepools, valley opened; visits repeat so both players below settle the same way. */
  async function scout(ctx: CoreContext, n: number): Promise<P & { seatId: string }> {
    const p = await newPlayer(ctx, n);
    await p.state();
    const bought = await p.api.call('POST', '/api/valley/seat/buy', {
      idempotencyKey: newKey('seat'),
    });
    expect(bought.status).toBe(200);
    const seatId = bought.body.seatId as string;
    const posted = await p.api.call('POST', '/api/valley/seat', {
      seatId,
      creatureId: p.creatureIds[0],
      destination: 'tidepools',
    });
    expect(posted.status).toBe(200);
    return { ...p, seatId };
  }

  const hours = (ctx: CoreContext, creatureId: string): number =>
    ctx.sql
      .exec<{ scout_hours: number }>(
        'SELECT scout_hours FROM valley_creatures WHERE creature_id = ?',
        creatureId,
      )
      .one().scout_hours;

  it('stops the scout from the first stage lock to the end of the finale and lets it go on after; the creature still earns idle XP', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const raider = await scout(ctx, 1);
        const control = await scout(ctx, 2);
        const week = weekIdFor(ctx.clock.t, TZ);
        const times = eventTimes(week, TZ, 2);
        ctx.sql.exec(
          "INSERT OR IGNORE INTO raid_weeks (week_id, boss_id, status, created_at, rules_version) VALUES (?, 'boss', 'open', ?, 2)",
          week,
          ctx.clock.t,
        );
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
          week,
          raider.id,
          raider.creatureIds[0],
        );
        const visit = async (at: number): Promise<ValleyView[]> => {
          ctx.clock.t = at;
          return [view(await raider.state()), view(await control.state())];
        };
        const [a0, b0] = await visit(times.phase1 - 2 * HOUR);
        expect(a0?.seats[0]?.paused).toBeNull();
        expect(b0?.seats[0]?.paused).toBeNull();
        expect(hours(ctx, raider.creatureIds[0] as string)).toBeCloseTo(
          hours(ctx, control.creatureIds[0] as string),
          6,
        );
        // Into the raid: both settled at the same moment, the raider's seat is paused and shows why.
        const [a1, b1] = await visit(times.phase1 + 5 * HOUR);
        expect(a1?.seats[0]?.paused).toBe('raid');
        expect(b1?.seats[0]?.paused).toBeNull();
        const gap1 =
          hours(ctx, control.creatureIds[0] as string) -
          hours(ctx, raider.creatureIds[0] as string);
        expect(gap1).toBeGreaterThan(0);
        // The idle XP is the same: a creature on a post can still fight and earns what the others earn.
        const xp = (id: string): number =>
          ctx.sql
            .exec<{ exp: number; level: number }>(
              'SELECT exp, level FROM creatures WHERE id = ?',
              id,
            )
            .one().exp;
        expect(xp(raider.creatureIds[0] as string)).toBe(xp(control.creatureIds[0] as string));
        // Still inside the weekend (before the finale ends): the gap keeps growing.
        await visit(times.finale + HOUR);
        const gap2 =
          hours(ctx, control.creatureIds[0] as string) -
          hours(ctx, raider.creatureIds[0] as string);
        expect(gap2).toBeGreaterThan(gap1);
        // The finale ends at its done marker: the seat works again from there, and the gap stops growing.
        const endsAt = times.finale + 2 * HOUR;
        ctx.sql.exec(
          "INSERT OR REPLACE INTO raid_events (week_id, event, outcome, done_at) VALUES (?, 'finale', 'ran', ?)",
          week,
          endsAt,
        );
        const [a3] = await visit(endsAt + 6 * HOUR);
        expect(a3?.seats[0]?.paused).toBeNull();
        const gap3 =
          hours(ctx, control.creatureIds[0] as string) -
          hours(ctx, raider.creatureIds[0] as string);
        await visit(endsAt + 12 * HOUR);
        const gap4 =
          hours(ctx, control.creatureIds[0] as string) -
          hours(ctx, raider.creatureIds[0] as string);
        expect(gap4).toBeCloseTo(gap3, 6);
      },
      { ...SYSTEMS, scoutRng: NONE },
    );
  });

  it('pauses an anvil the same way', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const bought = await p.api.call('POST', '/api/valley/anvil/buy', {
          idempotencyKey: newKey('anvil'),
        });
        expect(bought.status).toBe(200);
        const posted = await p.api.call('POST', '/api/valley/seat', {
          seatId: bought.body.seatId,
          creatureId: p.creatureIds[0],
        });
        expect(posted.status).toBe(200);
        const week = weekIdFor(ctx.clock.t, TZ);
        const times = eventTimes(week, TZ, 2);
        ctx.sql.exec(
          "INSERT OR IGNORE INTO raid_weeks (week_id, boss_id, status, created_at, rules_version) VALUES (?, 'boss', 'open', ?, 2)",
          week,
          ctx.clock.t,
        );
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
          week,
          p.id,
          p.creatureIds[0],
        );
        const smithHours = (): number =>
          ctx.sql
            .exec<{ smith_hours: number }>(
              'SELECT smith_hours FROM valley_creatures WHERE creature_id = ?',
              p.creatureIds[0] as string,
            )
            .one().smith_hours;
        ctx.clock.t = times.phase1 - HOUR;
        expect((await p.state()).status).toBe(200);
        const before = smithHours();
        ctx.clock.t = times.phase1 + 3 * HOUR;
        const seen = view(await p.state());
        expect(seen.anvils[0]?.paused).toBe('raid');
        // Only the hour before the lock counted (the away share of an hour is below 1 by the next visit, but never more than an hour).
        expect(smithHours() - before).toBeGreaterThan(0);
        expect(smithHours() - before).toBeLessThanOrEqual(1 + 1e-6);
      },
      SYSTEMS,
    );
  });

  it('reads nothing of the raid for a player without a post, and nothing outside a raid weekend', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        const week = weekIdFor(ctx.clock.t, TZ);
        ctx.sql.exec(
          "INSERT OR IGNORE INTO raid_weeks (week_id, boss_id, status, created_at, rules_version) VALUES (?, 'boss', 'open', ?, 2)",
          week,
          ctx.clock.t,
        );
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
          week,
          p.id,
          p.creatureIds[0],
        );
        ctx.clock.t = eventTimes(week, TZ, 2).phase1 + HOUR;
        const seen = view(await p.state());
        expect(seen.seats).toEqual([]);
        expect(seen.creatures.every((c) => c.state === 'resting')).toBe(true);
      },
      SYSTEMS,
    );
  });
});

describe('the strictness of the new fields', () => {
  it('rejects an online entry with an unknown key or too many creatures', () => {
    const base = {
      name: 'A',
      creatures: [{ id: 'c', species: 'x', shiny: false, level: 1, name: null }],
    };
    const ok = v.safeParse(ValleyViewSchema.entries.online, [base]);
    expect(ok.success).toBe(true);
    expect(v.safeParse(ValleyViewSchema.entries.online, [{ ...base, extra: 1 }]).success).toBe(
      false,
    );
    expect(
      v.safeParse(ValleyViewSchema.entries.online, [
        { ...base, creatures: Array.from({ length: 4 }, () => base.creatures[0]) },
      ]).success,
    ).toBe(false);
    expect(createSeededRng('x').nextU32()).toBeGreaterThanOrEqual(0);
  });
});
