/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument --
   The tools' answers are read loosely on purpose (`Json.body` is `any`): typing them would repeat the tools' own types. */
// The raid test bench (docs/design/dev-tools.md, "Raid"): clear the board, fill it with simulated players, pick the Boss Rank, play the
// stages (and open their replays) and start again. The whole loop runs through the dev routes, as the panel does.
import { RULES } from '@creatures/game';
import { knownKnacks } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import { slotBossInfo } from '../src/raid-v2-core';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { sessionCaller } from './kit';
import { HELSINKI, count, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const CORE = { ...ON, combatV2: true } as const;
const LEVEL = 22;
/** A Boss Rank a full board of level 22 plays through all three stages at (rank 7's Cinder Wyrm falls in stage 1 to a full board, and wipes a small one; rank 8's Storm Sovereign has two seats a player, so a full board is smaller and it does not fall). */
const RANK = 6;

/** The caller: a seeded v2 player with a session, and the bench's routes. */
async function caller(ctx: CoreContext, level = LEVEL) {
  const seeded = v2Player(ctx, 1, { level });
  const { call } = await sessionCaller<Json['body']>(ctx, {
    id: seeded.id,
    displayName: seeded.name,
  });
  const tool = (name: string, body: unknown = {}) => call('POST', `/api/dev/${name}`, body);
  /** A bench action that must succeed: its `result`. */
  const ok = async (name: string, body: unknown = {}) => {
    const res = await tool(name, body);
    expect(res, `${name} ${JSON.stringify(body)} ${JSON.stringify(res.body)}`).toMatchObject({
      status: 200,
    });
    return res.body.result;
  };
  const refused = async (name: string, body: unknown, error: string) => {
    expect(await tool(name, body), `${name} ${JSON.stringify(body)}`).toEqual({
      status: 409,
      body: { error },
    });
  };
  const place = (creatureId: string, slot: number) =>
    call('PUT', '/api/raid/placement', { creatureId, slot });
  /** What the client does to open a fight: the raid view's week and party, and the name the view gives the stage. */
  const replayOf = async (phase: string) => {
    const view = await call('GET', '/api/raid');
    return call('GET', `/api/raid/replay/${view.body.weekId}/${view.body.party.party}/${phase}`);
  };
  return { ...seeded, call, tool, ok, refused, place, replayOf };
}

const placedSlots = (ctx: CoreContext, userId: string): Record<string, number> =>
  Object.fromEntries(
    rows<{ creature_id: string; slot: number }>(
      ctx.sql,
      'SELECT creature_id, slot FROM raid_placements WHERE user_id = ?',
      userId,
    ).map((r) => [r.creature_id, r.slot]),
  );

const guests = (ctx: CoreContext): string[] =>
  rows<{ user_id: string }>(
    ctx.sql,
    "SELECT DISTINCT user_id FROM raid_placements WHERE user_id LIKE 'dev-guest-%' ORDER BY user_id",
  ).map((r) => r.user_id);

const weekRow = (ctx: CoreContext) =>
  rows<{
    boss_id: string;
    track_slot: number;
    status: string;
    rules_version: number;
    ladder_at: number | null;
  }>(
    ctx.sql,
    'SELECT boss_id, track_slot, status, rules_version, ladder_at FROM raid_weeks WHERE week_id = ?',
    V2_WEEK.id,
  )[0];

const trackRow = (ctx: CoreContext) =>
  rows<{
    slot: number;
    best_share_bp: number;
    failed_weekends: number;
    updated_week: string | null;
  }>(ctx.sql, 'SELECT slot, best_share_bp, failed_weekends, updated_week FROM raid_track')[0];

describe('the raid test bench', () => {
  it('sets the board up, plays the stages and their replays, and starts again from a clean board', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);

        // --- Clear: a fresh combat v2 week ---
        const cleared = await me.ok('raid-clear');
        expect(cleared).toMatchObject({ weekId: V2_WEEK.id, rank: 1, clockMovedBack: false });
        expect(weekRow(ctx)).toMatchObject({ rules_version: 2, status: 'open', ladder_at: null });

        // --- The caller places a creature; the guests fill the empty slots after it and never move it ---
        const mine = me.creatureIds[0] as string;
        expect((await me.place(mine, 5)).status).toBe(200);
        const filled = await me.ok('raid-fill');
        expect(filled.added).toBeGreaterThan(0);
        expect(placedSlots(ctx, me.id)).toEqual({ [mine]: 5 });
        const onBoard = guests(ctx);
        expect(onBoard).toHaveLength(filled.added);
        for (const g of onBoard) {
          const board = rows<{ creature_id: string }>(
            ctx.sql,
            'SELECT creature_id FROM raid_placements WHERE user_id = ?',
            g,
          );
          expect(board.length).toBeLessThanOrEqual(RULES.raid.teamSize);
          for (const { creature_id: id } of board) {
            expect(count(ctx.sql, 'creature_talents_v2', `creature_id = '${id}'`)).toBeGreaterThan(
              0,
            );
            const own = rows<{ species: string; knack: string | null }>(
              ctx.sql,
              'SELECT species, knack FROM creatures WHERE id = ?',
              id,
            )[0];
            expect(own?.knack).toBe(knownKnacks(own?.species ?? '')[0] ?? null);
          }
        }

        // --- A Boss Rank comes with its own boss, for the week and the track ---
        const ranked = await me.ok('raid-rank', { rank: RANK });
        expect(ranked).toMatchObject({ rank: RANK, bossId: slotBossInfo(RANK).bossId });
        expect(weekRow(ctx)).toMatchObject({
          track_slot: RANK,
          boss_id: slotBossInfo(RANK).bossId,
        });
        expect(trackRow(ctx)?.slot).toBe(RANK);
        // The caller's creature is still where they put it (slot 5 is on the new board too).
        expect(placedSlots(ctx, me.id)).toEqual({ [mine]: 5 });

        // --- Stage 1 first: stage 2 and the finale refuse in plain codes ---
        await me.refused('raid-play', { stage: 'stage2' }, 'play_stage1_first');
        await me.refused('raid-play', { stage: 'finale' }, 'play_stage1_first');

        // --- Play stage 1: the replay opens, as the client asks for it ---
        const one = await me.ok('raid-play', { stage: 'stage1' });
        expect(one).toMatchObject({
          stage: 1,
          live: false,
          watch: { week: V2_WEEK.id, phase: 'stage1' },
        });
        expect(count(ctx.sql, 'raid_events', "event = 'phase1' AND outcome = 'ran'")).toBe(1);
        const view = await me.call('GET', '/api/raid');
        expect(view.body.party.party).toBe(one.watch.party);
        expect(view.body.party.results.map((r: { phase: string }) => r.phase)).toEqual(['stage1']);
        const replay1 = await me.replayOf('stage1');
        expect(replay1).toMatchObject({ status: 200 });
        expect(replay1.body).toMatchObject({
          rules: 2,
          phase: 'stage1',
          stage: 1,
          weekId: V2_WEEK.id,
        });
        await me.refused('raid-play', { stage: 'stage1' }, 'already_played');
        // A fought week keeps its board and its rank.
        await me.refused('raid-fill', {}, 'fought');
        await me.refused('raid-rank', { rank: 3 }, 'fought');
        await me.refused('raid-play', { stage: 'finale' }, 'play_stage2_first');

        // --- Play stage 2 ---
        const two = await me.ok('raid-play', { stage: 'stage2' });
        expect(two).toMatchObject({ stage: 2, watch: { phase: 'stage2' } });
        expect(two.bossFell).toBe(false);
        expect((await me.replayOf('stage2')).body).toMatchObject({ phase: 'stage2', stage: 2 });
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);

        // --- The finale plays to its end at once ---
        const three = await me.ok('raid-play', { stage: 'finale' });
        expect(three).toMatchObject({ stage: 3, live: false, watch: { phase: 'finale' } });
        expect((await me.replayOf('finale')).body).toMatchObject({ phase: 'finale', rules: 2 });
        expect(weekRow(ctx)?.ladder_at).not.toBeNull();
        await me.refused('raid-play', { stage: 'finale' }, 'already_played');
        await me.refused('raid-play', { stage: 'stage1' }, 'already_played');

        // --- Clear again: the same Boss Rank, nothing placed, nothing fought, and the track is where it was ---
        const again = await me.ok('raid-clear');
        expect(again).toMatchObject({ weekId: V2_WEEK.id, rank: RANK });
        expect(weekRow(ctx)).toMatchObject({
          track_slot: RANK,
          boss_id: slotBossInfo(RANK).bossId,
          status: 'open',
          ladder_at: null,
        });
        expect(trackRow(ctx)).toMatchObject({ slot: RANK, updated_week: null });
        for (const table of ['raid_results', 'raid_placements', 'raid_parties', 'raid_live']) {
          expect(count(ctx.sql, table), table).toBe(0);
        }
        expect(count(ctx.sql, 'raid_events', "outcome = 'ran'")).toBe(0);
        // The players' creatures and what they learned stay.
        expect(count(ctx.sql, 'creatures', `user_id = '${me.id}'`)).toBe(5);
        expect(count(ctx.sql, 'creatures', "user_id LIKE 'dev-guest-%'")).toBeGreaterThan(0);

        // --- And all over again, on a board the guests had before ---
        expect((await me.place(mine, 0)).status).toBe(200);
        expect((await me.ok('raid-fill', { count: 2 })).added).toBe(2);
        expect(guests(ctx)).toHaveLength(2);
        const second = await me.ok('raid-play', { stage: 'stage1' });
        expect(second.watch).toMatchObject({ phase: 'stage1' });
        expect((await me.replayOf('stage1')).status).toBe(200);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 240_000);

  it('fills each guest with the boss piece\'s seats, and a rank change trims a player to the new boss\'s seats', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.ok('raid-clear');
        // Rank 3 is the Storm Sovereign: two seats a player.
        await me.ok('raid-rank', { rank: 3 });
        expect((await me.place(me.creatureIds[0] as string, 0)).status).toBe(200);
        await me.ok('raid-fill', { count: 3 });
        for (const g of guests(ctx)) {
          expect(count(ctx.sql, 'raid_placements', `user_id = '${g}'`)).toBe(2);
        }
        // Rank 7 is the Cinder Wyrm: four seats, so a guest brings four.
        await me.ok('raid-clear');
        await me.ok('raid-rank', { rank: 7 });
        await me.ok('raid-fill', { count: 2 });
        for (const g of guests(ctx)) {
          expect(count(ctx.sql, 'raid_placements', `user_id = '${g}'`)).toBe(4);
        }
        // Back to two seats: the earliest placed two stay.
        await me.ok('raid-rank', { rank: 3 });
        for (const g of guests(ctx)) {
          expect(count(ctx.sql, 'raid_placements', `user_id = '${g}'`)).toBe(2);
        }
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 120_000);

  it('opens the replay of every stage the same way the Raid tab asks for it', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.ok('raid-clear');
        await me.ok('raid-rank', { rank: 5 });
        expect((await me.place(me.creatureIds[0] as string, 0)).status).toBe(200);
        await me.ok('raid-fill', { count: 3 });
        await me.ok('raid-play', { stage: 'stage1' });
        // The view names the stage `stage1`; the client turns it into `phase1` for its own use and back into `stage1` for the route.
        const view = await me.call('GET', '/api/raid');
        const [result] = view.body.party.results;
        expect(result.phase).toBe('stage1');
        const fetched = await me.call(
          'GET',
          `/api/raid/replay/${view.body.weekId}/${view.body.party.party}/${result.phase}`,
        );
        expect(fetched.status).toBe(200);
        expect(fetched.body.fighters.length).toBeGreaterThan(0);
        // The stats (the card beside Watch) answer for the same fight.
        const stats = await me.call(
          'GET',
          `/api/raid/stats/${view.body.weekId}/${view.body.party.party}/stage1`,
        );
        expect(stats.status).toBe(200);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 120_000);

  it('refuses in plain codes: nobody on the board, a boss that fell, a week that was not cleared', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.ok('raid-clear');
        await me.refused('raid-play', { stage: 'stage1' }, 'nobody_placed');
        // Rank 7's boss falls in stage 1 to a full board: stage 2 and the finale say so.
        await me.ok('raid-rank', { rank: 7 });
        await me.place(me.creatureIds[0] as string, 0);
        await me.ok('raid-fill');
        const one = await me.ok('raid-play', { stage: 'stage1' });
        expect(one.bossFell).toBe(true);
        await me.refused('raid-play', { stage: 'stage2' }, 'boss_fell');
        await me.refused('raid-play', { stage: 'finale' }, 'boss_fell');
      },
      { start: V2_WEEK.open, core: CORE },
    );
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        // A small board is wiped by rank 7's boss in stage 1: creatures knocked out stay out, so nobody is left for stage 2.
        await me.ok('raid-clear');
        await me.ok('raid-rank', { rank: 7 });
        await me.place(me.creatureIds[0] as string, 0);
        await me.ok('raid-fill', { count: 3 });
        const one = await me.ok('raid-play', { stage: 'stage1' });
        expect(one.bossFell).toBe(false);
        await me.refused('raid-play', { stage: 'stage2' }, 'nobody_left');
      },
      { start: V2_WEEK.open, core: CORE },
    );
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        // A v1 week (made before the flag) is for `raid-clear` to remake.
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.sql.exec('UPDATE raid_weeks SET rules_version = 1');
        await me.refused('raid-fill', {}, 'not_v2');
        await me.refused('raid-rank', { rank: 2 }, 'not_v2');
        await me.refused('raid-play', { stage: 'stage1' }, 'not_v2');
        const cleared = await me.ok('raid-clear');
        expect(cleared).toMatchObject({ weekId: V2_WEEK.id });
        expect(weekRow(ctx)?.rules_version).toBe(2);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 240_000);

  it('plays the finale live, on request, and the finale screen has its fight', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.ok('raid-clear');
        await me.ok('raid-rank', { rank: RANK });
        await me.place(me.creatureIds[0] as string, 0);
        await me.ok('raid-fill');
        await me.ok('raid-play', { stage: 'stage1' });
        await me.ok('raid-play', { stage: 'stage2' });
        const live = await me.ok('raid-play', { stage: 'finale', live: true });
        expect(live).toMatchObject({ stage: 3, live: true, watch: null });
        expect(count(ctx.sql, 'raid_live', 'practice = 0')).toBe(1);
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);
        const snapshot = await me.call('GET', '/api/raid/live');
        expect(snapshot.body).toMatchObject({ rules: 2, status: 'live' });
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 240_000);

  it('does not let the scheduler play a stage when the board is cleared past stage 1', async () => {
    // The dev clock is ahead of the real time: clearing puts it back before stage 1.
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.ok('raid-clear');
        await me.place(me.creatureIds[0] as string, 0);
        await me.ok('raid-fill', { count: 2 });
        // Past stage 1: the scheduler plays it by itself, as it always does.
        await me.ok('clock', { advanceMs: 6 * 86_400_000 });
        expect(count(ctx.sql, 'raid_results', "phase = 'stage1'")).toBeGreaterThan(0);

        const cleared = await me.ok('raid-clear');
        expect(cleared).toMatchObject({ clockMovedBack: true, leftForPlay: [] });
        expect(cleared.clockNow).toBeLessThan(V2_WEEK.stage1);
        const state = await me.call('GET', '/api/dev/state');
        expect(state.body.clock.now).toBe(cleared.clockNow);
        expect(state.body.clock.now).toBeGreaterThanOrEqual(ctx.clock.t);
        // Nothing is played by the requests and the alarm that follow.
        expect(ctx.core.raid.runDue(HELSINKI)).toBe(0);
        await me.call('GET', '/api/raid');
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect(count(ctx.sql, 'raid_events', "outcome = 'ran' AND event <> 'weekStart'")).toBe(0);
        expect(weekRow(ctx)?.status).toBe('open');
        // The bench plays it when asked.
        await me.place(me.creatureIds[0] as string, 0);
        await me.ok('raid-play', { stage: 'stage1' });
        expect(count(ctx.sql, 'raid_results', "phase = 'stage1'")).toBeGreaterThan(0);
      },
      { start: V2_WEEK.open, core: CORE },
    );
    // The real time is already past stage 1: the clock cannot go back, so the due events are left for the bench, not the scheduler.
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        const cleared = await me.ok('raid-clear');
        expect(cleared).toMatchObject({ clockMovedBack: false, leftForPlay: ['phase1'] });
        await me.place(me.creatureIds[0] as string, 0);
        await me.ok('raid-fill', { count: 2 });
        expect(ctx.core.raid.runDue(HELSINKI)).toBe(0);
        await me.call('GET', '/api/raid');
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect(weekRow(ctx)?.status).toBe('open');
        const one = await me.ok('raid-play', { stage: 'stage1' });
        expect(one.watch).toMatchObject({ phase: 'stage1' });
        expect(count(ctx.sql, 'raid_events', "event = 'phase1' AND outcome = 'ran'")).toBe(1);
        expect((await me.replayOf('stage1')).status).toBe(200);
      },
      { start: V2_WEEK.stage1 + 2 * 3_600_000, core: CORE },
    );
  }, 240_000);

  it('answers 404 without the flag, and the bodies are checked strictly', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        for (const [tool, body] of [
          ['raid-clear', {}],
          ['raid-fill', {}],
          ['raid-rank', { rank: 2 }],
          ['raid-play', { stage: 'stage1' }],
        ] as const) {
          expect(await me.tool(tool, body), tool).toEqual({
            status: 404,
            body: { error: 'not_found' },
          });
        }
        expect(count(ctx.sql, 'raid_results')).toBe(0);
      },
      { start: V2_WEEK.open, core: ON },
    );
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        const bad: [string, unknown][] = [
          ['raid-clear', { extra: 1 }],
          ['raid-fill', { count: 0 }],
          ['raid-fill', { count: 15 }],
          ['raid-fill', { count: 2.5 }],
          ['raid-fill', { nope: 1 }],
          ['raid-rank', {}],
          ['raid-rank', { rank: 0 }],
          ['raid-rank', { rank: 99 }],
          ['raid-play', {}],
          ['raid-play', { stage: 'stage3' }],
          ['raid-play', { stage: 'stage1', live: true }],
          ['raid-play', { stage: 'finale', live: 'yes' }],
        ];
        for (const [tool, body] of bad) {
          expect(await me.tool(tool, body), `${tool} ${JSON.stringify(body)}`).toEqual({
            status: 400,
            body: { error: 'invalid_body' },
          });
        }
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 120_000);
});
