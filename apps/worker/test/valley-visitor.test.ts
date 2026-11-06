/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
/**
 * Phase 5 step 8: the weekly visitor (migration 64, `valley-visitor.ts`, the `/api/valley/visitor*` routes, the `visitor-arrive` dev tool).
 * Thursday 00:00 to Sunday 23:00 guild-local; his week's row is made the first time the server sees him; one arrival post; a keyed reroll
 * of all of a piece's lines and a once-a-week blueprint, both only while he is here.
 */
import {
  VALLEY_RULES,
  ValleyViewSchema,
  createSeededRng,
  rerollPrice,
  rollItem,
  type ValleyView,
} from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import { runCore, type CoreContext } from './helpers';
import { HOUR, give, newKey, sessionCaller, type SessionCaller } from './kit';
import { count, nextGuild, rows, seedPlayer } from './raid-helpers';
import {
  blueprintMarks,
  creditParts,
  findItem,
  insertItem,
  learnBlueprint,
  parseLines,
  setEquipped,
} from '../src/gear-store';

const SYSTEMS = { ...ON, valleySystems: true, combatV2: true, dailyAllowance: true } as const;
const FLAG_OFF = { ...ON, dailyAllowance: true } as const;
const R = VALLEY_RULES.visitor;
const DAY_MS = 24 * HOUR;
const CHANNEL = '123456789012345678';
// The test clock starts on Friday 2027-01-15 08:00 UTC (10:00 in Helsinki): the visitor is here. The Tuesday before it he is away.
const FRIDAY = 1_800_000_000_000;
const TUESDAY = FRIDAY - 3 * DAY_MS;
const HAT = 'felt-hat';

interface P {
  id: string;
  creatureIds: string[];
  api: SessionCaller<Json['body']>;
  state: () => Promise<Json>;
}

async function newPlayer(ctx: CoreContext, n: number): Promise<P> {
  const seeded = seedPlayer(ctx, n, { creatures: 3, level: 3 });
  const api = await sessionCaller<Json['body']>(ctx, { id: seeded.id, displayName: seeded.name });
  return {
    id: seeded.id,
    creatureIds: seeded.creatureIds,
    api,
    state: () => api.call('GET', '/api/state'),
  };
}

const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);
const read = (p: P, item?: string) =>
  p.api.call('GET', `/api/valley/visitor${item === undefined ? '' : `?item=${item}`}`);
const reroll = (p: P, itemId: string, key = newKey('reroll')) =>
  p.api.call('POST', '/api/valley/visitor/reroll', { itemId, idempotencyKey: key });
const blueprint = (p: P, key = newKey('vbp')) =>
  p.api.call('POST', '/api/valley/visitor/blueprint', { idempotencyKey: key });
const bait = (ctx: CoreContext, p: P): number => ctx.core.balances(p.id).bait;
const drain = (ctx: CoreContext, p: P): void => {
  ctx.sql.exec("UPDATE balances SET amount = 0 WHERE user_id = ? AND currency = 'bait'", p.id);
};
const part = (ctx: CoreContext, userId: string, kind: string): number =>
  ctx.sql
    .exec<{ amount: number }>(
      'SELECT amount FROM parts WHERE user_id = ? AND kind = ?',
      userId,
      kind,
    )
    .toArray()[0]?.amount ?? 0;
const queue = (ctx: CoreContext) =>
  rows<{ key: string; channel_id: string; content: string }>(
    ctx.sql,
    "SELECT key, channel_id, content FROM discord_posts WHERE key LIKE 'visitor:%' ORDER BY id",
  );

/** Gives a piece to a player (an epic hat at an item level). Its lines are the seeded dice's. */
function makeItem(ctx: CoreContext, userId: string, itemLevel = 10, seed = 'visitor-item'): string {
  const item = rollItem(createSeededRng(seed), { baseId: HAT, rarity: 'epic', itemLevel });
  return insertItem(ctx.sql, userId, item, { source: 'test', now: ctx.clock.t });
}

/** A player with the valley open, Acorns, scrap and shards to spend, and one epic hat. */
async function stocked(ctx: CoreContext, n: number, itemLevel = 10) {
  const p = await newPlayer(ctx, n);
  await p.state();
  give(ctx, p.id, { bait: 5000 });
  creditParts(ctx.sql, p.id, { scrap: 5000, 'mire-shard': 60, 'tide-shard': 20 });
  return { ...p, item: makeItem(ctx, p.id, itemLevel, `visitor-item-${String(n)}`) };
}

const setChannel = (ctx: CoreContext): void => {
  ctx.sql.exec('UPDATE guild_meta SET announce_channel_id = ? WHERE id = 1', CHANNEL);
};

describe('migration 64: his tables', () => {
  it('creates visitor_weeks and visitor_rerolls, empty', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        for (const table of ['visitor_weeks', 'visitor_rerolls']) {
          expect(count(ctx.sql, `pragma_table_info('${table}')`, "name = 'week_key'"), table).toBe(
            1,
          );
          expect(count(ctx.sql, table)).toBe(0);
        }
      },
      SYSTEMS,
    );
  });
});

describe('with VALLEY_SYSTEMS off nothing of him exists', () => {
  it('answers 404 on every route, writes no row and the dev tool is gone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        expect((await read(p)).status).toBe(404);
        expect((await reroll(p, 'item-1')).status).toBe(404);
        expect((await blueprint(p)).status).toBe(404);
        expect(count(ctx.sql, 'visitor_weeks')).toBe(0);
        expect(count(ctx.sql, 'visitor_rerolls')).toBe(0);
        // The alarm never makes his row either.
        await ctx.core.alarm();
        expect(count(ctx.sql, 'visitor_weeks')).toBe(0);
        const dev = await p.api.call('POST', '/api/dev/visitor-arrive', {});
        expect(dev.status).toBe(404);
      },
      FLAG_OFF,
    );
  });
});

describe('his days (V-VIS-1) and what stays hidden before he comes', () => {
  it('is away on a Tuesday: no stock in the answer, no row, and 409 visitor_away before any spend', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = TUESDAY;
        const p = await stocked(ctx, 1);
        const away = await read(p);
        expect(away.status).toBe(200);
        expect(away.body).toEqual({ here: false });
        expect(count(ctx.sql, 'visitor_weeks')).toBe(0);
        const before = bait(ctx, p);
        const scrap = part(ctx, p.id, 'scrap');
        const lines = findItem(ctx.sql, p.id, p.item)?.lines_json;
        const gone = await reroll(p, p.item);
        expect(gone).toMatchObject({ status: 409, body: { error: 'visitor_away' } });
        expect((await blueprint(p)).body).toMatchObject({ error: 'visitor_away' });
        expect(bait(ctx, p)).toBe(before);
        expect(part(ctx, p.id, 'scrap')).toBe(scrap);
        expect(findItem(ctx.sql, p.id, p.item)?.lines_json).toBe(lines);
        // The alarm of a Tuesday makes nothing either.
        await ctx.core.alarm();
        expect(count(ctx.sql, 'visitor_weeks')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('arrives at Thursday 00:00 Helsinki, not a minute before, and is gone after Sunday 23:00', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1);
        // Thursday 2027-01-14 00:00 Helsinki is Wednesday 22:00 UTC.
        ctx.clock.t = Date.UTC(2027, 0, 13, 21, 59);
        expect((await read(p)).body).toEqual({ here: false });
        ctx.clock.t = Date.UTC(2027, 0, 13, 22, 0);
        const here = await read(p);
        expect(here.body.here).toBe(true);
        // Sunday 23:00 Helsinki is 21:00 UTC.
        ctx.clock.t = Date.UTC(2027, 0, 17, 20, 59);
        expect((await read(p)).body.here).toBe(true);
        ctx.clock.t = Date.UTC(2027, 0, 17, 21, 0);
        expect((await read(p)).body).toEqual({ here: false });
        // Monday: still away, then Thursday again with a new week's row.
        ctx.clock.t = Date.UTC(2027, 0, 20, 22, 0);
        expect((await read(p)).body.here).toBe(true);
        expect(count(ctx.sql, 'visitor_weeks')).toBe(2);
      },
      SYSTEMS,
    );
  });

  it('wakes the object for Thursday 00:00 (the next arrival is a pure time, after now)', async () => {
    await runCore(
      nextGuild(),
      (ctx) => {
        const weeks = ctx.core.valleyVisitorWeeks;
        if (weeks === null) throw new Error('no visitor');
        // From the Tuesday: this Thursday 00:00 Helsinki (Wednesday 22:00 UTC).
        expect(weeks.nextArrivalAt(Date.UTC(2027, 0, 12, 12))).toBe(Date.UTC(2027, 0, 13, 22));
        // From the Friday he is here: next Thursday.
        expect(weeks.nextArrivalAt(FRIDAY)).toBe(Date.UTC(2027, 0, 20, 22));
        // Exactly at the moment: the one after.
        expect(weeks.nextArrivalAt(Date.UTC(2027, 0, 13, 22))).toBe(Date.UTC(2027, 0, 20, 22));
      },
      SYSTEMS,
    );
  });

  it('arms the alarm for it: the alarm at Thursday 00:00 makes his row and queues the post, once', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = TUESDAY;
        const p = await newPlayer(ctx, 1);
        await p.state();
        setChannel(ctx);
        // The object wakes on its own for his arrival (nothing else is due before it).
        await ctx.core.ensureAlarm();
        const armed = await ctx.storage.getAlarm();
        expect(armed).not.toBeNull();
        expect(armed ?? 0).toBeLessThanOrEqual(Date.UTC(2027, 0, 13, 22));
        ctx.clock.t = Date.UTC(2027, 0, 13, 22, 0, 5);
        await ctx.core.alarm();
        expect(count(ctx.sql, 'visitor_weeks')).toBe(1);
        expect(queue(ctx)).toHaveLength(1);
        await ctx.core.alarm();
        expect(queue(ctx)).toHaveLength(1);
        expect(count(ctx.sql, 'visitor_weeks')).toBe(1);
      },
      SYSTEMS,
    );
  });
});

describe('his arrival (V-VIS-1): the week, its blueprint and the post', () => {
  it('is made once for the week the first time he is seen, with a craftable blueprint, and the stock is the same for everyone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        const b = await stocked(ctx, 2);
        const first = await read(a);
        expect(first.body.here).toBe(true);
        expect(first.body.blueprint).toMatchObject({
          acorns: R.blueprintAcorns,
          shards: R.blueprintShards,
          bought: false,
        });
        expect(first.body.rerolls).toBe(0);
        const other = await read(b);
        expect(other.body.blueprint.baseId).toBe(first.body.blueprint.baseId);
        expect(count(ctx.sql, 'visitor_weeks')).toBe(1);
        const row = rows<{ blueprint_id: string; arrived_at: number; forced: number }>(
          ctx.sql,
          'SELECT blueprint_id, arrived_at, forced FROM visitor_weeks',
        )[0];
        expect(row?.blueprint_id).toBe(first.body.blueprint.baseId);
        expect(row?.forced).toBe(0);
        // A later look does not change the week's blueprint.
        ctx.clock.t += 5 * HOUR;
        expect((await read(a)).body.blueprint.baseId).toBe(first.body.blueprint.baseId);
      },
      SYSTEMS,
    );
  });

  it('queues one post for the week in the announcement channel, in the game voice, with nothing a player typed', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        setChannel(ctx);
        await read(a);
        await read(a);
        await ctx.core.alarm();
        const [post] = queue(ctx);
        expect(queue(ctx)).toHaveLength(1);
        expect(post?.channel_id).toBe(CHANNEL);
        expect(post?.key).toMatch(/^visitor:\d{4}-\d{2}-\d{2}$/);
        const message = JSON.parse(post?.content ?? '{}') as {
          embeds: { title: string; description: string }[];
        };
        expect(message.embeds[0]?.title).toContain('visitor');
        // No amounts, no ids, no names: the text is fixed.
        expect(
          `${message.embeds[0]?.title ?? ''} ${message.embeds[0]?.description ?? ''}`,
        ).not.toMatch(/\d/);
        expect(post?.content).not.toContain(a.id);
        const posted = rows<{ posted_at: number | null }>(
          ctx.sql,
          'SELECT posted_at FROM visitor_weeks',
        )[0];
        expect(posted?.posted_at).not.toBeNull();
        // The next week posts once more.
        ctx.clock.t += 7 * DAY_MS;
        await read(a);
        expect(queue(ctx)).toHaveLength(2);
      },
      SYSTEMS,
    );
  });

  it('posts nothing when no channel is known, and still makes his week', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        ctx.sql.exec('UPDATE guild_meta SET announce_channel_id = NULL WHERE id = 1');
        expect((await read(a)).body.here).toBe(true);
        expect(queue(ctx)).toHaveLength(0);
        expect(count(ctx.sql, 'visitor_weeks')).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('draws the week from the server dice: a scripted source picks the blueprint', async () => {
    const first = await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        return (await read(a)).body.blueprint.baseId as string;
      },
      { ...SYSTEMS, gearRng: createSeededRng('visitor-a') },
    );
    const again = await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        return (await read(a)).body.blueprint.baseId as string;
      },
      { ...SYSTEMS, gearRng: createSeededRng('visitor-a') },
    );
    expect(again).toBe(first);
  });
});

describe('the reroll (V-VIS-2, 3, 4)', () => {
  it('takes the price in Acorns and scrap, rolls every line again, keeps rarity and item level, and answers before, after and the next price', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 10);
        const was = findItem(ctx.sql, p.id, p.item);
        const [acorns, scrap] = rerollPrice(VALLEY_RULES, 10, 0);
        await p.state();
        const baitBefore = bait(ctx, p);
        const scrapBefore = part(ctx, p.id, 'scrap');
        const res = await reroll(p, p.item);
        expect(res.status).toBe(200);
        expect(res.body.paid).toEqual({ acorns, scrap });
        expect(bait(ctx, p)).toBe(baitBefore - acorns);
        expect(part(ctx, p.id, 'scrap')).toBe(scrapBefore - scrap);
        expect(res.body.before).toEqual(parseLines(was?.lines_json ?? '[]'));
        const now = findItem(ctx.sql, p.id, p.item);
        expect(res.body.after).toEqual(parseLines(now?.lines_json ?? '[]'));
        expect(now?.rarity).toBe(was?.rarity);
        expect(now?.item_level).toBe(was?.item_level);
        expect(now?.base_id).toBe(was?.base_id);
        // An epic has three rolled lines, all drawn again.
        expect(res.body.after).toHaveLength(3);
        expect(res.body.rerolls).toBe(1);
        const [nextAcorns, nextScrap] = rerollPrice(VALLEY_RULES, 10, 1);
        expect(res.body.next).toEqual({ acorns: nextAcorns, scrap: nextScrap });
        expect(view(res).paper).toBeUndefined();
      },
      SYSTEMS,
    );
  });

  it('rises by the growth with each reroll within the week, and starts again the next week', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 10);
        const paid: number[] = [];
        for (let i = 0; i < 3; i++) {
          const res = await reroll(p, p.item);
          expect(res.status).toBe(200);
          paid.push(res.body.paid.acorns as number);
        }
        expect(paid).toEqual([0, 1, 2].map((n) => rerollPrice(VALLEY_RULES, 10, n)[0]));
        expect(paid[1]).toBeGreaterThan(paid[0] as number);
        // The read shows the same next price and the count made.
        const asked = await read(p, p.item);
        expect(asked.body.rerolls).toBe(3);
        expect(asked.body.item.price.acorns).toBe(rerollPrice(VALLEY_RULES, 10, 3)[0]);
        // A week later it is the first reroll's price again.
        ctx.clock.t += 7 * DAY_MS;
        const week2 = await read(p, p.item);
        expect(week2.body.rerolls).toBe(0);
        expect(week2.body.item.price.acorns).toBe(rerollPrice(VALLEY_RULES, 10, 0)[0]);
        const res = await reroll(p, p.item);
        expect(res.body.paid.acorns).toBe(rerollPrice(VALLEY_RULES, 10, 0)[0]);
        expect(count(ctx.sql, 'visitor_rerolls', `user_id = '${p.id}'`)).toBe(2);
      },
      SYSTEMS,
    );
  });

  it('prices by item level: a higher piece costs more', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 10);
        const high = makeItem(ctx, p.id, 20, 'visitor-high');
        const lowPrice = (await read(p, p.item)).body.item.price;
        const highPrice = (await read(p, high)).body.item.price;
        expect(highPrice.acorns).toBe(lowPrice.acorns * 2);
        expect(highPrice.scrap).toBe(lowPrice.scrap * 2);
      },
      SYSTEMS,
    );
  });

  it('works on a worn piece as on one in the bag', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 10);
        setEquipped(ctx.sql, p.item, p.creatureIds[0] ?? null);
        const res = await reroll(p, p.item);
        expect(res.status).toBe(200);
        expect(findItem(ctx.sql, p.id, p.item)?.equipped_on).toBe(p.creatureIds[0]);
      },
      SYSTEMS,
    );
  });

  it('a retry with the same key returns the stored result and charges nothing more', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 10);
        const key = newKey('retry');
        const first = await reroll(p, p.item, key);
        await p.state();
        const baitAfter = bait(ctx, p);
        const scrapAfter = part(ctx, p.id, 'scrap');
        const lines = findItem(ctx.sql, p.id, p.item)?.lines_json;
        const again = await reroll(p, p.item, key);
        expect(again.status).toBe(200);
        expect(again.body.after).toEqual(first.body.after);
        expect(again.body.paid).toEqual(first.body.paid);
        expect(bait(ctx, p)).toBe(baitAfter);
        expect(part(ctx, p.id, 'scrap')).toBe(scrapAfter);
        expect(findItem(ctx.sql, p.id, p.item)?.lines_json).toBe(lines);
        expect((await p.api.call('GET', '/api/valley/visitor')).body.rerolls).toBe(1);
        // The same key on another piece is a conflict, not a second reroll.
        const other = makeItem(ctx, p.id, 10, 'visitor-other');
        expect((await reroll(p, other, key)).body).toMatchObject({ error: 'key_conflict' });
      },
      SYSTEMS,
    );
  });

  it('refuses a piece that is not the caller`s (404) and takes nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        const b = await stocked(ctx, 2);
        const before = bait(ctx, a);
        const res = await reroll(a, b.item);
        expect(res).toMatchObject({ status: 404, body: { error: 'not_found' } });
        expect((await read(a, b.item)).status).toBe(404);
        expect(bait(ctx, a)).toBe(before);
        expect(findItem(ctx.sql, b.id, b.item)).toBeDefined();
        expect((await reroll(a, crypto.randomUUID())).status).toBe(404);
      },
      SYSTEMS,
    );
  });

  it('refuses without Acorns or without scrap, and the piece is untouched', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 10);
        const lines = findItem(ctx.sql, p.id, p.item)?.lines_json;
        ctx.sql.exec("UPDATE parts SET amount = 0 WHERE user_id = ? AND kind = 'scrap'", p.id);
        const noScrap = await reroll(p, p.item);
        expect(noScrap).toMatchObject({ status: 409, body: { error: 'insufficient_parts' } });
        creditParts(ctx.sql, p.id, { scrap: 5000 });
        await p.state();
        drain(ctx, p);
        const noAcorns = await reroll(p, p.item);
        expect(noAcorns).toMatchObject({ status: 409, body: { error: 'insufficient_funds' } });
        expect(findItem(ctx.sql, p.id, p.item)?.lines_json).toBe(lines);
        expect(count(ctx.sql, 'visitor_rerolls', `user_id = '${p.id}'`)).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('validates the payloads strictly', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1);
        const call = (path: string, body: unknown) => p.api.call('POST', path, body);
        expect((await call('/api/valley/visitor/reroll', {})).status).toBe(400);
        expect(
          (
            await call('/api/valley/visitor/reroll', {
              itemId: p.item,
              idempotencyKey: newKey('k'),
              extra: 1,
            })
          ).status,
        ).toBe(400);
        expect(
          (await call('/api/valley/visitor/reroll', { itemId: 5, idempotencyKey: newKey('k') }))
            .status,
        ).toBe(400);
        expect(
          (await call('/api/valley/visitor/blueprint', { idempotencyKey: 'a:b' })).status,
        ).toBe(400);
        expect(
          (await call('/api/valley/visitor/blueprint', { idempotencyKey: newKey('k'), x: 1 }))
            .status,
        ).toBe(400);
        expect((await p.api.call('GET', '/api/valley/visitor?bogus=1')).status).toBe(400);
        expect((await p.api.call('GET', '/api/valley/visitor?item=a&item=b')).status).toBe(400);
      },
      SYSTEMS,
    );
  });
});

describe('the odds shown before one confirm (V-VIS-2)', () => {
  it('gives the lines, the top tier its item level allows and its chance, from the roller`s pool', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1, 20);
        const asked = await read(p, p.item);
        expect(asked.body.item).toMatchObject({ id: p.item, itemLevel: 20, rarity: 'epic' });
        const odds = asked.body.item.odds;
        expect(odds.lines).toBe(3);
        expect(odds.topTier).toBe(4);
        expect(odds.topChance).toBeCloseTo(0.15);
        expect(odds.tiers.map((t: { tier: number }) => t.tier)).toEqual([4, 3, 2, 1]);
        // Asking is free and changes nothing.
        expect(asked.body.rerolls).toBe(0);
        const low = await stocked(ctx, 2, 3);
        expect((await read(low, low.item)).body.item.odds).toMatchObject({
          topTier: 0,
          topChance: 1,
        });
      },
      SYSTEMS,
    );
  });
});

describe('the week`s blueprint (V-VIS-5)', () => {
  it('costs the Acorns and shards of any element, most-held first, and teaches the blueprint', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1);
        const base = (await read(p)).body.blueprint.baseId as string;
        await p.state();
        const baitBefore = bait(ctx, p);
        const mire = part(ctx, p.id, 'mire-shard');
        const tide = part(ctx, p.id, 'tide-shard');
        const res = await blueprint(p);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          baseId: base,
          duplicate: false,
          paid: { acorns: R.blueprintAcorns, shards: R.blueprintShards },
        });
        expect(bait(ctx, p)).toBe(baitBefore - R.blueprintAcorns);
        // 60 mire and 20 tide: the biggest pile comes down first, one shard at a time.
        const mireLeft = part(ctx, p.id, 'mire-shard');
        const tideLeft = part(ctx, p.id, 'tide-shard');
        expect(mire - mireLeft + (tide - tideLeft)).toBe(R.blueprintShards);
        expect(mireLeft).toBeLessThan(mire);
        expect(blueprintMarks(ctx.sql, p.id, base)).toBe(0);
        expect((await read(p)).body.blueprint.bought).toBe(true);
      },
      SYSTEMS,
    );
  });

  it('can be bought once a week per player, and again the next week', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const a = await stocked(ctx, 1);
        const b = await stocked(ctx, 2);
        expect((await blueprint(a)).status).toBe(200);
        const baitAfter = bait(ctx, a);
        const second = await blueprint(a);
        expect(second).toMatchObject({ status: 409, body: { error: 'already_bought' } });
        expect(bait(ctx, a)).toBe(baitAfter);
        // Another player is not held back by a's purchase.
        expect((await blueprint(b)).status).toBe(200);
        ctx.clock.t += 7 * DAY_MS;
        creditParts(ctx.sql, a.id, { 'mire-shard': 60 });
        expect((await blueprint(a)).status).toBe(200);
        expect(count(ctx.sql, 'visitor_rerolls', `user_id = '${a.id}'`)).toBe(2);
      },
      SYSTEMS,
    );
  });

  it('adds a mark when the blueprint is already known (a copy), as other sources do', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1);
        const base = (await read(p)).body.blueprint.baseId as string;
        learnBlueprint(ctx.sql, p.id, base, ctx.clock.t);
        const res = await blueprint(p);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ baseId: base, duplicate: true, marks: 1 });
        expect(blueprintMarks(ctx.sql, p.id, base)).toBe(1);
      },
      SYSTEMS,
    );
  });

  it('a retry with the same key returns the stored result and charges nothing more', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1);
        const key = newKey('bpretry');
        const first = await blueprint(p, key);
        await p.state();
        const baitAfter = bait(ctx, p);
        const shards = part(ctx, p.id, 'mire-shard') + part(ctx, p.id, 'tide-shard');
        const again = await blueprint(p, key);
        expect(again.status).toBe(200);
        expect(again.body.baseId).toBe(first.body.baseId);
        expect(bait(ctx, p)).toBe(baitAfter);
        expect(part(ctx, p.id, 'mire-shard') + part(ctx, p.id, 'tide-shard')).toBe(shards);
      },
      SYSTEMS,
    );
  });

  it('refuses without enough shards or Acorns, and keeps the week unbought', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await stocked(ctx, 1);
        ctx.sql.exec("UPDATE parts SET amount = 1 WHERE user_id = ? AND kind LIKE '%-shard'", p.id);
        const few = await blueprint(p);
        expect(few).toMatchObject({ status: 409, body: { error: 'insufficient_parts' } });
        expect((await read(p)).body.blueprint.bought).toBe(false);
        const poor = await stocked(ctx, 2);
        await poor.state();
        drain(ctx, poor);
        expect((await blueprint(poor)).body).toMatchObject({ error: 'insufficient_funds' });
      },
      SYSTEMS,
    );
  });
});

describe('the Gazette tells a returning player he is here, once a week (V-VIS-1)', () => {
  const closeIt = (p: P, paperId: string) =>
    p.api.call('POST', '/api/valley/gazette/close', { paperId });

  it('adds one line to the paper of a return that falls while he is here, never twice in a week, again the next', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await newPlayer(ctx, 1);
        await p.state();
        // Away for twelve hours inside his days (Friday 10:00 to 22:00 Helsinki).
        ctx.clock.t += 12 * HOUR;
        const first = view(await p.state()).paper;
        expect(first?.headlines.map((h) => h.kind)).toContain('visitor');
        expect(rows(ctx.sql, 'SELECT told FROM visitor_rerolls')).toEqual([{ told: 1 }]);
        await closeIt(p, first?.id ?? '');
        // Another return the same week: nothing more about him.
        ctx.clock.t += 12 * HOUR;
        const second = view(await p.state()).paper;
        expect(second?.headlines.map((h) => h.kind) ?? []).not.toContain('visitor');
        if (second !== undefined) await closeIt(p, second.id);
        // Next week it is told again.
        ctx.clock.t += 7 * DAY_MS;
        const third = view(await p.state()).paper;
        expect(third?.headlines.map((h) => h.kind)).toContain('visitor');
      },
      SYSTEMS,
    );
  });

  it('tells nothing of him when the return falls while he is away', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = TUESDAY;
        const p = await newPlayer(ctx, 1);
        await p.state();
        ctx.clock.t += 12 * HOUR;
        const paper = view(await p.state()).paper;
        expect(paper?.headlines.map((h) => h.kind) ?? []).not.toContain('visitor');
        expect(count(ctx.sql, 'visitor_rerolls')).toBe(0);
      },
      SYSTEMS,
    );
  });
});

describe('the staging tools', () => {
  it('visitor-arrive brings him on any weekday, once, and valley-fresh clears his tables', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        ctx.clock.t = TUESDAY;
        const p = await stocked(ctx, 1);
        setChannel(ctx);
        expect((await read(p)).body).toEqual({ here: false });
        const brought = await p.api.call('POST', '/api/dev/visitor-arrive', {});
        expect(brought.status).toBe(200);
        expect(brought.body.result.blueprintId).toEqual(expect.any(String));
        const here = await read(p);
        expect(here.body.here).toBe(true);
        expect(here.body.blueprint.baseId).toBe(brought.body.result.blueprintId);
        // A Tuesday reroll works while he is brought.
        expect((await reroll(p, p.item)).status).toBe(200);
        // Safe to repeat: the week keeps its blueprint and its post.
        const again = await p.api.call('POST', '/api/dev/visitor-arrive', {});
        expect(again.body.result.blueprintId).toBe(brought.body.result.blueprintId);
        expect(queue(ctx)).toHaveLength(1);
        // He is gone again when the week ends.
        ctx.clock.t = Date.UTC(2027, 0, 17, 22, 0);
        expect((await read(p)).body.here).toBe(false);
        // valley-fresh clears both tables.
        expect(count(ctx.sql, 'visitor_weeks')).toBe(1);
        const fresh = await p.api.call('POST', '/api/dev/valley-fresh', {});
        expect(fresh.status).toBe(200);
        expect(count(ctx.sql, 'visitor_weeks')).toBe(0);
        expect(count(ctx.sql, 'visitor_rerolls')).toBe(0);
      },
      SYSTEMS,
    );
  });
});
