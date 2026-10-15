/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of many different response bodies (`Json.body` is `any` on purpose): typing
   each body would only repeat the server's view types. */
import { RULES, content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { RAID_DIFFICULTY_VERSION } from '../src/raid-difficulty';
import { ON, player } from './dev-helpers';
import { runCore } from './helpers';
import { W02, count, nextGuild, rows, runRaid } from './raid-helpers';

describe('raid tools', () => {
  it('sets the boss, the Boss Rank and the Festival flag of the week', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        await p.call('GET', '/api/raid');
        const boss = content.bosses[1]?.id as string;
        const set = await p.tool('raid-boss', { bossId: boss, rank: 7 });
        expect(set).toMatchObject({
          weekId: W02.id,
          bossId: boss,
          rank: 7,
          effectiveRank: 7,
          festival: false,
          difficultyVersion: RAID_DIFFICULTY_VERSION,
        });
        expect(rows(ctx.sql, 'SELECT rank FROM raid_ladder WHERE id = 1')).toEqual([{ rank: 7 }]);

        const festival = await p.tool('raid-festival', { on: true });
        expect(festival).toMatchObject({
          festival: true,
          rank: 7,
          effectiveRank: 7 - RULES.progression.festivalEaseRanks,
        });
        expect(
          rows<{ festival_species: string | null }>(
            ctx.sql,
            'SELECT festival_species FROM raid_weeks WHERE week_id = ?',
            W02.id,
          )[0]?.festival_species,
        ).toBeTruthy();
        expect(await p.tool('raid-festival', { on: false })).toMatchObject({
          festival: false,
          effectiveRank: 7,
        });
        expect((await p.dev('raid-boss', {})).status).toBe(400);
        expect((await p.dev('raid-boss', { bossId: 'nope' })).status).toBe(400);
        const tooHigh = { rank: RULES.raid.scaling.maxRank + 1 };
        expect((await p.dev('raid-boss', tooHigh)).status).toBe(400);
      },
      { core: ON },
    );
  });

  it('resolves Phase 1 and Phase 2 now, once each', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        expect(await p.tool('raid-resolve', { phase: 'phase1' })).toMatchObject({
          resolved: ['phase1'],
          status: 'phase1',
        });
        expect(await p.tool('raid-resolve', { phase: 'phase2' })).toMatchObject({
          resolved: ['phase2'],
          status: 'phase2',
        });
        expect(await p.tool('raid-resolve', { phase: 'phase2' })).toMatchObject({ resolved: [] });
        expect(count(ctx.sql, 'raid_results')).toBe(2);
        // The scheduler finds the events done: nothing runs twice when the clock gets there.
        await p.tool('raid-phase', { to: 'phase2' });
        expect(count(ctx.sql, 'raid_results')).toBe(2);
        expect(
          count(ctx.sql, 'raid_events', `week_id = '${W02.id}' AND event IN ('phase1', 'phase2')`),
        ).toBe(2);
      },
      { core: ON },
    );
  });

  it('fills the roster with simulated players, until Phase 1 locks it', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        expect(await p.tool('raid-roster', { count: 5 })).toMatchObject({
          weekId: W02.id,
          guests: 5,
          members: 6,
        });
        const guests = rows<{ user_id: string; n: number }>(
          ctx.sql,
          `SELECT p.user_id, (SELECT COUNT(*) FROM creatures c WHERE c.user_id = p.user_id) AS n
           FROM players p WHERE p.user_id LIKE 'dev-guest-%' ORDER BY p.user_id`,
        );
        expect(guests.map((g) => g.user_id)).toEqual([1, 2, 3, 4, 5].map((n) => `dev-guest-${n}`));
        expect(guests.every((g) => g.n === 3)).toBe(true);
        // Three creatures of three different lines each.
        expect(
          rows(
            ctx.sql,
            "SELECT COUNT(*) AS n, COUNT(DISTINCT line) AS d FROM creatures WHERE user_id = 'dev-guest-1'",
          ),
        ).toEqual([{ n: 3, d: 3 }]);
        expect((await p.call('GET', '/api/raid')).status).toBe(200);
        // A smaller count removes the extra ones, completely.
        expect(await p.tool('raid-roster', { count: 2 })).toMatchObject({ guests: 2, members: 3 });
        expect(count(ctx.sql, 'players', "user_id LIKE 'dev-guest-%'")).toBe(2);
        expect(count(ctx.sql, 'creatures', "user_id = 'dev-guest-4'")).toBe(0);
        expect(count(ctx.sql, 'raid_party_members', "user_id = 'dev-guest-4'")).toBe(0);
        // Locked once Phase 1 resolved: the same number is fine, another one is not.
        await p.tool('raid-resolve', { phase: 'phase1' });
        expect(await p.tool('raid-roster', { count: 2 })).toMatchObject({ guests: 2 });
        expect(await p.dev('raid-roster', { count: 4 })).toEqual({
          status: 409,
          body: { error: 'roster_locked' },
        });
        // The way out the dev panel names. "Resolve now" does not move the clock, so it is still
        // inside this week's Preparation and jumping to Preparation changes nothing: the roster
        // stays locked. Week done first, then Preparation, is next week's, and its roster is open.
        await p.tool('raid-phase', { to: 'preparation' });
        expect((await p.dev('raid-roster', { count: 4 })).status).toBe(409);
        await p.tool('raid-phase', { to: 'done' });
        await p.tool('raid-phase', { to: 'preparation' });
        const next = await p.tool('raid-roster', { count: 4 });
        expect(next).toMatchObject({ guests: 4 });
        expect((next as { weekId: string }).weekId).not.toBe(W02.id);
      },
      { core: ON },
    );
  });

  it('simulates a whole week and returns the after-action of each stage', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        const result = await p.tool('raid-simulate', { guests: 4 });
        expect(result).toMatchObject({ weekId: W02.id, party: 1, status: 'finale' });
        for (const phase of ['phase1', 'phase2', 'finale']) {
          expect(result.stats[phase], phase).toBeTruthy();
        }
        expect(count(ctx.sql, 'raid_results')).toBe(3);
        expect(
          count(
            ctx.sql,
            'raid_events',
            `week_id = '${W02.id}' AND event IN ('phase1', 'phase2', 'finale')`,
          ),
        ).toBe(3);
        expect((await p.call('GET', '/api/raid')).status).toBe(200);
        // Again: nothing resolves twice.
        expect((await p.tool('raid-simulate', {})).status).toBe('finale');
        expect(count(ctx.sql, 'raid_results')).toBe(3);
        // A player who is not in the roster has no week to simulate.
        const nobody = await player(ctx, 9, { creatures: 0 });
        expect(await nobody.dev('raid-simulate', {})).toEqual({
          status: 409,
          body: { error: 'not_in_roster' },
        });
      },
      { core: ON },
    );
  });

  it('starts a live finale now with a short countdown, without the practice limits', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        await p.tool('raid-roster', { count: 3 });
        const first = await p.tool('raid-live', { countdownSeconds: 5 });
        expect(first.snapshot.status).toBe('lobby');
        expect(
          rows<{ practice: number; started_at: number }>(
            ctx.sql,
            'SELECT practice, started_at FROM raid_live',
          ),
        ).toEqual([{ practice: 1, started_at: ctx.clock.t + 5000 }]);
        // The normal practice route refuses a second one for ten minutes; the dev tool does not.
        expect(await p.call('POST', '/api/raid/practice')).toMatchObject({
          status: 409,
          body: { error: 'practice_cooldown' },
        });
        expect((await p.tool('raid-live', {})).snapshot.status).toBe('lobby');
        expect(
          rows<{ started_at: number }>(ctx.sql, 'SELECT started_at FROM raid_live')[0]?.started_at,
        ).toBe(ctx.clock.t + 10_000);
        // It pays nothing and stores no result.
        expect(count(ctx.sql, 'raid_results')).toBe(0);
        expect((await p.dev('raid-live', { countdownSeconds: 61 })).status).toBe(400);
      },
      { core: ON },
    );
  });

  it('needs only the dev tools for the live finale, not RAID_PRACTICE', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        expect((await p.call('POST', '/api/raid/practice')).status).toBe(404);
        const live = await p.tool('raid-live', { countdownSeconds: 3 });
        expect(live.snapshot.status).toBe('lobby');
      },
      { core: { devTools: true } },
    );
  });
});

describe('analytics and account tools', () => {
  it('logs every change as a dev_action and lists the last 50 events without actors', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        await p.tool('finish-jobs');
        await p.tool('set-balances', { bait: 5 });
        const events = (await p.call('GET', '/api/dev/events')).body.events as {
          at: number;
          kind: string;
          props: unknown;
        }[];
        expect(events.filter((e) => e.kind === 'dev_action').map((e) => e.props)).toEqual([
          { tool: 'set-balances' },
          { tool: 'finish-jobs' },
        ]);
        expect(JSON.stringify(events)).not.toMatch(/actor/i);
        for (const event of events) {
          expect(Object.keys(event).sort()).toEqual(['at', 'kind', 'props']);
        }
        // The stored event has the actor (hashed); the list never shows it.
        expect(
          count(ctx.sql, 'analytics_events', "kind = 'dev_action' AND actor_hash IS NOT NULL"),
        ).toBe(2);

        // At most 50, newest first.
        for (let i = 0; i < 60; i++) {
          ctx.core.analytics.record({ kind: 'roster_optout', optOut: i % 2 === 0 });
        }
        const list = (await p.call('GET', '/api/dev/events')).body.events as {
          kind: string;
          props: { optOut: boolean };
        }[];
        expect(list).toHaveLength(50);
        expect(list[0]).toMatchObject({ kind: 'roster_optout', props: { optOut: false } });
      },
      ON,
    );
  });

  it('rolls up today so far without marking the day as rolled', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const res = await p.dev('analytics-rollup');
        expect(res.status).toBe(200);
        const body = res.body as { ok: boolean; result: { rolled: string[]; today: string } };
        expect(body.ok).toBe(true);
        expect(body.result.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(count(ctx.sql, 'analytics_daily', `day = '${body.result.today}'`)).toBeGreaterThan(
          0,
        );
        expect(
          count(ctx.sql, 'analytics_daily', `day = '${body.result.today}' AND metric = 'rolled'`),
        ).toBe(0);
      },
      ON,
    );
  });

  it("resets the caller's own data on this guild after a confirmation, and nobody else's", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const other = await player(ctx, 2);
        await p.tool('set-balances', { bait: 50, essence: 9 });
        await p.tool('grant-parts', { scrap: 5 });
        await p.tool('force-gates', { night: 'on' });
        await p.tool('dungeon-depth', { depth: 9 });
        await other.tool('set-balances', { bait: 11 });
        const theirs = count(ctx.sql, 'creatures', `user_id = '${other.id}'`);

        expect((await p.dev('reset-account', {})).status).toBe(400);
        expect(await p.tool('reset-account', { confirm: 'RESET' })).toEqual({ reset: true });
        expect((await p.call('GET', '/api/state')).body).toMatchObject({
          creatures: [],
          starterChosen: false,
          balances: { bait: 0, essence: 0 },
        });
        expect(count(ctx.sql, 'parts', `user_id = '${p.id}'`)).toBe(0);
        expect((await p.call('GET', '/api/dungeon/today')).body.depth).toBe(1);
        expect((await p.call('GET', '/api/dev/state')).body.flags.night).toBe('auto');
        // Still signed in, and the other player is untouched.
        expect((await p.call('GET', '/api/me')).status).toBe(200);
        expect(count(ctx.sql, 'creatures', `user_id = '${other.id}'`)).toBe(theirs);
        expect((await other.call('GET', '/api/me')).body.balances.bait).toBe(11);
      },
      ON,
    );
  });
});
