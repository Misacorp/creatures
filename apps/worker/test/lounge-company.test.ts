import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { LoungeClient } from '../src/lounge-discord';
import { LOUNGE_FLUSH_MS, LOUNGE_MAX_GAP_MS, loungeDay } from '../src/lounge-company';
import type { ActivityInstance } from '../src/schemas';
import { runCore, type CoreContext } from './helpers';
import { nextGuild, seedPlayer } from './raid-helpers';

const { msPerXp, dailyCap } = RULES.experience.lounge;
const SECOND = 1000;
const MIN = 60 * SECOND;
const TZ = 'Europe/Helsinki';
const INSTANCE = 'i-1234-gc-5678';

/** Discord as the lounge check sees it: who is in each Activity instance. Message calls just succeed. */
interface FakeDiscord extends LoungeClient {
  instances: Map<string, string[]>;
  lookupFails: boolean;
}

function fakeDiscord(guildId: string): FakeDiscord {
  const ok = <T>(value: T) => Promise.resolve({ kind: 'ok' as const, value });
  const fake: FakeDiscord = {
    instances: new Map(),
    lookupFails: false,
    getInstance(id): Promise<ActivityInstance | null> {
      if (fake.lookupFails) return Promise.reject(new Error('down'));
      const users = fake.instances.get(id);
      return Promise.resolve(
        users === undefined ? null : { location: { guild_id: guildId }, users },
      );
    },
    createMessage: () => ok('900000000000000001'),
    editMessage: () => ok(null),
    deleteMessage: () => ok(null),
    recentMessageIds: () => ok([]),
    appIconUrl: () => Promise.resolve(null),
  };
  return fake;
}

interface Seat {
  id: string;
  name: string;
  creatureIds: string[];
}

/** A player with creatures who opens the Activity in the instance (Discord lists them there). */
async function arrive(
  ctx: CoreContext,
  discord: FakeDiscord,
  n: number,
  creatures = 2,
): Promise<Seat> {
  const s = seedPlayer(ctx, n, { creatures, level: 3 });
  discord.instances.set(INSTANCE, [...(discord.instances.get(INSTANCE) ?? []), s.id]);
  await ctx.core.createSession(ctx.guildId, { id: s.id, displayName: s.name }, null, INSTANCE);
  return { id: s.id, name: s.name, creatureIds: s.creatureIds };
}

/** Moves the clock and runs the lounge check, as the alarm does about once a minute. */
async function check(ctx: CoreContext, ms = MIN): Promise<void> {
  ctx.clock.t += ms;
  await ctx.core.runLounge();
}

type State = { loungerId: string | null; loungeXp: Record<string, number> };

/** The player's state (a request: it also pays what they collected). A fresh session each time. */
async function stateOf(ctx: CoreContext, who: Seat): Promise<State> {
  const secret = await ctx.core.createSession(ctx.guildId, { id: who.id, displayName: who.name });
  const res = await ctx.request(secret, '/api/state');
  expect(res.status).toBe(200);
  return res.json<State>();
}

/** What lounging paid, per creature, as stored (no request: nothing is paid by reading it). */
function stored(ctx: CoreContext): Record<string, number> {
  return Object.fromEntries(
    ctx.sql
      .exec<{ creature_id: string; paid: number }>('SELECT creature_id, paid FROM lounge_rest')
      .toArray()
      .map((r) => [r.creature_id, r.paid]),
  );
}

function loungerOf(ctx: CoreContext, who: Seat): string {
  return ctx.core.collection.lounge.resolve(who.id) ?? '';
}

/** Runs a test inside one game day: the clock starts a minute after a daily reset. */
function inGuild(fn: (ctx: CoreContext, discord: FakeDiscord) => Promise<void>): Promise<void> {
  const guildId = nextGuild();
  const discord = fakeDiscord(guildId);
  return runCore(
    guildId,
    async (ctx) => {
      ctx.clock.t = loungeDay(ctx.clock.t, TZ).start + 24 * 60 * MIN + MIN;
      await fn(ctx, discord);
    },
    { lounge: discord },
  );
}

/** The first check after the sessions, then `minutes` checks a minute apart: the company time it pays. */
async function together(ctx: CoreContext, minutes: number): Promise<number> {
  await check(ctx, 15 * SECOND);
  for (let i = 0; i < minutes; i++) await check(ctx);
  return 15 * SECOND + minutes * MIN;
}

describe('lounging with company, from Discord', () => {
  it('pays both players while Discord lists them together: no live socket needed (a hidden tab earns)', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      const b = await arrive(ctx, discord, 2);
      const ms = await together(ctx, 10);
      // Ten minutes collected: paid without anyone asking, 1 XP per 2 minutes.
      const xp = Math.floor(ms / msPerXp);
      expect(ms).toBeGreaterThanOrEqual(LOUNGE_FLUSH_MS);
      expect(stored(ctx)).toEqual({ [loungerOf(ctx, a)]: xp, [loungerOf(ctx, b)]: xp });
    });
  });

  it('pays nothing alone', async () => {
    await inGuild(async (ctx, discord) => {
      await arrive(ctx, discord, 1);
      await together(ctx, 30);
      expect(stored(ctx)).toEqual({});
    });
  });

  it('pays what was collected when the player makes a request, so the state they read is fresh', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      await arrive(ctx, discord, 2);
      const ms = await together(ctx, 4);
      expect(stored(ctx)).toEqual({});
      const state = await stateOf(ctx, a);
      expect(state.loungeXp).toEqual({ [loungerOf(ctx, a)]: Math.floor(ms / msPerXp) });
      // The other player has not asked: theirs is still collecting.
      expect(Object.keys(stored(ctx))).toEqual([loungerOf(ctx, a)]);
    });
  });

  it('keeps paying from the last list when Discord cannot be asked', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      await arrive(ctx, discord, 2);
      await check(ctx, 15 * SECOND);
      discord.lookupFails = true;
      for (let i = 0; i < 4; i++) await check(ctx);
      expect((await stateOf(ctx, a)).loungeXp[loungerOf(ctx, a)]).toBe(
        Math.floor((15 * SECOND + 4 * MIN) / msPerXp),
      );
    });
  });

  it('pays at most a few minutes for a long gap between checks (a stalled alarm)', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      await arrive(ctx, discord, 2);
      await check(ctx, 15 * SECOND);
      await check(ctx, 60 * MIN);
      expect((await stateOf(ctx, a)).loungeXp[loungerOf(ctx, a)]).toBe(
        Math.floor((15 * SECOND + LOUNGE_MAX_GAP_MS) / msPerXp),
      );
    });
  });

  it('pays the one who stays as soon as the friend leaves, then stops', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      const b = await arrive(ctx, discord, 2);
      const ms = await together(ctx, 4);
      discord.instances.set(INSTANCE, [a.id]);
      await check(ctx);
      // Paid at the check that saw b gone (the minute in between counts for neither).
      const xp = Math.floor(ms / msPerXp);
      expect(stored(ctx)).toEqual({ [loungerOf(ctx, a)]: xp, [loungerOf(ctx, b)]: xp });
      for (let i = 0; i < 20; i++) await check(ctx);
      expect((await stateOf(ctx, a)).loungeXp[loungerOf(ctx, a)]).toBe(xp);
    });
  });

  it('is not kept company by a player with no creature', async () => {
    await inGuild(async (ctx, discord) => {
      await arrive(ctx, discord, 1);
      await arrive(ctx, discord, 2, 0);
      await together(ctx, 30);
      expect(stored(ctx)).toEqual({});
    });
  });

  it('caps each creature at the daily cap; a swapped-in creature earns from the swap on', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      await arrive(ctx, discord, 2);
      const first = loungerOf(ctx, a);
      const second = a.creatureIds.find((id) => id !== first) ?? '';
      await together(ctx, 150);
      expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: dailyCap });

      const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      const swap = await ctx.request(secret, '/api/lounger', 'PUT', { creatureId: second });
      expect(swap.status).toBe(200);
      for (let i = 0; i < 20; i++) await check(ctx);
      expect((await stateOf(ctx, a)).loungeXp).toEqual({ [first]: dailyCap, [second]: 10 });
    });
  });

  it('pays no time from before the daily reset to the new day, and pays the old day its own', async () => {
    await inGuild(async (ctx, discord) => {
      const a = await arrive(ctx, discord, 1);
      await arrive(ctx, discord, 2);
      // Start four minutes before the next reset.
      ctx.clock.t = loungeDay(ctx.clock.t, TZ).start + 24 * 60 * MIN - 4 * MIN - 15 * SECOND;
      await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name }, null, INSTANCE);
      await together(ctx, 6);
      const lounger = loungerOf(ctx, a);
      const rows = ctx.sql
        .exec<{ day: string; paid: number }>(
          'SELECT day, paid FROM lounge_rest WHERE creature_id = ?',
          lounger,
        )
        .toArray();
      // The old day's minutes were paid to the old day when the new one began.
      expect(rows).toHaveLength(1);
      expect(rows[0]?.paid).toBeGreaterThanOrEqual(1);
      const today = loungeDay(ctx.clock.t, TZ).day;
      // Today's two minutes are collecting; the state shows only today's.
      const state = await stateOf(ctx, a);
      expect(state.loungeXp[lounger]).toBe(1);
      expect(
        ctx.sql
          .exec<{ day: string }>('SELECT day FROM lounge_rest WHERE creature_id = ?', lounger)
          .one().day,
      ).toBe(today);
    });
  });
});
