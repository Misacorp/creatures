// The combat v2 arena (Misa, 2026-11-03, docs/design/combat/integration.md): each boss's piece is the seats one player brings; the
// board is one piece per player plus a spare piece until stage 1, which drops the spare and moves what stood in it.
import { describe, expect, it } from 'vitest';
import type { RaidV2Part } from '../src/raid-v2-view';
import type { CoreContext } from './helpers';
import { HELSINKI, rows, runRaid } from './raid-helpers';
import { V2_WEEK, carryOf, v2Player } from './raid-v2-helpers';

const V2 = { combatV2: true } as const;
const run = (fn: (ctx: CoreContext) => void) =>
  runRaid(fn, { start: V2_WEEK.open, core: V2 });

const setSlot = (ctx: CoreContext, slot: number): void => {
  ctx.sql.exec(
    'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, ?, 0, 0)',
    slot,
  );
};
const v2Of = (ctx: CoreContext, id: string): RaidV2Part => {
  const v = ctx.core.raid.view(id, HELSINKI).v2;
  if (v === undefined) throw new Error('not a v2 view');
  return v;
};
type Player = ReturnType<typeof v2Player>;
const place = (ctx: CoreContext, p: Player, k: number, slot: number) =>
  ctx.core.raid.place(p.id, HELSINKI, p.creatureIds[k] as string, slot);
const slotsOf = (ctx: CoreContext, p: Player): number[] =>
  rows<{ slot: number }>(
    ctx.sql,
    'SELECT slot FROM raid_placements WHERE user_id = ? ORDER BY slot',
    p.id,
  ).map((r) => r.slot);
const FULL = { ok: false, status: 409, error: 'board_full' } as const;

describe('the seats of a piece', () => {
  it('Storm Sovereign: two seats a player, and a third player can still join', async () => {
    await run((ctx) => {
      setSlot(ctx, 3);
      const [a, b, c] = [1, 2, 3].map((n) => v2Player(ctx, n, { level: 22 })) as [
        Player,
        Player,
        Player,
      ];
      expect(place(ctx, a, 0, 0)).toMatchObject({ ok: true });
      expect(place(ctx, a, 1, 1)).toMatchObject({ ok: true });
      // The cap is the piece's two seats, not three.
      expect(place(ctx, a, 2, 2)).toEqual(FULL);
      expect(ctx.core.raid.needsPlacement(a.id, HELSINKI).needed).toBe(false);
      expect(place(ctx, b, 0, 2)).toMatchObject({ ok: true });
      expect(place(ctx, b, 1, 3)).toMatchObject({ ok: true });
      expect(v2Of(ctx, a.id)).toMatchObject({ rows: 2, seats: 2, cols: 4, spare: true });
      // Four columns are eight seats; the third player joins into the free ones.
      expect(place(ctx, c, 0, 4)).toMatchObject({ ok: true });
      expect(place(ctx, c, 1, 5)).toMatchObject({ ok: true });
      expect(ctx.core.raid.needsPlacement(c.id, HELSINKI).needed).toBe(false);
    });
  }, 60_000);

  it('Storm Sovereign: the spare column appears and goes at stage 1, and what stood in it moves', async () => {
    await run((ctx) => {
      setSlot(ctx, 3);
      const [a, b, c, d, e] = [1, 2, 3, 4, 5].map((n) => v2Player(ctx, n, { level: 22 })) as [
        Player,
        Player,
        Player,
        Player,
        Player,
      ];
      // Three players fill six seats (slots 0 to 5, column-major).
      for (const [i, p] of [a, b, c].entries()) {
        expect(place(ctx, p, 0, i * 2)).toMatchObject({ ok: true });
        expect(place(ctx, p, 1, i * 2 + 1)).toMatchObject({ ok: true });
      }
      // The fourth player joins, so the board is five columns: the spare one is slots 8 and 9.
      expect(place(ctx, d, 0, 8)).toMatchObject({ ok: true });
      expect(place(ctx, d, 1, 9)).toMatchObject({ ok: true });
      expect(v2Of(ctx, a.id)).toMatchObject({ cols: 5, spare: true, players: 4 });
      expect(ctx.core.raid.view(a.id, HELSINKI).party?.rowLength).toBe(10);
      // A fifth player arrives and still finds room: the board widens again.
      expect(place(ctx, e, 0, 6)).toMatchObject({ ok: true });
      expect(slotsOf(ctx, e)).toEqual([6]);
      expect(v2Of(ctx, a.id)).toMatchObject({ cols: 6, spare: true, players: 5 });
      // Stage 1 locks the five players: five columns, no spare, and the creatures beyond move to free seats.
      ctx.clock.t = V2_WEEK.stage1 + 5000;
      ctx.core.raid.runDue(HELSINKI);
      expect(rows(ctx.sql, 'SELECT v2_players FROM raid_parties')).toEqual([{ v2_players: 5 }]);
      const after = rows<{ slot: number }>(ctx.sql, 'SELECT slot FROM raid_placements').map(
        (r) => r.slot,
      );
      expect(after.every((s) => s < 10)).toBe(true);
      expect(new Set(after).size).toBe(after.length);
      // All nine creatures fought (a knocked-out one's placement is deleted after the stage, so the carry is the proof): none was lost
      // from the spare column.
      const carry = carryOf(ctx.sql);
      const fought = [...Object.keys(carry.hp), ...carry.out];
      expect(fought).toHaveLength(9);
      for (const id of d.creatureIds.slice(0, 2)) expect(fought).toContain(id);
      expect(v2Of(ctx, a.id)).toMatchObject({ cols: 5, spare: false, players: 5 });
    });
  }, 120_000);

  it('a three-row boss takes three creatures a player, the four-row Cinder Wyrm four', async () => {
    await run((ctx) => {
      const a = v2Player(ctx, 1, { level: 22 });
      for (const k of [0, 1, 2]) expect(place(ctx, a, k, k)).toMatchObject({ ok: true });
      expect(place(ctx, a, 3, 3)).toEqual(FULL);
      expect(v2Of(ctx, a.id)).toMatchObject({ rows: 3, seats: 3 });
    });
    await run((ctx) => {
      setSlot(ctx, 2);
      const a = v2Player(ctx, 1, { level: 22 });
      for (const k of [0, 1, 2, 3]) expect(place(ctx, a, k, k)).toMatchObject({ ok: true });
      expect(place(ctx, a, 4, 4)).toEqual(FULL);
      expect(v2Of(ctx, a.id)).toMatchObject({ rows: 4, seats: 4, cols: 4, spare: true });
      expect(ctx.core.raid.needsPlacement(a.id, HELSINKI).needed).toBe(false);
    });
  }, 60_000);

  it('a v1 week keeps three a player and has no seats in its view', async () => {
    await runRaid(
      (ctx) => {
        const a = v2Player(ctx, 1, { level: 22 });
        for (const k of [0, 1, 2]) expect(place(ctx, a, k, k)).toMatchObject({ ok: true });
        expect(place(ctx, a, 3, 3)).toEqual(FULL);
        expect(ctx.core.raid.view(a.id, HELSINKI).v2).toBeUndefined();
        return Promise.resolve();
      },
      { start: V2_WEEK.open },
    );
  }, 60_000);
});
