// The live v2 finale (docs/design/combat/integration.md, sections 5 and 8): the replay by the dispatcher, the rounds kept in the row so a
// plain poll plays nothing, the prefix property the worker leans on, the inputs, and the replay's CPU per read.
import type { FinaleAction, StageCarry, StageInputV2 } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import { isV2Input, replayFight, rulesOfInput } from '../src/fight-replay';
import type { Frames } from '../src/raid-v2-live';
import type { LiveSnapshotV2 } from '../src/raid-v2-view';
import type { CoreContext } from './helpers';
import { HELSINKI, count, joinRaid, rows, runRaid } from './raid-helpers';
import { V2_WEEK, carryOf, v2Player } from './raid-v2-helpers';

const ROUND = 30_000;

/** A weekend on slot 6 up to the live finale's first second: 4 players, two stages played. */
function toFinale(ctx: CoreContext, width = 4) {
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 0, 0)',
  );
  const players = Array.from({ length: width }, (_, i) => v2Player(ctx, i + 1, { level: 22 }));
  ctx.core.raid.currentWeek(HELSINKI);
  joinRaid(ctx, players);
  ctx.clock.t = V2_WEEK.stage1 + 30_000;
  ctx.core.raid.runDue(HELSINKI);
  ctx.clock.t = V2_WEEK.stage2 + 30_000;
  ctx.core.raid.runDue(HELSINKI);
  ctx.clock.t = V2_WEEK.finale + 1000;
  ctx.core.raid.runDue(HELSINKI);
  return players;
}

const liveRow = (ctx: CoreContext) => {
  const row = rows<{ seed: string; input: string; frames: string | null; abilities: string }>(
    ctx.sql,
    'SELECT seed, input, frames, abilities FROM raid_live',
  )[0];
  if (row === undefined) throw new Error('no live fight');
  return {
    seed: row.seed,
    input: JSON.parse(row.input) as StageInputV2,
    frames: row.frames === null ? null : (JSON.parse(row.frames) as Frames),
    abilities: row.abilities,
  };
};

const snap = (ctx: CoreContext, id: string) =>
  ctx.core.raid.liveView(id, HELSINKI) as LiveSnapshotV2;

describe('the dispatcher', () => {
  it('replays a stored input by its version: v2 on the v2 engine, none on v1', async () => {
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const { input, seed } = liveRow(ctx);
        expect(isV2Input(input)).toBe(true);
        expect(rulesOfInput(input)).toBe(2);
        const carry = carryOf(ctx.sql);
        const first = replayFight(input, seed, { carry });
        const again = replayFight(input, seed, { carry });
        expect(first.rules).toBe(2);
        expect(again.output.result.events).toEqual(first.output.result.events);
        // A v2 replay needs the carry.
        expect(() => (replayFight as (i: unknown, s: string) => unknown)(input, seed)).toThrow();
        // An input without a version is a v1 fight.
        const v1 = { ...input } as Record<string, unknown>;
        delete v1['version'];
        expect(rulesOfInput(v1 as unknown as StageInputV2)).toBe(1);
      },
      { start: V2_WEEK.open, core: { combatV2: true } },
    );
  }, 120_000);

  it('plays the first rounds of a fight exactly as the whole fight does (the prefix property)', async () => {
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const { input, seed } = liveRow(ctx);
        const carry = carryOf(ctx.sql);
        const actions: FinaleAction[] = [
          { round: 2, kind: 'rally', by: 'm1' },
          { round: 3, kind: 'shieldWall', row: 1, by: 'm2' },
          { round: 5, kind: 'purge', by: 'm3' },
        ];
        const whole = replayFight(input, seed, { carry, actions }).output.result;
        // The end event is the fight's own; the rest of a shorter fight is the start of the longer one.
        const body = (events: readonly { board?: { type: string } }[], upTo: number) =>
          events.filter((e) => (e as { round: number }).round <= upTo && e.board?.type !== 'end');
        for (const r of [1, 2, 3, 4, 5, 6, 7]) {
          const part = replayFight(input, seed, { carry, actions, upToRound: r }).output.result;
          expect(body(part.events, r)).toEqual(body(whole.events, r));
        }
        // An input added at round r changes nothing before r.
        const without = replayFight(input, seed, { carry, actions: [] }).output.result;
        const early = (events: readonly { round: number }[]) => events.filter((e) => e.round < 2);
        expect(early(without.events)).toEqual(early(whole.events));
      },
      { start: V2_WEEK.open, core: { combatV2: true } },
    );
  }, 120_000);
});

describe('the live finale replay', () => {
  it('keeps the rounds played in the row: a poll inside a round plays nothing, a new round or an input plays again', async () => {
    await runRaid(
      (ctx) => {
        const [a] = toFinale(ctx) as [{ id: string }];
        const survivor = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_placements LIMIT 1',
        )[0]?.user_id as string;
        void a;
        expect(liveRow(ctx).frames).toBeNull();
        // Round 1: the first read plays one round and stores it.
        const first = snap(ctx, survivor);
        expect(first.round).toBe(1);
        const stored = liveRow(ctx).frames;
        expect(stored).toMatchObject({ upTo: 1 });
        // A second read in the same round returns the same rounds from the row: the stored frames are untouched.
        const raw = (): string =>
          rows<{ frames: string }>(ctx.sql, 'SELECT frames FROM raid_live')[0]?.frames as string;
        const before = raw();
        ctx.clock.t += 5000;
        expect(snap(ctx, survivor).events).toEqual(first.events);
        expect(raw()).toBe(before);
        // The next round plays on from the start of the fight and stores two rounds.
        ctx.clock.t = V2_WEEK.finale + ROUND + 1000;
        const second = snap(ctx, survivor);
        expect(second.round).toBe(2);
        expect(liveRow(ctx).frames).toMatchObject({ upTo: 2 });
        // What was shown of round 1 did not change.
        expect(second.events.filter((e) => e.round === 1)).toEqual(
          first.events.filter((e) => e.round === 1),
        );
        // An input pressed in round 2 acts in round 3: the stored rounds up to 2 stay good and nothing before round 3 changes.
        const me = second.abilities.find((x) => x.alias === second.you);
        const pressed = ctx.core.raid.liveAction(survivor, HELSINKI, {
          key: `${second.you as string}:basic`,
          action: 'fire',
          ...(me?.kind === 'shieldWall' ? { row: 0 } : {}),
        });
        expect(pressed.ok).toBe(true);
        const third = snap(ctx, survivor);
        expect(third.events.filter((e) => e.round <= 2)).toEqual(second.events);
        // The frames were replayed with the input at the time of the last read, and key their inputs.
        expect(liveRow(ctx).frames?.key).toContain('"round"');
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);
      },
      { start: V2_WEEK.open, core: { combatV2: true } },
    );
  }, 120_000);

  it.each([4, 15])(
    'measures the CPU of a read at %i columns: a poll from the stored rounds, and the replays of the longest rounds',
    async (width) => {
      await runRaid(
        (ctx) => {
          // Stage 1's stored input is a whole 8-round fight of the party at its width (the finale's is the same shape).
          ctx.sql.exec('INSERT INTO raid_track (id, slot) VALUES (1, 6)');
          const players = Array.from({ length: width }, (_, i) =>
            v2Player(ctx, i + 1, { level: 22 }),
          );
          ctx.core.raid.currentWeek(HELSINKI);
          joinRaid(ctx, players);
          ctx.clock.t = V2_WEEK.stage1 + 30_000;
          ctx.core.raid.runDue(HELSINKI);
          const stored = rows<{ input: string; seed: string }>(
            ctx.sql,
            "SELECT input, seed FROM raid_results WHERE phase = 'stage1'",
          )[0];
          const input = JSON.parse(stored?.input ?? '{}') as StageInputV2;
          const seed = stored?.seed as string;
          const carry: StageCarry = {
            stage: 0,
            bossHp: input.boss.hp,
            shadowHp: input.boss.hp,
            hp: {},
            out: [],
            windDone: [],
            holdDone: [],
            used: {},
            dealt: {},
          };
          const actions: FinaleAction[] = [
            { round: 2, kind: 'rally', by: 'm1' },
            { round: 3, kind: 'shieldWall', row: 1, by: 'm2' },
            { round: 4, kind: 'purge', by: 'm3' },
          ];
          // The worker's timer ticks in whole milliseconds, so a read is timed as the mean of a span of reads. The first call is cold.
          const span = (fn: () => void, runs = 20): { cold: number; mean: number } => {
            const c0 = performance.now();
            fn();
            const cold = performance.now() - c0;
            const t0 = performance.now();
            for (let i = 0; i < runs; i++) fn();
            return { cold, mean: (performance.now() - t0) / runs };
          };
          const full = span(() => void replayFight(input, seed, { carry, actions }));
          const six = span(() => void replayFight(input, seed, { carry, actions, upToRound: 6 }));
          // The Free plan allows 10 ms of CPU per request. A test machine is not a Worker, so this only guards the order of magnitude;
          // the measured numbers are in the decision and the report.
          expect(full.mean).toBeLessThan(10);
          expect(six.mean).toBeLessThan(10);
        },
        { start: V2_WEEK.open, core: { combatV2: true } },
      );
    },
    120_000,
  );
});

describe('a poll of the live finale', () => {
  it('reads the stored rounds in a few milliseconds', async () => {
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const survivor = rows<{ user_id: string }>(
          ctx.sql,
          'SELECT user_id FROM raid_placements LIMIT 1',
        )[0]?.user_id as string;
        ctx.clock.t = V2_WEEK.finale + 7 * ROUND + 1000;
        snap(ctx, survivor);
        const t0 = performance.now();
        for (let i = 0; i < 20; i++) snap(ctx, survivor);
        const mean = (performance.now() - t0) / 20;
        expect(mean).toBeLessThan(10);
      },
      { start: V2_WEEK.open, core: { combatV2: true } },
    );
  }, 120_000);
});
