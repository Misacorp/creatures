// What a combat v2 weekend pays and when (Misa, 2026-11-04): each HP threshold of the weekend is paid once, by the stage that first crosses
// it; a kill pays a big bonus of epic and rare gear once; nothing is paid twice on a re-run.
import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { CoreContext } from './helpers';
import { crossedThresholds } from '../src/raid-v2-stage';
import { HELSINKI, count, joinRaid, rows, runRaid } from './raid-helpers';
import { V2_WEEK, setBossHp, v2Player } from './raid-v2-helpers';

const V2 = { combatV2: true } as const;
const IDS = RULES.raid.v2.rewards.thresholds.map((t) => t.id);

describe('which thresholds a stage crosses', () => {
  const ids = (after: number, paid: string[] = []) =>
    crossedThresholds(after, new Set(paid)).map((t) => t.id);

  it('starts at 30% and 85% of the weekend, as data', () => {
    expect(RULES.raid.v2.rewards.thresholds).toEqual([
      { id: 'hp30', removedBp: 3_000, pays: 'phase1' },
      { id: 'hp85', removedBp: 8_500, pays: 'phase2' },
    ]);
  });

  it('a stage 1 that removes 90% pays both, and the later stages nothing more for them', () => {
    expect(ids(9_000)).toEqual(['hp30', 'hp85']);
    expect(ids(9_500, ['hp30', 'hp85'])).toEqual([]);
    expect(ids(10_000, ['hp30', 'hp85'])).toEqual([]);
  });

  it('stage 1 below the first threshold pays nothing; stage 2 pays what it crosses', () => {
    expect(ids(2_999)).toEqual([]);
    expect(ids(8_499, [])).toEqual(['hp30']);
    expect(ids(8_500, ['hp30'])).toEqual(['hp85']);
  });

  it('the finale pays what is left, and a kill crosses everything not yet paid', () => {
    expect(ids(10_000, ['hp30'])).toEqual(['hp85']);
    expect(ids(10_000)).toEqual(['hp30', 'hp85']);
  });
});

const ledgerKeys = (ctx: CoreContext) =>
  rows<{ user_id: string; idempotency_key: string }>(
    ctx.sql,
    "SELECT user_id, idempotency_key FROM ledger WHERE source = 'raid' ORDER BY id",
  ).map((r) => `${r.user_id}|${r.idempotency_key}`);
const grants = (ctx: CoreContext, key: string) =>
  rows<{ user_id: string; result_json: string }>(
    ctx.sql,
    'SELECT user_id, result_json FROM gear_grants WHERE key = ?',
    key,
  );
const paidOf = (ctx: CoreContext, phase: string) => {
  const row = rows<{ summary: string }>(
    ctx.sql,
    'SELECT summary FROM raid_results WHERE phase = ?',
    phase,
  )[0];
  const v2 = (
    JSON.parse(row?.summary ?? '{}') as {
      v2?: { paid?: { thresholds: string[]; killBonus: boolean } };
    }
  ).v2;
  return v2?.paid;
};

/** A server on its second lap, so the boss outlasts the party and stage 1 does not kill it. */
const secondLap = (ctx: CoreContext): void => {
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2)',
  );
};

describe('the payout of a combat v2 weekend', () => {
  it('pays each threshold once across stage 1 and a stage 2 kill, and the kill bonus once', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
        secondLap(ctx);
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(paidOf(ctx, 'stage1')?.killBonus).toBe(false);
        setBossHp(ctx.sql, 5);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const one = paidOf(ctx, 'stage1')?.thresholds ?? [];
        const two = paidOf(ctx, 'stage2');
        // Each threshold was paid by exactly one stage, and the kill crossed whatever was left.
        expect([...one, ...(two?.thresholds ?? [])].sort()).toEqual([...IDS].sort());
        expect(two?.killBonus).toBe(true);
        const keys = ledgerKeys(ctx);
        const week = V2_WEEK.id;
        for (const p of players) {
          for (const stage of ['phase1', 'phase2'])
            expect(keys.filter((k) => k === `${p.id}|raid:${week}:1:${stage}`)).toHaveLength(1);
        }
        for (const key of [`raid:${week}:phase1`, `raid:${week}:phase2`]) {
          expect(grants(ctx, key)).toHaveLength(4);
        }
        // The kill bonus: one epic and two rare pieces for every member, once.
        const kill = grants(ctx, `raid:${week}:kill`);
        expect(kill.map((g) => g.user_id).sort()).toEqual(players.map((p) => p.id).sort());
        for (const g of kill) {
          const view = JSON.parse(g.result_json) as { gear: { rarity: string }[] };
          expect(view.gear.map((i) => i.rarity)).toEqual(['epic', 'rare', 'rare']);
        }
        // A re-run pays nothing twice: the stages are done, and the ledger and grants stay as they are.
        const before = {
          ledger: count(ctx.sql, 'ledger'),
          grants: count(ctx.sql, 'gear_grants'),
          items: count(ctx.sql, 'gear_items'),
        };
        ctx.clock.t = V2_WEEK.finale + 60_000;
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.runDue(HELSINKI);
        expect({
          ledger: count(ctx.sql, 'ledger'),
          grants: count(ctx.sql, 'gear_grants'),
          items: count(ctx.sql, 'gear_items'),
        }).toEqual(before);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('a kill in stage 1 pays both thresholds and the bonus then, and later stages play and pay nothing', async () => {
    await runRaid(
      (ctx) => {
        // A server on slot 1 and a party far above it: the first boss falls in stage 1.
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 30 }));
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const one = paidOf(ctx, 'stage1');
        expect(one).toEqual({ thresholds: IDS, killBonus: true });
        const week = V2_WEEK.id;
        const kill = grants(ctx, `raid:${week}:kill`);
        expect(kill).toHaveLength(4);
        for (const g of kill) {
          const view = JSON.parse(g.result_json) as { gear: { rarity: string }[] };
          expect(view.gear.map((i) => i.rarity)).toEqual(['epic', 'rare', 'rare']);
        }
        const total = { ledger: count(ctx.sql, 'ledger'), grants: count(ctx.sql, 'gear_grants') };
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        ctx.clock.t = V2_WEEK.finale + 60_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_results', "phase <> 'stage1'")).toBe(0);
        expect({ ledger: count(ctx.sql, 'ledger'), grants: count(ctx.sql, 'gear_grants') }).toEqual(
          total,
        );
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('a kill in the live finale pays the thresholds not yet paid, the finale and the bonus once', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
        secondLap(ctx);
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const paidSoFar = [
          ...(paidOf(ctx, 'stage1')?.thresholds ?? []),
          ...(paidOf(ctx, 'stage2')?.thresholds ?? []),
        ];
        // Leave the boss a sliver of HP and let the finale play out.
        setBossHp(ctx.sql, 5);
        ctx.clock.t = V2_WEEK.finale + 1000;
        const survivor = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_placements LIMIT 1',
        )[0]?.user_id as string;
        ctx.core.raid.liveView(survivor, HELSINKI);
        ctx.clock.t = V2_WEEK.finale + 9 * 30_000;
        ctx.core.raid.liveView(survivor, HELSINKI);
        const finale = paidOf(ctx, 'finale');
        expect(finale?.killBonus).toBe(true);
        // Every threshold was paid by one stage only, the finale paying what the earlier stages left.
        expect([...paidSoFar, ...(finale?.thresholds ?? [])].sort()).toEqual([...IDS].sort());
        const week = V2_WEEK.id;
        const keys = ledgerKeys(ctx);
        // The members of the finale are the players who still had a creature standing: each is paid once.
        const fighters = keys.filter((k) => k.endsWith(`|raid:${week}:1:finale`));
        expect(fighters.length).toBeGreaterThan(0);
        expect(new Set(fighters).size).toBe(fighters.length);
        expect(grants(ctx, `raid:${week}:kill`)).toHaveLength(fighters.length);
        expect(grants(ctx, `raid:${week}:finale`)).toHaveLength(fighters.length);
        const total = count(ctx.sql, 'ledger');
        ctx.clock.t = V2_WEEK.finale + 20 * 30_000;
        ctx.core.raid.liveView(survivor, HELSINKI);
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'ledger')).toBe(total);
        expect(grants(ctx, `raid:${week}:kill`)).toHaveLength(fighters.length);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);
});
