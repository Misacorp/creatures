/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call --
   The tool's answer is read loosely on purpose (`Json.body` is `any`): typing it would repeat the tool's own types. */
// The `raid-weekend` dev tool and the v2 guests (docs/design/combat/integration.md, section 10): a whole combat v2 weekend played step by
// step on the real scheduler by moving the dev clock. This is the automatic half of the phase 4 gate, through the dev tool: the weekend
// ends with the track updated, the guests replace their fallen, one guest asks the caller for a swap, and the live finale plays.
import { RULES } from '@creatures/game';
import { WEEK_TABLES } from '../src/raid';
import { slotBossInfo } from '../src/raid-v2-core';
import { knownKnacks } from '@creatures/game/combat-v2';
import { describe, expect, it } from 'vitest';
import type { LiveSnapshotV2 } from '../src/raid-v2-view';
import { ON, type Json } from './dev-helpers';
import type { CoreContext } from './helpers';
import { sessionCaller } from './kit';
import { HELSINKI, count, rows, runRaid } from './raid-helpers';
import { V2_WEEK, carryOf, v2Player } from './raid-v2-helpers';

const CORE = { ...ON, combatV2: true } as const;
const LEVEL = 22;

/** A server on its second lap (slot 6, two failed weekends), where a party of this size is knocked about and the boss stands. */
const secondLap = (ctx: CoreContext): void => {
  ctx.sql.exec(
    'INSERT OR REPLACE INTO raid_track (id, slot, best_share_bp, failed_weekends) VALUES (1, 6, 2500, 2)',
  );
};

/** The caller: a seeded v2 player with a session and the dev tool's route. */
async function caller(ctx: CoreContext) {
  const seeded = v2Player(ctx, 1, { level: LEVEL });
  const { call } = await sessionCaller<Json['body']>(ctx, {
    id: seeded.id,
    displayName: seeded.name,
  });
  const weekend = (body: unknown = {}) => call('POST', '/api/dev/raid-weekend', body);
  /** A step that must succeed: its `result`. */
  const step = async (body: unknown = {}) => {
    const res = await weekend(body);
    expect(res, JSON.stringify(body)).toMatchObject({ status: 200 });
    return res.body.result;
  };
  return { ...seeded, call, weekend, step };
}

const guestIds = (ctx: CoreContext): string[] =>
  rows<{ user_id: string }>(
    ctx.sql,
    "SELECT user_id FROM players WHERE user_id LIKE 'dev-guest-%' ORDER BY user_id",
  ).map((r) => r.user_id);

const placedBy = (ctx: CoreContext, userId: string): string[] =>
  rows<{ creature_id: string }>(
    ctx.sql,
    'SELECT creature_id FROM raid_placements WHERE user_id = ? ORDER BY slot',
    userId,
  ).map((r) => r.creature_id);

/** A picture of what the weekend has stored: if a step that already ran changes anything, this changes. */
const fingerprint = (ctx: CoreContext) => ({
  results: count(ctx.sql, 'raid_results'),
  events: count(ctx.sql, 'raid_events'),
  placements: rows(
    ctx.sql,
    'SELECT user_id, creature_id, slot FROM raid_placements ORDER BY user_id, slot',
  ),
  swaps: rows(ctx.sql, 'SELECT id, status FROM raid_swap_requests ORDER BY id'),
  track: rows(ctx.sql, 'SELECT * FROM raid_track'),
  carry: rows(ctx.sql, 'SELECT carry_json FROM raid_parties'),
  live: count(ctx.sql, 'raid_live'),
  offset: rows(ctx.sql, "SELECT value FROM dev_state WHERE key = 'clock_offset_ms'"),
});

describe('the raid-weekend dev tool', () => {
  it('plays a whole weekend step by step, and a step that has run changes nothing', async () => {
    await runRaid(
      async (ctx) => {
        secondLap(ctx);
        const me = await caller(ctx);

        // --- Stage 1: the roster is made (guests with v2 talents, Knacks and spares), the clock moves, the scheduler plays it ---
        const first = await me.step({ step: 'stage1', guests: 3 });
        expect(first).toMatchObject({
          ran: ['stage1'],
          done: { stage1: true, stage2: false, 'finale-start': false, 'finale-end': false },
        });
        expect(ctx.clock.t).toBeLessThan(V2_WEEK.stage1);
        const guests = guestIds(ctx);
        expect(guests).toHaveLength(3);

        // Every guest creature has a v2 talent; every one it placed saved the first Knack its form knows.
        for (const g of guests) {
          const creatures = rows<{ id: string; species: string; knack: string | null }>(
            ctx.sql,
            'SELECT id, species, knack FROM creatures WHERE user_id = ?',
            g,
          );
          expect(creatures).toHaveLength(RULES.raid.teamSize * 2);
          for (const c of creatures) {
            expect(
              count(ctx.sql, 'creature_talents_v2', `creature_id = '${c.id}'`),
              `talent of ${c.species}`,
            ).toBeGreaterThan(0);
          }
          const fought = Object.keys(carryOf(ctx.sql).hp).concat(carryOf(ctx.sql).out);
          for (const c of creatures.filter((x) => fought.includes(x.id))) {
            expect(c.knack).toBe(knownKnacks(c.species)[0] ?? null);
          }
        }

        // The stage was a stage: the caller and the guests fought, the results are in the answer.
        const afterOne = carryOf(ctx.sql);
        expect(afterOne.stage).toBe(1);
        expect(first.stages).toHaveLength(1);
        expect(first.stages[0]).toMatchObject({ stage: 1, party: 1, kill: false });
        expect(first.stages[0].removedBp).toBeGreaterThan(0);
        expect(first.stages[0].knockedOut).toBe(afterOne.out.length);
        expect(afterOne.out.length).toBeGreaterThan(0);

        // The guests replaced what they lost: fresh creatures (none that is out, none that fought), three on the board each.
        const guestOut = afterOne.out.filter((id) =>
          guests.some(
            (g) =>
              rows(ctx.sql, 'SELECT 1 FROM creatures WHERE id = ? AND user_id = ?', id, g).length >
              0,
          ),
        );
        expect(first.guestsReplaced).toBe(guestOut.length);
        expect(first.guestsReplaced).toBeGreaterThan(0);
        for (const g of guests) {
          const board = placedBy(ctx, g);
          expect(board.length).toBeLessThanOrEqual(RULES.raid.teamSize);
          expect(board.length).toBe(RULES.raid.teamSize);
          for (const id of board) {
            expect(afterOne.out).not.toContain(id);
            if (!Object.hasOwn(afterOne.hp, id)) {
              // A replacement: fresh, with a v2 talent and a Knack, through the placement code.
              const row = rows<{ species: string; knack: string | null }>(
                ctx.sql,
                'SELECT species, knack FROM creatures WHERE id = ?',
                id,
              )[0];
              expect(row?.knack).toBe(knownKnacks(row?.species ?? '')[0] ?? null);
            }
          }
        }

        // One guest asked the caller for a swap, through the swap code: it waits for the caller.
        expect(first.swapRequestedBy).toMatch(/^Guest \d$/);
        const asked = await me.call('GET', '/api/raid/swap');
        expect(asked.status).toBe(200);
        expect(asked.body.incoming).toHaveLength(1);
        expect(count(ctx.sql, 'raid_swap_requests', "status = 'open'")).toBe(1);

        // A step that has run changes nothing (not the board, not the requests, not the clock).
        const pictured = fingerprint(ctx);
        const again = await me.step({ step: 'stage1', guests: 3 });
        expect(again).toMatchObject({ ran: [], swapRequestedBy: null, guestsReplaced: 0 });
        expect(fingerprint(ctx)).toEqual(pictured);

        // --- Stage 2 ---
        const second = await me.step({ step: 'stage2' });
        expect(second).toMatchObject({ ran: ['stage2'], done: { stage2: true } });
        expect(second.stages.map((s: { stage: number }) => s.stage)).toEqual([1, 2]);
        const afterTwo = carryOf(ctx.sql);
        expect(afterTwo.stage).toBe(2);
        expect(afterTwo.bossHp).toBeLessThan(afterOne.bossHp);
        for (const id of afterOne.out) expect(afterTwo.out).toContain(id);
        // The request the caller did not answer ended with the stage's lock.
        expect(count(ctx.sql, 'raid_swap_requests', "status = 'open'")).toBe(0);
        expect(await me.step({ step: 'stage2' })).toMatchObject({ ran: [] });

        // --- The finale starts: it is live, the caller can watch and press their input ---
        const started = await me.step({ step: 'finale-start' });
        expect(started).toMatchObject({ ran: ['finale-start'], done: { 'finale-start': true } });
        expect(started.done['finale-end']).toBe(false);
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);
        const live = ctx.core.raid.liveView(me.id, HELSINKI) as LiveSnapshotV2;
        expect(live).toMatchObject({ rules: 2, status: 'live', round: 1 });
        const mine = live.abilities.find((x) => x.alias === live.you);
        expect(mine).toBeDefined();
        const fired = ctx.core.raid.liveAction(me.id, HELSINKI, {
          key: `${live.you as string}:basic`,
          action: 'fire',
          ...(mine?.kind === 'shieldWall' ? { row: 0 } : {}),
        });
        expect(fired.ok).toBe(true);
        expect(await me.step({ step: 'finale-start' })).toMatchObject({ ran: [] });

        // --- The finale ends: the fight settles and the week ends with the track updated ---
        const ended = await me.step({ step: 'finale-end' });
        expect(ended).toMatchObject({ ran: ['finale-end'], done: { 'finale-end': true } });
        expect(ended.stages.map((s: { stage: number }) => s.stage)).toEqual([1, 2, 3]);
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(1);
        expect(rows(ctx.sql, 'SELECT ladder_at IS NOT NULL AS ended FROM raid_weeks')).toEqual([
          { ended: 1 },
        ]);
        expect(
          rows<{ updated_week: string | null }>(ctx.sql, 'SELECT updated_week FROM raid_track')[0]
            ?.updated_week,
        ).toBe(V2_WEEK.id);
        // The boss stood on this lap, so the track holds its slot and counts the lost weekend; the answer says it.
        expect(ended).toMatchObject({ kill: false, slotAfter: 6 });
        expect(ended.track).toMatchObject({ slot: 6, failedWeekends: 3 });
        expect(ended.track.bestShareBp).toBeGreaterThanOrEqual(2500);

        // The whole run again is a no-op.
        const final = fingerprint(ctx);
        expect(await me.step({ step: 'finale-end' })).toMatchObject({ ran: [] });
        expect(await me.step({})).toMatchObject({ ran: [] });
        expect(fingerprint(ctx)).toEqual(final);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 180_000);

  it('without a step runs to the finale start; a step runs the earlier ones it needs', async () => {
    await runRaid(
      async (ctx) => {
        secondLap(ctx);
        const me = await caller(ctx);
        // Up to stage 2 from the opening: stage 1 first, with the guests' work between.
        const two = await me.step({ step: 'stage2', guests: 3 });
        expect(two).toMatchObject({ ran: ['stage1', 'stage2'] });
        expect(two.swapRequestedBy).toMatch(/^Guest \d$/);
        // The default goes on to the finale's start: the live fight is on.
        const rest = await me.step({});
        expect(rest).toMatchObject({ ran: ['finale-start'], done: { 'finale-end': false } });
        expect((ctx.core.raid.liveView(me.id, HELSINKI) as LiveSnapshotV2).status).toBe('live');
        // Two stages are stored, and the finale has not been played yet.
        expect(count(ctx.sql, 'raid_results')).toBe(2);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  }, 180_000);

  it('fills a v2 roster with guests that have talents, Knacks and spares, placed on the grid by the placement code', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        const roster = await me.call('POST', '/api/dev/raid-roster', { count: 4 });
        expect(roster).toMatchObject({ status: 200 });
        expect(roster.body.result).toMatchObject({ guests: 4, members: 5 });
        const week = rows<{ rules_version: number; track_slot: number }>(
          ctx.sql,
          'SELECT rules_version, track_slot FROM raid_weeks',
        )[0];
        expect(week?.rules_version).toBe(2);
        const boardRows = ctx.core.raid.view(me.id, HELSINKI).v2?.rows ?? 0;
        expect(boardRows).toBeGreaterThan(0);
        const taken = new Set<number>();
        for (const g of guestIds(ctx)) {
          const board = rows<{ slot: number; creature_id: string }>(
            ctx.sql,
            'SELECT slot, creature_id FROM raid_placements WHERE user_id = ? ORDER BY slot',
            g,
          );
          // Three at most, in free slots of the grid (column-major: `slot = col * rows + row`), never one on top of another.
          expect(board.length).toBeLessThanOrEqual(RULES.raid.teamSize);
          expect(board.length).toBeGreaterThan(0);
          for (const { slot, creature_id: id } of board) {
            expect(taken.has(slot)).toBe(false);
            taken.add(slot);
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
          expect(count(ctx.sql, 'creatures', `user_id = '${g}'`)).toBe(RULES.raid.teamSize * 2);
        }
        // A second call with the same count changes nothing.
        const before = rows(ctx.sql, 'SELECT slot, creature_id FROM raid_placements ORDER BY slot');
        expect(await me.call('POST', '/api/dev/raid-roster', { count: 4 })).toMatchObject({
          status: 200,
        });
        expect(
          rows(ctx.sql, 'SELECT slot, creature_id FROM raid_placements ORDER BY slot'),
        ).toEqual(before);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  it("raid-phase and the clock's next phase follow the week's own calendar on a v2 week", async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        expect(await me.call('POST', '/api/dev/raid-roster', { count: 3 })).toMatchObject({
          status: 200,
        });
        const now = async (): Promise<number> =>
          (await me.call('GET', '/api/dev/state')).body.clock.now;
        const phase = (to: string) => me.call('POST', '/api/dev/raid-phase', { to });
        // Stage 1 is Saturday 13:37, stage 2 Sunday 13:37 and the finale Sunday 20:00 (Europe/Helsinki), not the v1 Friday and Saturday.
        expect(await phase('phase1')).toMatchObject({ status: 200 });
        expect(await now()).toBe(V2_WEEK.stage1);
        expect(count(ctx.sql, 'raid_events', "week_id = '2027-W02' AND event = 'phase1'")).toBe(1);
        expect(count(ctx.sql, 'raid_results', "phase = 'stage1'")).toBeGreaterThan(0);
        expect(await phase('phase2')).toMatchObject({ status: 200 });
        expect(await now()).toBe(V2_WEEK.stage2);
        expect(count(ctx.sql, 'raid_events', "week_id = '2027-W02' AND event = 'phase2'")).toBe(1);
        expect(await phase('finale')).toMatchObject({ status: 200 });
        expect(await now()).toBe(V2_WEEK.finale);
        expect(count(ctx.sql, 'raid_events', "week_id = '2027-W02' AND event = 'finale'")).toBe(1);
      },
      { start: V2_WEEK.open, core: CORE },
    );
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

  it('answers 404 without the flag and 409 on a week that is not a v2 week', async () => {
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        expect(await me.weekend({})).toEqual({ status: 404, body: { error: 'not_found' } });
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect(
          rows(ctx.sql, 'SELECT value FROM dev_state WHERE key = ?', 'clock_offset_ms'),
        ).toEqual([]);
      },
      { start: V2_WEEK.open, core: ON },
    );
    await runRaid(
      async (ctx) => {
        const me = await caller(ctx);
        ctx.core.raid.currentWeek(HELSINKI);
        ctx.sql.exec('UPDATE raid_weeks SET rules_version = 1');
        expect(await me.weekend({})).toEqual({ status: 409, body: { error: 'not_v2' } });
        // The body is checked strictly.
        expect((await me.weekend({ step: 'stage3' })).status).toBe(400);
        expect((await me.weekend({ nope: 1 })).status).toBe(400);
        expect((await me.weekend({ guests: 41 })).status).toBe(400);
      },
      { start: V2_WEEK.open, core: CORE },
    );
  });

  describe('after combat-v2-convert on a week made under the old rules', () => {
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
        creatureIds[0] as string,
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
          // Without the rebuild the weekend tool refuses.
          expect(await me.weekend({})).toEqual({ status: 409, body: { error: 'not_v2' } });
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

          // And the weekend plays stage 1.
          const stage = await me.step({ step: 'stage1' });
          expect(stage.ran).toEqual(['stage1']);
          expect(stage.stages[0]).toMatchObject({ stage: 1 });
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
