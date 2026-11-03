/* eslint-disable @typescript-eslint/no-unsafe-member-access --
   These tests read parts of many different response bodies (`Json.body` is `any` on purpose): typing
   each body would only repeat the server's view types. */
import { describe, expect, it } from 'vitest';
import { ON, player } from './dev-helpers';
import { runCore } from './helpers';
import { count, nextGuild } from './raid-helpers';

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
          ctx.core.analytics.record({
            kind: 'placement',
            action: i % 2 === 0 ? 'place' : 'unplace',
            species: 'splashet',
            slot: 0,
            swap: false,
          });
        }
        const list = (await p.call('GET', '/api/dev/events')).body.events as {
          kind: string;
          props: { action: string };
        }[];
        expect(list).toHaveLength(50);
        expect(list[0]).toMatchObject({ kind: 'placement', props: { action: 'unplace' } });
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
