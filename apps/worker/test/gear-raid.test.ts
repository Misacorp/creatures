import {
  RULES,
  applyGear,
  content,
  createSeededRng,
  dismantleYield,
  effectiveStats,
  festivalBaseFor,
  droppableBases,
  finaleUpgradeLevel,
  rollFinaleReward,
  rollGear,
  type GearRarity,
  type PartKind,
  type Rng,
} from '@creatures/game';
import { simulateFight, type FightInput } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { evaluate, loadLive, roundStartsOf } from '../src/raid-live';
import { loadCreatures } from '../src/raid-teams';
import { eventTimes } from '../src/raid-schedule';
import { insertItem, learnBlueprint, rowToItem, findItem } from '../src/gear-store';
import { runCore, type CoreContext } from './helpers';
import {
  DAY,
  HELSINKI,
  MINUTE,
  W02,
  count,
  forcePool,
  membersOf,
  nextGuild,
  rows,
  runRaid,
  seedPlayer,
  storedRuns,
  weekPayout,
  type Seeded,
} from './raid-helpers';

let tripCounter = 0;
const FINALE = eventTimes(W02.id, HELSINKI).finale;
const SUNDAY = W02.afterFinale;
const BIG = 50_000_000;

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

const grants = (ctx: CoreContext, userId?: string) =>
  rows<{ user_id: string; key: string; source: string; result_json: string }>(
    ctx.sql,
    `SELECT user_id, key, source, result_json FROM gear_grants
     ${userId === undefined ? '' : `WHERE user_id = '${userId}'`} ORDER BY created_at, rowid`,
  );

const itemsOf = (ctx: CoreContext, userId: string) =>
  rows<{
    id: string;
    base_id: string;
    rarity: GearRarity;
    level: number;
    source: string;
    rolls_json: string;
  }>(
    ctx.sql,
    'SELECT id, base_id, rarity, level, source, rolls_json FROM gear_items WHERE user_id = ? ORDER BY created_at, rowid',
    userId,
  );

const scrapOf = (ctx: CoreContext, userId: string): number =>
  rows<{ amount: number }>(
    ctx.sql,
    "SELECT amount FROM parts WHERE user_id = ? AND kind = 'scrap'",
    userId,
  )[0]?.amount ?? 0;

/** Seeds `n` players and opens the week. */
function openWeek(ctx: CoreContext, n: number, level = 15): Seeded[] {
  const players = Array.from({ length: n }, (_, i) => seedPlayer(ctx, i + 1, { level }));
  ctx.core.raid.currentWeek(HELSINKI);
  return players;
}

describe('drops from the weekly raid', () => {
  it('pays scrap for each cleared phase and one reward (a gear piece or a blueprint) for a won finale, to members only', async () => {
    const gearRng = counting('raid-gear');
    await runRaid(
      (ctx) => {
        const players = openWeek(ctx, 5);
        const outsider = seedPlayer(ctx, 90, { lastSeenAt: ctx.clock.t - 30 * DAY });
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = SUNDAY;
        ctx.core.raid.runDue(HELSINKI);
        const runs = storedRuns(ctx.sql);
        expect(runs.map((r) => r.phase)).toEqual(['phase1', 'phase2', 'finale']);
        expect(runs.every((r) => r.result.cleared)).toBe(true);

        const { rank } = weekPayout(ctx.sql);
        const members = membersOf(ctx.sql);
        expect(members).toHaveLength(5);
        const expectRng = createSeededRng('raid-gear');
        for (const userId of members) {
          const mine = grants(ctx, userId);
          expect(mine.map((g) => g.key)).toEqual([
            `raid:${W02.id}:phase1`,
            `raid:${W02.id}:phase2`,
            `raid:${W02.id}:finale`,
          ]);
          expect(mine.map((g) => g.source)).toEqual(['raid_phase', 'raid_phase', 'raid_finale']);
          // Scrap for the phases (3 and 4), then exactly one reward from the finale: an item or a blueprint.
          const items = itemsOf(ctx, userId);
          const finale = JSON.parse(mine[2]?.result_json ?? '{}') as {
            gear: unknown[];
            blueprints: unknown[];
          };
          expect(finale.gear.length + finale.blueprints.length).toBe(1);
          expect(items).toHaveLength(finale.gear.length);
          for (const item of items) expect(item.source).toBe('raid_finale');
          expect(scrapOf(ctx, userId)).toBe(
            RULES.gear.drops.phaseScrap.phase1 + RULES.gear.drops.phaseScrap.phase2,
          );
        }
        // The finale rolls came from the injected rng, one after the other in member order, at the
        // week's Boss Rank. Nobody knew a blueprint yet, so each is a new one.
        let gearDrops = 0;
        for (const userId of members) {
          const expected = rollFinaleReward(expectRng, rank, new Set());
          const items = itemsOf(ctx, userId);
          if (expected.kind === 'gear') {
            gearDrops++;
            expect(items[0]).toMatchObject({ base_id: expected.baseId, rarity: expected.rarity });
            expect(items[0]?.level).toBe(finaleUpgradeLevel(rank));
            expect(JSON.parse(items[0]?.rolls_json ?? '{}')).toEqual(expected.rolls);
          } else {
            expect(items).toEqual([]);
            expect(
              rows(ctx.sql, 'SELECT base_id, rarity FROM blueprints WHERE user_id = ?', userId),
            ).toEqual([{ base_id: expected.baseId, rarity: expected.rarity }]);
          }
        }
        // Nobody outside the party got anything.
        expect(grants(ctx, outsider.id)).toEqual([]);
        expect(count(ctx.sql, 'gear_items', `user_id = '${outsider.id}'`)).toBe(0);
        expect(count(ctx.sql, 'gear_items')).toBe(gearDrops);
        expect(players.length).toBe(5);

        // One analytics event per grant, with no actor (a raid payout is guild level).
        const logged = rows<{ props_json: string; actor_hash: string | null }>(
          ctx.sql,
          "SELECT props_json, actor_hash FROM analytics_events WHERE kind = 'gear_drop'",
        );
        expect(logged).toHaveLength(15);
        expect(logged.every((e) => e.actor_hash === null)).toBe(true);
        expect(logged.filter((e) => e.props_json.includes('"raid_finale"'))).toHaveLength(5);
      },
      { core: { gearRng } },
    );
  });

  it('is idempotent: running everything again changes nothing and draws nothing', async () => {
    const gearRng = counting('raid-gear-2');
    await runRaid(
      (ctx) => {
        openWeek(ctx, 4);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = SUNDAY;
        ctx.core.raid.runDue(HELSINKI);
        const before = {
          grants: grants(ctx),
          items: count(ctx.sql, 'gear_items'),
          events: count(ctx.sql, 'analytics_events', "kind = 'gear_drop'"),
          drawn: gearRng.drawn(),
        };
        // One reward each: a gear piece or a blueprint.
        expect(before.items + count(ctx.sql, 'blueprints')).toBe(4);
        expect(before.drawn).toBeGreaterThan(0);
        const week = ctx.core.raid.week(W02.id) as NonNullable<
          ReturnType<typeof ctx.core.raid.week>
        >;
        for (const phase of ['phase1', 'phase2', 'finale'] as const) {
          ctx.core.raid.resolvePhase(week, phase);
        }
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.settleDueLive();
        expect(grants(ctx)).toEqual(before.grants);
        expect(count(ctx.sql, 'gear_items')).toBe(before.items);
        expect(count(ctx.sql, 'analytics_events', "kind = 'gear_drop'")).toBe(before.events);
        expect(gearRng.drawn()).toBe(before.drawn);
      },
      { core: { gearRng } },
    );
  });

  it('pays nothing for stages that were not cleared', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 3, 3);
      forcePool(ctx.sql, BIG);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      expect(storedRuns(ctx.sql).every((r) => !r.result.cleared)).toBe(true);
      expect(count(ctx.sql, 'gear_grants')).toBe(0);
      expect(count(ctx.sql, 'gear_items')).toBe(0);
      expect(count(ctx.sql, 'parts')).toBe(0);
    });
  });

  it('pays the phase scrap but no gear when the finale is lost', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 3, 15);
      // Small enough that three players clear both phases (Phase 2 now leaves 15%, not 48%).
      forcePool(ctx.sql, 12_000);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      // The boss cannot fall in the finale.
      ctx.sql.exec('UPDATE raid_parties SET hp_max = ?, hp_current = ?', BIG, BIG);
      ctx.clock.t = SUNDAY;
      ctx.core.raid.runDue(HELSINKI);
      const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
      expect(finale?.result.cleared).toBe(false);
      expect(count(ctx.sql, 'gear_items')).toBe(0);
      expect(count(ctx.sql, 'gear_grants', "key LIKE '%:finale'")).toBe(0);
      expect(count(ctx.sql, 'gear_grants', "key LIKE '%:phase%'")).toBe(6);
    });
  });

  it('turns a drop into parts when the inventory is full, and never loses it', async () => {
    await runRaid(
      (ctx) => {
        const [first] = openWeek(ctx, 3) as [Seeded];
        for (let i = 0; i < RULES.gear.inventoryCap; i++) {
          insertItem(
            ctx.sql,
            first.id,
            { baseId: 'trail-charm', rarity: 'common', rolls: { primary: 300, secondary: [] } },
            'test',
            ctx.clock.t,
          );
        }
        // They know every blueprint, so the reward slot is gear and has to turn into parts.
        for (const base of droppableBases()) {
          learnBlueprint(ctx.sql, first.id, base.id, base.blueprint, ctx.clock.t);
        }
        forcePool(ctx.sql, 12_000);
        ctx.clock.t = SUNDAY;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'gear_items', `user_id = '${first.id}'`)).toBe(
          RULES.gear.inventoryCap,
        );
        const grant = grants(ctx, first.id).find((g) => g.key.endsWith(':finale'));
        const view = JSON.parse(grant?.result_json ?? '{}') as {
          gear: unknown[];
          converted: { baseId: string; rarity: GearRarity; level?: number }[];
          parts: Record<string, number>;
        };
        expect(view.gear).toEqual([]);
        expect(view.converted).toHaveLength(1);
        const yielded = dismantleYield({
          baseId: view.converted[0]?.baseId ?? '',
          rarity: view.converted[0]?.rarity ?? 'common',
          level: view.converted[0]?.level ?? 0,
        });
        expect(view.parts).toEqual(yielded);
        // The parts really arrived: the two phases plus the converted item.
        expect(scrapOf(ctx, first.id)).toBe(
          RULES.gear.drops.phaseScrap.phase1 +
            RULES.gear.drops.phaseScrap.phase2 +
            (yielded.scrap ?? 0),
        );
        // The others got their reward: an item or a blueprint.
        for (const userId of membersOf(ctx.sql).filter((id) => id !== first.id)) {
          const other = grants(ctx, userId).find((g) => g.key.endsWith(':finale'));
          const reward = JSON.parse(other?.result_json ?? '{}') as {
            gear: unknown[];
            blueprints: unknown[];
          };
          expect(reward.gear.length + reward.blueprints.length).toBe(1);
        }
      },
      { core: { gearRng: createSeededRng('full') } },
    );
  });

  it('GET /api/gear lists the loot with its keys, newest first, for the loot reveal', async () => {
    await runRaid(
      async (ctx) => {
        const players = openWeek(ctx, 3);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = SUNDAY;
        ctx.core.raid.runDue(HELSINKI);
        const [a] = players as [Seeded];
        const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
        const res = await ctx.request(secret, '/api/gear');
        const body = await res.json<{
          grants: { key: string; gear: { baseId: string }[]; parts: Record<string, number> }[];
        }>();
        expect(body.grants.map((g) => g.key)).toContain(`raid:${W02.id}:finale`);
        expect(body.grants.map((g) => g.key)).toContain(`welcome`);
        const finale = body.grants.find((g) => g.key === `raid:${W02.id}:finale`);
        expect(finale?.gear).toHaveLength(1);
        expect(JSON.stringify(body)).not.toContain('8000000000000000'); // no other player's id
      },
      { core: { gearRng: createSeededRng('reveal') } },
    );
  });
});

describe('the Festival piece', () => {
  const festival = (n: number) => ({
    monday: W02.monday + n * 7 * DAY,
    afterPhase2: W02.afterPhase2 + n * 7 * DAY,
    afterFinale: W02.afterFinale + n * 7 * DAY,
  });

  it('gives every member of a party that wins a Festival finale a Festival piece, once, next to the normal roll', async () => {
    await runRaid(
      (ctx) => {
        const week = festival(4); // 2027-W06
        Array.from({ length: 4 }, (_, i) => seedPlayer(ctx, i + 1, { level: 15 }));
        ctx.clock.t = week.monday;
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.currentWeek(HELSINKI);
        const row = rows<{ week_id: string; festival: number; festival_species: string }>(
          ctx.sql,
          'SELECT week_id, festival, festival_species FROM raid_weeks',
        )[0];
        expect(row?.festival).toBe(1);
        const species = content.creatures.find((c) => c.id === row?.festival_species);
        const piece = festivalBaseFor(species?.element ?? 'tide');
        ctx.clock.t = week.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        ctx.sql.exec('UPDATE raid_parties SET hp_current = 1');
        ctx.clock.t = week.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(true);

        for (const userId of membersOf(ctx.sql, 1, row?.week_id)) {
          const items = itemsOf(ctx, userId);
          // The Festival piece, and the normal reward slot next to it (an item or a blueprint).
          const reward = grants(ctx, userId).find((g) => g.key.endsWith(':finale'));
          const slot = JSON.parse(reward?.result_json ?? '{}') as {
            gear: unknown[];
            blueprints: unknown[];
          };
          expect(slot.gear.length + slot.blueprints.length).toBe(1);
          expect(items.map((i) => i.source).sort()).toEqual(
            slot.gear.length === 1 ? ['festival', 'raid_finale'] : ['festival'],
          );
          const festive = items.find((i) => i.source === 'festival');
          expect(festive).toMatchObject({ base_id: piece.id, rarity: 'festival' });
          expect(
            (JSON.parse(festive?.rolls_json ?? '{}') as { secondary: unknown[] }).secondary,
          ).toHaveLength(RULES.gear.rarity.festival.secondaries);
        }
        // Idempotent.
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.settleDueLive();
        expect(count(ctx.sql, 'gear_items', "source = 'festival'")).toBe(4);
        expect(count(ctx.sql, 'gear_grants', "source = 'festival'")).toBe(4);
      },
      { start: W02.monday + 4 * 7 * DAY, core: { gearRng: createSeededRng('festival') } },
    );
  });

  it('gives no Festival piece in a normal week or after a lost Festival', async () => {
    await runRaid(
      (ctx) => {
        openWeek(ctx, 3);
        forcePool(ctx.sql, 20_000);
        ctx.clock.t = SUNDAY;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'gear_items', "source = 'festival'")).toBe(0);
      },
      { core: { gearRng: createSeededRng('normal') } },
    );
    await runRaid(
      (ctx) => {
        const week = festival(4);
        Array.from({ length: 3 }, (_, i) => seedPlayer(ctx, i + 1, { level: 3 }));
        ctx.clock.t = week.monday;
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.clock.t = week.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        ctx.sql.exec('UPDATE raid_parties SET hp_max = ?, hp_current = ?', BIG, BIG);
        ctx.clock.t = week.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        expect(storedRuns(ctx.sql).find((r) => r.phase === 'finale')?.result.cleared).toBe(false);
        expect(count(ctx.sql, 'gear_items')).toBe(0);
      },
      { start: W02.monday + 4 * 7 * DAY, core: { gearRng: createSeededRng('lost') } },
    );
  });
});

/** Gives a player's creature an item straight into the tables, and equips it. */
function wear(
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  baseId: string,
  rarity: GearRarity,
  options: { level?: number; enchantId?: string; seed?: string } = {},
): string {
  const id = insertItem(
    ctx.sql,
    userId,
    {
      baseId,
      rarity,
      rolls: rollGear(createSeededRng(options.seed ?? `wear:${baseId}`), baseId, rarity),
    },
    'test',
    ctx.clock.t,
  );
  ctx.sql.exec(
    'UPDATE gear_items SET equipped_on = ?, level = ?, enchant_id = ? WHERE id = ?',
    creatureId,
    options.level ?? 0,
    options.enchantId ?? null,
    id,
  );
  return id;
}

describe('gear in fights', () => {
  it('folds the worn item into the fight stats and crit, and stores them in the fight input', async () => {
    await runRaid(
      (ctx) => {
        const players = openWeek(ctx, 4, 12);
        const [a] = players as [Seeded];
        const creatureId = a.creatureIds[0] as string;
        const row = rows<{ species: string; level: number; fusion_count: number }>(
          ctx.sql,
          'SELECT species, level, fusion_count FROM creatures WHERE id = ?',
          creatureId,
        )[0] as { species: string; level: number; fusion_count: number };
        const species = content.creatures.find((c) => c.id === row.species);
        if (species === undefined) throw new Error('species');
        // A rare band with a crit secondary, upgraded: attack, crit chance and crit damage all move.
        const itemId = wear(ctx, a.id, creatureId, 'bark-band', 'rare', {
          level: 3,
          enchantId: 'steady-hand',
        });
        const item = rowToItem(
          findItem(ctx.sql, a.id, itemId) as NonNullable<ReturnType<typeof findItem>>,
        );
        const expected = applyGear(
          effectiveStats(species, row.level, row.fusion_count),
          species.crit,
          species.role,
          species.element,
          item,
        );
        expect(expected.stats.atk).toBeGreaterThan(effectiveStats(species, row.level, 0).atk);

        forcePool(ctx.sql, BIG);
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const [p1] = storedRuns(ctx.sql);
        const slot = p1?.input.row.find((s) => s.id === creatureId);
        // The stored fight input carries the final stats (and crit), not the base ones.
        expect(slot?.stats).toEqual(expected.stats);
        expect(slot?.crit).toEqual(expected.crit);
        // A creature without gear keeps exactly what it always had.
        const other = p1?.input.row.find((s) => s.id === a.creatureIds[1]);
        const otherRow = rows<{ species: string; level: number; fusion_count: number }>(
          ctx.sql,
          'SELECT species, level, fusion_count FROM creatures WHERE id = ?',
          a.creatureIds[1] as string,
        )[0] as { species: string; level: number; fusion_count: number };
        const otherSpecies = content.creatures.find((c) => c.id === otherRow.species);
        if (otherSpecies === undefined) throw new Error('species');
        expect(other?.stats).toEqual(
          effectiveStats(otherSpecies, otherRow.level, otherRow.fusion_count),
        );
        expect(other?.crit).toEqual(otherSpecies.crit);
      },
      { start: W02.friday - 2 * 3_600_000, core: { gearRng: createSeededRng('fold') } },
    );
  });

  it('a fight with gear differs from one without, and both replay exactly from the stored input', async () => {
    /** Plays phase 1 of a fixed week; `geared` puts an epic item on every creature. */
    const play = (geared: boolean) =>
      runRaid(
        (ctx) => {
          const players = openWeek(ctx, 4, 12);
          if (geared) {
            for (const p of players) {
              for (const creatureId of p.creatureIds) {
                wear(ctx, p.id, creatureId, 'pearl-trinket', 'epic', { level: 5 });
              }
            }
          }
          forcePool(ctx.sql, BIG);
          ctx.clock.t = W02.afterFinale;
          ctx.core.raid.runDue(HELSINKI);
          return storedRuns(ctx.sql);
        },
        { core: { gearRng: createSeededRng('same-gear') } },
      );
    const plain = await play(false);
    const geared = await play(true);
    const [p0] = plain as [(typeof plain)[number]];
    const [g0] = geared as [(typeof geared)[number]];
    // Same seed (the raid rng is seeded the same), different inputs and different fights.
    expect(g0.seed).toBe(p0.seed);
    expect(g0.input.row.map((s) => s.stats)).not.toEqual(p0.input.row.map((s) => s.stats));
    expect(g0.summary.damage).toBeGreaterThan(p0.summary.damage);
    expect(g0.result.bossHpEnd).toBeLessThan(p0.result.bossHpEnd);
    // Every stored fight replays exactly from its own stored input and seed.
    for (const run of [...plain, ...geared]) {
      const replay = simulateFight(run.input, createSeededRng(run.seed));
      expect(replay).toEqual(run.result);
    }
  });

  it('keeps a stored fight exact after the gear is changed or dismantled', async () => {
    await runRaid(
      (ctx) => {
        const [a] = openWeek(ctx, 3, 12) as [Seeded];
        const creatureId = a.creatureIds[0] as string;
        const itemId = wear(ctx, a.id, creatureId, 'pearl-trinket', 'epic', { level: 5 });
        forcePool(ctx.sql, BIG);
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const before = storedRuns(ctx.sql);
        const slotBefore = before[0]?.input.row.find((s) => s.id === creatureId)?.stats;
        // Take the item away and level the creature: the old fights do not change.
        ctx.sql.exec('DELETE FROM gear_items WHERE id = ?', itemId);
        ctx.sql.exec('UPDATE creatures SET level = level + 1 WHERE id = ?', creatureId);
        const after = storedRuns(ctx.sql);
        expect(after).toEqual(before);
        for (const run of after) {
          expect(simulateFight(run.input, createSeededRng(run.seed))).toEqual(run.result);
        }
        expect(slotBefore?.atk).toBeGreaterThan(0);
      },
      { core: { gearRng: createSeededRng('after') } },
    );
  });

  it('counts gear in a creature’s power, so the automatic team prefers the geared creature', async () => {
    await runRaid(
      (ctx) => {
        const a = seedPlayer(ctx, 1, {
          level: 5,
          creatures: 4,
          species: ['splashet', 'cindle', 'sproutle', 'zipmouse'],
        });
        const plain = loadCreatures(ctx.sql, a.id);
        expect(plain.every((c) => c.power > 0)).toBe(true);
        const weakest = [...plain].sort((x, y) => x.power - y.power)[0];
        if (weakest === undefined) throw new Error('no creatures');
        wear(ctx, a.id, weakest.id, 'pearl-trinket', 'epic', { level: 5 });
        const geared = loadCreatures(ctx.sql, a.id).find((c) => c.id === weakest.id);
        expect(geared?.power).toBeGreaterThan(weakest.power);
        expect(geared?.stats.atk).toBeGreaterThan(weakest.stats.atk);
        // Busy creatures are still part of the raid roster (as on an expedition).
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
           VALUES ('00000000-0000-4000-8000-000000000001', ?, ?, 'craft', '{}', 0, 1)`,
          a.id,
          weakest.id,
        );
        expect(loadCreatures(ctx.sql, a.id).map((c) => c.id)).toContain(weakest.id);
      },
      { core: { gearRng: createSeededRng('power') } },
    );
  });
});

describe('practice fights', () => {
  it('use the worn gear, store the final stats in the practice input, and pay no loot', async () => {
    await runRaid(
      (ctx) => {
        const players = openWeek(ctx, 2, 9);
        const [a] = players as [Seeded];
        const creatureId = a.creatureIds[0] as string;
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        wear(ctx, a.id, creatureId, 'pearl-trinket', 'epic', { level: 5 });
        const worn = loadCreatures(ctx.sql, a.id).find((c) => c.id === creatureId);
        const grantsBefore = count(ctx.sql, 'gear_grants');
        const itemsBefore = count(ctx.sql, 'gear_items');

        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        const row = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 1',
        )[0];
        const slot = (JSON.parse(row?.input ?? '{}') as FightInput).row.find(
          (s) => s.id === creatureId,
        );
        expect(slot?.stats).toEqual(worn?.stats);
        expect(slot?.stats?.atk).toBeGreaterThan(0);
        // Even once it is over, a practice fight gives nothing.
        ctx.clock.t += 10 * 60_000;
        ctx.core.raid.settleDueLive();
        expect(count(ctx.sql, 'gear_grants')).toBe(grantsBefore);
        expect(count(ctx.sql, 'gear_items')).toBe(itemsBefore);
      },
      { core: { raidPractice: true, gearRng: createSeededRng('practice') } },
    );
  });
});

describe('stats freeze when the live finale starts', () => {
  /** The end of the last real fight (copied from the live finale tests). */
  const atEnd = (ctx: CoreContext): void => {
    const ends = rows<{ party: number }>(
      ctx.sql,
      'SELECT party FROM raid_live WHERE practice = 0',
    ).map((r) => {
      const row = loadLive(ctx.sql, W02.id, r.party, false);
      if (row === null) throw new Error('no stored fight');
      return roundStartsOf(row, evaluate(row, ctx.clock.t).result).endsAt;
    });
    ctx.clock.t = Math.max(...ends) + 1000;
  };

  it('uses the gear worn at the start; later changes never touch the stored fight, and it replays exactly', async () => {
    await runRaid(
      (ctx) => {
        const players = Array.from({ length: 2 }, (_, i) => seedPlayer(ctx, i + 1, { level: 12 }));
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        const [a] = players as [Seeded];
        const creatureId = a.creatureIds[0] as string;
        const itemId = wear(ctx, a.id, creatureId, 'pearl-trinket', 'epic', { level: 5 });
        const worn = loadCreatures(ctx.sql, a.id).find((c) => c.id === creatureId);

        // The finale starts: the fight is frozen with the stats of this moment.
        ctx.clock.t = FINALE;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_live', 'practice = 0')).toBeGreaterThan(0);
        const live = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 0',
        );
        const frozen = live
          .map((r) => JSON.parse(r.input) as FightInput)
          .flatMap((i) => i.row)
          .find((s) => s.id === creatureId);
        expect(frozen?.stats).toEqual(worn?.stats);

        // During the fight: take the item off, dismantle it, level the creature up. None of it
        // reaches the frozen fight.
        ctx.clock.t = FINALE + 30_000;
        ctx.sql.exec('UPDATE gear_items SET equipped_on = NULL WHERE id = ?', itemId);
        ctx.sql.exec('DELETE FROM gear_items WHERE id = ?', itemId);
        ctx.sql.exec('UPDATE creatures SET level = level + 3 WHERE id = ?', creatureId);
        const midway = rows<{ input: string }>(
          ctx.sql,
          'SELECT input FROM raid_live WHERE practice = 0',
        );
        expect(midway).toEqual(live);

        atEnd(ctx);
        ctx.core.raid.settleDueLive();
        const finale = storedRuns(ctx.sql).find((r) => r.phase === 'finale');
        expect(finale).toBeDefined();
        const slot = finale?.input.row.find((s) => s.id === creatureId);
        expect(slot?.stats).toEqual(worn?.stats);
        // And it replays exactly from what was stored, with the item long gone.
        const run = finale as NonNullable<typeof finale>;
        expect(simulateFight(run.input, createSeededRng(run.seed))).toEqual(run.result);
      },
      { core: { gearRng: createSeededRng('freeze') } },
    );
  });

  it('gear equipped during a phase that already resolved counts from the next one, not the past', async () => {
    await runRaid(
      (ctx) => {
        const [a] = openWeek(ctx, 3, 12) as [Seeded];
        const creatureId = a.creatureIds[0] as string;
        forcePool(ctx.sql, BIG);
        ctx.clock.t = W02.afterPhase1;
        ctx.core.raid.runDue(HELSINKI);
        const p1 = storedRuns(ctx.sql).find((r) => r.phase === 'phase1');
        expect(p1).toBeDefined();
        const plainStats = p1?.input.row.find((s) => s.id === creatureId)?.stats;
        wear(ctx, a.id, creatureId, 'pearl-trinket', 'epic', { level: 5 });
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        const runs = storedRuns(ctx.sql);
        // Phase 1 is as it was fought; phase 2 sees the item.
        expect(
          runs.find((r) => r.phase === 'phase1')?.input.row.find((s) => s.id === creatureId)?.stats,
        ).toEqual(plainStats);
        const p2 = runs
          .find((r) => r.phase === 'phase2')
          ?.input.row.find((s) => s.id === creatureId)?.stats;
        expect(p2?.atk).toBeGreaterThan(plainStats?.atk ?? 0);
      },
      { core: { gearRng: createSeededRng('next') } },
    );
  });
});

describe('expedition loot', () => {
  /** A player with creatures and Bait, with a session; the gear rng is the one the test injects. */
  async function explorer(ctx: CoreContext, n: number, species?: string[]) {
    // Early in the raid week, so no phase resolves while the trips run.
    ctx.clock.t = Date.parse('2027-01-12T06:00:00Z');
    const seeded = seedPlayer(ctx, n, {
      level: 5,
      ...(species === undefined ? {} : { species }),
    });
    ctx.sql.exec(
      'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET expeditions_claimed = 1',
      seeded.id,
    );
    ctx.core.credit({
      userId: seeded.id,
      currency: 'bait',
      amount: 500,
      source: 'test',
      idempotencyKey: `bait:${seeded.id}`,
    });
    let secret = await ctx.core.createSession(ctx.guildId, {
      id: seeded.id,
      displayName: seeded.name,
    });
    let at = ctx.clock.t;
    const call = async (method: string, path: string, body?: unknown) => {
      if (ctx.clock.t - at >= 30 * MINUTE) {
        secret = await ctx.core.createSession(ctx.guildId, {
          id: seeded.id,
          displayName: seeded.name,
        });
        at = ctx.clock.t;
      }
      const res = await ctx.request(secret, path, method, body);
      return { status: res.status, body: await res.json<Record<string, unknown>>() };
    };
    const trip = async (
      index: number,
      duration: 'short' | 'medium' | 'long',
      destination = 'tidepools',
    ) => {
      const sent = await call('POST', '/api/expeditions', {
        creatureId: seeded.creatureIds[index],
        destination,
        duration,
        supplies: [],
        idempotencyKey: `trip-${String(++tripCounter).padStart(8, '0')}-${duration}`,
      });
      expect(sent.status).toBe(200);
      return sent.body['expedition'] as { id: string; startedAt: number; endsAt: number };
    };
    return { ...seeded, call, trip };
  }

  type Loot = {
    gear: unknown[];
    converted: unknown[];
    parts: Partial<Record<PartKind, number>>;
    blueprints: { baseId: string; rarity: string; duplicate: boolean }[];
  };
  const lootOf = (res: { body: Record<string, unknown> }) =>
    (res.body['result'] as { loot: Loot }).loot;
  /** The scrap of the rank-up gifts a claim paid: a trip that raises the rank brings its gift too. */
  const giftScrapOf = (res: { body: Record<string, unknown> }): number =>
    (
      (res.body['result'] as { rankGifts?: { parts: { scrap?: number } }[] }).rankGifts ?? []
    ).reduce((n, g) => n + (g.parts.scrap ?? 0), 0);
  /** The `gear_drop` events of one source (the rank gift has its own). */
  const dropEvents = (ctx: { sql: SqlStorage }, source: string) =>
    rows<{ props_json: string }>(
      ctx.sql,
      "SELECT props_json FROM analytics_events WHERE kind = 'gear_drop' ORDER BY id",
    ).filter((e) => (JSON.parse(e.props_json) as { source: string }).source === source);

  it('pays scrap by duration to the claimer, with the loot in the claim result and the stored state', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // No Guard among them: a Guard brings back more parts.
        const p = await explorer(ctx, 1, ['cindle', 'splashet', 'zipmouse']);
        for (const [index, duration] of [
          [0, 'short'],
          [1, 'medium'],
          [2, 'long'],
        ] as const) {
          const scrap = RULES.expeditions.lengths[duration].loot.scrap;
          const exp = await p.trip(index, duration);
          ctx.clock.t = exp.endsAt;
          const before = scrapOf(ctx, p.id);
          const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
          expect(res.status).toBe(200);
          const loot = lootOf(res);
          expect(loot.parts.scrap ?? 0).toBe(scrap);
          expect(scrapOf(ctx, p.id)).toBe(before + scrap + giftScrapOf(res));
          // The same loot is in the state the client reloads.
          const state = (await p.call('GET', '/api/state')).body as {
            expeditions: { id: string; result: { loot: Loot } | null }[];
          };
          expect(state.expeditions.find((e) => e.id === exp.id)?.result?.loot).toEqual(loot);
        }
      },
      { gearRng: createSeededRng('exp-scrap') },
    );
  });

  it('pays the share of the scrap that was caught on a recall, and nothing else', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await explorer(ctx, 1);
        const long = RULES.expeditions.lengths.long;
        const exp = await p.trip(0, 'long');
        ctx.clock.t = exp.startedAt + 8 * 3_600_000; // floor(rolls * 8 / 12) rolls
        const caught = Math.floor((long.rolls * 8) / 12);
        const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
        const result = res.body['result'] as { recalled: boolean; catches: unknown[]; loot: Loot };
        expect(result.recalled).toBe(true);
        expect(result.catches).toHaveLength(caught);
        // The share of the scrap that was caught, and nothing else.
        const share = Math.floor((long.loot.scrap * caught) / long.rolls);
        expect(result.loot.parts).toEqual(share > 0 ? { scrap: share } : {});
        expect(result.loot.blueprints).toEqual([]);
      },
      { gearRng: createSeededRng('exp-recall') },
    );
  });

  it('can bring back a shard of the explorer’s element, a glimmer and a blueprint on a 12 hour trip', async () => {
    // Draws in order: shard chance, glimmer chance, blueprint chance, the blueprint's rarity and base, then the supply chance and kind.
    const script = Array.from({ length: 20 }, () => 0);
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await explorer(ctx, 1, ['cindle', 'splashet', 'sproutle']);
        const scrap = RULES.expeditions.lengths.long.loot.scrap;
        const exp = await p.trip(0, 'long', 'ember-caves'); // the shard is of the place's element
        ctx.clock.t = exp.endsAt;
        const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
        const loot = lootOf(res);
        const gift = giftScrapOf(res);
        expect(loot.parts).toEqual({ scrap, 'ember-shard': 1, glimmer: 1 });
        // The draw of 0 also finds a supply: the explorer is rank 1, so a plain one.
        expect((loot as { supplies?: string[] }).supplies).toEqual(['lure-basic']);
        expect(loot.blueprints).toEqual([
          { baseId: 'trail-charm', rarity: 'common', duplicate: false },
        ]);
        expect(rows(ctx.sql, 'SELECT base_id FROM blueprints')).toEqual([
          { base_id: 'trail-charm' },
        ]);
        expect(
          rows(ctx.sql, 'SELECT kind, amount FROM parts WHERE user_id = ? ORDER BY kind', p.id),
        ).toEqual([
          { kind: 'ember-shard', amount: 1 },
          { kind: 'glimmer', amount: 1 },
          { kind: 'scrap', amount: scrap + gift },
        ]);
        // A blueprint the player knows already turns into scrap.
        const again = await p.trip(1, 'long', 'tidepools');
        ctx.clock.t = again.endsAt;
        const res2 = await p.call('POST', `/api/expeditions/${again.id}/claim`, {});
        const loot2 = lootOf(res2);
        expect(loot2.blueprints).toEqual([
          { baseId: 'trail-charm', rarity: 'common', duplicate: true },
        ]);
        expect(loot2.parts.scrap).toBe(scrap + RULES.gear.drops.duplicateBlueprintScrap);
        expect(count(ctx.sql, 'blueprints')).toBe(1);
        const events = dropEvents(ctx, 'expedition');
        expect(events).toHaveLength(2);
        expect(JSON.parse(events[0]?.props_json ?? '{}')).toEqual({
          source: 'expedition',
          gear: [],
          converted: 0,
          scrap,
          shards: 1,
          glimmer: 1,
          blueprint: 'trail-charm',
          blueprintDuplicate: false,
          supplies: 1,
          parts: { scrap, 'ember-shard': 1, glimmer: 1 },
        });
        const actor = rows<{ actor_hash: string | null }>(
          ctx.sql,
          "SELECT actor_hash FROM analytics_events WHERE kind = 'gear_drop' ORDER BY id",
        )[0]?.actor_hash;
        expect(actor).toMatch(/^[0-9a-f]{32}$/);
      },
      {
        gearRng: {
          ...(() => {
            const rest = createSeededRng('exp-bp');
            let i = 0;
            return {
              nextU32: () => script[i++] ?? rest.nextU32(),
            };
          })(),
        },
      },
    );
  });

  it('claiming again returns the stored result: no second payout, no second draw', async () => {
    const gearRng = counting('exp-twice');
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await explorer(ctx, 1);
        const exp = await p.trip(0, 'long');
        ctx.clock.t = exp.endsAt;
        const first = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
        const drawn = gearRng.drawn();
        const parts = rows(ctx.sql, 'SELECT kind, amount FROM parts ORDER BY kind');
        const again = await Promise.all(
          Array.from({ length: 4 }, () => p.call('POST', `/api/expeditions/${exp.id}/claim`, {})),
        );
        for (const r of again) expect(lootOf(r)).toEqual(lootOf(first));
        expect(gearRng.drawn()).toBe(drawn);
        expect(rows(ctx.sql, 'SELECT kind, amount FROM parts ORDER BY kind')).toEqual(parts);
        expect(count(ctx.sql, 'gear_grants', "source = 'expedition'")).toBe(1);
        expect(dropEvents(ctx, 'expedition')).toHaveLength(1);
      },
      { gearRng },
    );
  });
});
