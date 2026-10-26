import { RULES, content } from '@creatures/game';
import { liveFightRules, phaseFloorHp, raidEnrage } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { loadLive, scheduleRounds, type LiveRow } from '../src/raid-live';
import type { PostMessage } from '../src/discord-format';
import { queuePhasePost } from '../src/raid-posts';
import { buildPhaseInput, outcomeFlags } from '../src/raid-resolve';
import { hpNeeded } from '../src/raid-stats';
import { eventTimes } from '../src/raid-schedule';
import type { CoreContext } from './helpers';
import {
  HELSINKI,
  W02,
  count,
  forcePool,
  rows,
  runRaid,
  seedMember,
  storedRuns,
} from './raid-helpers';

const FINALE = eventTimes(W02.id, HELSINKI).finale;
const CHANNEL = '555555555555555555';

/** Seeds players and opens the week, leaving the clock where it is. */
function openWeek(ctx: CoreContext, n: number, level = 15) {
  const players = Array.from({ length: n }, (_, i) => seedMember(ctx, i + 1, { level }));
  ctx.core.raid.currentWeek(HELSINKI);
  return players;
}

const weekOf = (ctx: CoreContext) => {
  const week = ctx.core.raid.week(W02.id);
  if (week === null) throw new Error('no week');
  return week;
};

describe('the floor of a phase', () => {
  it('is the pool less what the phase has to take off (rounded up), the same as the stats say', () => {
    for (const phase of ['phase1', 'phase2'] as const) {
      for (const max of [1, 7, 999, 1000, 1001, 12_345, 1_000_000]) {
        const floor = phaseFloorHp(max, phase);
        // Reaching the floor is exactly what clears the phase.
        expect(floor + hpNeeded(phase, max), `${phase} ${String(max)}`).toBe(max);
      }
    }
    // Phase 1 leaves 70% (the boss retreats at 30% lost), Phase 2 leaves 15%, the finale has none.
    expect(phaseFloorHp(1000, 'phase1')).toBe(700);
    expect(phaseFloorHp(1000, 'phase2')).toBe(150);
    expect(phaseFloorHp(1001, 'phase1')).toBe(700); // 30% of 1001 = 300.3, rounded up to 301 lost
    expect(phaseFloorHp(1000, 'finale')).toBe(0);
  });
});

describe('the fight inputs the server builds', () => {
  it('carries the combat rules and the floor of Phases 1 and 2, and no enrage', async () => {
    await runRaid((ctx) => {
      const [me] = openWeek(ctx, 4);
      if (me === undefined) throw new Error('no player');
      // A pool no party can empty and with a pool max that does not divide evenly.
      forcePool(ctx.sql, 40_001);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      const [one, two] = storedRuns(ctx.sql);
      expect(one?.phase).toBe('phase1');
      expect(two?.phase).toBe('phase2');
      for (const run of [one, two]) {
        expect(run?.input.rules).toEqual(liveFightRules());
        expect(run?.input.rules).toEqual({
          coverBp: RULES.combat.coverBp,
          maxHitBp: RULES.combat.maxHitBp,
          guardHpBp: RULES.combat.guard.hpBp,
          guardArmorBp: RULES.combat.guard.armorBp,
          // A Guard protects the creatures within its reach (2026-10-22); a stored older fight has none.
          guardRule: 'reach',
          supportFx: RULES.combat.supportFx,
          // Dodge is switched on (the balance pass): a new fight stores its numbers.
          dodge: {
            perSpeedBp: RULES.combat.dodge.perSpeedBp,
            maxBp: RULES.combat.dodge.maxBp,
            areaShareBp: RULES.combat.dodge.areaShareBp,
          },
        });
        expect(run?.input.effects).toEqual({ dice: RULES.combat.effects.dice });
        expect(run?.input.enrage).toBeUndefined();
        expect(run?.input.luck).toEqual(RULES.combat.luck);
      }
      expect(one?.input.bossHpFloor).toBe(phaseFloorHp(40_001, 'phase1'));
      expect(one?.input.bossHpFloor).toBe(40_001 - Math.ceil((40_001 * 3000) / 10_000));
      expect(two?.input.bossHpFloor).toBe(phaseFloorHp(40_001, 'phase2'));
      expect(two?.input.bossHpFloor).toBe(40_001 - Math.ceil((40_001 * 8500) / 10_000));
      // Phase 2 floors lower than Phase 1, and the pool is the same maximum.
      expect(two?.input.bossHpFloor).toBeLessThan(one?.input.bossHpFloor ?? 0);
      expect(one?.input.bossHpPool.max).toBe(40_001);
      expect(two?.input.bossHpPool.max).toBe(40_001);
      // The replay tells the client the Guard numbers the fight used (extra HP and armor).
      expect(ctx.core.raid.replay(me.id, W02.id, 1, 'phase1')?.rules).toEqual({
        guardHpBp: RULES.combat.guard.hpBp,
        guardArmorBp: RULES.combat.guard.armorBp,
      });
    });
  });

  it('gives the live finale the rules and the enrage but no floor, and keeps them in the stored row', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 3);
      forcePool(ctx.sql, 40_001);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      ctx.clock.t = FINALE;
      ctx.core.raid.runDue(HELSINKI);
      const live = loadLive(ctx.sql, W02.id, 1, false);
      if (live === null) throw new Error('no live fight');
      expect(live.input.rules).toEqual(liveFightRules());
      expect(live.input.enrage).toEqual({
        rounds: RULES.raid.enrage.rounds,
        powerBp: RULES.raid.enrage.powerBp,
      });
      expect(live.input.bossHpFloor).toBeUndefined();
      // The stored column is what replays and re-simulations read: the fields are really in it.
      const [stored] = rows<{ input: string }>(
        ctx.sql,
        'SELECT input FROM raid_live WHERE practice = 0',
      );
      expect(JSON.parse(stored?.input ?? '{}')).toMatchObject({
        rules: liveFightRules(),
        enrage: raidEnrage('finale'),
      });
    });
  });

  it('builds the finale input with an enrage in a practice fight, too', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 2);
      const built = buildPhaseInput(ctx.sql, weekOf(ctx), 1, 'finale', { practice: true });
      expect(built?.input.enrage).toEqual(RULES.raid.enrage);
      expect(built?.input.bossHpFloor).toBeUndefined();
      expect(built?.input.rules).toEqual(liveFightRules());
    });
  });

  it('never floors above the HP the boss has: a pool already past the floor floors where it stands', async () => {
    await runRaid((ctx) => {
      openWeek(ctx, 2);
      // A week whose Phase 1 ran under the old rules can reach Phase 2 with less than the new floor.
      forcePool(ctx.sql, 10_000, 1_000);
      const phase2 = buildPhaseInput(ctx.sql, weekOf(ctx), 1, 'phase2');
      expect(phaseFloorHp(10_000, 'phase2')).toBe(1_500);
      expect(phase2?.input.bossHpFloor).toBe(1_000);
      forcePool(ctx.sql, 10_000, 10_000);
      expect(buildPhaseInput(ctx.sql, weekOf(ctx), 1, 'phase1')?.input.bossHpFloor).toBe(7_000);
      expect(buildPhaseInput(ctx.sql, weekOf(ctx), 1, 'phase2')?.input.bossHpFloor).toBe(1_500);
    });
  });

  it('plays the enrage rounds on the live schedule, and only when the stored input has an enrage', () => {
    const row = (enrage: { rounds: number; powerBp: number } | undefined): LiveRow['input'] =>
      ({ ...(enrage === undefined ? {} : { enrage }) }) as LiveRow['input'];
    expect(scheduleRounds({ rounds: 12, input: row({ rounds: 3, powerBp: 30_000 }) })).toBe(15);
    // A fight stored before enrage has none.
    expect(scheduleRounds({ rounds: 12, input: row(undefined) })).toBe(12);
  });
});

describe('what a stage result shows', () => {
  it('says whether the boss retreated or enraged, and false for results stored without them', async () => {
    await runRaid((ctx) => {
      const [me] = openWeek(ctx, 3);
      if (me === undefined) throw new Error('no player');
      forcePool(ctx.sql, 40_001);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      const [first] = storedRuns(ctx.sql);
      // A fresh result carries the flags.
      expect(first?.summary).toMatchObject({ retreated: false, enraged: false });
      expect(outcomeFlags(first?.result as NonNullable<typeof first>['result'])).toEqual({
        retreated: false,
        enraged: false,
      });

      // The same stored fight as an older server wrote it: no flags in the result, the summary or
      // the input, and the boss definition without retreat lines.
      for (const run of storedRuns(ctx.sql)) {
        const result: Record<string, unknown> = { ...run.result };
        const summary: Record<string, unknown> = { ...run.summary };
        const input: Record<string, unknown> = { ...run.input };
        delete result['retreated'];
        delete result['enraged'];
        delete summary['retreated'];
        delete summary['enraged'];
        for (const key of ['rules', 'bossHpFloor', 'enrage']) delete input[key];
        // The boss definition in the stored input carries the retreat lines the content has now.
        const boss: Record<string, unknown> = { ...(input['boss'] as Record<string, unknown>) };
        delete boss['retreat'];
        input['boss'] = boss;
        ctx.sql.exec(
          'UPDATE raid_results SET input = ?, result = ?, summary = ? WHERE week_id = ? AND party = ? AND phase = ?',
          JSON.stringify(input),
          JSON.stringify(result),
          JSON.stringify(summary),
          run.weekId,
          run.party,
          run.phase,
        );
      }
      const old = storedRuns(ctx.sql)[0];
      expect(old?.result).not.toHaveProperty('retreated');
      expect(old?.input).not.toHaveProperty('rules');
      expect(old ? outcomeFlags(old.result) : null).toEqual({ retreated: false, enraged: false });

      // Every reader still works and says false.
      const stats = ctx.core.raid.stats(me.id, W02.id, 1, 'phase1');
      expect(stats).toMatchObject({ retreated: false, enraged: false });
      const view = ctx.core.raid.view(me.id, HELSINKI);
      expect(view.party?.results.map((r) => [r.phase, r.retreated, r.enraged])).toEqual([
        ['phase1', false, false],
        ['phase2', false, false],
      ]);
      const replay = ctx.core.raid.replay(me.id, W02.id, 1, 'phase1');
      expect(replay).toMatchObject({ retreated: false, enraged: false });
      expect(replay?.boss.retreat).toBeNull();
      // No rules were stored, so the replay carries none: the client falls back to the old Guard.
      expect(replay?.rules).toBeNull();
    });
  });

  it('reports the flags of a stored result that has them, and the boss retreat lines', async () => {
    await runRaid((ctx) => {
      const [me] = openWeek(ctx, 3);
      if (me === undefined) throw new Error('no player');
      forcePool(ctx.sql, 40_001);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      const [phase1] = storedRuns(ctx.sql);
      if (phase1 === undefined) throw new Error('no run');
      ctx.sql.exec(
        'UPDATE raid_results SET result = ?, summary = ? WHERE week_id = ? AND party = ? AND phase = ?',
        JSON.stringify({ ...phase1.result, retreated: true }),
        JSON.stringify({ ...phase1.summary, retreated: true }),
        phase1.weekId,
        phase1.party,
        'phase1',
      );
      expect(ctx.core.raid.stats(me.id, W02.id, 1, 'phase1')).toMatchObject({ retreated: true });
      const view = ctx.core.raid.view(me.id, HELSINKI);
      expect(view.party?.results[0]).toMatchObject({ phase: 'phase1', retreated: true });
      expect(ctx.core.raid.replay(me.id, W02.id, 1, 'phase1')).toMatchObject({ retreated: true });
      // The boss's own retreat lines (or null when it has none) go out with the week.
      const boss = content.bosses.find((b) => b.id === view.boss.id);
      expect(view.boss.retreat).toEqual(boss?.retreat ?? null);
    });
  });
});

describe('the Discord post of a stage', () => {
  it('says the boss retreated for a cleared phase, from the stored summary', async () => {
    await runRaid(async (ctx) => {
      const [me] = openWeek(ctx, 3);
      if (me === undefined) throw new Error('no player');
      await ctx.core.createSession(ctx.guildId, { id: me.id, displayName: me.name }, CHANNEL);
      forcePool(ctx.sql, 40_001);
      ctx.clock.t = W02.afterPhase1;
      ctx.core.raid.runDue(HELSINKI);
      const [run] = storedRuns(ctx.sql);
      if (run === undefined) throw new Error('no run');
      expect(count(ctx.sql, 'discord_posts', "key = 'raid:2027-W02:phase1:1'")).toBe(1);
      ctx.sql.exec("DELETE FROM discord_posts WHERE key = 'raid:2027-W02:phase1:1'");
      queuePhasePost(ctx.sql, {
        weekId: run.weekId,
        party: 1,
        phase: 'phase1',
        now: ctx.clock.t,
        input: run.input,
        result: run.result,
        summary: { ...run.summary, cleared: true, retreated: true },
      });
      const [post] = rows<{ content: string }>(
        ctx.sql,
        "SELECT content FROM discord_posts WHERE key = 'raid:2027-W02:phase1:1'",
      );
      const message = JSON.parse(post?.content ?? '{}') as PostMessage;
      expect(message.embeds[0]?.title).toBe(`✅ ${run.input.boss.name} retreats`);
    });
  });
});
