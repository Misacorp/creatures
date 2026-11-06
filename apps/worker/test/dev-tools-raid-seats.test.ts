/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return --
   The tools' answers and the view are read loosely on purpose (`Json.body` is `any`): typing them would repeat the server's own types. */
// The "Creatures per player" override of the raid (docs/design/dev-tools.md, "Raid"; integration.md, section 10): the arena's seats per
// player, the board it makes, the placement cap, the boss's size and the default that puts the boss's own piece back.
import { describe, expect, it } from 'vitest';
import { arenaOf, colsFor, effectivePlayers, slotBossInfo, weekendBoss } from '../src/raid-v2-core';
import { MAX_RAID_SEATS } from '../src/dev-state';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { sessionCaller } from './kit';
import { count, rows, runRaid } from './raid-helpers';
import { V2_WEEK, v2Player } from './raid-v2-helpers';

const CORE = { ...ON, combatV2: true } as const;
/** Eight distinct lines of evolved forms (one creature each). */
const EIGHT = [
  'tidewing',
  'pyrelynx',
  'thornbuck',
  'voltaro',
  'fogwyrm',
  'magmole',
  'tempestray',
  'ancientshell',
];

async function caller(ctx: CoreContext, n = 1) {
  const seeded = v2Player(ctx, n, { level: 22, creatures: 8, species: EIGHT });
  const { call } = await sessionCaller<Json['body']>(ctx, {
    id: seeded.id,
    displayName: seeded.name,
  });
  const seats = (body: unknown) => call('POST', '/api/dev/raid-seats', body);
  const view = async () => (await call('GET', '/api/raid')).body;
  const place = (creatureId: string, slot: number) =>
    call('PUT', '/api/raid/placement', { creatureId, slot });
  return { ...seeded, call, seats, view, place };
}

describe('the seats and the board of an arena', () => {
  it('uses the boss’s own piece by default and the override when one is set', () => {
    const own = slotBossInfo(1);
    expect(arenaOf(1, null)).toEqual({
      bossId: own.bossId,
      rows: own.rows,
      seats: own.seats,
      pieceSeats: own.seats,
    });
    expect(arenaOf(1, 8)).toMatchObject({ rows: own.rows, seats: 8, pieceSeats: own.seats });
  });

  it('makes the board as wide as the pieces need', () => {
    const arena = arenaOf(1, null);
    // The boss's own piece is one column per player (and one for the spare): as before.
    expect(colsFor(3, true, arena)).toBe(4);
    expect(colsFor(3, false, arena)).toBe(3);
    expect(colsFor(3, true)).toBe(4);
    const wide = arenaOf(1, 8);
    expect(colsFor(3, false, wide)).toBe(Math.ceil((3 * 8) / wide.rows));
    expect(colsFor(3, true, wide)).toBe(Math.ceil((4 * 8) / wide.rows));
    // One seat each still makes one column.
    expect(colsFor(1, false, arenaOf(1, 1))).toBe(1);
  });

  it('counts effective players as ceil(seats on the board / the boss’s own seats per player)', () => {
    const own = arenaOf(1, null);
    expect(effectivePlayers(3, own)).toBe(3);
    expect(effectivePlayers(1, own)).toBe(1);
    const { seats } = slotBossInfo(1);
    const eight = arenaOf(1, 8);
    expect(effectivePlayers(3, eight)).toBe(Math.ceil((3 * 8) / seats));
    // Fewer seats than the piece: a smaller boss, never under one player.
    expect(effectivePlayers(1, arenaOf(1, 1))).toBe(1);
    expect(effectivePlayers(2, arenaOf(1, 1))).toBe(Math.max(1, Math.ceil(2 / seats)));
    // It is the board's width without the spare piece (a boss's piece is a full column), so the boss and the board agree.
    for (const players of [1, 2, 3, 5]) {
      for (const k of [1, 2, 4, 8]) {
        const arena = arenaOf(1, k);
        expect(effectivePlayers(players, arena)).toBe(colsFor(players, false, arena));
      }
    }
    // The boss it makes: more players than four widen it, three effective players are a smaller boss than four.
    expect(weekendBoss(1, effectivePlayers(3, eight)).cols).toBe(effectivePlayers(3, eight));
  });
});

describe('the creatures-per-player tool', () => {
  it('changes the seats, the board and the placement limit, and the default puts the boss’s piece back', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        expect((await me.call('POST', '/api/dev/raid-clear', {})).status).toBe(200);
        const own = slotBossInfo(1);
        const before = (await me.view()).v2;
        expect(before).toMatchObject({ seats: own.seats, rows: own.rows, cols: 2, spare: true });

        // Eight seats: the view says so and the board is as wide as eight seats need (a spare piece included).
        const set = await me.seats({ seats: 8 });
        expect(set).toMatchObject({
          status: 200,
          body: { result: { seats: 8, seatsPerPlayer: 8, pieceSeats: own.seats } },
        });
        const wide = (await me.view()).v2;
        expect(wide).toMatchObject({ seats: 8, rows: own.rows, spare: true });
        expect(wide.cols).toBe(Math.ceil((2 * 8) / own.rows));
        // All eight creatures can be placed, a ninth player-creature does not exist; the piece's seats would have refused the fourth.
        const [first, ...rest] = me.creatureIds as [string, ...string[]];
        expect((await me.place(first, 0)).status).toBe(200);
        for (const [i, id] of rest.entries()) {
          expect((await me.place(id, i + 1)).status, `creature ${String(i + 2)}`).toBe(200);
        }
        expect(count(ctx.sql, 'raid_placements', `user_id = '${me.id}'`)).toBe(8);

        // Back to the default: the board is refitted at once to the boss's piece (the earliest placed stay).
        const back = await me.seats({ seats: null });
        expect(back).toMatchObject({ status: 200, body: { result: { seats: null } } });
        expect(count(ctx.sql, 'raid_placements', `user_id = '${me.id}'`)).toBe(own.seats);
        const kept = rows<{ creature_id: string }>(
          ctx.sql,
          'SELECT creature_id FROM raid_placements ORDER BY rowid',
        ).map((r) => r.creature_id);
        expect(kept).toEqual(me.creatureIds.slice(0, own.seats));
        expect((await me.view()).v2).toMatchObject({ seats: own.seats, cols: 2, spare: true });
        const ninth = me.creatureIds[own.seats] as string;
        expect((await me.place(ninth, 5)).status).toBe(409);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('stays for the later weeks and through a clear until it is set back', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.seats({ seats: 5 });
        // A cleared week is made again with the override on.
        expect((await me.call('POST', '/api/dev/raid-clear', {})).status).toBe(200);
        expect((await me.view()).v2.seats).toBe(5);
        // A week that does not exist yet reads it too (a later week made by the normal path).
        const next = ctx.core.raid.ensureWeek('2027-W05');
        expect(next.seatOverride).toBe(5);
        expect((await me.call('GET', '/api/dev/state')).body.raidSeats).toBe(5);
        await me.seats({ seats: null });
        expect(ctx.core.raid.week('2027-W05')?.seatOverride).toBeNull();
        expect((await me.call('GET', '/api/dev/state')).body.raidSeats).toBeNull();
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('fights the boss for the seats on the board, and the replay is of that board', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        const other = await caller(ctx, 2);
        await me.call('POST', '/api/dev/raid-clear', {});
        await me.seats({ seats: 8 });
        const arena = arenaOf(1, 8);
        for (const [i, id] of me.creatureIds.entries())
          expect((await me.place(id, i)).status).toBe(200);
        // The second player's creatures go after them, in free slots, through the same placement code.
        for (const [i, id] of other.creatureIds.entries()) {
          expect((await other.place(id, 8 + i)).status).toBe(200);
        }
        const played = await me.call('POST', '/api/dev/raid-play', { stage: 'stage1' });
        expect(played).toMatchObject({ status: 200 });
        const stored = rows<{ input: string }>(ctx.sql, 'SELECT input FROM raid_results');
        const input = JSON.parse(stored[0]?.input ?? '{}') as {
          boss: { cols: number; rows: number; hp: number };
          fighters: { owner: string }[];
        };
        // Two players with eight seats each: the boss is sized for ceil(16 / its own seats) players, and as wide.
        const effective = effectivePlayers(2, arena);
        expect(input.boss.cols).toBe(effective);
        expect(input.boss.hp).toBe(weekendBoss(1, effective).hp);
        expect(input.fighters).toHaveLength(16);
        // The replay opens on the same fight.
        const view = await me.view();
        const replay = await me.call(
          'GET',
          `/api/raid/replay/${view.weekId}/${view.party.party}/stage1`,
        );
        expect(replay).toMatchObject({ status: 200, body: { rules: 2 } });
        expect(replay.body.boss.cols).toBe(effective);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it('refuses a fought week, a bad number and an unknown field, and does not exist without combat v2', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        await me.call('POST', '/api/dev/raid-clear', {});
        await me.place(me.creatureIds[0] as string, 0);
        for (const body of [
          { seats: 0 },
          { seats: MAX_RAID_SEATS + 1 },
          { seats: 2.5 },
          { seats: '3' },
          {},
          { seats: 3, extra: 1 },
        ]) {
          expect(await me.seats(body), JSON.stringify(body)).toMatchObject({ status: 400 });
        }
        expect(await me.call('POST', '/api/dev/raid-play', { stage: 'stage1' })).toMatchObject({
          status: 200,
        });
        expect(await me.seats({ seats: 4 })).toEqual({ status: 409, body: { error: 'fought' } });
      },
      { start: V2_WEEK.open, core: CORE },
    );
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        expect(await me.seats({ seats: 4 })).toMatchObject({ status: 404 });
      },
      { start: V2_WEEK.open, core: ON },
    );
  });

  it('is never read in production (no dev tools): the week row carries no override', async () => {
    await runRaid(
      (ctx) => {
        ctx.sql.exec('CREATE TABLE dev_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        ctx.sql.exec("INSERT INTO dev_state (key, value) VALUES ('g:raid_seats', '6')");
        const week = ctx.core.raid.ensureWeek(V2_WEEK.id);
        expect(week.seatOverride).toBeNull();
      },
      { start: V2_WEEK.open, core: { combatV2: true } },
    );
  });
});
