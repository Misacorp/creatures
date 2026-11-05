/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   The tool's answer is read loosely on purpose (`Json.body` is `any`): typing it would repeat the tool's own types. */
// The `combat-v2-convert` dev tool and the clock's next phase on a combat v2 week (docs/design/combat/integration.md, sections 1 and 10).
import { WEEK_TABLES } from '../src/raid';
import { slotBossInfo } from '../src/raid-v2-core';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { sessionCaller } from './kit';
import { HELSINKI, count, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const CORE = { ...ON, combatV2: true } as const;
const LEVEL = 22;

/** A server on its second lap (slot 6, two failed weekends). */
const secondLap = (ctx: CoreContext): void => {
  ctx.sql.exec(
    'INSERT OR REPLACE INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2)',
  );
};

/** The caller: a seeded v2 player with a session. */
async function caller(ctx: CoreContext) {
  const seeded = v2Player(ctx, 1, { level: LEVEL });
  const { call } = await sessionCaller<Json['body']>(ctx, {
    id: seeded.id,
    displayName: seeded.name,
  });
  return { ...seeded, call };
}

describe('the clock on a combat v2 week', () => {
  it("the clock's next phase follows the week's own calendar", async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        ctx.core.raid.currentWeek(HELSINKI);
        const next = await me.call('POST', '/api/dev/clock', { to: 'next-phase' });
        expect(next).toMatchObject({ status: 200 });
        // The next event of a v2 week is stage 1 on Saturday, not a v1 Friday.
        expect(next.body.result.now).toBe(V2_WEEK.stage1);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });
});

describe('the combat-v2-convert dev tool', () => {
  describe('on a week made under the old rules', () => {
    /** A v1 week W02 with the caller placed and phase 1 resolved, a v1 week W03 beside it, and a server on slot 6. */
    const oldWeeks = (ctx: CoreContext, userId: string, creatureIds: string[]): void => {
      secondLap(ctx);
      // The caller's session may have made the week already, under v2: the old weeks replace it.
      ctx.sql.exec('DELETE FROM raid_weeks');
      for (const weekId of [V2_WEEK.id, '2027-W03']) {
        ctx.sql.exec(
          `INSERT INTO raid_weeks (week_id, boss_id, status, created_at, season_index, festival, difficulty_version, rank, effective_rank)
           VALUES (?, 'tidal-colossus', 'open', ?, 0, 0, 99, 1, 1)`,
          weekId,
          ctx.clock.t,
        );
        ctx.sql.exec(
          'INSERT INTO raid_parties (week_id, party, hp_max, hp_current) VALUES (?, 1, 100, 60)',
          weekId,
        );
        ctx.sql.exec(
          'INSERT INTO raid_party_members (week_id, user_id, party, joined_at) VALUES (?, ?, 1, ?)',
          weekId,
          userId,
          ctx.clock.t,
        );
        ctx.sql.exec(
          `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
           VALUES (?, 1, 'phase1', 's', '{}', '{}', '{}', ?)`,
          weekId,
          ctx.clock.t,
        );
        ctx.sql.exec(
          "INSERT INTO raid_events (week_id, event, outcome, done_at) VALUES (?, 'phase1', 'ran', ?)",
          weekId,
          ctx.clock.t,
        );
      }
      for (const [slot, id] of creatureIds.slice(0, 3).entries()) {
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, ?, ?, ?)',
          V2_WEEK.id,
          slot,
          userId,
          id,
        );
      }
      ctx.sql.exec(
        'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
        '2027-W03',
        userId,
        creatureIds[0],
      );
    };
    const perWeek = (ctx: CoreContext, weekId: string) => ({
      results: count(ctx.sql, 'raid_results', `week_id = '${weekId}'`),
      events: count(ctx.sql, 'raid_events', `week_id = '${weekId}'`),
      placements: count(ctx.sql, 'raid_placements', `week_id = '${weekId}'`),
      members: count(ctx.sql, 'raid_party_members', `week_id = '${weekId}'`),
      parties: count(ctx.sql, 'raid_parties', `week_id = '${weekId}'`),
    });

    it('rebuilds the clock week as a v2 week, leaves other weeks alone, changes nothing twice, and then plays stage 1', async () => {
      await runRaid(
        async (ctx) => {
          const me = await caller(ctx);
          oldWeeks(ctx, me.id, me.creatureIds);
          // Without the rebuild the bench refuses to play (it says to clear first).
          expect(await me.call('POST', '/api/dev/raid-play', { stage: 'stage1' })).toMatchObject({
            status: 409,
            body: { error: 'not_v2' },
          });
          const otherBefore = perWeek(ctx, '2027-W03');
          const otherRow = rows(ctx.sql, "SELECT * FROM raid_weeks WHERE week_id = '2027-W03'");
          const creaturesBefore = rows(
            ctx.sql,
            'SELECT id, user_id, level FROM creatures ORDER BY id',
          );
          const trackBefore = rows(ctx.sql, 'SELECT * FROM raid_track');

          const first = await me.call('POST', '/api/dev/combat-v2-convert', {});
          expect(first.status).toBe(200);
          expect(first.body.result).toMatchObject({
            weekRebuilt: true,
            weekId: V2_WEEK.id,
            slot: 6,
          });
          expect(
            rows(
              ctx.sql,
              'SELECT rules_version, track_slot, boss_id, status FROM raid_weeks WHERE week_id = ?',
              V2_WEEK.id,
            ),
          ).toEqual([
            { rules_version: 2, track_slot: 6, boss_id: slotBossInfo(6).bossId, status: 'open' },
          ]);
          expect(perWeek(ctx, V2_WEEK.id)).toEqual({
            results: 0,
            events: 0,
            placements: 0,
            members: 0,
            parties: 0,
          });
          // Other weeks, the track and the players' creatures are untouched.
          expect(perWeek(ctx, '2027-W03')).toEqual(otherBefore);
          expect(rows(ctx.sql, "SELECT * FROM raid_weeks WHERE week_id = '2027-W03'")).toEqual(
            otherRow,
          );
          expect(rows(ctx.sql, 'SELECT id, user_id, level FROM creatures ORDER BY id')).toEqual(
            creaturesBefore,
          );
          expect(rows(ctx.sql, 'SELECT * FROM raid_track')).toEqual(trackBefore);

          // A second run changes nothing.
          const weekRows = rows(ctx.sql, 'SELECT * FROM raid_weeks ORDER BY week_id');
          const second = await me.call('POST', '/api/dev/combat-v2-convert', {});
          expect(second.body.result).toMatchObject({ weekRebuilt: false, weekId: V2_WEEK.id });
          expect(rows(ctx.sql, 'SELECT * FROM raid_weeks ORDER BY week_id')).toEqual(weekRows);

          // And the bench plays stage 1 on it.
          const placed = await me.call('PUT', '/api/raid/placement', {
            creatureId: me.creatureIds[0],
            slot: 0,
          });
          expect(placed.status).toBe(200);
          const stage = await me.call('POST', '/api/dev/raid-play', { stage: 'stage1' });
          expect(stage).toMatchObject({ status: 200 });
          expect(stage.body.result).toMatchObject({ stage: 1, watch: { phase: 'stage1' } });
        },
        { start: V2_WEEK.open, core: CORE },
      );
    });

    it('clears every table that is keyed by a week (a new one must be added to the list, or be the valley weather)', async () => {
      await runRaid(
        (ctx) => {
          const keyed = rows<{ name: string }>(
            ctx.sql,
            `SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) c
             WHERE m.type = 'table' AND c.name = 'week_id' ORDER BY m.name`,
          ).map((r) => r.name);
          expect(keyed.filter((t) => t !== 'weather_days')).toEqual([...WEEK_TABLES].sort());
        },
        { start: V2_WEEK.open, core: CORE },
      );
    });

    it('leaves a v2 week alone', async () => {
      await runRaid(
        async (ctx) => {
          secondLap(ctx);
          const me = await caller(ctx);
          ctx.core.raid.currentWeek(HELSINKI);
          const before = rows(ctx.sql, 'SELECT * FROM raid_weeks');
          const res = await me.call('POST', '/api/dev/combat-v2-convert', {});
          expect(res.body.result).toMatchObject({ weekRebuilt: false, slot: 6 });
          expect(rows(ctx.sql, 'SELECT * FROM raid_weeks')).toEqual(before);
        },
        { start: V2_WEEK.open, core: CORE },
      );
    });
  });
});
