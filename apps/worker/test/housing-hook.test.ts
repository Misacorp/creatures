/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of many response bodies (`Json.body` is `any` on purpose); every answer is also parsed with its strict
   schema from `@creatures/game`, so a shape change fails here. */
import {
  CatalogueViewSchema,
  HouseAnswerSchema,
  SeenAnswerSchema,
  HOUSING_RULES,
  expeditionContent,
  type HousingMoment,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { HousingDrops } from '../src/housing-drops';
import { weekIdFor } from '../src/raid-schedule';
import { player, type Dev } from './dev-helpers';
import type { CoreContext } from './helpers';
import { content, householder, parsed, runHouse, stock } from './housing-helpers';
import { DAY, captureConsole } from './kit';
import { count, rows } from './raid-helpers';

const own = async (p: Dev) => parsed(HouseAnswerSchema, await p.call('GET', '/api/house'));

function hook(ctx: CoreContext) {
  const h = ctx.core.housingHook;
  if (h === null) throw new Error('no housing hook');
  return h;
}

const trip = (key: string): HousingMoment => ({
  kind: 'trip',
  key,
  place: 'tidepools',
  element: 'tide',
  ticks: 9,
});
const raid = (
  key: string,
  o: Partial<Extract<HousingMoment, { kind: 'raid' }>> = {},
): HousingMoment => ({
  kind: 'raid',
  key,
  weekId: '2027-W02',
  bossId: 'tidal-colossus',
  rank: 3,
  cleared: true,
  festival: null,
  element: 'tide',
  ...o,
});
const materialsOf = (ctx: CoreContext, userId: string): number =>
  rows<{ n: number | null }>(
    ctx.sql,
    "SELECT SUM(count) AS n FROM house_items WHERE user_id = ? AND kind = 'material'",
    userId,
  )[0]?.n ?? 0;

describe('the drops hook', () => {
  it('pays a moment once: a second call with the same key writes nothing', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      hook(ctx).drop(p.id, trip('trip:one'));
      const items = rows(
        ctx.sql,
        'SELECT * FROM house_items WHERE user_id = ? ORDER BY kind, item_id',
        p.id,
      );
      const total = materialsOf(ctx, p.id);
      expect(total).toBeGreaterThan(0);
      expect(count(ctx.sql, 'house_drops')).toBe(1);
      hook(ctx).drop(p.id, trip('trip:one'));
      expect(
        rows(ctx.sql, 'SELECT * FROM house_items WHERE user_id = ? ORDER BY kind, item_id', p.id),
      ).toEqual(items);
      expect(count(ctx.sql, 'house_drops')).toBe(1);
      // Another key is another moment.
      hook(ctx).drop(p.id, trip('trip:two'));
      expect(count(ctx.sql, 'house_drops')).toBe(2);
      expect(materialsOf(ctx, p.id)).toBeGreaterThan(total);
    });
  });

  it('needs no house: the finds wait, show as "+N" and as recent finds, and the seen call clears the "+N"', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      hook(ctx).drop(p.id, trip('trip:one'));
      expect(count(ctx.sql, 'houses')).toBe(0);
      const first = await own(p);
      const have = Object.values(first.own.materials);
      expect(have.length).toBeGreaterThan(0);
      expect(have.every((m) => m.fresh === m.have && m.have > 0)).toBe(true);
      expect(first.own.recent).toHaveLength(1);
      expect(Object.keys(first.own.recent[0]?.materials ?? {}).sort()).toEqual(
        Object.keys(first.own.materials).sort(),
      );
      const seen = await p.call('POST', '/api/house/seen', {});
      expect(parsed(SeenAnswerSchema, seen)).toEqual({ ok: true });
      const after = await own(p);
      expect(Object.values(after.own.materials).every((m) => m.fresh === 0 && m.have > 0)).toBe(
        true,
      );
      expect((await p.call('POST', '/api/house/seen', { x: 1 })).status).toBe(400);
    });
  });

  it('upserts a cleared raid finale into the trophy rows, keeping the best rank and counting wins', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      hook(ctx).drop(p.id, raid('raid:a', { rank: 3, festival: 'sunbird' }));
      hook(ctx).drop(p.id, raid('raid:b', { rank: 2 }));
      hook(ctx).drop(p.id, raid('raid:b', { rank: 9 }));
      expect(
        rows(
          ctx.sql,
          'SELECT kind, ref, best, wins, last_week FROM house_trophies WHERE user_id = ? ORDER BY kind',
          p.id,
        ),
      ).toEqual([
        { kind: 'festival', ref: 'sunbird', best: 0, wins: 1, last_week: '2027-W02' },
        { kind: 'raid', ref: 'tidal-colossus', best: 3, wins: 2, last_week: '2027-W02' },
      ]);
      // A lost finale pays one roll and no trophy.
      const q = await player(ctx, 2);
      hook(ctx).drop(q.id, raid('raid:lost', { cleared: false }));
      expect(count(ctx.sql, 'house_trophies', `user_id = '${q.id}'`)).toBe(0);
      expect(materialsOf(ctx, q.id)).toBe(1);
      // The week's finale of a Tide boss brings Tide materials only.
      const kinds = rows<{ item_id: string }>(
        ctx.sql,
        "SELECT item_id FROM house_items WHERE user_id = ? AND kind = 'material'",
        q.id,
      );
      expect(
        kinds.every((k) => content.materials.find((m) => m.id === k.item_id)?.element === 'tide'),
      ).toBe(true);
    });
  });

  it('never drops a blueprint or a stamp the player already holds', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      for (let n = 0; n < 120; n++) hook(ctx).drop(p.id, raid(`raid:${String(n)}`));
      const drops = rows<{ json: string }>(
        ctx.sql,
        'SELECT json FROM house_drops WHERE user_id = ?',
        p.id,
      ).map((r) => JSON.parse(r.json) as { blueprint: string | null; stamp: string | null });
      const blueprints = drops.flatMap((d) => (d.blueprint === null ? [] : [d.blueprint]));
      const stamps = drops.flatMap((d) => (d.stamp === null ? [] : [d.stamp]));
      expect(blueprints.length).toBeGreaterThan(0);
      expect(new Set(blueprints).size).toBe(blueprints.length);
      expect(new Set(stamps).size).toBe(stamps.length);
      expect(count(ctx.sql, 'house_items', `kind = 'blueprint' AND user_id = '${p.id}'`)).toBe(
        blueprints.length,
      );
      expect(count(ctx.sql, 'house_items', `kind = 'stamp' AND user_id = '${p.id}'`)).toBe(
        stamps.length,
      );
    });
  });

  it('never throws into the reward it is called from: a failed drop leaves nothing behind', async () => {
    const logged = captureConsole();
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      const broken = new HousingDrops({
        storage: ctx.storage,
        now: () => ctx.clock.t,
        rng: {
          nextU32: () => {
            throw new Error('dice broke');
          },
        },
      });
      expect(() => {
        broken.drop(p.id, trip('trip:broken'));
      }).not.toThrow();
      expect(count(ctx.sql, 'house_drops')).toBe(0);
      expect(count(ctx.sql, 'house_items')).toBe(0);
    });
    expect(logged.text()).toContain('housing drop failed');
  });

  it('forgets drop rows older than the keep time in its own write', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      hook(ctx).drop(p.id, trip('trip:old'));
      ctx.clock.t += (HOUSING_RULES.dropsKeepDays + 1) * DAY;
      hook(ctx).drop(p.id, trip('trip:new'));
      expect(
        rows<{ key: string }>(ctx.sql, 'SELECT key FROM house_drops WHERE user_id = ?', p.id),
      ).toEqual([{ key: 'trip:new' }]);
    });
  });

  it("rolls with its own RNG, never the other systems' (seeded, so a run repeats)", async () => {
    const run = async (): Promise<unknown> =>
      runHouse(async (ctx) => {
        const p = await player(ctx, 1);
        for (let n = 0; n < 6; n++) hook(ctx).drop(p.id, trip(`trip:${String(n)}`));
        return rows(
          ctx.sql,
          'SELECT kind, item_id, count FROM house_items WHERE user_id = ? ORDER BY kind, item_id',
          p.id,
        );
      });
    expect(await run()).toEqual(await run());
  });
});

describe('displays', () => {
  const grantRows = (ctx: CoreContext, userId: string): void => {
    const sql = ctx.sql;
    sql.exec(
      "INSERT INTO house_trophies (user_id, kind, ref, best, wins, last_week) VALUES (?, 'raid', 'tidal-colossus', 3, 2, '2027-W02'), (?, 'raid', 'cinder-wyrm', 1, 1, '2027-W03'), (?, 'festival', 'sunbird', 0, 1, '2027-W03')",
      userId,
      userId,
      userId,
    );
    sql.exec(
      'INSERT INTO games_medals (user_id, gold, silver, bronze, pins) VALUES (?, 2, 1, 0, 3)',
      userId,
    );
    sql.exec(
      "INSERT INTO games_badges (creature_id, event_id, user_id, wins) VALUES ('c1', 'pepper-panic', ?, 2), ('c2', 'pepper-panic', ?, 1), ('c3', 'log-carry', ?, 4)",
      userId,
      userId,
      userId,
    );
    sql.exec(
      "INSERT INTO valley_gifts (user_id, place, project, given_milli, plaque) VALUES (?, 'market', 1, 1000, 1), (?, 'market', 2, 1000, 1), (?, 'forge', 1, 1000, 1), (?, 'forge', 2, 1000, 0)",
      userId,
      userId,
      userId,
      userId,
    );
    sql.exec(
      'INSERT INTO dungeon_progress (user_id, depth, streak, runs, clears) VALUES (?, 12, 2, 5, 3)',
      userId,
    );
    const set = expeditionContent.journal.entries.filter((e) => e.set === 'tide-ledger');
    for (const e of set) {
      sql.exec('INSERT INTO journal (user_id, entry_id, found_at) VALUES (?, ?, 1)', userId, e.id);
    }
    sql.exec(
      'INSERT INTO journal (user_id, entry_id, found_at) VALUES (?, ?, 1)',
      userId,
      expeditionContent.journal.entries.find((e) => e.set === 'ash-records')?.id ?? '',
    );
  };

  it('fill themselves from what the player already did: the mantel and the trophy hall', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx, 1);
        await p.tool('housing-build', { parts: ['cottage', 'house', 'west-wing'] });
        grantRows(ctx, p.id);
        // The week's boss is known once the week exists.
        const week = weekIdFor(ctx.clock.t, ctx.core.timezone());
        const boss = ctx.core.raid.ensureWeek(week).bossId;
        const res = await own(p);
        const byKind = Object.fromEntries(res.house.displays.map((d) => [d.kind, d]));
        expect(res.house.displays).toHaveLength(9);
        expect(
          res.house.displays
            .filter((d) => d.kind === 'raid-plaques')
            .map((d) => d.roomId)
            .sort(),
        ).toEqual(['hut:hearth', 'west-wing:hall']);
        expect(byKind['raid-plaques']).toMatchObject({
          plaques: [
            { bossId: 'cinder-wyrm', best: 1, wins: 1 },
            { bossId: 'tidal-colossus', best: 3, wins: 2 },
          ],
          current: boss,
        });
        expect(byKind['games-medals']).toMatchObject({ gold: 2, silver: 1, bronze: 0, pins: 3 });
        expect(byKind['games-badges']).toMatchObject({
          events: [
            { eventId: 'log-carry', wins: 4 },
            { eventId: 'pepper-panic', wins: 3 },
          ],
        });
        expect(byKind['festival']).toMatchObject({ species: ['sunbird'] });
        expect(byKind['keepsakes']).toMatchObject({
          places: [
            { place: 'forge', count: 1 },
            { place: 'market', count: 2 },
          ],
        });
        // One whole journal set and one page of another.
        expect(byKind['journal']).toMatchObject({ sets: ['tide-ledger'] });
        expect((byKind['journal'] as { pages: number }).pages).toBeGreaterThan(1);
        expect(byKind['dungeon']).toMatchObject({ depth: 12, clears: 3 });
        // The Cosy set is whole from the start: its keepsake is in the cabinet.
        expect(byKind['set-keepsakes']).toMatchObject({ sets: ['cosy'] });
        // A visitor sees the same displays.
        const q = await player(ctx, 2);
        const seen = parsed(
          (await import('@creatures/game')).VisitAnswerSchema,
          await q.call('GET', `/api/houses/${p.id}`),
        );
        expect(seen.house.displays).toEqual(res.house.displays);
      },
      { dev: true },
    );
  });

  it('are empty, not missing, for a player who did nothing yet', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx, 1);
        await p.tool('housing-build', { parts: ['cottage', 'house', 'west-wing'] });
        const res = await own(p);
        const byKind = Object.fromEntries(res.house.displays.map((d) => [d.kind, d]));
        expect(byKind['games-medals']).toMatchObject({ gold: 0, silver: 0, bronze: 0, pins: 0 });
        expect(byKind['dungeon']).toMatchObject({ depth: 0, clears: 0 });
        expect(byKind['journal']).toMatchObject({ sets: [], pages: 0 });
        // The week's boss is the empty plaque's: the week exists already, so it is named.
        expect(byKind['raid-plaques']).toMatchObject({ plaques: [] });
      },
      { dev: true },
    );
  });
});

describe('feats', () => {
  it('award the stamp of a finished journal set once, with the first look after it', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx, 1);
      expect((await own(p)).own.items.stamps).toEqual(['paw-print']);
      for (const e of expeditionContent.journal.entries.filter((x) => x.set === 'tide-ledger')) {
        ctx.sql.exec(
          'INSERT INTO journal (user_id, entry_id, found_at) VALUES (?, ?, 1)',
          p.id,
          e.id,
        );
      }
      expect((await own(p)).own.items.stamps.sort()).toEqual(['ledger-shell', 'paw-print']);
      await own(p);
      expect(count(ctx.sql, 'house_items', `kind = 'stamp' AND item_id = 'ledger-shell'`)).toBe(1);
    });
  });

  it('award boss, dungeon, Games, stat and part stamps, and the blueprint a feat stamp teaches', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx, 1);
        ctx.sql.exec(
          "INSERT INTO house_trophies (user_id, kind, ref, best, wins, last_week) VALUES (?, 'raid', 'tidal-colossus', 1, 1, '2027-W02')",
          p.id,
        );
        ctx.sql.exec('INSERT INTO dungeon_progress (user_id, depth) VALUES (?, 10)', p.id);
        ctx.sql.exec('INSERT INTO games_medals (user_id, gold) VALUES (?, 1)', p.id);
        ctx.sql.exec(
          "INSERT INTO account_stats (user_id, stat, value) VALUES (?, 'places_visited', 7)",
          p.id,
        );
        await p.tool('housing-build', { parts: ['cottage'] });
        const res = await own(p);
        expect(res.own.items.stamps.sort()).toEqual(
          [
            'colossus-wave',
            'deep-door',
            'gold-medal',
            'housewarming',
            'paw-print',
            'wayfarer',
          ].sort(),
        );
        // The Wayfarer stamp teaches the Wayfarer Globe.
        expect(res.own.items.blueprints).toContain('wayfarer-globe');
      },
      { dev: true },
    );
  });

  it('count a finished set beyond the starter set, and not the starter set itself', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx, 1);
      expect((await own(p)).house.setsComplete).toEqual(['cosy']);
      const pieces: Record<string, number> = {};
      for (const piece of content.pieces.filter((x) => x.set === 'tidepool')) pieces[piece.id] = 1;
      stock(ctx, p.id, { pieces });
      const res = await own(p);
      expect(res.house.setsComplete.sort()).toEqual(['cosy', 'tidepool']);
      expect(res.own.items.stamps).toContain('matched-set');
    });
  });
});

describe('the catalogue', () => {
  it('lists everything with what the caller owns, has placed and knows', async () => {
    await runHouse(async (ctx) => {
      const p = await householder(ctx, 1);
      stock(ctx, p.id, { materials: { driftwood: 3 }, blueprints: ['tidepool-stool'] });
      const cat = parsed(CatalogueViewSchema, await p.call('GET', '/api/house/catalogue'));
      expect(cat.pieces).toHaveLength(content.pieces.length);
      expect(cat.pieces.find((x) => x.id === 'cosy-sofa')).toEqual({
        id: 'cosy-sofa',
        owned: 1,
        placed: 1,
        known: true,
      });
      expect(cat.pieces.find((x) => x.id === 'cosy-bed')).toEqual({
        id: 'cosy-bed',
        owned: 1,
        placed: 0,
        known: true,
      });
      expect(cat.pieces.find((x) => x.id === 'tidepool-stool')).toEqual({
        id: 'tidepool-stool',
        owned: 0,
        placed: 0,
        known: true,
      });
      expect(cat.pieces.find((x) => x.id === 'ancient-stool')).toEqual({
        id: 'ancient-stool',
        owned: 0,
        placed: 0,
        known: false,
      });
      expect(cat.skins.find((x) => x.id === 'thatch')).toEqual({
        id: 'thatch',
        owned: true,
        known: true,
      });
      expect(cat.skins.find((x) => x.id === 'slate')).toEqual({
        id: 'slate',
        owned: false,
        known: false,
      });
      expect(cat.stamps.find((x) => x.id === 'paw-print')?.owned).toBe(true);
      expect(cat.materials.find((x) => x.id === 'driftwood')?.have).toBe(3);
      expect(cat.parts.find((x) => x.id === 'hut')?.built).toBe(true);
      expect(cat.parts.find((x) => x.id === 'cottage')?.built).toBe(false);
      expect(cat.sets.find((x) => x.id === 'cosy')?.complete).toBe(true);
      expect(cat.sets.find((x) => x.id === 'ancient')?.complete).toBe(false);
    });
  });

  it('does not make a house, for a player who has none', async () => {
    await runHouse(async (ctx) => {
      const p = await player(ctx, 1);
      const cat = parsed(CatalogueViewSchema, await p.call('GET', '/api/house/catalogue'));
      expect(cat.pieces.every((x) => x.owned === 0)).toBe(true);
      expect(count(ctx.sql, 'houses')).toBe(0);
    });
  });
});

describe('the dev tools', () => {
  it('fill holdings, build parts without paying, make guest houses and start over', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx, 1);
        await p.tool('housing-grant', {
          materials: 20,
          acorns: 500,
          scrap: 900,
          blueprints: 'all',
          stamps: 'all',
        });
        const granted = await own(p);
        expect(Object.keys(granted.own.materials)).toHaveLength(content.materials.length);
        expect(granted.own.purse).toMatchObject({ bait: 500, scrap: 900 });
        expect(granted.own.items.stamps).toHaveLength(content.stamps.length);
        expect(granted.own.items.blueprints.length).toBeGreaterThan(50);
        expect((await p.dev('housing-grant', {})).status).toBe(400);
        // Parts: all of them, in order, free.
        await p.tool('housing-build', { parts: 'all' });
        const full = await own(p);
        expect(full.house.built.sort()).toEqual(content.parts.map((x) => x.id).sort());
        expect(full.own.buildable).toEqual([]);
        expect((await p.dev('housing-build', { parts: ['moat'] })).status).toBe(400);
        // Guests: houses for the raid's dev guests, with stamps in the caller's guestbook.
        await p.tool('housing-guests', { count: 3 });
        expect(count(ctx.sql, 'houses', "user_id LIKE 'dev-guest-%'")).toBe(3);
        const book = (await own(p)).house.guestbook;
        expect(book).toHaveLength(3);
        const list = await p.call('GET', '/api/houses');
        expect(list.body.houses).toHaveLength(3);
        // A guest's house opens, though its id is not a Discord id.
        expect((await p.call('GET', '/api/houses/dev-guest-1')).status).toBe(200);
        // Start over: every housing row of the caller is gone, the guests' stay.
        await p.tool('housing-fresh', {});
        expect(count(ctx.sql, 'houses', `user_id = '${p.id}'`)).toBe(0);
        expect(count(ctx.sql, 'house_items', `user_id = '${p.id}'`)).toBe(0);
        expect(count(ctx.sql, 'house_guestbook', `owner_id = '${p.id}'`)).toBe(0);
        expect(count(ctx.sql, 'houses', "user_id LIKE 'dev-guest-%'")).toBe(3);
        expect((await own(p)).house.built).toEqual(['hut']);
      },
      { dev: true },
    );
  });

  it('are wiped with the account by reset-account, the mailbox and guestbook too', async () => {
    await runHouse(
      async (ctx) => {
        const p = await householder(ctx, 1);
        const q = await householder(ctx, 2);
        await q.call('POST', `/api/houses/${p.id}/gift`, { idempotencyKey: 'reset-gift-key-1' });
        await q.call('POST', `/api/houses/${p.id}/stamp`, { stampId: 'paw-print' });
        hook(ctx).drop(p.id, trip('trip:reset'));
        expect(count(ctx.sql, 'house_mail', `owner_id = '${p.id}'`)).toBe(1);
        await p.tool('reset-account', { confirm: 'RESET' });
        for (const table of [
          'houses',
          'house_parts',
          'house_rooms',
          'house_items',
          'house_drops',
        ]) {
          expect(count(ctx.sql, table, `user_id = '${p.id}'`)).toBe(0);
        }
        for (const table of ['house_mail', 'house_guestbook']) {
          expect(count(ctx.sql, table, `owner_id = '${p.id}'`)).toBe(0);
        }
        // Another player's house is untouched.
        expect(count(ctx.sql, 'houses', `user_id = '${q.id}'`)).toBe(1);
      },
      { dev: true },
    );
  });

  it('answer 404 with the flag off', async () => {
    await runHouse(
      async (ctx) => {
        const p = await player(ctx, 1);
        for (const tool of ['housing-grant', 'housing-build', 'housing-guests', 'housing-fresh']) {
          const body =
            tool === 'housing-grant'
              ? { materials: 1 }
              : tool === 'housing-build'
                ? { parts: 'all' }
                : {};
          expect(await p.dev(tool, body)).toMatchObject({ status: 404 });
        }
      },
      { dev: true, housing: false },
    );
  });
});
