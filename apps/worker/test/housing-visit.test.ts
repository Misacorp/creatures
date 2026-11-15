import {
  CollectAnswerSchema,
  GiftAnswerSchema,
  HouseAnswerSchema,
  HouseListViewSchema,
  HOUSING_RULES,
  StampAnswerSchema,
  VisitAnswerSchema,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { player, type Dev } from './dev-helpers';
import type { CoreContext } from './helpers';
import { householder, parsed, runHouse } from './housing-helpers';
import { DAY, newKey } from './kit';
import { count, rows } from './raid-helpers';

const gift = (p: Dev, ownerId: string, key = newKey()) =>
  p.call('POST', `/api/houses/${ownerId}/gift`, { idempotencyKey: key });
const stamp = (p: Dev, ownerId: string, stampId: string) =>
  p.call('POST', `/api/houses/${ownerId}/stamp`, { stampId });
const collect = (p: Dev, key = newKey()) =>
  p.call('POST', '/api/house/mail/collect', { idempotencyKey: key });
const own = async (p: Dev) => parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));

describe('visiting', () => {
  it('opens another house read-only, owner online or not, and the own id answers without the own part', async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      const b = await householder(ctx, 2);
      const seen = parsed(VisitAnswerSchema, await a.call('GET', `/api/houses/${b.id}`));
      expect(seen.house.owner).toEqual({ userId: b.id, name: 'Player 2' });
      expect(seen.house.built).toEqual(['hut']);
      // The caller's own id: the same house as the own view, with nothing but the house.
      const self = parsed(VisitAnswerSchema, await a.call('GET', `/api/houses/${a.id}`));
      expect(self.house).toEqual((await own(a)).house);
    });
  });

  it('is a 404 for a house that does not exist and for a malformed id', async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      const nobody = await player(ctx, 2);
      for (const id of [nobody.id, '800000000000000099', 'not-an-id', '12345']) {
        expect(await a.call('GET', `/api/houses/${id}`)).toMatchObject({
          status: 404,
          body: { error: 'no_house' },
        });
      }
      // Visiting never makes the visited player's house.
      expect(count(ctx.sql, 'houses', `user_id = '${nobody.id}'`)).toBe(0);
    });
  });
});

describe('the visit list', () => {
  it('lists the other houses by name with what the caller did there today', async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      const b = await householder(ctx, 3);
      const c = await householder(ctx, 2);
      const before = parsed(HouseListViewSchema, await a.call('GET', '/api/houses'));
      expect(before.houses.map((h) => h.name)).toEqual(['Player 2', 'Player 3']);
      expect(before.houses.every((h) => h.built.join() === 'hut')).toBe(true);
      expect(before.houses.every((h) => !h.today.gifted && !h.today.stamped)).toBe(true);
      expect(before.me.giftLeft).toBe(true);
      await gift(a, b.id);
      await stamp(a, c.id, 'paw-print');
      const after = parsed(HouseListViewSchema, await a.call('GET', '/api/houses'));
      expect(after.houses.find((h) => h.userId === b.id)?.today).toEqual({
        gifted: true,
        stamped: false,
      });
      expect(after.houses.find((h) => h.userId === c.id)?.today).toEqual({
        gifted: false,
        stamped: true,
      });
      expect(after.me.giftLeft).toBe(false);
      // Another day, a clean slate.
      ctx.clock.t += DAY;
      const next = parsed(HouseListViewSchema, await a.call('GET', '/api/houses'));
      expect(next.me.giftLeft).toBe(true);
      expect(next.houses.every((h) => !h.today.gifted && !h.today.stamped)).toBe(true);
    });
  });

  it('shows the fifteen most recently changed houses', async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      for (let n = 0; n < 17; n++) {
        const id = `7${String(n).padStart(17, '0')}`;
        ctx.sql.exec(
          'INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, 1, 1)',
          id,
          `Neighbour ${String(n).padStart(2, '0')}`,
        );
        ctx.sql.exec(
          "INSERT INTO houses (user_id, roof, walls, created_at, updated_at) VALUES (?, 'thatch', 'plaster', 1, ?)",
          id,
          ctx.clock.t - 1_000_000 + n,
        );
      }
      const list = parsed(HouseListViewSchema, await a.call('GET', '/api/houses'));
      expect(list.houses).toHaveLength(HOUSING_RULES.visitListMax);
      // The caller's own house is the newest and is left out; the two oldest neighbours fall off.
      expect(list.houses.some((h) => h.userId === a.id)).toBe(false);
      expect(list.houses.some((h) => h.name === 'Neighbour 00' || h.name === 'Neighbour 01')).toBe(
        false,
      );
      expect(list.houses.map((h) => h.name)).toEqual([...list.houses.map((h) => h.name)].sort());
    });
  });
});

describe('gifts and the mailbox', () => {
  it("leaves Acorns in the owner's mailbox at no cost to the giver, once a day in all", async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      const b = await householder(ctx, 2);
      const c = await householder(ctx, 3);
      const key = newKey();
      const done = parsed(GiftAnswerSchema, await gift(a, b.id, key));
      expect(done).toEqual({ gift: { amount: 5 }, today: { gifted: true, stamped: false } });
      expect(ctx.core.balances(a.id).bait).toBe(0);
      expect(ctx.core.balances(b.id).bait).toBe(0);
      // A retry of the key answers the same and leaves one row.
      expect(await gift(a, b.id, key)).toMatchObject({ status: 200, body: done });
      expect(count(ctx.sql, 'house_mail')).toBe(1);
      // One gift a day in all: not another house, not the same one.
      expect(await gift(a, c.id)).toMatchObject({
        status: 409,
        body: { error: 'gift_used_today' },
      });
      expect(await gift(a, b.id)).toMatchObject({
        status: 409,
        body: { error: 'gift_used_today' },
      });
      // The key is the player's own namespace: the same key on another house is a conflict.
      expect(await gift(a, c.id, key)).toMatchObject({
        status: 409,
        body: { error: 'key_conflict' },
      });
      // The owner sees it waiting, with who sent it.
      const mailbox = (await own(b)).own.mailbox;
      expect(mailbox).toEqual({ gifts: 1, acorns: 5, from: [{ userId: a.id, name: 'Player 1' }] });
      // Tomorrow another gift is allowed.
      ctx.clock.t += DAY;
      expect((await gift(a, c.id)).status).toBe(200);
    });
  });

  it('refuses your own house, a house that does not exist, and bad bodies', async () => {
    await runHouse(async (ctx) => {
      const a = await householder(ctx, 1);
      const nobody = await player(ctx, 2);
      expect(await gift(a, a.id)).toMatchObject({ status: 409, body: { error: 'own_house' } });
      expect(await gift(a, nobody.id)).toMatchObject({ status: 404, body: { error: 'no_house' } });
      expect(await gift(a, 'garbage')).toMatchObject({ status: 404, body: { error: 'no_house' } });
      const b = await householder(ctx, 3);
      expect((await a.call('POST', `/api/houses/${b.id}/gift`, {})).status).toBe(400);
      expect(
        (await a.call('POST', `/api/houses/${b.id}/gift`, { idempotencyKey: 'x' })).status,
      ).toBe(400);
      expect(
        (
          await a.call('POST', `/api/houses/${b.id}/gift`, {
            idempotencyKey: newKey(),
            amount: 500,
          })
        ).status,
      ).toBe(400);
      expect(count(ctx.sql, 'house_mail')).toBe(0);
    });
  });

  it('stops a house from receiving more than the daily cap', async () => {
    await runHouse(async (ctx) => {
      const owner = await householder(ctx, 1);
      const cap = HOUSING_RULES.gift.perReceiverPerDay;
      for (let n = 2; n <= cap + 1; n++) {
        expect((await gift(await player(ctx, n), owner.id)).status).toBe(200);
      }
      const late = await player(ctx, cap + 2);
      expect(await gift(late, owner.id)).toMatchObject({
        status: 409,
        body: { error: 'gift_cap_reached' },
      });
      // The cap is per receiver per day.
      ctx.clock.t += DAY;
      expect((await gift(late, owner.id)).status).toBe(200);
    });
  });

  it('collects every waiting gift into the ledger once, and a repeat of the key answers the same', async () => {
    await runHouse(async (ctx) => {
      const owner = await householder(ctx, 1);
      for (let n = 2; n <= 4; n++) await gift(await player(ctx, n), owner.id);
      const key = newKey();
      const done = parsed(CollectAnswerSchema, await collect(owner, key));
      expect(done).toEqual({ collected: 15, balance: 15 });
      expect(parsed(CollectAnswerSchema, await collect(owner, key))).toEqual(done);
      expect(ctx.core.balances(owner.id).bait).toBe(15);
      const entries = rows<{ source: string; amount: number }>(
        ctx.sql,
        "SELECT source, amount FROM ledger WHERE user_id = ? AND source = 'house_gift'",
        owner.id,
      );
      expect(entries).toEqual([{ source: 'house_gift', amount: 15 }]);
      expect((await own(owner)).own.mailbox).toEqual({ gifts: 0, acorns: 0, from: [] });
      // Nothing left to collect; the gifts never expire, so a late one still arrives.
      expect(await collect(owner)).toMatchObject({
        status: 409,
        body: { error: 'nothing_to_collect' },
      });
      ctx.clock.t += 40 * DAY;
      await gift(await player(ctx, 5), owner.id);
      expect(parsed(CollectAnswerSchema, await collect(owner))).toEqual({
        collected: 5,
        balance: 20,
      });
      expect((await collect(owner, 'x')).status).toBe(400);
    });
  });

  it('does not let one collect run twice at once', async () => {
    await runHouse(async (ctx) => {
      const owner = await householder(ctx, 1);
      await gift(await player(ctx, 2), owner.id);
      const key = newKey();
      const both = await Promise.all([collect(owner, key), collect(owner, key)]);
      expect(both[0]).toEqual(both[1]);
      expect(ctx.core.balances(owner.id).bait).toBe(5);
    });
  });
});

describe('stamps and the guestbook', () => {
  async function pair(ctx: CoreContext): Promise<[Dev, Dev]> {
    return [await householder(ctx, 1), await householder(ctx, 2)];
  }

  it('signs the guestbook once per house a day with a stamp the visitor holds', async () => {
    await runHouse(async (ctx) => {
      const [a, b] = await pair(ctx);
      const c = await householder(ctx, 3);
      const done = parsed(StampAnswerSchema, await stamp(a, b.id, 'paw-print'));
      expect(done.today).toEqual({ gifted: false, stamped: true });
      expect(done.guestbook).toEqual([
        { visitor: { userId: a.id, name: 'Player 1' }, stampId: 'paw-print', at: ctx.clock.t },
      ]);
      expect(await stamp(a, b.id, 'paw-print')).toMatchObject({
        status: 409,
        body: { error: 'stamp_used_today' },
      });
      // Another house is another stamp; the next day another again.
      expect((await stamp(a, c.id, 'paw-print')).status).toBe(200);
      ctx.clock.t += DAY;
      expect((await stamp(a, b.id, 'paw-print')).status).toBe(200);
      // The owner reads it, newest first.
      const book = (await own(b)).house.guestbook;
      expect(book).toHaveLength(2);
      expect(book[0]?.at).toBeGreaterThan(book[1]?.at ?? Infinity);
    });
  });

  it('takes only stamps the visitor holds, and never your own house', async () => {
    await runHouse(async (ctx) => {
      const [a, b] = await pair(ctx);
      const stranger = await player(ctx, 3);
      expect(await stamp(a, b.id, 'gold-medal')).toMatchObject({
        status: 409,
        body: { error: 'stamp_not_owned' },
      });
      expect(await stamp(a, b.id, 'no-such-stamp')).toMatchObject({
        status: 409,
        body: { error: 'stamp_not_owned' },
      });
      // A visitor with no house holds no stamp at all.
      expect(await stamp(stranger, b.id, 'paw-print')).toMatchObject({
        status: 409,
        body: { error: 'stamp_not_owned' },
      });
      expect(await stamp(a, a.id, 'paw-print')).toMatchObject({
        status: 409,
        body: { error: 'own_house' },
      });
      expect(await stamp(a, stranger.id, 'paw-print')).toMatchObject({
        status: 404,
        body: { error: 'no_house' },
      });
      expect(
        (await a.call('POST', `/api/houses/${b.id}/stamp`, { stampId: 'paw-print', x: 1 })).status,
      ).toBe(400);
      expect((await a.call('POST', `/api/houses/${b.id}/stamp`, {})).status).toBe(400);
      expect(count(ctx.sql, 'house_guestbook')).toBe(0);
    });
  });

  it('keeps only the latest thirty stamps of a house', async () => {
    await runHouse(async (ctx) => {
      const [a, b] = await pair(ctx);
      for (let n = 0; n < 34; n++) {
        ctx.sql.exec(
          "INSERT INTO house_guestbook (owner_id, visitor_id, stamp_id, day, at) VALUES (?, ?, 'paw-print', '2020-01-01', ?)",
          b.id,
          `600000000000000${String(n).padStart(3, '0')}`,
          n + 1,
        );
      }
      const done = parsed(StampAnswerSchema, await stamp(a, b.id, 'paw-print'));
      expect(done.guestbook).toHaveLength(HOUSING_RULES.guestbookKeep);
      expect(count(ctx.sql, 'house_guestbook', `owner_id = '${b.id}'`)).toBe(
        HOUSING_RULES.guestbookKeep,
      );
      // The newest is ours; the oldest rows went.
      expect(done.guestbook[0]?.visitor.userId).toBe(a.id);
      expect(count(ctx.sql, 'house_guestbook', `at <= 5 AND owner_id = '${b.id}'`)).toBe(0);
    });
  });
});
