/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   The tools' answers are read loosely on purpose (`Json.body` is `any`). */
// The dev tools of combat v2 on a server that has valley rows (all three flags on): the raid test bench, the seats override and the
// Convert tool each start from a state a tester really has (a post on a placed creature, a v1 week with a stored lock), and the valley
// goes on working after each (no error, no negative time, the post still its owner's).
import { ValleyViewSchema, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { DAY, HOUR, newKey, sessionCaller } from './kit';
import { count, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const ALL = { ...ON, combatV2: true, valleySystems: true } as const;

async function tester(ctx: CoreContext) {
  const seeded = v2Player(ctx, 1, { level: 22 });
  const { call } = await sessionCaller<Json['body']>(ctx, {
    id: seeded.id,
    displayName: seeded.name,
  });
  const view = async (): Promise<ValleyView> => {
    const res = await call('GET', '/api/state');
    expect(res.status).toBe(200);
    return v.parse(ValleyViewSchema, res.body.valley);
  };
  const ok = async (name: string, body: unknown = {}) => {
    const res = await call('POST', `/api/dev/${name}`, body);
    expect(res, `${name} ${JSON.stringify(res.body)}`).toMatchObject({ status: 200 });
    return res.body.result;
  };
  await view();
  const bought = await call('POST', '/api/valley/seat/buy', { idempotencyKey: newKey('seat') });
  expect(bought.status).toBe(200);
  const seatId = bought.body.seatId as string;
  const posted = await call('POST', '/api/valley/seat', {
    seatId,
    creatureId: seeded.creatureIds[0],
    destination: 'tidepools',
  });
  expect(posted.status).toBe(200);
  return { ...seeded, call, view, ok, seatId };
}

const scoutHours = (ctx: CoreContext, id: string): number =>
  rows<{ scout_hours: number }>(
    ctx.sql,
    'SELECT scout_hours FROM valley_creatures WHERE creature_id = ?',
    id,
  )[0]?.scout_hours ?? 0;

describe('the raid test bench with a posted raider', () => {
  it('clears, fills, plays and clears again while the valley keeps settling (no error, no time lost below zero)', async () => {
    await runRaid(
      async (ctx) => {
        const me = await tester(ctx);
        const post = me.creatureIds[0] as string;
        await me.ok('raid-clear');
        expect(
          (await me.call('PUT', '/api/raid/placement', { creatureId: post, slot: 0 })).status,
        ).toBe(200);
        await me.ok('raid-fill');
        await me.ok('raid-rank', { rank: 6 });
        // The bench plays stage 1 now (a Monday): the post pauses by the calendar, from Saturday's lock, not before.
        await me.ok('raid-play', { stage: 'stage1' });
        let hours = scoutHours(ctx, post);
        ctx.clock.t += 5 * HOUR;
        expect((await me.view()).seats[0]?.paused).toBeNull();
        expect(scoutHours(ctx, post)).toBeGreaterThanOrEqual(hours);
        await me.ok('raid-play', { stage: 'stage2' });
        await me.ok('raid-play', { stage: 'finale' });
        // The finale's done marker is earlier than the calendar's lock: an empty window, so nothing pauses and nothing goes negative.
        hours = scoutHours(ctx, post);
        ctx.clock.t += 5 * HOUR;
        expect((await me.view()).seats[0]?.paused).toBeNull();
        expect(scoutHours(ctx, post)).toBeGreaterThanOrEqual(hours);
        // Clearing the board takes the placement away and the valley is none the worse; the seat is still the player's.
        await me.ok('raid-clear');
        expect(count(ctx.sql, 'raid_placements', `user_id = '${me.id}'`)).toBe(0);
        ctx.clock.t += HOUR;
        const after = await me.view();
        expect(after.seats).toHaveLength(1);
        expect(after.seats[0]?.paused).toBeNull();
        expect(
          rows(ctx.sql, 'SELECT creature_id FROM valley_seats WHERE seat_id = ?', me.seatId),
        ).toEqual([{ creature_id: post }]);
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 120_000);

  it('moves the seats override with a posted creature on the board, and the valley pass reads the refitted board', async () => {
    await runRaid(
      async (ctx) => {
        const me = await tester(ctx);
        const post = me.creatureIds[0] as string;
        await me.ok('raid-clear');
        for (const [i, id] of me.creatureIds.slice(0, 3).entries()) {
          expect(
            (await me.call('PUT', '/api/raid/placement', { creatureId: id, slot: i })).status,
          ).toBe(200);
        }
        await me.ok('raid-seats', { seats: 1 });
        // A smaller seat count keeps one creature of the three on the board; whichever it is, the valley still passes.
        expect(count(ctx.sql, 'raid_placements', `user_id = '${me.id}'`)).toBeLessThanOrEqual(1);
        ctx.clock.t += 6 * HOUR;
        expect((await me.view()).seats).toHaveLength(1);
        await me.ok('raid-seats', { seats: null });
        ctx.clock.t += 6 * HOUR;
        expect((await me.view()).seats[0]?.paused).toBeNull();
        expect(
          rows(ctx.sql, 'SELECT creature_id FROM valley_seats WHERE seat_id = ?', me.seatId),
        ).toEqual([{ creature_id: post }]);
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 120_000);
});

describe('combat-v2-convert on a server with valley rows and a v1 week', () => {
  it('rebuilds the week as v2, takes the old placements (and so the pause) away, and leaves the post and the valley alone', async () => {
    await runRaid(
      async (ctx) => {
        const me = await tester(ctx);
        const post = me.creatureIds[0] as string;
        // The week was made before the flag was on: a v1 week with the post's creature placed and a v1 lock stored.
        ctx.sql.exec('DELETE FROM raid_weeks');
        ctx.sql.exec(
          `INSERT INTO raid_weeks (week_id, boss_id, status, created_at, season_index, festival, difficulty_version, rank, effective_rank)
           VALUES (?, 'tidal-colossus', 'open', ?, 0, 0, 99, 1, 1)`,
          V2_WEEK.id,
          ctx.clock.t,
        );
        ctx.sql.exec(
          'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, 1, 0, ?, ?)',
          V2_WEEK.id,
          me.id,
          post,
        );
        ctx.sql.exec(
          'INSERT INTO raid_parties (week_id, party, hp_max, hp_current) VALUES (?, 1, 100, 100)',
          V2_WEEK.id,
        );
        ctx.sql.exec(
          'INSERT INTO raid_party_members (week_id, user_id, party, joined_at) VALUES (?, ?, 1, ?)',
          V2_WEEK.id,
          me.id,
          ctx.clock.t,
        );
        ctx.core.raid.forgetSchedule();
        const result = await me.ok('combat-v2-convert');
        expect(result.weekRebuilt).toBe(true);
        expect(
          rows(ctx.sql, 'SELECT rules_version FROM raid_weeks WHERE week_id = ?', V2_WEEK.id),
        ).toEqual([{ rules_version: 2 }]);
        expect(count(ctx.sql, 'raid_placements')).toBe(0);
        // The post stands, and a visit during v1's Friday lock no longer pauses it (the v2 week has no Friday lock).
        ctx.clock.t = V2_WEEK.stage1 - DAY - 2 * HOUR;
        const seen = await me.view();
        expect(seen.seats).toHaveLength(1);
        expect(seen.seats[0]?.paused).toBeNull();
        // And a second run changes nothing.
        expect(await me.ok('combat-v2-convert')).toMatchObject({
          creatures: 0,
          weekRebuilt: false,
        });
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 120_000);
});
