/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument --
   These tests read parts of many different response bodies (`Json.body` is `any` on purpose): typing
   each body would only repeat the server's view types. */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { DEV_ACTION_TOOLS, DEV_READ_TOOLS } from '../src/dev-schemas';
import { MAX_CLOCK_OFFSET_MS } from '../src/dev-state';
import { createHandler } from '../src/index';
import { RULES } from '@creatures/game';
import { eventTimes } from '../src/raid-schedule';
import { nextOccurrence } from '../src/time';
import wranglerText from '../wrangler.jsonc?raw';
import { DAY, ON, newKey, player } from './dev-helpers';
import { ORIGIN, callHandler, runCore } from './helpers';
import { HELSINKI, HOUR, W02, count, nextGuild, runRaid } from './raid-helpers';

/** Config files are JSONC: drop the comment lines, which are the only non-JSON in `wrangler.jsonc`. */
function parseWrangler(): {
  vars: Record<string, string>;
  env: Record<string, { vars: Record<string, string> }>;
} {
  const json = wranglerText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(json) as ReturnType<typeof parseWrangler>;
}

describe('the DEV_TOOLS gate: configuration', () => {
  it('is off at the top level and in production, and on only in staging', () => {
    const config = parseWrangler();
    expect(config.vars['DEV_TOOLS']).toBe('off');
    expect(config.env['production']?.vars['DEV_TOOLS']).toBe('off');
    expect(config.env['staging']?.vars['DEV_TOOLS']).toBe('on');
    // Whatever environments exist, the only one that has it on is staging.
    const on = Object.entries(config.env)
      .filter(([, e]) => e.vars['DEV_TOOLS'] === 'on')
      .map(([name]) => name);
    expect(on).toEqual(['staging']);
  });

  it('is off in the environment the tests run in (the top level)', () => {
    expect(env.DEV_TOOLS).toBe('off');
  });
});

describe('the DEV_TOOLS gate: off', () => {
  const handler = createHandler();

  it('answers every dev route with the 404 of an unknown route, before anything else', async () => {
    const paths = [
      ['GET', '/api/dev'],
      ['GET', '/api/dev/'],
      ...DEV_READ_TOOLS.map((t) => ['GET', `/api/dev/${t}`] as const),
      ...DEV_ACTION_TOOLS.map((t) => ['POST', `/api/dev/${t}`] as const),
      ['POST', '/api/dev/nope'],
    ] as const;
    for (const [method, path] of paths) {
      // No session at all, and a garbage one: the answer is the same 404, not a 401.
      for (const headers of [{}, { Authorization: 'Bearer s1.junk.junk.junk' }]) {
        const res = await callHandler(
          handler,
          new Request(`${ORIGIN}${path}`, {
            method,
            headers,
            body: method === 'POST' ? '{}' : null,
          }),
        );
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
      }
    }
  });

  it('does not tell the client that dev tools exist', async () => {
    const res = await callHandler(handler, new Request(`${ORIGIN}/api/config`));
    expect(await res.json()).not.toHaveProperty('devTools');
  });

  it('is enforced inside the Durable Object too, even with a valid session', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx);
      const me = await p.call('GET', '/api/me');
      expect(me.body).not.toHaveProperty('devTools');
      for (const tool of DEV_READ_TOOLS) {
        expect(await p.call('GET', `/api/dev/${tool}`)).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
      }
      for (const tool of DEV_ACTION_TOOLS) {
        expect(await p.dev(tool, {})).toEqual({ status: 404, body: { error: 'not_found' } });
      }
      // Nothing was created: no dev table, no analytics event, no clock.
      expect(count(ctx.sql, 'sqlite_master', "name = 'dev_state'")).toBe(0);
      expect(count(ctx.sql, 'analytics_events', "kind = 'dev_action'")).toBe(0);
    });
  });

  it('ignores a stored clock offset and stored force flags entirely', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx);
      // A leftover from a staging database: the table and an offset of a week, and a night flag.
      ctx.sql.exec('CREATE TABLE dev_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      ctx.sql.exec("INSERT INTO dev_state VALUES ('clock_offset_ms', ?)", String(7 * DAY));
      ctx.sql.exec("INSERT INTO dev_state VALUES (?, 'on')", `u:${p.id}:night`);
      const state = await p.call('GET', '/api/state');
      expect(state.body.serverNow).toBe(ctx.clock.t);
      const today = await p.call('GET', '/api/dungeon/today');
      expect(today.body.serverNow).toBe(ctx.clock.t);
      // The night-only reef stays closed (it is 10:00 in Helsinki), whatever the flag says.
      ctx.sql.exec(
        'INSERT INTO explorer_progress (user_id, creature_id, xp, trips) VALUES (?, ?, 100000, 0)',
        p.id,
        p.creatureIds[0],
      );
      const sent = await p.call('POST', '/api/expeditions', {
        creatureId: p.creatureIds[0],
        destination: 'moonlit-reef',
        duration: 'short',
        supplies: [],
        idempotencyKey: newKey(),
      });
      expect(sent).toMatchObject({
        status: 409,
        body: { error: 'destination_closed', reason: 'night' },
      });
    });
  });
});

describe('the DEV_TOOLS gate: on', () => {
  it('lets the client know, in the config and in /api/me', async () => {
    const on = { ...env, DEV_TOOLS: 'on' } as Env;
    const handler = createHandler();
    const res = await Promise.resolve(
      handler.fetch?.(new Request(`${ORIGIN}/api/config`) as never, on, {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
        props: {},
      } as unknown as ExecutionContext),
    );
    expect(await res?.json()).toMatchObject({ devTools: true });
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        expect((await p.call('GET', '/api/me')).body).toMatchObject({ devTools: true });
      },
      ON,
    );
  });

  it('lets a request past the Worker only with a session: no session is a 401, not a 404', async () => {
    const on = { ...env, DEV_TOOLS: 'on' } as Env;
    const handler = createHandler();
    const res = await Promise.resolve(
      handler.fetch?.(new Request(`${ORIGIN}/api/dev/state`) as never, on, {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
        props: {},
      } as unknown as ExecutionContext),
    );
    expect(res?.status).toBe(401);
  });

  it('needs a verified session in the Durable Object as well', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const none = await ctx.core.handle(new Request(`${ORIGIN}/api/dev/state`));
        expect(none.status).toBe(401);
        const bad = await ctx.core.handle(
          new Request(`${ORIGIN}/api/dev/clock`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${'a'.repeat(43)}` },
            body: JSON.stringify({ reset: true }),
          }),
        );
        expect(bad.status).toBe(401);
      },
      ON,
    );
  });

  it('is rate-limited like every other route', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        let limited = 0;
        for (let i = 0; i < 40; i++) {
          if ((await p.call('GET', '/api/dev/state')).status === 429) limited++;
        }
        expect(limited).toBeGreaterThan(0);
      },
      ON,
    );
  });

  it('knows its tools and refuses what it does not know', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const state = await p.call('GET', '/api/dev/state');
        expect(state.status).toBe(200);
        expect(state.body).toMatchObject({
          enabled: true,
          clock: { offsetMs: 0, now: ctx.clock.t, realNow: ctx.clock.t, timezone: HELSINKI },
          tools: [...DEV_ACTION_TOOLS],
        });
        // Reads are GET, actions are POST, and ids must be known.
        expect((await p.call('POST', '/api/dev/state', {})).status).toBe(404);
        expect((await p.call('GET', '/api/dev/clock')).status).toBe(404);
        expect((await p.dev('nope', {})).status).toBe(404);
        expect((await p.dev('__proto__', {})).status).toBe(404);
        expect((await p.dev('constructor', {})).status).toBe(404);
      },
      ON,
    );
  });

  it('validates every body strictly: unknown keys, ranges and the wrong shape are 400', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const bad: [string, unknown][] = [
          ['clock', {}],
          ['clock', { advanceMs: 0 }],
          ['clock', { advanceMs: -5 }],
          ['clock', { advanceMs: 30 * DAY + 1 }],
          ['clock', { advanceMs: 1.5 }],
          ['clock', { advanceMs: 1000, extra: true }],
          ['clock', { to: 'tomorrow' }],
          ['clock', { reset: false }],
          ['set-balances', {}],
          ['set-balances', { bait: -1 }],
          ['set-balances', { bait: 5, userId: '1' }],
          ['grant-creature', { species: 'not-a-species' }],
          ['grant-gear', { baseId: 'nope', rarity: 'common' }],
          ['reset-account', {}],
          ['reset-account', { confirm: 'reset' }],
          ['raid-roster', { count: 41 }],
          ['finish-jobs', { extra: 1 }],
        ];
        for (const [tool, body] of bad) {
          const res = await p.dev(tool, body);
          expect(res, `${tool} ${JSON.stringify(body)}`).toEqual({
            status: 400,
            body: { error: 'invalid_body' },
          });
        }
        // Not an object, not JSON, too large.
        for (const text of ['[]', 'null', '"x"', '{nope', ' '.repeat(5000) + '{}']) {
          const res = await p.raw('/api/dev/clock', text);
          expect(res, text).toEqual({ status: 400, body: { error: 'invalid_body' } });
        }
        // Nothing was logged for any refused call.
        expect(count(ctx.sql, 'analytics_events', "kind = 'dev_action'")).toBe(0);
      },
      ON,
    );
  });
});

describe('the dev clock', () => {
  it('moves a trip to finished, and sessions keep real time', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const sent = await p.call('POST', '/api/expeditions', {
          creatureId: p.creatureIds[0],
          destination: 'tidepools',
          duration: 'short',
          supplies: [],
          idempotencyKey: newKey(),
        });
        expect(sent.status).toBe(200);
        const trip = sent.body.expedition as { id: string; endsAt: number };
        const before = await p.call('GET', '/api/state');
        expect(before.body.serverNow).toBe(ctx.clock.t);
        expect(trip.endsAt).toBeGreaterThan(before.body.serverNow);

        const clock = await p.tool('clock', { advanceMs: 3 * HOUR });
        expect(clock).toMatchObject({ offsetMs: 3 * HOUR, now: ctx.clock.t + 3 * HOUR });
        const after = await p.call('GET', '/api/state');
        expect(after.body.serverNow).toBe(ctx.clock.t + 3 * HOUR);
        expect(trip.endsAt).toBeLessThanOrEqual(after.body.serverNow);
        const claimed = await p.call('POST', `/api/expeditions/${trip.id}/claim`, {});
        expect(claimed.status).toBe(200);
        expect(claimed.body.result.recalled).toBe(false);

        // Ninety days later the session still works: it keeps real time (it would have idled out).
        for (let i = 0; i < 3; i++) await p.tool('clock', { advanceMs: 30 * DAY });
        expect((await p.call('GET', '/api/me')).status).toBe(200);
        // The offset is stored, so it is the same on the next request.
        expect((await p.call('GET', '/api/dev/state')).body.clock.offsetMs).toBe(
          3 * HOUR + 90 * DAY,
        );
      },
      ON,
    );
  });

  it('moves a Workshop job to done', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        await p.tool('grant-blueprints', { all: true });
        await p.tool('grant-parts', {
          scrap: 500,
          'tide-shard': 50,
          'ember-shard': 50,
          'grove-shard': 50,
          'spark-shard': 50,
          glimmer: 50,
        });
        const gear = (await p.call('GET', '/api/gear')).body;
        const blueprint = gear.blueprints[0].baseId as string;
        const started = await p.call('POST', '/api/workshop/jobs', {
          kind: 'craft',
          creatureId: p.creatureIds[0],
          blueprintId: blueprint,
          idempotencyKey: newKey(),
        });
        expect(started.status).toBe(200);
        const job = { id: started.body.result.jobId as string };
        const jobsOf = async () =>
          ((await p.call('GET', '/api/gear')).body.jobs as { id: string; status: string }[]).find(
            (j) => j.id === job.id,
          );
        expect((await jobsOf())?.status).toBe('running');
        await p.tool('clock', { advanceMs: 48 * HOUR });
        expect((await jobsOf())?.status).toBe('ready');
        const claimed = await p.call('POST', `/api/workshop/jobs/${job.id}/claim`, {
          idempotencyKey: newKey(),
        });
        expect(claimed.status).toBe(200);
      },
      ON,
    );
  });

  it('crosses the 13:37 game day, so the dungeon day changes', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx);
        const first = (await p.call('GET', '/api/dungeon/today')).body;
        const reset = (await p.tool('clock', { to: 'next-reset' })) as { now: number };
        expect(reset.now).toBe(first.resetsAt);
        const next = (await p.call('GET', '/api/dungeon/today')).body;
        expect(next.day).not.toBe(first.day);
        expect(next.serverNow).toBe(first.resetsAt);
        expect(next.resetsAt).toBe(first.resetsAt + DAY);
        // Asking again goes to the one after that: always forward.
        await p.tool('clock', { to: 'next-reset' });
        expect((await p.call('GET', '/api/dungeon/today')).body.serverNow).toBe(
          first.resetsAt + DAY,
        );
        // And a reset puts the clock back for the guild.
        await p.tool('clock', { reset: true });
        const back = (await p.call('GET', '/api/dungeon/today')).body;
        expect(back.serverNow).toBe(ctx.clock.t);
        expect(back.day).toBe(first.day);
      },
      ON,
    );
  });

  it('moves the raid week through its phases, and re-arms the alarm in real time', async () => {
    await runRaid(
      async (ctx) => {
        const p = await player(ctx);
        const times = eventTimes(W02.id, HELSINKI);
        expect((await p.call('GET', '/api/raid')).body.status).toBe('open');
        // The alarm is set for Phase 1.
        expect(await ctx.storage.getAlarm()).toBe(times.phase1);

        const next = (await p.tool('clock', { to: 'next-phase' })) as { now: number };
        expect(next.now).toBe(times.phase1);
        expect(await p.call('GET', '/api/raid').then((r) => r.body.status)).toBe('phase1');
        // Now the alarm is for Phase 2, in real time (the game time minus the offset), unless the
        // daily analytics rollup (13:40 real time) comes first.
        const offset = times.phase1 - ctx.clock.t;
        const { hour, minute } = RULES.daily.reset;
        const rollupAt = nextOccurrence(ctx.clock.t - 180_000, hour, minute, HELSINKI) + 180_000;
        expect(await ctx.storage.getAlarm()).toBe(Math.min(times.phase2 - offset, rollupAt));

        // Straight to the finale: the live fight starts at the scheduled time.
        await p.tool('raid-phase', { to: 'finale' });
        expect(count(ctx.sql, 'raid_live', 'practice = 0')).toBe(1);
        expect(count(ctx.sql, 'raid_results', "phase = 'phase2'")).toBe(1);
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(0);
        // And on to the end of the week: the finale resolved.
        await p.tool('raid-phase', { to: 'done' });
        expect(count(ctx.sql, 'raid_results', "phase = 'finale'")).toBe(1);
        // Asking for a phase the clock is inside changes nothing; an earlier one is next week's.
        const clockBefore = (await p.call('GET', '/api/dev/state')).body.clock.offsetMs;
        await p.tool('raid-phase', { to: 'done' });
        expect((await p.call('GET', '/api/dev/state')).body.clock.offsetMs).toBe(clockBefore);
        await p.tool('raid-phase', { to: 'preparation' });
        const state = (await p.call('GET', '/api/dev/state')).body;
        expect(state.clock.now).toBeGreaterThan(times.finale);
        expect(state.raid.weekId).not.toBe(W02.id);
      },
      { start: W02.friday - 2 * HOUR, core: ON },
    );
  });

  it('is exactly the real clock when the dev tools are off, with the offset never read', async () => {
    await runCore(nextGuild(), async (ctx) => {
      const p = await player(ctx);
      const me = await p.call('GET', '/api/state');
      expect(me.body.serverNow).toBe(ctx.clock.t);
    });
  });

  it('refuses a clock past the cap and leaves the offset as it was', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        // A staging database that is a day short of the cap.
        ctx.sql.exec(
          "INSERT INTO dev_state VALUES ('clock_offset_ms', ?)",
          String(MAX_CLOCK_OFFSET_MS - DAY),
        );
        const p = await player(ctx);
        const refused = await p.dev('clock', { advanceMs: 2 * DAY });
        expect(refused).toEqual({ status: 409, body: { error: 'offset_too_large' } });
        const state = (await p.call('GET', '/api/dev/state')).body;
        expect(state.clock.offsetMs).toBe(MAX_CLOCK_OFFSET_MS - DAY);
        await p.tool('clock', { advanceMs: DAY });
        expect((await p.call('GET', '/api/dev/state')).body.clock.offsetMs).toBe(
          MAX_CLOCK_OFFSET_MS,
        );
        expect(count(ctx.sql, 'analytics_events', "kind = 'dev_action'")).toBe(1);
      },
      ON,
    );
  });
});
