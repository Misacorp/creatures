import {
  RULES,
  applyGear,
  blueprintBases,
  content,
  createSeededRng,
  dismantleYield,
  effectiveStats,
  finaleItemLevel,
  festivalBases,
  rollFinaleReward,
  type GearRarity,
  type PartKind,
  type Rng,
} from '@creatures/game';
import { simulateFight, type FightInput } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { evaluate, loadLive, roundStartsOf } from '../src/raid-live';
import { loadCreatures } from '../src/raid-teams';
import { eventTimes } from '../src/raid-schedule';
import { learnBlueprint, rowToItem, findItem, wearerOf } from '../src/gear-store';
import { giveItem } from './gear-helpers';
import { runCore, type CoreContext } from './helpers';
import {
  DAY,
  HELSINKI,
  W02,
  count,
  forcePool,
  membersOf,
  nextGuild,
  rows,
  runRaid,
  seedMember,
  seedPlayer,
  storedRuns,
  weekPayout,
  type Seeded,
} from './raid-helpers';
import { give, sessionCaller } from './kit';

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
    item_level: number;
    source: string;
    lines_json: string;
  }>(
    ctx.sql,
    'SELECT id, base_id, rarity, item_level, source, lines_json FROM gear_items WHERE user_id = ? ORDER BY created_at, rowid',
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
  const players = Array.from({ length: n }, (_, i) => seedMember(ctx, i + 1, { level }));
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
        const bossId = rows<{ boss_id: string }>(ctx.sql, 'SELECT boss_id FROM raid_weeks')[0]
          ?.boss_id;
        const element = content.bosses.find((b) => b.id === bossId)?.element ?? 'tide';
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
          const expected = rollFinaleReward(expectRng, rank, element, new Set());
          const items = itemsOf(ctx, userId);
          if (expected.kind === 'gear') {
            gearDrops++;
            expect(items[0]).toMatchObject({
              base_id: expected.item.baseId,
              rarity: expected.item.rarity,
              // 3 + Boss Rank, the boss's element as the tag.
              item_level: Math.min(20, 3 + rank),
            });
            expect(JSON.parse(items[0]?.lines_json ?? '[]')).toEqual(expected.item.lines);
            expect(expected.item.tag === element || expected.item.slot === 'charm').toBe(true);
          } else {
            expect(items).toEqual([]);
            expect(
              rows(ctx.sql, 'SELECT base_id FROM blueprints WHERE user_id = ?', userId),
            ).toEqual([{ base_id: expected.baseId }]);
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
          giveItem(ctx.sql, first.id, 'trail-cap', { now: ctx.clock.t });
        }
        // They know every blueprint, so the reward slot is gear and has to turn into parts.
        for (const base of blueprintBases()) {
          learnBlueprint(ctx.sql, first.id, base.id, ctx.clock.t);
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
          converted: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
          parts: Record<string, number>;
        };
        expect(view.gear).toEqual([]);
        expect(view.converted).toHaveLength(1);
        const yielded = dismantleYield({
          baseId: view.converted[0]?.baseId ?? '',
          rarity: view.converted[0]?.rarity ?? 'common',
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
        Array.from({ length: 4 }, (_, i) => seedMember(ctx, i + 1, { level: 15 }));
        ctx.clock.t = week.monday;
        ctx.sql.exec('UPDATE players SET last_seen_at = ?', ctx.clock.t);
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.currentWeek(HELSINKI);
        const row = rows<{ week_id: string; festival: number; festival_species: string }>(
          ctx.sql,
          'SELECT week_id, festival, festival_species FROM raid_weeks',
        )[0];
        expect(row?.festival).toBe(1);
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
          // A Festival base (which one is drawn; the element of the week's creature plays no part), special,
          // not stronger: a normal rarity, the lines of that rarity, the finale's item level.
          expect(festivalBases().map((b) => b.id)).toContain(festive?.base_id);
          expect(['common', 'rare', 'epic']).toContain(festive?.rarity);
          expect(JSON.parse(festive?.lines_json ?? '[]')).toHaveLength(
            RULES.gear.rolledLines[festive?.rarity as 'common' | 'rare' | 'epic'],
          );
          expect(festive?.item_level).toBe(finaleItemLevel(weekPayout(ctx.sql).rank));
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
        Array.from({ length: 3 }, (_, i) => seedMember(ctx, i + 1, { level: 3 }));
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

/** Lines that fold into the creature's own numbers wherever it stands (no position line), so the stored stats equal the fold. */
const PLAIN_LINES: [string, number][] = [
  ['attack-local-pct', 2],
  ['hp-local-flat', 1],
  ['crit-damage', 1],
];

/** Gives a player's creature an item straight into the tables, and equips it. */
function wear(
  ctx: CoreContext,
  userId: string,
  creatureId: string,
  baseId: string,
  rarity: GearRarity,
  options: { level?: number; lines?: [string, number][]; seed?: string } = {},
): string {
  const id = giveItem(ctx.sql, userId, baseId, {
    rarity,
    level: options.level ?? 1,
    seed: options.seed ?? `wear:${baseId}`,
    now: ctx.clock.t,
    ...(options.lines === undefined ? {} : { lines: options.lines }),
  });
  ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', creatureId, id);
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
        // A rare Hat with Attack, crit chance and a First pounce: stats, crit and the sheet all move.
        const itemId = wear(ctx, a.id, creatureId, 'coal-warm-cap', 'rare', {
          level: 12,
          lines: [
            ['attack', 2],
            ['crit-chance', 2],
          ],
        });
        wear(ctx, a.id, creatureId, 'ember-muffler', 'rare', {
          level: 12,
          lines: [
            ['area-ward', 2],
            ['all-damage-taken', 2],
          ],
        });
        const worn = rows<{ id: string }>(
          ctx.sql,
          'SELECT id FROM gear_items WHERE equipped_on = ? ORDER BY slot',
          creatureId,
        ).map((r) => r.id);
        expect(worn).toHaveLength(2);
        expect(worn).toContain(itemId);
        const items = worn.map((id) =>
          rowToItem(findItem(ctx.sql, a.id, id) as NonNullable<ReturnType<typeof findItem>>),
        );
        const expected = applyGear(
          effectiveStats(species, row.level, row.fusion_count),
          species.crit,
          wearerOf(species),
          items,
        );
        expect(expected.mods).toEqual({ areaBp: 700, takenBp: 400 });
        expect(expected.stats.atk).toBeGreaterThan(effectiveStats(species, row.level, 0).atk);

        const otherRow = rows<{ species: string; level: number; fusion_count: number }>(
          ctx.sql,
          'SELECT species, level, fusion_count FROM creatures WHERE id = ?',
          a.creatureIds[1] as string,
        )[0] as { species: string; level: number; fusion_count: number };
        const otherSpecies = content.creatures.find((c) => c.id === otherRow.species);
        if (otherSpecies === undefined) throw new Error('species');

        forcePool(ctx.sql, BIG);
        ctx.clock.t = W02.afterFinale;
        ctx.core.raid.runDue(HELSINKI);
        const [p1] = storedRuns(ctx.sql);
        const slot = p1?.input.row.find((s) => s.id === creatureId);
        // The stored fight input carries the final stats (and crit), not the base ones.
        expect(slot?.stats).toEqual(expected.stats);
        expect(slot?.crit).toEqual(expected.crit);
        // And the modifier sheet of its gear, which the engine reads in the fight.
        expect(slot?.mods).toEqual(expected.mods);
        // A creature without gear keeps exactly what it always had.
        const other = p1?.input.row.find((s) => s.id === a.creatureIds[1]);
        expect(other?.stats).toEqual(
          effectiveStats(otherSpecies, otherRow.level, otherRow.fusion_count),
        );
        expect(other?.crit).toEqual(otherSpecies.crit);
        expect(other?.mods).toBeUndefined();
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
                wear(ctx, p.id, creatureId, 'trail-cap', 'epic', { level: 5 });
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
        const itemId = wear(ctx, a.id, creatureId, 'trail-cap', 'epic', { level: 5 });
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
        const a = seedMember(ctx, 1, {
          level: 5,
          creatures: 4,
          species: ['splashet', 'cindle', 'sproutle', 'zipmouse'],
        });
        const plain = loadCreatures(ctx.sql, a.id);
        expect(plain.every((c) => c.power > 0)).toBe(true);
        const weakest = [...plain].sort((x, y) => x.power - y.power)[0];
        if (weakest === undefined) throw new Error('no creatures');
        wear(ctx, a.id, weakest.id, 'trail-cap', 'epic', {
          level: 5,
          lines: [
            ['attack-local-flat', 3],
            ['attack-local-pct', 3],
          ],
        });
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
        wear(ctx, a.id, creatureId, 'trail-cap', 'epic', { level: 5, lines: PLAIN_LINES });
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
        const players = Array.from({ length: 2 }, (_, i) => seedMember(ctx, i + 1, { level: 12 }));
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.clock.t = W02.afterPhase2;
        ctx.core.raid.runDue(HELSINKI);
        forcePool(ctx.sql, BIG, BIG, 1);
        const [a] = players as [Seeded];
        const creatureId = a.creatureIds[0] as string;
        const itemId = wear(ctx, a.id, creatureId, 'trail-cap', 'epic', {
          level: 5,
          lines: PLAIN_LINES,
        });
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
        wear(ctx, a.id, creatureId, 'trail-cap', 'epic', { level: 5 });
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
    const seeded = seedMember(ctx, n, {
      level: 5,
      ...(species === undefined ? {} : { species }),
    });
    ctx.sql.exec(
      'INSERT INTO player_progress (user_id, expeditions_claimed) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET expeditions_claimed = 1',
      seeded.id,
    );
    give(ctx, seeded.id, { bait: 500 });
    const { call } = await sessionCaller(ctx, { id: seeded.id, displayName: seeded.name });
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
    blueprints: { baseId: string; duplicate: boolean }[];
  };
  const lootOf = (res: { body: Record<string, unknown> }) =>
    (res.body['result'] as { loot: Loot }).loot;
  /** The scrap of the rank-up gifts a claim paid: a trip that raises the rank brings its gift too. */
  const giftScrapOf = (res: { body: Record<string, unknown> }): number =>
    (
      (res.body['result'] as { rankGifts?: { parts: { scrap?: number } }[] }).rankGifts ?? []
    ).reduce((n, g) => n + (g.parts.scrap ?? 0), 0);
  /**
   * Makes every table of a tick certain (and no gear piece), for a test that needs the loot of a trip to
   * be known. Returns the function that puts the shipped chances back.
   */
  const sureTicks = (): (() => void) => {
    const tick = RULES.expeditions.tick as unknown as Record<string, number>;
    const keys = ['scrapBp', 'shardBp', 'glimmerBp', 'blueprintBp', 'supplyBp', 'gearBp'] as const;
    const before = keys.map((k) => tick[k] as number);
    for (const k of keys) tick[k] = k === 'gearBp' ? 0 : 10_000;
    return () => {
      keys.forEach((k, i) => {
        tick[k] = before[i] as number;
      });
    };
  };
  /** The `gear_drop` events of one source (the rank gift has its own). */
  const dropEvents = (ctx: { sql: SqlStorage }, source: string) =>
    rows<{ props_json: string }>(
      ctx.sql,
      "SELECT props_json FROM analytics_events WHERE kind = 'gear_drop' ORDER BY id",
    ).filter((e) => (JSON.parse(e.props_json) as { source: string }).source === source);

  it('pays the loot of the ticks to the claimer, with the loot in the claim result and the stored state', async () => {
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
          const exp = await p.trip(index, duration);
          ctx.clock.t = exp.endsAt;
          const before = scrapOf(ctx, p.id);
          const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
          expect(res.status).toBe(200);
          const loot = lootOf(res);
          // What the claim says is what the player got: the scrap of the ticks, and any rank gift.
          expect(scrapOf(ctx, p.id)).toBe(before + (loot.parts.scrap ?? 0) + giftScrapOf(res));
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

  it('pays a recall only the ticks of the whole hours spent, with no fixed part', async () => {
    const restore = sureTicks();
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await explorer(ctx, 1);
          const exp = await p.trip(0, 'long');
          ctx.clock.t = exp.startedAt + 8 * 3_600_000 + 30 * 60_000; // 8 whole hours of 12
          const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
          const result = res.body['result'] as { recalled: boolean; loot: Loot };
          expect(result.recalled).toBe(true);
          // Every table is certain: eight ticks bring eight scrap, shards and glimmer, never the 15 of a full trip.
          expect(result.loot.parts).toEqual({ scrap: 8, 'tide-shard': 8, glimmer: 8 });
          expect(result.loot.blueprints).toHaveLength(8);
        },
        { gearRng: createSeededRng('exp-recall') },
      );
    } finally {
      restore();
    }
  });

  it('brings back shards of the place’s element, glimmer, blueprints and supplies from the ticks, once', async () => {
    const restore = sureTicks();
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await explorer(ctx, 1, ['cindle', 'splashet', 'sproutle']);
          const exp = await p.trip(0, 'short', 'ember-caves'); // the shard is of the place's element
          ctx.clock.t = exp.endsAt;
          const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
          const loot = lootOf(res);
          const gift = giftScrapOf(res);
          // A short trip is two ticks, and every table of a tick is certain here.
          expect(loot.parts).toEqual({ scrap: 2, 'ember-shard': 2, glimmer: 2 });
          const supplies = (loot as { supplies?: string[] }).supplies ?? [];
          expect(supplies).toHaveLength(2);
          // The explorer is rank 1, so plain ones, and never a lure.
          for (const id of supplies) expect(id).toMatch(/^(map-scrap|lantern|satchel)-basic$/);
          expect(loot.blueprints).toHaveLength(2);
          expect(loot.blueprints[0]?.duplicate).toBe(false);
          const known = new Set(loot.blueprints.map((b) => b.baseId));
          expect(count(ctx.sql, 'blueprints')).toBe(known.size);
          expect(
            rows(ctx.sql, 'SELECT kind, amount FROM parts WHERE user_id = ? ORDER BY kind', p.id),
          ).toEqual([
            { kind: 'ember-shard', amount: 2 },
            { kind: 'glimmer', amount: 2 },
            { kind: 'scrap', amount: 2 + gift },
          ]);
          const events = dropEvents(ctx, 'expedition');
          expect(events).toHaveLength(1);
          expect(JSON.parse(events[0]?.props_json ?? '{}')).toMatchObject({
            source: 'expedition',
            gear: [],
            converted: 0,
            scrap: 2,
            shards: 2,
            glimmer: 2,
            blueprint: loot.blueprints[0]?.baseId,
            blueprintDuplicate: false,
            supplies: 2,
            parts: { scrap: 2, 'ember-shard': 2, glimmer: 2 },
          });
          const actor = rows<{ actor_hash: string | null }>(
            ctx.sql,
            "SELECT actor_hash FROM analytics_events WHERE kind = 'gear_drop' ORDER BY id",
          )[0]?.actor_hash;
          expect(actor).toMatch(/^[0-9a-f]{32}$/);
        },
        { gearRng: createSeededRng('exp-bp') },
      );
    } finally {
      restore();
    }
  });

  it('can bring back several gear pieces and blueprints in one claim, from the ticks', async () => {
    // Every tick finds a gear piece: a long trip is 15 pieces, as many as the bag has room for.
    const tick = RULES.expeditions.tick as unknown as { gearBp: number };
    const before = tick.gearBp;
    tick.gearBp = 10_000;
    try {
      await runCore(
        nextGuild(),
        async (ctx) => {
          const p = await explorer(ctx, 1);
          const exp = await p.trip(0, 'long', 'ember-caves');
          ctx.clock.t = exp.endsAt;
          const res = await p.call('POST', `/api/expeditions/${exp.id}/claim`, {});
          expect(res.status).toBe(200);
          const loot = lootOf(res);
          // Every piece is in the bag or, when the bag is full, dismantled into parts (and listed).
          expect(loot.gear.length + loot.converted.length).toBe(15);
          expect(count(ctx.sql, 'gear_items')).toBe(loot.gear.length);
        },
        { gearRng: createSeededRng('exp-gear') },
      );
    } finally {
      tick.gearBp = before;
    }
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
