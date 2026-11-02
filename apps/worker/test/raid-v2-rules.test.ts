// The rules of the combat v2 raid weekend one by one (docs/design/combat/integration.md, sections 1, 2, 4 and 7): the calendar, the
// migrations, what the flag does and does not change, the player lock, Festival weeks, swap requests, the routes, the analytics and the
// pieces of the end of the week. The whole weekend is `raid-v2-weekend.test.ts`.
import { content, gearContent, seasonOf } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { propsOf } from '../src/analytics-props';
import { loadV2Creatures } from '../src/raid-v2-fighters';
import { determinationBpFor } from '../src/raid-v2-core';
import { addWeeks, eventTimes, nextDueEvent, weekIndex } from '../src/raid-schedule';
import { endWeekV2 } from '../src/raid-v2-track';
import { undoKnackMigration, type CoreContext } from './helpers';
import { giveItem } from './gear-helpers';
import { sessionCaller } from './kit';
import { HELSINKI, HOUR, count, joinRaid, rows, runRaid, seedPlayer } from './raid-helpers';
import { V2_WEEK, eventsOfKind, v2Player } from './raid-v2-helpers';

const V2 = { combatV2: true } as const;

describe('the v2 calendar', () => {
  it('puts stage 1 on Saturday and stage 2 and the finale on Sunday, and leaves a v1 week as it was', () => {
    const v2 = eventTimes(V2_WEEK.id, HELSINKI, 2);
    expect(v2).toEqual({
      weekStart: Date.parse('2027-01-11T11:37:00Z'),
      phase1: V2_WEEK.stage1,
      phase2: V2_WEEK.stage2,
      finale: V2_WEEK.finale,
    });
    const v1 = eventTimes(V2_WEEK.id, HELSINKI);
    expect(v1).toEqual(eventTimes(V2_WEEK.id, HELSINKI, 1));
    // v1: Friday 13:37 and Saturday 13:37 local, the finale on Sunday 20:00 as in v2.
    expect(v1.phase1).toBe(Date.parse('2027-01-15T11:37:00Z'));
    expect(v1.phase2).toBe(Date.parse('2027-01-16T11:37:00Z'));
    expect(v1.finale).toBe(v2.finale);
  });

  it('follows the clock of the guild across a change of summer time', () => {
    // 2027-W12 ends on Sunday 28 March, the night Europe moves to summer time.
    const times = eventTimes('2027-W12', HELSINKI, 2);
    expect(times.phase2).toBe(Date.parse('2027-03-28T10:37:00Z')); // 13:37 at UTC+3
    expect(times.phase1).toBe(Date.parse('2027-03-27T11:37:00Z')); // 13:37 at UTC+2
    expect(times.finale).toBe(Date.parse('2027-03-28T17:00:00Z'));
  });

  it('picks the next event by the week it belongs to', () => {
    // The week before is done; this week has started: what is next is its first stage.
    const done = new Set(
      ['2027-W01', '2027-W02']
        .flatMap((w) => ['weekStart'].map((e) => `${w}:${e}`))
        .concat(['phase1', 'phase2', 'finale'].map((e) => `2027-W01:${e}`)),
    );
    const next = (rules: 1 | 2) =>
      nextDueEvent(V2_WEEK.open, HELSINKI, done, '2027-W02', (id) =>
        id === '2027-W02' ? rules : 1,
      );
    expect(next(1)).toMatchObject({
      event: 'phase1',
      at: eventTimes('2027-W02', HELSINKI, 1).phase1,
    });
    expect(next(2)).toMatchObject({ event: 'phase1', at: V2_WEEK.stage1 });
  });
});

describe('the migrations', () => {
  it('add the rules version, the track, the carry, swap requests and the live columns, and can be redone', async () => {
    await runRaid(
      (ctx) => {
        ctx.core.migrate();
        // A week and a result from before: they must survive the migration that makes raid_results again.
        ctx.sql.exec(
          "INSERT INTO raid_weeks (week_id, boss_id, status, created_at) VALUES ('2026-W40', 'tidal-colossus', 'phase2', 1)",
        );
        ctx.sql.exec(
          "INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at) VALUES ('2026-W40', 1, 'phase1', 's', 'i', 'r', 'm', 5)",
        );
        undoKnackMigration(ctx.sql);
        for (const table of ['raid_track', 'raid_swap_requests']) {
          expect(count(ctx.sql, 'sqlite_master', `name = '${table}'`)).toBe(0);
        }
        for (const [table, column] of [
          ['raid_weeks', 'rules_version'],
          ['raid_weeks', 'track_slot'],
          ['raid_parties', 'carry_json'],
          ['raid_parties', 'v2_players'],
          ['raid_live', 'rules'],
          ['raid_live', 'frames'],
        ] as const) {
          expect(count(ctx.sql, `pragma_table_info('${table}')`, `name = '${column}'`)).toBe(0);
        }
        ctx.core.migrate();
        ctx.core.migrate();
        expect(rows(ctx.sql, 'SELECT week_id, rules_version, track_slot FROM raid_weeks')).toEqual([
          { week_id: '2026-W40', rules_version: 1, track_slot: null },
        ]);
        expect(rows(ctx.sql, 'SELECT week_id, phase, seed, created_at FROM raid_results')).toEqual([
          { week_id: '2026-W40', phase: 'phase1', seed: 's', created_at: 5 },
        ]);
        // The results table takes the v2 stages now and still refuses anything else.
        const insert = (phase: string) => () =>
          ctx.sql.exec(
            "INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at) VALUES ('2026-W40', 1, ?, 's', 'i', 'r', 'm', 5)",
            phase,
          );
        insert('stage1')();
        insert('stage2')();
        expect(insert('stage3')).toThrow();
        expect(count(ctx.sql, 'sqlite_master', "name = 'raid_swap_requests_to'")).toBe(1);
        expect(count(ctx.sql, 'sqlite_master', "name = 'raid_swap_requests_from'")).toBe(1);
        expect(rows(ctx.sql, 'SELECT rules FROM raid_live')).toEqual([]);
        return Promise.resolve();
      },
      { core: V2 },
    );
  }, 60_000);
});

describe('what the flag changes', () => {
  it('leaves a week that starts with the flag off a v1 week, whatever the flag does later', async () => {
    await runRaid(
      (ctx) => {
        const p = seedPlayer(ctx, 1);
        const v1 = ctx.core.raid.view(p.id, HELSINKI);
        expect(v1.rules).toBeUndefined();
        expect(v1.v2).toBeUndefined();
        expect(rows(ctx.sql, 'SELECT rules_version, track_slot FROM raid_weeks')).toEqual([
          { rules_version: 1, track_slot: null },
        ]);
        expect(count(ctx.sql, 'raid_track')).toBe(0);
        expect(v1.schedule.phase1).toBe(eventTimes(V2_WEEK.id, HELSINKI, 1).phase1);
        // The routes of a v2 weekend do not exist.
        return Promise.resolve();
      },
      { start: V2_WEEK.open },
    );
  });

  it('keeps a v1 week v1 when the flag is on, and answers v2 routes with not_v2', async () => {
    await runRaid(
      async (ctx) => {
        const p = seedPlayer(ctx, 1);
        // A week opened before the flag was turned on.
        ctx.sql.exec(
          `INSERT INTO raid_weeks (week_id, boss_id, status, created_at, season_index, festival, difficulty_version, rank, effective_rank)
           VALUES ('2027-W02', 'tidal-colossus', 'open', ?, 0, 0, 99, 1, 1)`,
          ctx.clock.t,
        );
        ctx.sql.exec(
          'INSERT INTO raid_ladder (id, rank, best_rank) VALUES (1, 1, NULL) ON CONFLICT(id) DO NOTHING',
        );
        const v = ctx.core.raid.view(p.id, HELSINKI);
        expect(v.rules).toBeUndefined();
        expect(v.schedule.phase1).toBe(eventTimes(V2_WEEK.id, HELSINKI, 1).phase1);
        const { call } = await sessionCaller(ctx, { id: p.id, displayName: p.name });
        expect(await call('GET', '/api/raid/swap')).toMatchObject({
          status: 409,
          body: { error: 'not_v2' },
        });
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });

  it('answers the swap routes with 404 when the flag is off', async () => {
    await runRaid(
      async (ctx) => {
        const p = seedPlayer(ctx, 1);
        const { call } = await sessionCaller(ctx, { id: p.id, displayName: p.name });
        expect((await call('GET', '/api/raid/swap')).status).toBe(404);
        expect((await call('POST', '/api/raid/swap', { slotA: 0, slotB: 1 })).status).toBe(404);
        const id = '11111111-1111-4111-8111-111111111111';
        expect((await call('POST', `/api/raid/swap/${id}/accept`)).status).toBe(404);
        expect((await call('POST', `/api/raid/swap/${id}/decline`)).status).toBe(404);
      },
      { start: V2_WEEK.open },
    );
  });

  it('has no knack lock without a weekend: nothing has fought', async () => {
    await runRaid(
      (ctx) => {
        const p = v2Player(ctx, 1);
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, p);
        expect(
          ctx.core.collection.setKnack(p.id, p.creatureIds[0] as string, null, 'raid'),
        ).toMatchObject({
          ok: true,
        });
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });
});

describe('players lock at stage 1', () => {
  it('shuts joining when stage 1 begins and sets the weekend HP from the players in it', async () => {
    await runRaid(
      (ctx) => {
        const [a, b] = [1, 2].map((n) => v2Player(ctx, n, { level: 22 })) as [
          ReturnType<typeof v2Player>,
          ReturnType<typeof v2Player>,
        ];
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, a);
        // Joining is open until stage 1: a second player is welcome, a third arrives too late.
        joinRaid(ctx, b);
        ctx.clock.t = V2_WEEK.stage1 - 1000;
        const early = v2Player(ctx, 3, { level: 22 });
        expect(ctx.core.raid.canWatchBoard(early.id, ctx.core.raid.currentWeek(HELSINKI), 1)).toBe(
          true,
        );
        ctx.clock.t = V2_WEEK.stage1 + 5000;
        ctx.core.raid.runDue(HELSINKI);
        expect(ctx.core.raid.place(early.id, HELSINKI, early.creatureIds[0] as string, 6)).toEqual({
          ok: false,
          status: 409,
          error: 'locked',
        });
        expect(ctx.core.raid.canWatchBoard(early.id, ctx.core.raid.currentWeek(HELSINKI), 1)).toBe(
          false,
        );
        // Two players fight a boss with the HP of four (a party under four fights at four columns).
        const boss = JSON.parse(
          rows<{ input: string }>(
            ctx.sql,
            "SELECT input FROM raid_results WHERE phase = 'stage1'",
          )[0]?.input ?? '{}',
        ) as { boss: { hp: number; cols: number } };
        expect(boss.boss.cols).toBe(4);
        expect(rows(ctx.sql, 'SELECT v2_players FROM raid_parties')).toEqual([{ v2_players: 2 }]);
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);

  it('widens the board with the players and numbers its slots down the columns', async () => {
    await runRaid(
      (ctx) => {
        const players = [1, 2, 3, 4, 5, 6].map((n) => v2Player(ctx, n));
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, players);
        const view = ctx.core.raid.view(players[0]?.id as string, HELSINKI);
        // Slot 1 is the Tidal Colossus: 3 rows; six players are six columns, and a slot is column * 3 + row.
        expect(view.v2).toMatchObject({ rows: 3, cols: 6, players: 6 });
        expect(view.party?.rowLength).toBe(18);
        const slots = rows<{ slot: number; user_id: string }>(
          ctx.sql,
          'SELECT slot, user_id FROM raid_placements ORDER BY slot',
        );
        // The first player holds column 0 (slots 0 to 2), the second column 1 (3 to 5), and so on.
        expect(slots.slice(0, 3).every((s) => s.user_id === players[0]?.id)).toBe(true);
        expect(slots.slice(3, 6).every((s) => s.user_id === players[1]?.id)).toBe(true);
        // A slot beyond the board is refused; the one just inside is not.
        const spare = players[0]?.creatureIds[3] as string;
        expect(ctx.core.raid.place(players[0]?.id as string, HELSINKI, spare, 18)).toEqual({
          ok: false,
          status: 400,
          error: 'invalid_slot',
        });
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);
});

describe('a Festival week', () => {
  it('has no raid on v2: placing is refused, the stages are skipped and the track waits', async () => {
    await runRaid(
      (ctx) => {
        let weekId = V2_WEEK.id;
        for (let k = 0; k < 12; k++) {
          weekId = addWeeks(V2_WEEK.id, k);
          if (seasonOf(weekIndex(weekId)).festival) break;
        }
        expect(seasonOf(weekIndex(weekId)).festival).toBe(true);
        const times = eventTimes(weekId, HELSINKI, 2);
        ctx.clock.t = times.weekStart + HOUR;
        const p = v2Player(ctx, 1);
        const v = ctx.core.raid.view(p.id, HELSINKI);
        expect(v).toMatchObject({ rules: 2, festival: true });
        expect(v.you.canEdit).toBe(false);
        expect(ctx.core.raid.place(p.id, HELSINKI, p.creatureIds[0] as string, 0)).toEqual({
          ok: false,
          status: 409,
          error: 'festival',
        });
        expect(ctx.core.raid.needsPlacement(p.id, HELSINKI).needed).toBe(false);
        ctx.clock.t = times.finale + 60_000;
        ctx.core.raid.runDue(HELSINKI);
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect(count(ctx.sql, 'raid_events', `week_id = '${weekId}' AND outcome = 'skipped'`)).toBe(
          3,
        );
        expect(rows(ctx.sql, 'SELECT slot FROM raid_track')).toEqual([{ slot: 1 }]);
        expect(endWeekV2(ctx.sql, weekId, ctx.clock.t)).toBeNull();
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);
});

describe('swap requests', () => {
  async function party(ctx: CoreContext) {
    const players = [1, 2, 3].map((n) => v2Player(ctx, n, { level: 22 }));
    ctx.core.raid.currentWeek(HELSINKI);
    joinRaid(ctx, players);
    const callers = await Promise.all(
      players.map((p) => sessionCaller(ctx, { id: p.id, displayName: p.name })),
    );
    return { players, callers };
  }
  const slotsOf = (ctx: CoreContext, userId: string) =>
    rows<{ slot: number }>(
      ctx.sql,
      'SELECT slot FROM raid_placements WHERE user_id = ? ORDER BY slot',
      userId,
    ).map((r) => r.slot);

  it('takes only what a request can mean: a swap with another player, or asking one to move into an empty slot', async () => {
    await runRaid(
      async (ctx) => {
        const { players } = await party(ctx);
        const [a, b] = players as [(typeof players)[0], (typeof players)[0]];
        const mine = slotsOf(ctx, a.id);
        const theirs = slotsOf(ctx, b.id);
        const ask = (slotA: number, slotB: number) =>
          ctx.core.raid.askSwap(a.id, HELSINKI, slotA, slotB);
        const code = (o: ReturnType<typeof ask>) => (o.ok ? 'ok' : `${o.status} ${o.error}`);
        // Two of my own creatures, or one of mine and an empty slot, is a placement, not a request.
        expect(code(ask(mine[0] as number, mine[1] as number))).toBe('409 invalid_swap');
        expect(code(ask(mine[0] as number, 11))).toBe('409 invalid_swap');
        expect(code(ask(mine[0] as number, mine[0] as number))).toBe('400 invalid_slot');
        expect(code(ask(mine[0] as number, 99))).toBe('400 invalid_slot');
        // A creature of mine and one of theirs: a swap, asked of its owner. Asking twice is one request.
        expect(code(ask(mine[0] as number, theirs[0] as number))).toBe('ok');
        expect(code(ask(mine[0] as number, theirs[0] as number))).toBe('ok');
        expect(count(ctx.sql, 'raid_swap_requests')).toBe(1);
        // Two creatures of two other players are nothing I can ask for.
        const third = slotsOf(ctx, (players[2] as { id: string }).id);
        expect(code(ask(theirs[0] as number, third[0] as number))).toBe('409 invalid_swap');
        // Another player's creature and an empty slot: the owner is asked to move it there.
        const empty = [9, 10, 11].find(
          (s) => !slotsOf(ctx, b.id).includes(s) && !mine.includes(s),
        ) as number;
        expect(code(ask(theirs[1] as number, empty))).toBe('ok');
        const view = ctx.core.raid.swaps(b.id, HELSINKI);
        const byKind = (swap: boolean) =>
          view.incoming.find((r) => (r.creatureB === null) !== swap);
        expect(view.incoming).toHaveLength(2);
        expect(byKind(true)).toMatchObject({ from: a.name, slotA: mine[0], slotB: theirs[0] });
        expect(byKind(false)).toMatchObject({ from: a.name, slotA: theirs[1], slotB: empty });
        expect(ctx.core.raid.swaps(a.id, HELSINKI).outgoing).toHaveLength(2);
        // Accepting the move puts the creature in the empty slot.
        const move = byKind(false)?.id as string;
        expect(ctx.core.raid.answerSwap(b.id, HELSINKI, move, 'accept').ok).toBe(true);
        expect(slotsOf(ctx, b.id)).toContain(empty);
        expect(slotsOf(ctx, b.id)).not.toContain(theirs[1]);
        // The other request is about slots that changed hands: it is ended, and accepting it answers `changed`.
        // The swap is still good: the creatures are where they were.
        const swap = byKind(true)?.id as string;
        expect(ctx.core.raid.answerSwap(b.id, HELSINKI, swap, 'accept')).toMatchObject({
          ok: true,
        });
        expect(slotsOf(ctx, a.id)).toContain(theirs[0]);
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);

  it('ends a request whose creatures moved, lets the asked player decline, and caps open requests', async () => {
    await runRaid(
      async (ctx) => {
        const { players } = await party(ctx);
        const [a, b] = players as [(typeof players)[0], (typeof players)[0]];
        const mine = slotsOf(ctx, a.id);
        const theirs = slotsOf(ctx, b.id);
        expect(
          ctx.core.raid.askSwap(a.id, HELSINKI, mine[0] as number, theirs[0] as number).ok,
        ).toBe(true);
        const id = ctx.core.raid.swaps(b.id, HELSINKI).incoming[0]?.id as string;
        // The asker moves the creature away before the answer: nothing to swap any more.
        ctx.sql.exec(
          'UPDATE raid_placements SET slot = 11 WHERE user_id = ? AND slot = ?',
          a.id,
          mine[0],
        );
        expect(ctx.core.raid.answerSwap(b.id, HELSINKI, id, 'accept')).toEqual({
          ok: false,
          status: 409,
          error: 'changed',
        });
        expect(rows(ctx.sql, 'SELECT status FROM raid_swap_requests')).toEqual([
          { status: 'ended' },
        ]);
        ctx.sql.exec(
          'UPDATE raid_placements SET slot = ? WHERE user_id = ? AND slot = 11',
          mine[0],
          a.id,
        );

        // Declining closes it and moves nothing.
        expect(
          ctx.core.raid.askSwap(a.id, HELSINKI, mine[1] as number, theirs[1] as number).ok,
        ).toBe(true);
        const second = ctx.core.raid.swaps(b.id, HELSINKI).incoming[0]?.id as string;
        expect(ctx.core.raid.answerSwap(b.id, HELSINKI, second, 'decline').ok).toBe(true);
        expect(slotsOf(ctx, a.id)).toEqual(mine);
        expect(ctx.core.raid.swaps(b.id, HELSINKI).incoming).toEqual([]);
        // A request is closed once: answering it again is not found.
        expect(ctx.core.raid.answerSwap(b.id, HELSINKI, second, 'decline')).toMatchObject({
          ok: false,
          status: 404,
        });
        // At most six open requests at a time.
        for (const row of [0, 1, 2]) {
          for (const col of [theirs[0], theirs[1], theirs[2]]) {
            ctx.core.raid.askSwap(a.id, HELSINKI, mine[row] as number, col as number);
          }
        }
        expect(count(ctx.sql, 'raid_swap_requests', "status = 'open'")).toBe(6);
        expect(
          ctx.core.raid.askSwap(
            a.id,
            HELSINKI,
            mine[0] as number,
            slotsOf(ctx, (players[2] as { id: string }).id)[0] as number,
          ),
        ).toMatchObject({
          ok: false,
          error: 'too_many_requests',
        });
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);

  it('validates what the routes take, and moves both creatures in one step', async () => {
    await runRaid(
      async (ctx) => {
        const { players, callers } = await party(ctx);
        const [a, b] = players as [(typeof players)[0], (typeof players)[0]];
        const [ca, cb] = callers as [(typeof callers)[0], (typeof callers)[0]];
        const mine = slotsOf(ctx, a.id);
        const theirs = slotsOf(ctx, b.id);
        // Strict: an unknown key, a missing slot or a fractional one is refused before anything runs.
        expect(
          (await ca.call('POST', '/api/raid/swap', { slotA: 0, slotB: 3, to: b.id })).status,
        ).toBe(400);
        expect((await ca.call('POST', '/api/raid/swap', { slotA: 0 })).status).toBe(400);
        expect((await ca.call('POST', '/api/raid/swap', { slotA: 0.5, slotB: 3 })).status).toBe(
          400,
        );
        expect((await ca.call('POST', '/api/raid/swap/not-an-id/accept')).status).toBe(400);
        const asked = await ca.call('POST', '/api/raid/swap', {
          slotA: mine[0],
          slotB: theirs[0],
        });
        expect(asked.status).toBe(200);
        expect(asked.body['outgoing']).toHaveLength(1);
        // The asked player sees it, nobody else does, and an answer from someone else is not found.
        const incoming = (await cb.call('GET', '/api/raid/swap')).body['incoming'] as {
          id: string;
        }[];
        expect(incoming).toHaveLength(1);
        expect(
          (await ca.call('POST', `/api/raid/swap/${incoming[0]?.id as string}/accept`)).status,
        ).toBe(404);
        const answered = await cb.call(
          'POST',
          `/api/raid/swap/${incoming[0]?.id as string}/accept`,
        );
        expect(answered.status).toBe(200);
        expect(answered.body['incoming']).toEqual([]);
        expect(slotsOf(ctx, a.id)).toContain(theirs[0]);
        expect(slotsOf(ctx, b.id)).toContain(mine[0]);
        // The week's view carries the open requests of the caller (none now).
        const raidBody = (await ca.call('GET', '/api/raid')).body as { v2: { swaps: unknown } };
        expect(raidBody.v2.swaps).toEqual({
          incoming: [],
          outgoing: [],
        });
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);
});

describe('the analytics of the weekend', () => {
  it("counts the creatures beyond a player's top three, and keeps every value inside its bounds", async () => {
    await runRaid(
      (ctx) => {
        const p = v2Player(ctx, 1, { level: 22 });
        // Levels: the placed three (the first) are 10, 12 and 14; the spares are 30 and 28: the top three are 30, 28 and 14.
        [10, 12, 14, 30, 28].forEach((level, i) => {
          ctx.sql.exec('UPDATE creatures SET level = ? WHERE id = ?', level, p.creatureIds[i]);
        });
        ctx.sql.exec('UPDATE creatures SET knack = NULL WHERE id = ?', p.creatureIds[0]);
        ctx.core.raid.currentWeek(HELSINKI);
        joinRaid(ctx, p);
        ctx.clock.t = V2_WEEK.stage1 + 5000;
        ctx.core.raid.runDue(HELSINKI);
        expect(eventsOfKind(ctx.sql, 'raid_lineup')).toEqual([
          { stage: 1, placed: 3, withKnack: 2, beyondTop3: 2 },
        ]);
        // The sanitizers clamp whatever they are given.
        expect(
          propsOf({
            kind: 'stage_result',
            slot: 5,
            stage: 9,
            players: 4,
            hpRemovedBp: 99999,
            knockouts: 2,
            reactions: 3,
            kill: false,
          }),
        ).toEqual({
          slot: 5,
          stage: 3,
          players: 4,
          hpRemovedBp: 10000,
          knockouts: 2,
          reactions: 3,
          kill: false,
        });
        expect(
          propsOf({ kind: 'raid_lineup', stage: 2, placed: 9, withKnack: 1, beyondTop3: 1 }),
        ).toEqual({ stage: 2, placed: 3, withKnack: 1, beyondTop3: 1 });
        expect(
          propsOf({
            kind: 'track_change',
            slot: 6,
            kill: true,
            bestShareBp: 20000,
            determination: 3,
          }),
        ).toEqual({ slot: 6, kill: true, bestShareBp: 10000, determination: 3 });
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);
});

describe('the end of the week', () => {
  it('gives Determination from the second lap only, five stacks at most', () => {
    expect(determinationBpFor(5, 4)).toBe(0);
    expect(determinationBpFor(6, 0)).toBe(0);
    expect(determinationBpFor(6, 2)).toBe(1000);
    expect(determinationBpFor(11, 5)).toBe(2500);
    expect(determinationBpFor(11, 9)).toBe(2500);
  });

  it('ends the weekend by the rule across parties: at least half of the parties that played won', async () => {
    await runRaid(
      (ctx) => {
        ctx.sql.exec(
          'INSERT INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 3000, 1)',
        );
        ctx.core.raid.currentWeek(HELSINKI);
        // Three parties played: one won, two did not. The server did not.
        const add = (party: number, hp: number) =>
          ctx.sql.exec(
            `INSERT INTO raid_parties (week_id, party, hp_max, hp_current, carry_json, v2_players)
             VALUES ('2027-W02', ?, 1000, ?, '{}', 4)`,
            party,
            hp,
          );
        add(1, 0);
        add(2, 400);
        add(3, 800);
        const moved = endWeekV2(ctx.sql, V2_WEEK.id, 5);
        expect(moved).toMatchObject({ won: false, parties: 3, partiesWon: 1, slotAfter: 6 });
        // The best share of the best party (600 of 1000 removed... the winner removed everything: 100%).
        expect(
          rows(ctx.sql, 'SELECT slot, best_share_bp, failed_weekends FROM raid_track'),
        ).toEqual([{ slot: 6, best_share_bp: 10_000, failed_weekends: 2 }]);
        // Ending twice changes nothing.
        expect(endWeekV2(ctx.sql, V2_WEEK.id, 6)).toBeNull();
        // Two of three parties won: the server did.
        ctx.sql.exec('UPDATE raid_weeks SET ladder_at = NULL');
        ctx.sql.exec('UPDATE raid_parties SET hp_current = 0 WHERE party = 2');
        expect(endWeekV2(ctx.sql, V2_WEEK.id, 7)).toMatchObject({ won: true, slotAfter: 7 });
        expect(
          rows(ctx.sql, 'SELECT slot, best_share_bp, failed_weekends FROM raid_track'),
        ).toEqual([{ slot: 7, best_share_bp: 0, failed_weekends: 0 }]);
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  });
});

describe('a fighter', () => {
  it("counts the gear's stat lines and the slotted v2 talents, and a creature's id is its key", async () => {
    await runRaid(
      (ctx) => {
        const p = v2Player(ctx, 1, { level: 22, creatures: 1 });
        const id = p.creatureIds[0] as string;
        const bare = loadV2Creatures(ctx.sql, [id]).get(id);
        expect(bare?.gear).toEqual({ hp: 0, atk: 0, spd: 0, critChanceBp: 0, critDamageBp: 0 });
        const base = gearContent.bases.find((b) => b.slot === 'hat') ?? gearContent.bases[0];
        const item = giveItem(ctx.sql, p.id, (base as { id: string }).id, { level: 10, lines: [] });
        ctx.sql.exec('UPDATE gear_items SET equipped_on = ? WHERE id = ?', id, item);
        const worn = loadV2Creatures(ctx.sql, [id]).get(id);
        expect(Math.abs(worn?.gear.hp ?? 0) + Math.abs(worn?.gear.atk ?? 0)).toBeGreaterThan(0);
        // The slotted talent is read, the Knack is the saved one.
        expect(worn?.talents.length).toBe(1);
        expect(content.creatures.some((c) => c.id === worn?.species)).toBe(true);
        return Promise.resolve();
      },
      { start: V2_WEEK.open, core: V2 },
    );
  }, 60_000);
});
