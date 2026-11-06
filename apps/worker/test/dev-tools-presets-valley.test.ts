/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of response bodies (`Json.body` is `any` on purpose). */
// The roster presets on a server that already has valley rows (all three flags on): the creatures a preset replaces sit on posts, on the
// raid board and in the valley's tables. The posts stay (bought seats keep what they stored), nothing points at a creature that is gone,
// and the next pass and `GET /api/state` read the player's valley without trouble.
import { ValleyViewSchema, type ValleyView } from '@creatures/game';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { HOUR, newKey, sessionCaller } from './kit';
import { HELSINKI, joinRaid, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const ALL = { ...ON, combatV2: true, valleySystems: true } as const;

describe('apply-roster-preset on a valley with posts', () => {
  it('keeps the bought seats (emptied), leaves no row naming a gone creature, and the next passes work', async () => {
    await runRaid(
      async (ctx: CoreContext) => {
        const ann = v2Player(ctx, 1, { name: 'Ann' });
        const { call } = await sessionCaller<Json['body']>(ctx, {
          id: ann.id,
          displayName: 'Ann',
        });
        const view = (res: Json): ValleyView => v.parse(ValleyViewSchema, res.body.valley);
        expect((await call('GET', '/api/state')).status).toBe(200);
        // A scout seat and an anvil with a team order, each with a creature, and a third creature on the raid board.
        const scout = await call('POST', '/api/valley/seat/buy', {
          idempotencyKey: newKey('seat'),
        });
        expect(scout.status).toBe(200);
        expect(
          (
            await call('POST', '/api/valley/seat', {
              seatId: scout.body.seatId,
              creatureId: ann.creatureIds[0],
              destination: 'tidepools',
            })
          ).status,
        ).toBe(200);
        const anvil = await call('POST', '/api/valley/anvil/buy', {
          idempotencyKey: newKey('anvil'),
        });
        expect(anvil.status).toBe(200);
        expect(
          (
            await call('POST', '/api/valley/seat', {
              seatId: anvil.body.seatId,
              creatureId: ann.creatureIds[1],
            })
          ).status,
        ).toBe(200);
        const order = await call('POST', '/api/valley/order', {
          action: 'add',
          seatId: anvil.body.seatId,
          forTeam: true,
          reach: 'none',
        });
        expect(order.status, JSON.stringify(order.body)).toBe(200);
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, [ann], { creatures: 3 });
        // The seat has stored goods: they stay with the seat.
        ctx.sql.exec(
          'UPDATE valley_seats SET scrap = 17, shards = 3 WHERE seat_id = ?',
          scout.body.seatId,
        );
        const old = new Set(ann.creatureIds);

        const res = await call('POST', '/api/dev/apply-roster-preset', {
          preset: 'week-8',
          userId: ann.id,
          confirm: 'ann',
        });
        expect(res.status, JSON.stringify(res.body)).toBe(200);

        // The seats are still Ann's, empty, with what they held; the order waits on its anvil.
        const seats = rows<{ seat_id: string; creature_id: string | null; scrap: number }>(
          ctx.sql,
          'SELECT seat_id, creature_id, scrap FROM valley_seats WHERE user_id = ? ORDER BY seat_id',
          ann.id,
        );
        expect(seats).toHaveLength(2);
        expect(seats.every((s) => s.creature_id === null)).toBe(true);
        expect(seats.find((s) => s.seat_id === scout.body.seatId)?.scrap).toBe(17);
        expect(
          rows(ctx.sql, 'SELECT 1 FROM forge_orders WHERE seat_id = ?', anvil.body.seatId),
        ).toHaveLength(1);
        // No valley row, board place or post names a creature that is gone.
        const mine = rows<{ id: string }>(
          ctx.sql,
          'SELECT id FROM creatures WHERE user_id = ?',
          ann.id,
        ).map((r) => r.id);
        expect(mine.some((id) => old.has(id))).toBe(false);
        for (const table of ['valley_creatures', 'raid_placements', 'valley_seats']) {
          const named = rows<{ id: string | null }>(
            ctx.sql,
            `SELECT creature_id AS id FROM ${table} WHERE user_id = ? AND creature_id IS NOT NULL`,
            ann.id,
          ).map((r) => r.id as string);
          expect(
            named.filter((id) => !mine.includes(id)),
            table,
          ).toEqual([]);
        }

        // The next pass and the valley read work, now and a day later; the seats can take the new creatures.
        const first = await call('GET', '/api/state');
        expect(first.status).toBe(200);
        expect(view(first).seats).toHaveLength(1);
        ctx.clock.t += 24 * HOUR;
        const later = await call('GET', '/api/state');
        expect(later.status).toBe(200);
        expect(view(later).anvils).toHaveLength(1);
        expect(
          (
            await call('POST', '/api/valley/seat', {
              seatId: scout.body.seatId,
              creatureId: mine[0],
              destination: 'tidepools',
            })
          ).status,
        ).toBe(200);
      },
      { start: V2_WEEK.open, core: ALL },
    );
  }, 120_000);
});
