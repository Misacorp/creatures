// Stage rewards held until the replay ends (Misa, 2026-11-17: "pay stage rewards when the replay ends, no new timer"). A stage 1 or 2 resolves at
// its time and plays live; Essence, experience, scrap, the kill bonus and the away lines land at `endsAt`, once, from the guild alarm that
// already wakes then (even with posting off) or from the first request after it. The finale and v1 weeks pay as before.
import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { CoreContext } from './helpers';
import { windowRoundsOf } from '../src/raid-v2-core';
import { HELSINKI, count, joinRaid, rows, runRaid } from './raid-helpers';
import { V2_WEEK, setBossHp, v2Player } from './raid-v2-helpers';

const ROUND = RULES.raid.v2.liveRoundMs;
const V2 = { combatV2: true } as const;

const stageRow = (ctx: CoreContext, phase: string) =>
  rows<{ created_at: number; summary: string }>(
    ctx.sql,
    'SELECT created_at, summary FROM raid_results WHERE phase = ?',
    phase,
  )[0] as { created_at: number; summary: string };
const endsAt = (ctx: CoreContext, phase: string): number => {
  const r = stageRow(ctx, phase);
  return (
    r.created_at +
    windowRoundsOf(JSON.parse(r.summary) as Parameters<typeof windowRoundsOf>[0]) * ROUND
  );
};

/** Everything a stage pays a player, as one comparable snapshot. */
const books = (ctx: CoreContext) => ({
  ledger: rows(
    ctx.sql,
    "SELECT user_id, amount, idempotency_key FROM ledger WHERE source = 'raid' ORDER BY id",
  ),
  grants: rows(ctx.sql, 'SELECT key, user_id, result_json FROM gear_grants ORDER BY key, user_id'),
  items: count(ctx.sql, 'gear_items'),
  xp: rows(ctx.sql, 'SELECT id, level, exp FROM creatures ORDER BY id'),
  away: rows(ctx.sql, 'SELECT * FROM away_rewards ORDER BY user_id, kind'),
});
const pending = (ctx: CoreContext) => count(ctx.sql, 'raid_stage_pay');

/** Four players on the board of a server on its second lap (the boss outlasts them) and stage 1 resolved. */
function stageOne(ctx: CoreContext) {
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 1)',
  );
  const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
  joinRaid(ctx, players);
  ctx.clock.t = V2_WEEK.stage1 + 30_000;
  ctx.core.raid.runDue(HELSINKI);
  return players;
}

describe('stage rewards held until the replay ends', () => {
  it('pays nothing during the window and everything at the end, once, whoever touches the object', async () => {
    await runRaid(
      async (ctx) => {
        const players = stageOne(ctx);
        const start = books(ctx);
        const a = players[0] as { id: string };
        const end = endsAt(ctx, 'stage1');
        expect(pending(ctx)).toBe(1);
        // Resolved: the result row exists, nothing was paid, the away summary is empty.
        expect(start.ledger).toEqual([]);
        expect(start.grants).toEqual([]);
        expect(count(ctx.sql, 'away_rewards', "kind = 'raid'")).toBe(0);

        // The alarm is armed for the end of the replay although no post can go out (no announce channel here).
        await ctx.core.alarm();
        expect(await ctx.storage.getAlarm()).toBe(end);

        // Requests during the window pay nothing.
        ctx.clock.t = end - 1;
        ctx.core.raid.view(a.id, HELSINKI);
        ctx.core.raid.settleDueLive();
        expect(books(ctx)).toEqual(start);
        expect(pending(ctx)).toBe(1);

        // At the end the alarm pays.
        ctx.clock.t = end;
        await ctx.core.alarm();
        const paid = books(ctx);
        expect(pending(ctx)).toBe(0);
        expect(paid.xp).not.toEqual(start.xp);
        expect(count(ctx.sql, 'away_rewards', "kind = 'raid'")).toBeGreaterThan(0);
        // The stored summary shows what was paid.
        const summary = JSON.parse(stageRow(ctx, 'stage1').summary) as {
          essence: Record<string, number>;
        };
        const ledgerSum = rows<{ n: number }>(
          ctx.sql,
          "SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE source = 'raid' AND currency = 'essence'",
        )[0]?.n as number;
        expect(Object.values(summary.essence).reduce((x, y) => x + y, 0)).toBe(ledgerSum);

        // Never twice: another alarm, a request, a retried settle.
        await ctx.core.alarm();
        ctx.core.raid.view(a.id, HELSINKI);
        ctx.core.raid.settleDueLive();
        ctx.core.raid.settleDueLive();
        expect(books(ctx)).toEqual(paid);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('pays from the first request after the end when the alarm never ran', async () => {
    await runRaid(
      (ctx) => {
        const players = stageOne(ctx);
        const a = players[0] as { id: string };
        const start = books(ctx);
        // The object slept far past the end: a view pays it, once, and a second view changes nothing.
        ctx.clock.t = endsAt(ctx, 'stage1') + 3 * 60 * 60_000;
        ctx.core.raid.view(a.id, HELSINKI);
        const paid = books(ctx);
        expect(paid.xp).not.toEqual(start.xp);
        expect(pending(ctx)).toBe(0);
        ctx.core.raid.view(a.id, HELSINKI);
        ctx.core.raid.needsPlacement(a.id, HELSINKI);
        expect(books(ctx)).toEqual(paid);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('an early kill in stage 1 holds the thresholds, the kill bonus gear and the trial tick, then pays them once', async () => {
    await runRaid(
      (ctx) => {
        // A party far above slot 1: the first boss falls in stage 1.
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 30 }));
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        const kills: string[][] = [];
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const week = V2_WEEK.id;
        const grantsOf = (key: string) =>
          rows<{ user_id: string; result_json: string }>(
            ctx.sql,
            'SELECT user_id, result_json FROM gear_grants WHERE key = ?',
            key,
          );
        expect(grantsOf(`raid:${week}:kill`)).toHaveLength(0);
        expect(grantsOf(`raid:${week}:phase1`)).toHaveLength(0);
        expect(count(ctx.sql, 'ledger', "source = 'raid'")).toBe(0);
        const end = endsAt(ctx, 'stage1');
        ctx.clock.t = end - 1;
        ctx.core.raid.settleDueLive();
        expect(grantsOf(`raid:${week}:kill`)).toHaveLength(0);
        ctx.clock.t = end;
        ctx.core.raid.settleDueLive();
        const kill = grantsOf(`raid:${week}:kill`);
        expect(kill).toHaveLength(4);
        for (const g of kill) {
          const view = JSON.parse(g.result_json) as { gear: { rarity: string }[] };
          kills.push(view.gear.map((i) => i.rarity));
        }
        for (const rarities of kills) {
          expect(rarities).toEqual(['epic', 'epic', 'rare', 'rare', 'rare', 'rare']);
        }
        expect(grantsOf(`raid:${week}:phase1`)).toHaveLength(4);
        expect(grantsOf(`raid:${week}:phase2`)).toHaveLength(4);
        expect(count(ctx.sql, 'ledger', "source = 'raid'")).toBeGreaterThan(0);
        const total = books(ctx);
        ctx.core.raid.settleDueLive();
        ctx.clock.t = V2_WEEK.finale + 60_000;
        ctx.core.raid.runDue(HELSINKI);
        ctx.core.raid.settleDueLive();
        expect(books(ctx)).toEqual(total);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('a stage 2 kill pays at the end of stage 2, and stage 1 had already paid its own at its end', async () => {
    await runRaid(
      (ctx) => {
        stageOne(ctx);
        const end1 = endsAt(ctx, 'stage1');
        ctx.clock.t = end1;
        ctx.core.raid.settleDueLive();
        const afterOne = books(ctx);
        expect(pending(ctx)).toBe(0);
        setBossHp(ctx.sql, 5);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(pending(ctx)).toBe(1);
        // Stage 2 resolved: nothing new is paid until its replay ends.
        expect(books(ctx)).toEqual(afterOne);
        ctx.clock.t = endsAt(ctx, 'stage2') - 1;
        ctx.core.raid.settleDueLive();
        expect(books(ctx)).toEqual(afterOne);
        ctx.clock.t = endsAt(ctx, 'stage2');
        ctx.core.raid.settleDueLive();
        expect(pending(ctx)).toBe(0);
        expect(books(ctx).grants.length).toBeGreaterThan(afterOne.grants.length);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('a payout that throws keeps its row, backs off, is not retried before then, and pays once when it works', async () => {
    await runRaid(
      (ctx) => {
        stageOne(ctx);
        const end = endsAt(ctx, 'stage1');
        const row = () =>
          rows<{ attempts: number; due_at: number; payload: string }>(
            ctx.sql,
            'SELECT attempts, due_at, payload FROM raid_stage_pay',
          )[0] as { attempts: number; due_at: number; payload: string };
        const good = row().payload;
        const quiet = books(ctx);
        ctx.sql.exec("UPDATE raid_stage_pay SET payload = 'not json'");
        ctx.clock.t = end;
        expect(ctx.core.raid.settleDueLive()).toBe(0);
        expect(row()).toMatchObject({ attempts: 1, due_at: end + 60_000 });
        expect(books(ctx)).toEqual(quiet);
        // Before the back-off ends nothing is tried again.
        ctx.clock.t = end + 59_999;
        ctx.core.raid.settleDueLive();
        expect(row().attempts).toBe(1);
        // Then it fails again, with a longer wait; the wait never passes six hours.
        ctx.clock.t = end + 60_000;
        ctx.core.raid.settleDueLive();
        expect(row()).toMatchObject({ attempts: 2, due_at: end + 60_000 + 120_000 });
        ctx.sql.exec('UPDATE raid_stage_pay SET attempts = 40');
        ctx.clock.t = row().due_at;
        ctx.core.raid.settleDueLive();
        expect(row().due_at).toBe(ctx.clock.t + 6 * 60 * 60_000);
        // A fix is deployed (the payload reads again): it pays once, and the row goes.
        ctx.sql.exec('UPDATE raid_stage_pay SET payload = ?, due_at = ?', good, ctx.clock.t);
        ctx.core.raid.settleDueLive();
        const paid = books(ctx);
        expect(pending(ctx)).toBe(0);
        expect(paid.xp).not.toEqual(quiet.xp);
        ctx.core.raid.settleDueLive();
        expect(books(ctx)).toEqual(paid);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);

  it('pays a row whose result row is missing, patches no summary and deletes the row', async () => {
    await runRaid(
      (ctx) => {
        stageOne(ctx);
        const end = endsAt(ctx, 'stage1');
        ctx.sql.exec("DELETE FROM raid_results WHERE phase = 'stage1'");
        ctx.clock.t = end;
        expect(ctx.core.raid.settleDueLive()).toBe(1);
        expect(pending(ctx)).toBe(0);
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect(count(ctx.sql, 'away_rewards', "kind = 'raid'")).toBeGreaterThan(0);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 180_000);
});
