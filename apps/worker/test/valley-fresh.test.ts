/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment --
   These tests read parts of dev tool bodies (`Json.body` is `any` on purpose). */
/**
 * The `valley-fresh` dev tool (phase 5 step 0): the guard, the wipe, and the list of valley tables it clears.
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { VALLEY_GUILD_TABLES } from '../src/dev-tools-valley';
import { createHandler } from '../src/index';
import wranglerText from '../wrangler.jsonc?raw';
import { ON, player } from './dev-helpers';
import { ORIGIN, runCore } from './helpers';
import { count, nextGuild } from './raid-helpers';

const SYSTEMS = { ...ON, valleySystems: true } as const;

describe('valley-fresh: the guard', () => {
  it('answers 404 without the valley systems, even with the dev tools on', async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 2 });
        expect(await p.dev('valley-fresh', {})).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        expect(count(ctx.sql, 'creatures')).toBe(2);
      },
      ON,
    );
  });

  it('is never available in production: the dev tools and the valley systems are off there', async () => {
    const json = wranglerText
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const config = JSON.parse(json) as { env: Record<string, { vars: Record<string, string> }> };
    expect(config.env['production']?.vars['DEV_TOOLS']).toBe('off');
    expect(config.env['production']?.vars['VALLEY_SYSTEMS']).toBe('off');
    // Even with every valley flag mistakenly on, the dev gate answers first: a plain 404, no session needed.
    const production = {
      ...env,
      ENVIRONMENT: 'production',
      DEV_TOOLS: 'off',
      VALLEY: 'on',
      COMBAT_V2: 'on',
      VALLEY_SYSTEMS: 'on',
    } as Env;
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;
    const res = await createHandler().fetch?.(
      new Request(`${ORIGIN}/api/dev/valley-fresh`, { method: 'POST', body: '{}' }),
      production,
      ctx,
    );
    expect(res?.status).toBe(404);
  });
});

describe('valley-fresh: the wipe', () => {
  it("clears every player's progress in the guild, keeps them signed in and puts the dev clock back", async () => {
    await runCore(
      nextGuild(),
      async (ctx) => {
        const p = await player(ctx, 1, { creatures: 3 });
        await player(ctx, 2, { creatures: 2 });
        await p.tool('clock', { advanceMs: 3_600_000 });
        expect(count(ctx.sql, 'creatures')).toBe(5);
        expect((await p.call('GET', '/api/dev/state')).body.clock.offsetMs).toBe(3_600_000);
        const result = await p.tool('valley-fresh', {});
        expect(result).toEqual({ players: 2, tablesCleared: [...VALLEY_GUILD_TABLES] });
        expect(count(ctx.sql, 'creatures')).toBe(0);
        // Still known to the guild, and still signed in.
        expect(count(ctx.sql, 'players')).toBe(2);
        expect((await p.call('GET', '/api/dev/state')).body.clock.offsetMs).toBe(0);
        // A second run changes nothing.
        expect(await p.tool('valley-fresh', {})).toEqual({
          players: 2,
          tablesCleared: [...VALLEY_GUILD_TABLES],
        });
        expect(count(ctx.sql, 'creatures')).toBe(0);
      },
      SYSTEMS,
    );
  });

  it('lists the valley tables it clears in one place: the server middle so far, and every listed table exists', async () => {
    // Step 5 (migration 60) added the server's middle; later steps add theirs to the same list.
    expect(VALLEY_GUILD_TABLES).toEqual(['valley_server']);
    await runCore(nextGuild(), (ctx) => {
      for (const table of VALLEY_GUILD_TABLES) {
        expect(count(ctx.sql, 'sqlite_master', `type = 'table' AND name = '${table}'`), table).toBe(
          1,
        );
      }
    });
  });
});
