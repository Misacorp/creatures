import {
  RULES,
  convertedItemLevel,
  createSeededRng,
  legacyDismantleYield,
  legacyUpgradeSpent,
  tierCap,
  type PartKind,
  type Rng,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { convertPendingGear, type ConversionNotice } from '../src/gear-convert';
import { runCore, type CoreContext } from './helpers';
import { count, nextGuild, rows, seedPlayer, type SeedOptions } from './raid-helpers';

/**
 * The one-time conversion of the first gear model to gear v2 (docs/design/gear-and-creatures-v2.md
 * section 12). The old rows are written the way migration 27 leaves them: items in `gear_legacy`,
 * the player in `gear_conversion`, blueprints and jobs where they were.
 */

function counting(seed: string): Rng & { drawn: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    nextU32() {
      n++;
      return inner.nextU32();
    },
    drawn: () => n,
  };
}

interface Old {
  id: string;
  base: string;
  rarity: 'common' | 'rare' | 'epic' | 'festival';
  level?: number;
  enchant?: string | null;
  on?: string | null;
}

function legacy(ctx: CoreContext, userId: string, ...items: Old[]): void {
  for (const o of items) {
    ctx.sql.exec(
      `INSERT INTO gear_legacy (id, user_id, base_id, rarity, level, rolls_json, enchant_id, equipped_on, source, created_at)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, 'test', ?)`,
      o.id,
      userId,
      o.base,
      o.rarity,
      o.level ?? 0,
      o.enchant ?? null,
      o.on ?? null,
      ctx.clock.t,
    );
  }
  ctx.sql.exec('INSERT OR IGNORE INTO gear_conversion (user_id) VALUES (?)', userId);
}

const convert = (ctx: CoreContext, rng: Rng): number =>
  convertPendingGear({ storage: ctx.storage, now: () => ctx.clock.t, rng });

const itemRows = (ctx: CoreContext, userId: string) =>
  rows<{
    id: string;
    base_id: string;
    slot: string;
    tag: string;
    rarity: string;
    item_level: number;
    lines_json: string;
    equipped_on: string | null;
    source: string;
    origin_json: string;
  }>(ctx.sql, 'SELECT * FROM gear_items WHERE user_id = ? ORDER BY id', userId);

const partsOf = (ctx: CoreContext, userId: string): Partial<Record<PartKind, number>> =>
  Object.fromEntries(
    rows<{ kind: PartKind; amount: number }>(
      ctx.sql,
      'SELECT kind, amount FROM parts WHERE user_id = ?',
      userId,
    ).map((r) => [r.kind, r.amount]),
  );

const noticeOf = (ctx: CoreContext, userId: string): ConversionNotice =>
  JSON.parse(
    rows<{ notice_json: string }>(
      ctx.sql,
      'SELECT notice_json FROM gear_conversion WHERE user_id = ?',
      userId,
    )[0]?.notice_json ?? 'null',
  ) as ConversionNotice;

const essenceOf = (ctx: CoreContext, userId: string): number =>
  rows<{ amount: number }>(
    ctx.sql,
    "SELECT amount FROM balances WHERE user_id = ? AND currency = 'essence'",
    userId,
  )[0]?.amount ?? 0;

const player = (ctx: CoreContext, n: number, o: SeedOptions = {}) => seedPlayer(ctx, n, o);

const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('converting the first gear model', () => {
  it('turns a worn item into a new item of the same rarity and id: slot by stat focus, tag from the tint, a fresh drop level', async () => {
    const rng = counting('convert');
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      const [a, b, c] = p.creatureIds as [string, string, string];
      legacy(
        ctx,
        p.id,
        // Attack (a charm kind), HP (a band) and speed (a band) items, each worn.
        { id: ID(1), base: 'cinder-charm', rarity: 'rare', level: 2, on: a },
        { id: ID(2), base: 'forge-band', rarity: 'epic', level: 4, on: b },
        { id: ID(3), base: 'wave-band', rarity: 'common', on: c },
      );
      expect(convert(ctx, rng)).toBe(1);
      const items = itemRows(ctx, p.id);
      const level = convertedItemLevel(1, 0);
      expect(level).toBe(4);
      expect(
        items.map((i) => [i.id, i.slot, i.tag, i.rarity, i.item_level, i.equipped_on]),
      ).toEqual([
        [ID(1), 'hat', 'ember', 'rare', level, a],
        [ID(2), 'scarf', 'ember', 'epic', level, b],
        [ID(3), 'charm', 'tide', 'common', level, c],
      ]);
      for (const item of items) {
        const lines = JSON.parse(item.lines_json) as { id: string; tier: number }[];
        expect(lines).toHaveLength(RULES.gear.rolledLines[item.rarity as 'common']);
        // Tier II or better, even below item level 5 (where the ladder would only allow tier I).
        expect(tierCap(level)).toBe(0);
        for (const l of lines) expect(l.tier).toBeGreaterThanOrEqual(1);
        expect(item.source).toBe('converted');
        expect(JSON.parse(item.origin_json)).toEqual({ kind: 'converted' });
      }
      expect(rng.drawn()).toBeGreaterThan(0);
      // Nothing is left to convert, and the notice is stamped.
      // The old rows stay (the stamp on `gear_conversion` marks them converted).
      expect(count(ctx.sql, 'gear_legacy')).toBe(3);
      expect(count(ctx.sql, 'gear_conversion', 'converted_at IS NOT NULL')).toBe(1);
      expect(noticeOf(ctx, p.id)).toMatchObject({
        converted: 3,
        unequipped: [],
        refundedItems: 0,
        blueprints: 0,
        retiredJobs: 0,
      });
      return Promise.resolve();
    });
  });

  it('uses the higher of 3 + Boss Rank and the best dungeon depth drop level, at most 12', async () => {
    await runCore(nextGuild(), (ctx) => {
      ctx.sql.exec('UPDATE raid_ladder SET rank = 6 WHERE id = 1');
      const a = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      const b = player(ctx, 2, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      const c = player(ctx, 3, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      const run = (userId: string, depth: number, n: number) =>
        ctx.sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed, cleared, rooms_cleared, summary_json, rewards_json, created_at)
           VALUES (?, ?, ?, 1, ?, 'f', ?, 's', 1, 3, '{}', '{}', 0)`,
          ID(100 + n),
          userId,
          `2027-01-${String(10 + n)}`,
          `key-${String(n)}-xxxxxxxx`,
          depth,
        );
      // Rank 6: 9. A depth 12 dungeon: 7. Depth 29 gives 15, capped at 12.
      legacy(ctx, a.id, {
        id: ID(1),
        base: 'cinder-charm',
        rarity: 'common',
        on: a.creatureIds[0] as string,
      });
      legacy(ctx, b.id, {
        id: ID(2),
        base: 'cinder-charm',
        rarity: 'common',
        on: b.creatureIds[0] as string,
      });
      run(b.id, 12, 1);
      legacy(ctx, c.id, {
        id: ID(3),
        base: 'cinder-charm',
        rarity: 'common',
        on: c.creatureIds[0] as string,
      });
      run(c.id, 29, 2);
      convert(ctx, createSeededRng('levels'));
      const level = (id: string) =>
        rows<{ item_level: number }>(
          ctx.sql,
          'SELECT item_level FROM gear_items WHERE id = ?',
          id,
        )[0]?.item_level;
      expect(level(ID(1))).toBe(9);
      expect(level(ID(2))).toBe(9);
      expect(level(ID(3))).toBe(12);
      expect(convertedItemLevel(6, 12)).toBe(9);
      expect(convertedItemLevel(1, 29)).toBe(12);
      return Promise.resolve();
    });
  });

  it('takes an item off a creature that may not wear it, puts it in the bag and says so', async () => {
    await runCore(nextGuild(), (ctx) => {
      // Rank 9 gives item level 12.
      ctx.sql.exec('UPDATE raid_ladder SET rank = 9 WHERE id = 1');
      const p = player(ctx, 1, { level: 5, species: ['cindle', 'sproutle', 'splashet'] });
      const [a, b, c] = p.creatureIds as [string, string, string];
      ctx.sql.exec('UPDATE creatures SET level = 12 WHERE id = ?', c);
      ctx.sql.exec('UPDATE creatures SET level = 8 WHERE id = ?', b);
      legacy(
        ctx,
        p.id,
        // A level 5 creature: item level 12 is too high for its Hat.
        { id: ID(1), base: 'cinder-charm', rarity: 'rare', on: a },
        // A level 8 creature may wear a Scarf (opens at 7), but not at item level 12.
        { id: ID(2), base: 'forge-band', rarity: 'rare', on: b },
        // A level 12 creature may wear item level 12, but its Charm slot opens at 13.
        { id: ID(3), base: 'wave-band', rarity: 'rare', on: c },
        // And one that stays: a level 12 creature, an Attack item at level 12.
        { id: ID(4), base: 'trail-charm', rarity: 'common', on: c },
      );
      convert(ctx, createSeededRng('limits'));
      const worn = (id: string) =>
        rows<{ equipped_on: string | null }>(
          ctx.sql,
          'SELECT equipped_on FROM gear_items WHERE id = ?',
          id,
        )[0]?.equipped_on;
      expect(worn(ID(1))).toBeNull();
      expect(worn(ID(2))).toBeNull();
      expect(worn(ID(3))).toBeNull();
      expect(worn(ID(4))).toBe(c);
      const notice = noticeOf(ctx, p.id);
      expect(notice.converted).toBe(4);
      expect(notice.unequipped.map((u) => [u.id, u.slot, u.reason, u.needs, u.itemLevel])).toEqual([
        [ID(1), 'hat', 'item_level', 12, 12],
        [ID(2), 'scarf', 'item_level', 12, 12],
        [ID(3), 'charm', 'slot_locked', 13, 12],
      ]);
      // They are all still the player's, in the bag.
      expect(itemRows(ctx, p.id)).toHaveLength(4);
      return Promise.resolve();
    });
  });

  it('refunds an unworn item as parts, and the upgrades and enchant of every item as parts and Essence', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      const [a] = p.creatureIds as [string];
      legacy(
        ctx,
        p.id,
        // Unworn: its dismantle yield and the upgrades it cost, and an Ember enchant's glimmer and shards.
        { id: ID(1), base: 'phoenix-trinket', rarity: 'epic', level: 3, enchant: 'ember-fury' },
        // Worn: it stays, but its upgrades are still returned.
        { id: ID(2), base: 'cinder-charm', rarity: 'rare', level: 2, on: a },
      );
      convert(ctx, createSeededRng('refund'));
      expect(itemRows(ctx, p.id).map((i) => i.id)).toEqual([ID(2)]);
      const epic = legacyUpgradeSpent('epic', 3);
      const rare = legacyUpgradeSpent('rare', 2);
      const expected = legacyDismantleYield('epic', 'ember');
      expect(partsOf(ctx, p.id)).toEqual({
        scrap: (expected.scrap ?? 0) + epic.scrap + rare.scrap,
        'ember-shard': (expected['ember-shard'] ?? 0) + RULES.gear.legacy.enchant.shard,
        glimmer: (expected.glimmer ?? 0) + RULES.gear.legacy.enchant.glimmer,
      });
      expect(essenceOf(ctx, p.id)).toBe(epic.essence + rare.essence);
      const notice = noticeOf(ctx, p.id);
      expect(notice).toMatchObject({
        converted: 1,
        refundedItems: 1,
        essence: epic.essence + rare.essence,
      });
      expect(notice.parts).toEqual(partsOf(ctx, p.id));
      // The Essence went through the ledger under its own key, once.
      expect(
        rows(
          ctx.sql,
          "SELECT amount FROM ledger WHERE source = 'gear_refund' AND user_id = ?",
          p.id,
        ),
      ).toEqual([{ amount: epic.essence + rare.essence }]);
      return Promise.resolve();
    });
  });

  it('maps blueprints to the base of the same slot and tint, and an overlap adds a mark', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1);
      const learn = (base: string, rarity: string, at: number) =>
        ctx.sql.exec(
          'INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, ?, ?, ?)',
          p.id,
          base,
          rarity,
          at,
        );
      // Three neutral Attack and crit hats (old: trail-charm, fortune-charm, keen-trinket) all become the Trail Cap.
      learn('trail-charm', 'common', 1);
      learn('fortune-charm', 'rare', 2);
      learn('keen-trinket', 'rare', 3);
      // The old Tidepool Charm (HP, Tide) is a Seafoam Scarf; the Wave Band (speed, Tide) a Tidepool Charm.
      learn('tidepool-charm', 'common', 4);
      learn('wave-band', 'rare', 5);
      ctx.sql.exec('INSERT OR IGNORE INTO gear_conversion (user_id) VALUES (?)', p.id);
      convert(ctx, createSeededRng('bp'));
      expect(
        rows<{ base_id: string; marks: number }>(
          ctx.sql,
          'SELECT base_id, marks FROM blueprints WHERE user_id = ? ORDER BY base_id',
          p.id,
        ),
      ).toEqual([
        { base_id: 'seafoam-scarf', marks: 0 },
        { base_id: 'tidepool-charm', marks: 0 },
        { base_id: 'trail-cap', marks: 2 },
      ]);
      // Every old blueprint was mapped (five of them), onto three bases.
      expect(noticeOf(ctx, p.id).blueprints).toBe(5);
      return Promise.resolve();
    });
  });

  it('lets jobs in progress finish: a craft makes a new base, an Improve or Enchant pays its XP and returns its parts', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = player(ctx, 1, { level: 20 });
      const [a, b] = p.creatureIds as [string, string];
      ctx.sql.exec(
        "INSERT INTO blueprints (user_id, base_id, rarity, learned_at) VALUES (?, 'bark-band', 'rare', 1)",
        p.id,
      );
      ctx.sql.exec(
        `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
         VALUES (?, ?, ?, 'craft', NULL, ?, ?, ?), (?, ?, ?, 'enchant', ?, ?, ?, ?)`,
        ID(1),
        p.id,
        a,
        JSON.stringify({
          baseId: 'bark-band',
          rarity: 'rare',
          cost: { scrap: 18, 'grove-shard': 1 },
        }),
        ctx.clock.t,
        ctx.clock.t + 8 * 3_600_000,
        ID(2),
        p.id,
        b,
        ID(50),
        JSON.stringify({
          rarity: 'epic',
          gearId: ID(50),
          enchantId: 'steady-hand',
          cost: { glimmer: 1, 'tide-shard': 3 },
        }),
        ctx.clock.t,
        ctx.clock.t + 6 * 3_600_000,
      );
      ctx.sql.exec('INSERT OR IGNORE INTO gear_conversion (user_id) VALUES (?)', p.id);
      convert(ctx, createSeededRng('jobs'));
      const jobs = rows<{ id: string; gear_id: string | null; input_json: string }>(
        ctx.sql,
        'SELECT id, gear_id, input_json FROM workshop_jobs ORDER BY id',
      );
      // The craft now names the new base (Bark Band: Attack, Grove: the Acorn Cap).
      expect(JSON.parse(jobs[0]?.input_json ?? '{}')).toMatchObject({ baseId: 'acorn-cap' });
      // The enchant lets go of the item.
      expect(jobs[1]?.gear_id).toBeNull();
      expect(noticeOf(ctx, p.id).retiredJobs).toBe(1);
      // Claim both through the routes.
      ctx.clock.t += 9 * 3_600_000;
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const claim = (id: string, key: string) =>
        ctx.request(secret, `/api/workshop/jobs/${id}/claim`, 'POST', { idempotencyKey: key });
      const craft = await claim(ID(1), 'convert-claim-craft');
      expect(craft.status).toBe(200);
      expect(
        (await craft.json<{ result: { kind: string; baseId: string } }>()).result,
      ).toMatchObject({
        kind: 'craft',
        baseId: 'acorn-cap',
      });
      const enchant = await claim(ID(2), 'convert-claim-enchant');
      expect(
        (await enchant.json<{ result: { kind: string; refund: unknown; xp: number } }>()).result,
      ).toMatchObject({
        kind: 'retired',
        refund: { glimmer: 1, 'tide-shard': 3 },
        xp: 6 * RULES.gear.skill.xpPerHour,
      });
      expect(partsOf(ctx, p.id)).toMatchObject({ glimmer: 1, 'tide-shard': 3 });
    });
  });

  it('turns an old Festival piece into the Festival piece of its slot', async () => {
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      legacy(
        ctx,
        p.id,
        { id: ID(1), base: 'lantern-charm', rarity: 'festival', on: p.creatureIds[2] as string },
        { id: ID(2), base: 'hearth-band', rarity: 'festival' },
      );
      convert(ctx, createSeededRng('festival'));
      expect(itemRows(ctx, p.id).map((i) => [i.base_id, i.rarity])).toEqual([
        ['festival-lantern-charm', 'festival'],
      ]);
      // The unworn Hearth Band is refunded like any unworn item.
      expect(noticeOf(ctx, p.id).refundedItems).toBe(1);
      return Promise.resolve();
    });
  });

  it('is idempotent: a second run converts nobody, draws nothing and refunds nothing twice', async () => {
    const rng = counting('twice');
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      legacy(
        ctx,
        p.id,
        {
          id: ID(1),
          base: 'cinder-charm',
          rarity: 'epic',
          level: 3,
          on: p.creatureIds[0] as string,
        },
        { id: ID(2), base: 'pearl-trinket', rarity: 'rare', level: 2 },
      );
      expect(convert(ctx, rng)).toBe(1);
      const drawn = rng.drawn();
      const before = {
        items: itemRows(ctx, p.id),
        parts: partsOf(ctx, p.id),
        essence: essenceOf(ctx, p.id),
        notice: noticeOf(ctx, p.id),
      };
      expect(convert(ctx, rng)).toBe(0);
      ctx.core.migrate();
      expect(rng.drawn()).toBe(drawn);
      expect(itemRows(ctx, p.id)).toEqual(before.items);
      expect(partsOf(ctx, p.id)).toEqual(before.parts);
      expect(essenceOf(ctx, p.id)).toBe(before.essence);
      expect(noticeOf(ctx, p.id)).toEqual(before.notice);
      return Promise.resolve();
    });
  });

  it('does nothing for a player without old gear, blueprints or jobs', async () => {
    const rng = counting('nothing');
    await runCore(nextGuild(), (ctx) => {
      const p = player(ctx, 1);
      expect(convert(ctx, rng)).toBe(0);
      expect(rng.drawn()).toBe(0);
      expect(count(ctx.sql, 'gear_conversion', `user_id = '${p.id}'`)).toBe(0);
      return Promise.resolve();
    });
  });

  it('shows the notice once through the gear view, and dismissing it again changes nothing', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      legacy(ctx, p.id, {
        id: ID(1),
        base: 'cinder-charm',
        rarity: 'common',
        on: p.creatureIds[0] as string,
      });
      ctx.sql.exec(
        "INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, 'welcome', 'welcome', ?, ?)",
        p.id,
        JSON.stringify({ gear: [], converted: [], parts: {}, blueprints: [] }),
        ctx.clock.t,
      );
      convert(ctx, createSeededRng('notice'));
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const get = async () =>
        (await (await ctx.request(secret, '/api/gear')).json<{ notice: ConversionNotice | null }>())
          .notice;
      expect(await get()).toMatchObject({ converted: 1 });
      const dismissed = await ctx.request(secret, '/api/gear/conversion/dismiss', 'POST', {});
      expect(dismissed.status).toBe(200);
      expect(await get()).toBeNull();
      expect((await ctx.request(secret, '/api/gear/conversion/dismiss', 'POST', {})).status).toBe(
        200,
      );
      expect(await get()).toBeNull();
      // A body with anything in it is refused.
      expect(
        (await ctx.request(secret, '/api/gear/conversion/dismiss', 'POST', { extra: 1 })).status,
      ).toBe(400);
      // Someone else's notice is not theirs: another player sees none.
      const other = player(ctx, 2);
      const otherSecret = await ctx.core.createSession(ctx.guildId, {
        id: other.id,
        displayName: other.name,
      });
      const res = await ctx.request(otherSecret, '/api/gear');
      expect((await res.json<{ notice: unknown }>()).notice).toBeNull();
    });
  });

  it('converts every waiting player on the first load after the migration, each with their own rolls', async () => {
    const rng = counting('everyone');
    await runCore(
      nextGuild(),
      (ctx) => {
        const species = ['cindle', 'sproutle', 'splashet'];
        const players = [1, 2, 3].map((n) => player(ctx, n, { level: 20, species }));
        for (const [i, p] of players.entries()) {
          legacy(ctx, p.id, {
            id: ID(i + 1),
            base: 'cinder-charm',
            rarity: 'epic',
            on: p.creatureIds[0] as string,
          });
        }
        expect(convert(ctx, rng)).toBe(3);
        const lines = players.map((p) => itemRows(ctx, p.id)[0]?.lines_json);
        expect(new Set(lines).size).toBeGreaterThan(1);
        expect(count(ctx.sql, 'gear_conversion', 'converted_at IS NOT NULL')).toBe(3);
        return Promise.resolve();
      },
      {},
    );
  });

  it('counts only cleared dungeon runs for the best depth: a lost run at a deep depth adds nothing', async () => {
    await runCore(nextGuild(), (ctx) => {
      ctx.sql.exec('UPDATE raid_ladder SET rank = 1 WHERE id = 1');
      const p = player(ctx, 1, { level: 20, species: ['cindle', 'sproutle', 'splashet'] });
      const run = (depth: number, cleared: 0 | 1, n: number) =>
        ctx.sql.exec(
          `INSERT INTO dungeon_runs (id, user_id, day, attempt, idempotency_key, fingerprint, depth, seed, cleared, rooms_cleared, summary_json, rewards_json, created_at)
           VALUES (?, ?, ?, 1, ?, 'f', ?, 's', ?, 1, '{}', '{}', 0)`,
          ID(200 + n),
          p.id,
          `2027-02-${String(10 + n)}`,
          `key-${String(n)}-yyyyyyyy`,
          depth,
          cleared,
        );
      // Depth 4 cleared (drop level 3), depth 30 lost (it would have given 12).
      run(4, 1, 1);
      run(30, 0, 2);
      legacy(ctx, p.id, {
        id: ID(1),
        base: 'cinder-charm',
        rarity: 'common',
        on: p.creatureIds[0] as string,
      });
      convert(ctx, createSeededRng('cleared'));
      // Rank 1 gives 4; the cleared depth 4 gives 3.
      expect(itemRows(ctx, p.id)[0]?.item_level).toBe(4);
      return Promise.resolve();
    });
  });

  it('leaves a player pending when their conversion fails, converts the others, and answers 503 for them', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const species = ['cindle', 'sproutle', 'splashet'];
      const bad = player(ctx, 1, { level: 20, species });
      const good = player(ctx, 2, { level: 20, species });
      legacy(ctx, bad.id, {
        id: ID(1),
        // A row the rules cannot make sense of (an unknown rarity) fails inside the player's transaction.
        rarity: 'bogus' as 'common',
        base: 'cinder-charm',
        on: bad.creatureIds[0] as string,
      });
      legacy(ctx, good.id, {
        id: ID(2),
        base: 'cinder-charm',
        rarity: 'rare',
        on: good.creatureIds[0] as string,
      });
      // The start does not throw: the good player is converted, the bad one is rolled back whole.
      expect(convert(ctx, createSeededRng('failure'))).toBe(1);
      expect(count(ctx.sql, 'gear_conversion', 'converted_at IS NULL')).toBe(1);
      expect(itemRows(ctx, bad.id)).toEqual([]);
      expect(partsOf(ctx, bad.id)).toEqual({});
      expect(itemRows(ctx, good.id)).toHaveLength(1);
      const secret = await ctx.core.createSession(ctx.guildId, {
        id: bad.id,
        displayName: bad.name,
      });
      const attempts: [string, string, unknown][] = [
        ['/api/gear', 'GET', undefined],
        [`/api/gear/${ID(1)}/equip`, 'POST', { creatureId: null }],
        ['/api/gear/equip-best', 'POST', { creatureIds: [bad.creatureIds[0]] }],
        [`/api/workshop/jobs/${ID(9)}/claim`, 'POST', { idempotencyKey: 'pending-claim-1' }],
      ];
      for (const [path, method, body] of attempts) {
        const res = await ctx.request(secret, path, method, body);
        expect(res.status, path).toBe(503);
        expect(await res.json<{ error: string }>()).toEqual({ error: 'gear_conversion_pending' });
      }
      // The other player is not held up.
      const goodSecret = await ctx.core.createSession(ctx.guildId, {
        id: good.id,
        displayName: good.name,
      });
      expect((await ctx.request(goodSecret, '/api/gear')).status).toBe(200);
      // Starting again tries the pending player once more (and fails again without throwing).
      ctx.core.migrate();
      expect(count(ctx.sql, 'gear_conversion', 'converted_at IS NULL')).toBe(1);
    });
  });

  it('shows jobs claimed before gear v2 in the gear view as the new shapes', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = player(ctx, 1, { level: 20 });
      const [a, b, c] = p.creatureIds as [string, string, string];
      const common = { xp: 48, skillXp: 48, skillLevel: 1, leveledUp: false };
      const insert = (
        id: string,
        creature: string,
        kind: string,
        input: object,
        result: object,
        n: number,
      ) =>
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at, claimed_at, result_json)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          id,
          p.id,
          creature,
          kind,
          JSON.stringify(input),
          ctx.clock.t - 9 * 3_600_000,
          ctx.clock.t - 5 * 3_600_000,
          ctx.clock.t - 4_000 * n,
          JSON.stringify({ ...result, ...common }),
        );
      insert(
        ID(1),
        a,
        'craft',
        { baseId: 'bark-band', rarity: 'rare', cost: { scrap: 18 } },
        { kind: 'craft', gearId: ID(50), baseId: 'bark-band', rarity: 'rare', upgraded: false },
        1,
      );
      insert(
        ID(2),
        b,
        'improve',
        { gearId: ID(51), secondaryIndex: 0, rarity: 'rare', cost: { scrap: 6 } },
        {
          kind: 'improve',
          gearId: ID(51),
          baseId: 'bark-band',
          secondaryIndex: 0,
          from: { stat: 'atk', bp: 100 },
          to: { stat: 'atk', bp: 200 },
        },
        2,
      );
      insert(
        ID(3),
        c,
        'enchant',
        { gearId: ID(52), enchantId: 'steady-hand', rarity: 'epic', cost: { glimmer: 1 } },
        { kind: 'enchant', gearId: ID(52), baseId: 'bark-band', enchantId: 'steady-hand' },
        3,
      );
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const res = await ctx.request(secret, '/api/gear');
      expect(res.status).toBe(200);
      const jobs = (
        await res.json<{
          jobs: {
            id: string;
            kind: string;
            input: { baseId?: string };
            result: Record<string, unknown> | null;
          }[];
        }>()
      ).jobs;
      const byId = new Map(jobs.map((j) => [j.id, j]));
      // The old craft names the new base of its slot and tint, at item level 1.
      expect(byId.get(ID(1))?.result).toMatchObject({
        kind: 'craft',
        baseId: 'acorn-cap',
        itemLevel: 1,
        xp: 48,
      });
      expect(byId.get(ID(1))?.input.baseId).toBe('acorn-cap');
      // The old Improve and Enchant become the display-only retired shape.
      for (const [id, was] of [
        [ID(2), 'improve'],
        [ID(3), 'enchant'],
      ] as const) {
        expect(byId.get(id)?.result).toEqual({ kind: 'retired', was, refund: {}, ...common });
      }
      // Claiming a claimed job again returns the same normalised result.
      const again = await ctx.request(secret, `/api/workshop/jobs/${ID(2)}/claim`, 'POST', {
        idempotencyKey: 'old-claim-again',
      });
      expect((await again.json<{ result: { kind: string } }>()).result.kind).toBe('retired');
    });
  });

  it('a craft running at the switch comes out at least as rare as its blueprint was, and pays the old hours of XP', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = player(ctx, 1, { level: 20 });
      const [a, b] = p.creatureIds as [string, string];
      const start = (id: string, creature: string, rarity: string) =>
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
           VALUES (?, ?, ?, 'craft', NULL, ?, ?, ?)`,
          id,
          p.id,
          creature,
          JSON.stringify({ baseId: 'bark-band', rarity, cost: { scrap: 18 } }),
          ctx.clock.t,
          ctx.clock.t + 8 * 3_600_000,
        );
      start(ID(1), a, 'epic');
      start(ID(2), b, 'rare');
      ctx.sql.exec('INSERT OR IGNORE INTO gear_conversion (user_id) VALUES (?)', p.id);
      convert(ctx, createSeededRng('floor'));
      ctx.clock.t += 13 * 3_600_000;
      const secret = await ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const claim = async (id: string, key: string) =>
        (
          await (
            await ctx.request(secret, `/api/workshop/jobs/${id}/claim`, 'POST', {
              idempotencyKey: key,
            })
          ).json<{ result: { rarity: string; xp: number; itemLevel: number } }>()
        ).result;
      const epic = await claim(ID(1), 'floor-claim-epic');
      const rare = await claim(ID(2), 'floor-claim-rare');
      expect(epic.rarity).toBe('epic');
      expect(['rare', 'epic']).toContain(rare.rarity);
      // XP follows the old hours of the blueprint's rarity (12 h and 8 h), not today's 3 h.
      expect(epic.xp).toBe(RULES.gear.legacy.craftHours.epic * RULES.gear.skill.xpPerHour);
      expect(rare.xp).toBe(RULES.gear.legacy.craftHours.rare * RULES.gear.skill.xpPerHour);
    });
  });
});
