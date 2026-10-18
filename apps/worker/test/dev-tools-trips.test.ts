/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call --
   These tests read parts of many different response bodies (`Json.body` is `any` on purpose): typing
   each body would only repeat the server's view types. */
import { RULES, dungeonContent, expeditionContent } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deadlyFoes, easyFoes, playThrough } from './dungeon-helpers';
import { ON, newKey, player, type Dev, type Json } from './dev-helpers';
import { runCore } from './helpers';
import { count, nextGuild, rows } from './raid-helpers';

describe('expedition tools', () => {
  const sendTrip = (p: Dev, creatureId: string, destination = 'tidepools') =>
    p.call('POST', '/api/expeditions', {
      creatureId,
      destination,
      duration: 'short',
      supplies: [],
      idempotencyKey: newKey(),
    });
  const tripOf = (res: Json) => res.body.expedition as { id: string; endsAt: number };

  it('finishes trips now', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const trip = tripOf(await sendTrip(p, p.creatureIds[0] as string));
        expect(await p.tool('finish-trips')).toEqual({ trips: 1, pushOns: 0 });
        const state = (await p.call('GET', '/api/state')).body;
        expect(trip.endsAt).toBeGreaterThan(state.serverNow);
        expect(state.expeditions[0].endsAt).toBe(state.serverNow);
        const claimed = await p.call('POST', `/api/expeditions/${trip.id}/claim`, {});
        expect(claimed.body.result.recalled).toBe(false);
        expect(await p.tool('finish-trips')).toEqual({ trips: 0, pushOns: 0 });
      },
      ON,
    );
  });

  it('forces the push-on offer and its result, once each', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const goal = 'forage';
        // A finished trip that has not chosen: its offer becomes the goal; a failure is forced.
        const trip = tripOf(await sendTrip(p, p.creatureIds[0] as string));
        await p.tool('finish-trips');
        expect(await p.tool('force-offer', { goal, outcome: 'fail' })).toEqual({
          appliedToTrips: 1,
          armed: false,
          outcome: 'fail',
        });
        const offered = (await p.call('GET', '/api/state')).body.expeditions[0];
        expect(offered.offer.goals.map((g: { id: string }) => g.id)).toEqual([goal]);
        const chosen = await p.call('POST', `/api/expeditions/${trip.id}/push-on`, {
          goalId: goal,
        });
        expect(chosen.status).toBe(200);
        await p.tool('finish-trips');
        const failed = await p.call('POST', `/api/expeditions/${trip.id}/claim`, {});
        expect(failed.body.result).toMatchObject({ failed: true, pushOn: { outcome: 'failed' } });
        // The force was used up.
        expect((await p.call('GET', '/api/dev/state')).body.flags.pushOutcome).toBeNull();

        // With no finished trip the goal is armed for the next offer that is rolled.
        expect(await p.tool('force-offer', { goal, outcome: 'success' })).toMatchObject({
          appliedToTrips: 0,
          armed: true,
        });
        expect((await p.call('GET', '/api/dev/state')).body.flags).toMatchObject({
          pushOffer: goal,
          pushOutcome: 'success',
        });
        const second = tripOf(await sendTrip(p, p.creatureIds[1] as string));
        await p.tool('finish-trips');
        const next = (await p.call('GET', '/api/state')).body.expeditions.find(
          (e: { id: string }) => e.id === second.id,
        );
        expect(next.offer.goals.map((g: { id: string }) => g.id)).toEqual([goal]);
        expect((await p.call('GET', '/api/dev/state')).body.flags.pushOffer).toBeNull();
        await p.call('POST', `/api/expeditions/${second.id}/push-on`, { goalId: goal });
        await p.tool('finish-trips');
        const worked = await p.call('POST', `/api/expeditions/${second.id}/claim`, {});
        expect(worked.body.result.pushOn.outcome).toBe('worked');
        // Taking the forced result off again.
        await p.tool('force-offer', { outcome: 'fail' });
        await p.tool('force-offer', { outcome: 'random' });
        expect((await p.call('GET', '/api/dev/state')).body.flags.pushOutcome).toBeNull();
        expect((await p.dev('force-offer', {})).status).toBe(400);
        expect((await p.dev('force-offer', { goal: 'nope' })).status).toBe(400);
      },
      ON,
    );
  });

  it('forces night and a Festival week for the caller only', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const other = await player(ctx, 2);
        for (const creatureId of [p.creatureIds[0], p.creatureIds[1]]) {
          await p.tool('set-explorer', { creatureId, rank: 4 });
        }
        const reef = await sendTrip(p, p.creatureIds[0] as string, 'moonlit-reef');
        expect(reef).toMatchObject({ status: 409, body: { reason: 'night' } });
        expect(await p.tool('force-gates', { night: 'on' })).toEqual({
          night: 'on',
          festival: 'auto',
        });
        expect((await p.call('GET', '/api/destinations')).body.night).toBe(true);
        const sent = await sendTrip(p, p.creatureIds[0] as string, 'moonlit-reef');
        expect(sent.status).toBe(200);
        // Another player's gate is their own.
        expect((await other.call('GET', '/api/destinations')).body.night).toBe(false);

        // One slot: the Festival trip waits until the first one is done.
        const busy = await sendTrip(p, p.creatureIds[1] as string, 'festival-grounds');
        expect(busy).toMatchObject({ status: 409 });
        await p.tool('finish-trips');
        await p.call('POST', `/api/expeditions/${tripOf(sent).id}/claim`, {});
        expect(await sendTrip(p, p.creatureIds[1] as string, 'festival-grounds')).toMatchObject({
          status: 409,
          body: { reason: 'festival' },
        });
        await p.tool('force-gates', { festival: 'on', night: 'auto' });
        expect((await p.call('GET', '/api/destinations')).body.festivalWeek).toBe(true);
        expect((await sendTrip(p, p.creatureIds[1] as string, 'festival-grounds')).status).toBe(
          200,
        );
        // Off forces closed, and auto hands it back to the calendar.
        await p.tool('force-gates', { festival: 'off' });
        expect((await p.call('GET', '/api/destinations')).body.festivalWeek).toBe(false);
        await p.tool('force-gates', { festival: 'auto' });
        expect((await p.call('GET', '/api/dev/state')).body.flags).toMatchObject({
          night: 'auto',
          festival: 'auto',
        });
      },
      ON,
    );
  });

  it('sets slots, the rank sum and finished trips', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const slots = async () => (await p.call('GET', '/api/state')).body.slots;
        expect(await slots()).toMatchObject({ total: 1 });
        expect(await p.tool('set-slots', { tripsFinished: 3 })).toMatchObject({ slots: 2 });
        expect(await p.tool('set-slots', { slots: 3 })).toEqual({
          slots: 3,
          rankSum: RULES.expeditions.slots.thresholds[0],
          tripsFinished: 3,
        });
        expect(await slots()).toMatchObject({ total: 3 });
        expect(await p.tool('set-slots', { slots: 1 })).toEqual({
          slots: 1,
          rankSum: 0,
          tripsFinished: 0,
        });
        // Too few creatures for the rank sum: refused, and nothing changed (no half-way writes, no log).
        await p.tool('set-slots', { slots: 3 });
        const logged = count(ctx.sql, 'analytics_events', "kind = 'dev_action'");
        const refused = await p.dev('set-slots', { slots: 5 });
        expect(refused).toEqual({ status: 409, body: { error: 'not_enough_creatures' } });
        expect(await slots()).toMatchObject({ total: 3 });
        expect(count(ctx.sql, 'analytics_events', "kind = 'dev_action'")).toBe(logged);
      },
      ON,
    );
  });

  it('unlocks and resets journal pages, and brings the slot-wipe notice back', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const total = expeditionContent.journal.entries.length;
        const page = expeditionContent.journal.entries[0]?.id as string;
        expect(await p.tool('journal', { action: 'unlock', entryId: page })).toMatchObject({
          pages: 1,
        });
        expect(await p.tool('journal', { action: 'unlock-all' })).toMatchObject({
          pages: total,
          total,
          sets: expeditionContent.journal.sets.length,
        });
        const profile = (await p.call('GET', '/api/profile')).body;
        expect(profile.journal.found).toHaveLength(total);
        expect(profile.stats).toMatchObject({ journal_pages: total });
        await p.tool('journal', { action: 'reset' });
        const empty = (await p.call('GET', '/api/profile')).body;
        expect(empty.journal.found).toHaveLength(0);
        expect(empty.stats).toMatchObject({ journal_pages: 0, journal_sets: 0 });
        expect((await p.dev('journal', { action: 'unlock', entryId: 'nope' })).status).toBe(400);

        await p.tool('slot-wipe-notice');
        const state = (await p.call('GET', '/api/state')).body;
        expect(state.cancelled).toMatchObject([{ reason: 'slot_wipe' }]);
        expect(state.creatures[0].away).toBe(false);
        expect(state.balances.bait).toBe(0);
      },
      ON,
    );
  });
});

describe('dungeon tools', () => {
  // The foes are made easy: these tests look at what the tools do to a run, not at whether a team wins.
  let restoreFoes: () => void = () => undefined;
  beforeEach(() => {
    restoreFoes = easyFoes();
  });
  afterEach(() => {
    restoreFoes();
  });
  const today = async (p: Dev) => (await p.call('GET', '/api/dungeon/today')).body;
  const team = (p: Dev) => ({ team: p.creatureIds, idempotencyKey: newKey() });
  /** Starts a run and plays it out (the answer is the last act's, with the summary as `run`). */
  const run = (p: Dev) => playThrough(p.call, team(p)) as Promise<Json>;
  /** A run that is lost in its first fight: two requests, so a test with many runs stays inside the request allowance. */
  const lost = async (p: Dev) => {
    const back = deadlyFoes();
    try {
      return await run(p);
    } finally {
      back();
    }
  };
  const start = (p: Dev) => p.call('POST', '/api/dungeon/start', team(p));
  const modifierIds = (day: { modifiers: { id: string }[] }) => day.modifiers.map((m) => m.id);

  it('sets the depth, jumps to the next landmark and sets the streak', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        expect(await p.tool('dungeon-depth', { depth: 5 })).toEqual({ depth: 5, landmark: false });
        expect((await today(p)).depth).toBe(5);
        const every = RULES.dungeon.landmarkEvery;
        expect(await p.tool('dungeon-depth', { nextLandmark: true })).toEqual({
          depth: every,
          landmark: true,
        });
        expect((await today(p)).landmark).toBe(true);
        // From a landmark, the next one is a full step on.
        expect((await p.tool('dungeon-depth', { nextLandmark: true })).depth).toBe(2 * every);
        await p.tool('dungeon-streak', { streak: 4 });
        expect((await today(p)).streak).toBe(4);
        await p.tool('dungeon-streak', { streak: 0 });
        expect((await today(p)).streak).toBe(0);
        expect((await p.dev('dungeon-depth', { depth: 0 })).status).toBe(400);
      },
      ON,
    );
  });

  it("picks the day's modifiers and re-rolls its seed", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const ids = dungeonContent.modifiers.slice(0, RULES.dungeon.rooms).map((m) => m.id);
        await p.tool('dungeon-modifiers', { ids });
        expect(modifierIds(await today(p))).toEqual(ids);
        expect((await p.call('GET', '/api/dev/state')).body.flags.dungeonModifiers).toEqual(ids);
        // A re-roll hands the day back to its (new) seed, and says what it rolled.
        const rolled = await p.tool('dungeon-seed');
        expect(modifierIds(await today(p))).toEqual(rolled.modifiers);
        await p.tool('dungeon-modifiers', { ids });
        await p.tool('dungeon-modifiers', { clear: true });
        expect((await p.call('GET', '/api/dev/state')).body.flags.dungeonModifiers).toBeNull();
        const nonsense = ['nope', 'nope', 'nope'];
        expect((await p.dev('dungeon-modifiers', { ids: nonsense })).status).toBe(400);
        expect((await p.dev('dungeon-modifiers', { ids: ids.slice(0, 2) })).status).toBe(400);
      },
      ON,
    );
  });

  it('ignores picked modifiers when the dev tools are off, but not when they are on', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx);
      const first = await today(p);
      const rolled = modifierIds(first);
      expect(rolled).toHaveLength(RULES.dungeon.rooms);
      // A leftover flag from a staging database: the order reversed (the rolled ones are all different).
      ctx.sql.exec('CREATE TABLE dev_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      ctx.sql.exec(
        'INSERT INTO dev_state VALUES (?, ?)',
        `g:modifiers:${first.day as string}`,
        JSON.stringify([...rolled].reverse()),
      );
      expect(modifierIds(await today(p))).toEqual(rolled);
    });
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const ids = modifierIds(await today(p));
        await p.tool('dungeon-modifiers', { ids: [...ids].reverse() });
        expect(modifierIds(await today(p))).toEqual([...ids].reverse());
      },
      ON,
    );
  });

  it("resets today's run, its pay and streak included, and opens the first-day retry", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 30 });
        const before = (await p.call('GET', '/api/me')).body.balances;
        const ran = await run(p);
        expect(ran.status).toBe(200);
        const after = (await p.call('GET', '/api/me')).body.balances;
        expect(after.bait + after.essence).toBeGreaterThan(before.bait + before.essence);
        expect((await today(p)).canRun).toBe(false);

        expect(await p.tool('dungeon-reset')).toMatchObject({ removed: 1 });
        expect(await today(p)).toMatchObject({
          attemptsToday: 0,
          canRun: true,
          streak: 0,
          depth: 1,
        });
        expect((await p.call('GET', '/api/me')).body.balances).toEqual(before);
        expect(count(ctx.sql, 'dungeon_runs')).toBe(0);

        // The ledger stays append-only: the credits are still there, with one negative dev entry per
        // currency that balances them.
        const ledger = rows<{ currency: string; amount: number; source: string }>(
          ctx.sql,
          'SELECT currency, amount, source FROM ledger WHERE user_id = ? AND idempotency_key LIKE ?',
          p.id,
          'dungeon:%',
        );
        expect(ledger.length).toBeGreaterThan(0);
        const reversals = rows<{ currency: string; amount: number }>(
          ctx.sql,
          "SELECT currency, amount FROM ledger WHERE user_id = ? AND source = 'dev' AND amount < 0",
          p.id,
        );
        expect(reversals.length).toBeGreaterThan(0);
        for (const reversal of reversals) {
          const credited = ledger
            .filter((r) => r.currency === reversal.currency)
            .reduce((sum, r) => sum + r.amount, 0);
          expect(-reversal.amount).toBe(credited);
        }
        expect(
          rows<{ runs: number; streak: number }>(
            ctx.sql,
            'SELECT runs, streak FROM dungeon_progress WHERE user_id = ?',
            p.id,
          ),
        ).toEqual([{ runs: 0, streak: 0 }]);
        expect(await p.tool('dungeon-reset')).toMatchObject({ removed: 0 });

        // Run again, then open the first-day retry: a second run is possible.
        expect((await lost(p)).status).toBe(200);
        // The first day offers a retry after a loss already; the tool opens it for any run.
        await p.tool('dungeon-retry');
        expect(await today(p)).toMatchObject({
          canRun: true,
          attemptsAllowed: 2,
          attemptsToday: 1,
        });
        expect((await lost(p)).status).toBe(200);
        expect((await today(p)).attemptsToday).toBe(2);
      },
      ON,
    );
  });

  it('takes back no more than the balance and never twice, and appends no ledger row for nothing', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 30 });
        expect((await run(p)).status).toBe(200);
        // Spend down to a small balance, then reset: only what is there can be removed.
        await p.tool('set-balances', { bait: 1, essence: 0 });
        const reversalsBefore = count(ctx.sql, 'ledger');
        await p.tool('dungeon-reset');
        const balances = (await p.call('GET', '/api/me')).body.balances;
        expect(balances.bait).toBe(0);
        expect(balances.essence).toBe(0);
        expect(count(ctx.sql, 'ledger')).toBeLessThanOrEqual(reversalsBefore + 2);
        expect(
          rows<{ n: number }>(ctx.sql, 'SELECT COUNT(*) AS n FROM ledger WHERE amount = 0')[0]?.n,
        ).toBe(0);

        // A second run of the same attempt is not paid again (its credits keep their keys), so a
        // second reset has nothing more to take back.
        expect((await run(p)).status).toBe(200);
        await p.tool('set-balances', { bait: 40, essence: 40 });
        await p.tool('dungeon-reset');
        expect((await p.call('GET', '/api/me')).body.balances).toEqual({ bait: 40, essence: 40 });
      },
      ON,
    );
  });

  it('redraws the day’s map with the seed, while a run that is open keeps the map it started with', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 30 });
        const first = await today(p);
        const open = (await start(p)).body.state;
        expect(open.map).toEqual(first.map);
        const rolled = await p.tool('dungeon-seed');
        const stored = rows<{ map_json: string | null }>(
          ctx.sql,
          'SELECT map_json FROM dungeon_days',
        );
        expect(stored).toHaveLength(1);
        expect(stored[0]?.map_json).toBeNull(); // cleared: drawn again on the next look
        const next = await today(p);
        expect(next.map).not.toEqual(first.map);
        expect(next.modifiers.map((m: { id: string }) => m.id)).toEqual(rolled.modifiers);
        expect(next.active.map).toEqual(first.map); // the open run keeps its own copy
        expect(
          rows<{ map_json: string | null }>(ctx.sql, 'SELECT map_json FROM dungeon_days')[0]
            ?.map_json,
        ).not.toBeNull();
      },
      ON,
    );
  });

  it('resets a run that is still open with its steps, and leaves the progress alone', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 30 });
        const open = (await start(p)).body.state;
        const move = await p.call('POST', '/api/dungeon/act', {
          runId: open.id,
          step: 0,
          idempotencyKey: newKey(),
          act: { type: 'move', node: open.reachable[0] },
        });
        expect(move.status).toBe(200);
        expect(count(ctx.sql, 'dungeon_steps')).toBe(1);
        expect((await today(p)).canRun).toBe(false);
        expect(await p.tool('dungeon-reset')).toMatchObject({ removed: 1 });
        expect(count(ctx.sql, 'dungeon_runs')).toBe(0);
        expect(count(ctx.sql, 'dungeon_steps')).toBe(0);
        expect(count(ctx.sql, 'dungeon_progress')).toBe(0);
        expect(await today(p)).toMatchObject({ canRun: true, attemptsToday: 0, active: null });
        expect((await run(p)).status).toBe(200);
      },
      ON,
    );
  });

  it('opens the first-day retry for a run that went home or cleared, too', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { level: 30 });
        expect((await run(p)).status).toBe(200); // a clear
        expect((await today(p)).canRun).toBe(false);
        await p.tool('dungeon-retry');
        expect((await today(p)).canRun).toBe(true);
        expect(
          rows<{ outcome: string | null }>(ctx.sql, 'SELECT outcome FROM dungeon_runs')[0]?.outcome,
        ).toBe('defeat');
      },
      ON,
    );
  });
});
