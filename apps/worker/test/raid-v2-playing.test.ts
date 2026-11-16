// Stages 1 and 2 play as they happen (Misa, 2026-11-16): a stage resolves at its time, but the stored fight is revealed round by round, from
// its `created_at` until `created_at + rounds * liveRoundMs`. No timer: every read works out the round from the clock. The server never sends
// a round that has not started or any number that gives the outcome; the board is locked while a stage plays.
import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { CoreContext } from './helpers';
import type { PlayingReplayV2, RaidV2Part, ReplayViewV2 } from '../src/raid-v2-view';
import { HELSINKI, joinRaid, rows, runRaid } from './raid-helpers';
import { giveItem } from './gear-helpers';
import { V2_WEEK, finishPlaying, v2Player } from './raid-v2-helpers';

const ROUND = RULES.raid.v2.liveRoundMs;
const V2 = { combatV2: true } as const;

const stageRow = (ctx: CoreContext, phase: string) =>
  rows<{ created_at: number; summary: string }>(
    ctx.sql,
    'SELECT created_at, summary FROM raid_results WHERE phase = ?',
    phase,
  )[0] as { created_at: number; summary: string };
const roundsOf = (ctx: CoreContext, phase: string): number =>
  (JSON.parse(stageRow(ctx, phase).summary) as { rounds: number }).rounds;

const replay = (ctx: CoreContext, userId: string, phase: 'stage1' | 'stage2') =>
  ctx.core.raid.replay(userId, V2_WEEK.id, 1, phase);
const view = (ctx: CoreContext, userId: string) => ctx.core.raid.view(userId, HELSINKI);
const v2Of = (ctx: CoreContext, userId: string): RaidV2Part => {
  const v = view(ctx, userId).v2;
  if (v === undefined) throw new Error('not v2');
  return v;
};

const pick = <T>(list: readonly T[], i: number): T => {
  const item = list[i];
  if (item === undefined) throw new Error('no such player');
  return item;
};

/** Four players on the board (a server on its second lap, where the boss outlasts them) and stage 1 resolved at its time. */
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

describe('stages that play as they happen', () => {
  it('serves only the rounds that have started, with no end event and no outcome', async () => {
    await runRaid(
      (ctx) => {
        const a = pick(stageOne(ctx), 0);
        const created = stageRow(ctx, 'stage1').created_at;
        const rounds = roundsOf(ctx, 'stage1');
        expect(rounds).toBeGreaterThanOrEqual(4);

        // In round 3.
        ctx.clock.t = created + 2 * ROUND + 5;
        const playing = replay(ctx, a.id, 'stage1') as PlayingReplayV2;
        expect(playing).toMatchObject({
          playing: true,
          startsAt: created,
          roundMs: ROUND,
          round: 3,
          nextRoundAt: created + 3 * ROUND,
        });
        expect(playing.events.length).toBeGreaterThan(0);
        expect(Math.max(...playing.events.map((e) => e.round))).toBeLessThanOrEqual(3);
        expect(playing.events.some((e) => e.board?.type === 'end')).toBe(false);
        for (const hidden of ['rounds', 'cleared', 'kill', 'bossHpEnd', 'carry', 'seed']) {
          expect(playing).not.toHaveProperty(hidden);
        }
        // The route would give the same answer a moment later in the same round, and the next round only at its start.
        ctx.clock.t = created + 3 * ROUND - 1;
        expect((replay(ctx, a.id, 'stage1') as PlayingReplayV2).round).toBe(3);
        ctx.clock.t = created + 3 * ROUND;
        const next = replay(ctx, a.id, 'stage1') as PlayingReplayV2;
        expect(next.round).toBe(4);
        expect(next.events.length).toBeGreaterThan(playing.events.length);

        // The last round: the stage ends at `endsAt`, which is `nextRoundAt` by then.
        ctx.clock.t = created + (rounds - 1) * ROUND;
        const last = replay(ctx, a.id, 'stage1') as PlayingReplayV2;
        expect(last).toMatchObject({ round: rounds, nextRoundAt: created + rounds * ROUND });
        expect(last.events.some((e) => e.board?.type === 'end')).toBe(false);

        // After the window the full replay, as before.
        ctx.clock.t = created + rounds * ROUND;
        const full = replay(ctx, a.id, 'stage1') as ReplayViewV2;
        expect(full).not.toHaveProperty('playing');
        expect(full).toMatchObject({ rounds });
        expect(typeof full.cleared).toBe('boolean');
        expect(full.carry.bossHp).toBeGreaterThanOrEqual(0);
        expect(full.events.some((e) => e.board?.type === 'end')).toBe(true);
        expect(Math.max(...full.events.map((e) => e.round))).toBeGreaterThanOrEqual(4);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });

  it('hides the after-action stats and the result of a playing stage from the week view', async () => {
    await runRaid(
      (ctx) => {
        const players = stageOne(ctx);
        const a = pick(players, 0);
        const b = pick(players, 1);
        const created = stageRow(ctx, 'stage1').created_at;
        const rounds = roundsOf(ctx, 'stage1');
        ctx.clock.t = created + ROUND + 1;

        expect(ctx.core.raid.stats(a.id, V2_WEEK.id, 1, 'stage1')).toBeNull();
        const v = view(ctx, a.id);
        expect(v.party?.results).toEqual([]);
        // The boss as it stood before the stage: its whole HP, nothing carried, nobody out, every creature placed as it stood.
        expect(v.party?.bossHp?.current).toBe(v.party?.bossHp?.max);
        expect(v.v2).toMatchObject({
          stagesPlayed: 0,
          nextStage: 1,
          carry: null,
          out: [],
          playing: {
            stage: 1,
            startsAt: created,
            roundMs: ROUND,
            nextRoundAt: created + 2 * ROUND,
            endsAt: created + rounds * ROUND,
          },
        });
        const fought = rows<{ n: number }>(
          ctx.sql,
          'SELECT COUNT(*) AS n FROM creatures WHERE id IN (SELECT creature_id FROM raid_placements)',
        )[0]?.n as number;
        const input = JSON.parse(
          rows<{ input: string }>(
            ctx.sql,
            "SELECT input FROM raid_results WHERE phase = 'stage1'",
          )[0]?.input ?? '{}',
        ) as { fighters: unknown[] };
        // The knocked-out creatures lost their places when the stage resolved: the view still shows them from the stored input.
        expect(v.v2?.creatures.length).toBe(input.fighters.length);
        expect(v.v2?.creatures.length).toBeGreaterThan(fought);
        expect(v.v2?.creatures.every((c) => c.hp === null)).toBe(true);
        expect(typeof v.v2?.creatures[0]?.role).toBe('string');
        expect(Array.isArray(v.v2?.creatures[0]?.talents)).toBe(true);
        expect(Array.isArray(v.v2?.creatures[0]?.gear)).toBe(true);
        // Another player's creature is on the board for everyone.
        expect(view(ctx, b.id).v2?.creatures.length).toBe(input.fighters.length);

        // After the window: the result, the carry and the outs.
        finishPlaying(ctx);
        const after = view(ctx, a.id);
        expect(after.party?.results.map((r) => r.phase)).toEqual(['stage1']);
        expect(after.v2?.playing).toBeNull();
        expect(after.v2?.stagesPlayed).toBe(1);
        expect(after.v2?.out.length).toBeGreaterThan(0);
        expect(ctx.core.raid.stats(a.id, V2_WEEK.id, 1, 'stage1')).not.toBeNull();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });

  it('shows stage 2 as the party stood after stage 1 while it plays', async () => {
    await runRaid(
      (ctx) => {
        const a = pick(stageOne(ctx), 0);
        finishPlaying(ctx);
        const afterOne = v2Of(ctx, a.id);
        ctx.clock.t = V2_WEEK.stage2 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const created = stageRow(ctx, 'stage2').created_at;
        ctx.clock.t = created + 1;
        const v = view(ctx, a.id);
        expect(v.v2?.playing).toMatchObject({ stage: 2, startsAt: created });
        expect(v.v2?.carry).toEqual(afterOne.carry);
        expect(v.v2?.stagesPlayed).toBe(1);
        expect(v.party?.results.map((r) => r.phase)).toEqual(['stage1']);
        expect(v.party?.bossHp?.current).toBe(afterOne.carry?.bossHp);
        const playing = replay(ctx, a.id, 'stage2') as PlayingReplayV2;
        expect(playing.playing).toBe(true);
        expect(playing.fighters.find((f) => afterOne.carry?.out.includes(f.key))).toBeUndefined();
        finishPlaying(ctx);
        expect(view(ctx, a.id).party?.results.map((r) => r.phase)).toEqual(['stage1', 'stage2']);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });

  it('locks the board until the window ends, exactly', async () => {
    await runRaid(
      (ctx) => {
        const players = stageOne(ctx);
        const a = pick(players, 0);
        const b = pick(players, 1);
        const created = stageRow(ctx, 'stage1').created_at;
        const endsAt = created + roundsOf(ctx, 'stage1') * ROUND;
        const spare = a.creatureIds[3] as string;
        const own = a.creatureIds[0] as string;
        const slots = rows<{ slot: number; user_id: string }>(
          ctx.sql,
          'SELECT slot, user_id FROM raid_placements ORDER BY slot',
        );
        const mine = slots.find((s) => s.user_id === a.id);
        const theirs = slots.find((s) => s.user_id === b.id);
        const refused = { ok: false, status: 409, error: 'stage_playing' };
        const gearId = giveItem(ctx.sql, a.id, 'thundercap');
        const knackRow = rows<{ species: string }>(
          ctx.sql,
          'SELECT species FROM creatures WHERE id = ?',
          own,
        )[0];
        expect(knackRow).toBeDefined();

        ctx.clock.t = endsAt - 1;
        expect(ctx.core.raid.place(a.id, HELSINKI, spare, 11)).toEqual(refused);
        expect(ctx.core.raid.unplace(a.id, HELSINKI, own)).toEqual(refused);
        expect(
          ctx.core.raid.askSwap(a.id, HELSINKI, mine?.slot as number, theirs?.slot as number),
        ).toEqual(refused);
        expect(ctx.core.raid.answerSwap(a.id, HELSINKI, 'x', 'decline')).toEqual(refused);
        expect(ctx.core.raid.cancelSwap(a.id, HELSINKI, 'x')).toEqual(refused);
        expect(ctx.core.collection.setKnack(a.id, own, null, 'raid')).toMatchObject({
          ok: false,
          status: 409,
          error: 'stage_playing',
        });
        expect(ctx.core.gear.equip(a.id, gearId, own)).toEqual(refused);
        expect(ctx.core.gear.equipBest(a.id, [own])).toEqual(refused);
        // A creature that is not in the stage can still change.
        expect(ctx.core.gear.equip(a.id, gearId, spare).ok).toBe(true);

        ctx.clock.t = endsAt;
        // The lock ends exactly at the window's end: the Knack is locked for the weekend by the earlier rule, not by the stage.
        expect(ctx.core.collection.setKnack(a.id, own, null, 'raid')).toMatchObject({
          ok: false,
          error: 'locked',
        });
        expect(
          ctx.core.raid.askSwap(a.id, HELSINKI, mine?.slot as number, theirs?.slot as number),
        ).not.toEqual(refused);
        expect(ctx.core.raid.unplace(a.id, HELSINKI, own)).not.toEqual(refused);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });

  it('queues the stage post for the end of the window', async () => {
    await runRaid(
      async (ctx) => {
        const players = [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 }));
        const first = pick(players, 0);
        await ctx.core.createSession(
          ctx.guildId,
          { id: first.id, displayName: first.name },
          '555555555555555555',
        );
        joinRaid(ctx, players);
        ctx.clock.t = V2_WEEK.stage1 + 30_000;
        ctx.core.raid.runDue(HELSINKI);
        const post = rows<{ next_attempt_at: number }>(
          ctx.sql,
          "SELECT next_attempt_at FROM discord_posts WHERE key = 'raid:2027-W02:stage1:1'",
        )[0];
        const created = stageRow(ctx, 'stage1').created_at;
        expect(post?.next_attempt_at).toBe(created + roundsOf(ctx, 'stage1') * ROUND);
        // Not due while the stage plays, due when it ends.
        expect(
          rows(
            ctx.sql,
            "SELECT 1 FROM discord_posts WHERE status = 'pending' AND next_attempt_at <= ? AND key LIKE '%stage1%'",
            created + ROUND,
          ),
        ).toEqual([]);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });

  it('shows what a creature wears and which talents it has on the board', async () => {
    await runRaid(
      (ctx) => {
        const a = pick(
          [1, 2, 3, 4].map((n) => v2Player(ctx, n, { level: 22 })),
          0,
        );
        const worn = a.creatureIds[0] as string;
        const gearId = giveItem(ctx.sql, a.id, 'thundercap', { rarity: 'rare', level: 5 });
        expect(ctx.core.gear.equip(a.id, gearId, worn).ok).toBe(true);
        joinRaid(ctx, a);
        const board = v2Of(ctx, a.id).creatures.find((c) => c.creatureId === worn);
        expect(board?.gear).toHaveLength(1);
        expect(board?.gear[0]).toMatchObject({
          baseId: 'thundercap',
          rarity: 'rare',
          itemLevel: 5,
        });
        expect(board?.gear[0]).not.toHaveProperty('id');
        expect(board?.gear[0]?.stats.length).toBeGreaterThan(0);
        expect(board?.talents.length).toBeGreaterThan(0);
        expect(board?.talents[0]?.golden).toBe(false);
        expect(typeof board?.talents[0]?.id).toBe('string');
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });
});
