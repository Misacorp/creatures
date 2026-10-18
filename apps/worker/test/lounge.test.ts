import { describe, expect, it, vi } from 'vitest';
import { renderLounge, recordInstance, readLounge, isInstanceId } from '../src/lounge';
import { createLoungeClient, type LoungeClient, type LoungeResult } from '../src/lounge-discord';
import type { ActivityInstance } from '../src/schemas';
import { USER_ID, OTHER_USER_ID, runCore, type CoreContext } from './helpers';
import { nextGuild } from './raid-helpers';

const CHANNEL = '555555555555555555';
const CHANNEL_2 = '555555555555555556';
const THIRD_USER = '444444444444444444';
const INSTANCE = 'i-1234-gc-5678';
const SECOND = 1000;

// --- The text ---

describe('renderLounge', () => {
  it('is quiet without a last visit', () => {
    expect(renderLounge({ names: [], unknown: 0, lastVisit: null })).toEqual({
      content: '🌙 **Leet Creatures**\nThe lounge is quiet.',
      label: 'Play',
    });
  });

  it('is quiet with the last visit as a Discord timestamp', () => {
    const r = renderLounge({
      names: [],
      unknown: 0,
      lastVisit: { name: 'Misa', at: 1_700_000_123_456 },
    });
    expect(r.content).toBe(
      '🌙 **Leet Creatures**\nThe lounge is quiet. Last visit: Misa, <t:1700000123:t>.',
    );
    expect(r.label).toBe('Play');
  });

  it('shows one player in the singular', () => {
    expect(renderLounge({ names: ['Misa'], unknown: 0, lastVisit: null })).toEqual({
      content: '🔥 **Leet Creatures**\n1 in the lounge: Misa',
      label: 'Join',
    });
  });

  it('sorts names and cuts the list after 8 with "and N more"', () => {
    const names = ['k', 'j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', 'B', 'a'];
    expect(renderLounge({ names, unknown: 1, lastVisit: null }).content).toBe(
      '🔥 **Leet Creatures**\n12 in the lounge: a, B, c, d, e, f, g, h and 4 more',
    );
  });

  it('counts players whose names are unknown without naming them', () => {
    expect(renderLounge({ names: ['Misa'], unknown: 1, lastVisit: null }).content).toBe(
      '🔥 **Leet Creatures**\n2 in the lounge: Misa and 1 more',
    );
    expect(renderLounge({ names: [], unknown: 2, lastVisit: null }).content).toBe(
      '🔥 **Leet Creatures**\n2 in the lounge',
    );
  });

  it('escapes markdown and mentions in names', () => {
    const r = renderLounge({ names: ['*@everyone* <@123>'], unknown: 0, lastVisit: null });
    expect(r.content).not.toContain('@everyone');
    expect(r.content).toContain('\\*@\u200Beveryone\\*');
    expect(r.content).toContain('<@\u200B123\\>'.replace('\\>', '\\>'));
    const quiet = renderLounge({ names: [], unknown: 0, lastVisit: { name: '**x**', at: 0 } });
    expect(quiet.content).toContain('\\*\\*x\\*\\*');
  });
});

describe('isInstanceId', () => {
  it('accepts sane ids only', () => {
    expect(isInstanceId('i-123-gc-456')).toBe(true);
    expect(isInstanceId('')).toBe(false);
    expect(isInstanceId('a/b')).toBe(false);
    expect(isInstanceId('a'.repeat(129))).toBe(false);
    expect(isInstanceId('a b')).toBe(false);
  });
});

// --- The Discord client ---

describe('createLoungeClient', () => {
  function clientWith(respond: (url: string, init: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createLoungeClient({
      botToken: 'tok',
      clientId: '1',
      clientSecret: 's',
      fetch: (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, init: init ?? {} });
        return Promise.resolve(respond(url, init ?? {}));
      },
    });
    return { client, calls };
  }
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('posts silently, without mentions or embeds, with the button', async () => {
    const { client, calls } = clientWith(() => ok({ id: '999999999999999999' }));
    expect(await client.createMessage(CHANNEL, { content: 'hi', label: 'Join' })).toEqual({
      kind: 'ok',
      value: '999999999999999999',
    });
    const call = calls[0];
    expect(call?.url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
    expect(call?.init.redirect).toBe('manual');
    expect(JSON.parse(call?.init.body as string)).toEqual({
      content: 'hi',
      allowed_mentions: { parse: [] },
      flags: 4100,
      components: [
        { type: 1, components: [{ type: 2, style: 1, label: 'Join', custom_id: 'lounge:play' }] },
      ],
    });
  });

  it('edits with PATCH and no notification flag, lists ids, and deletes', async () => {
    const { client, calls } = clientWith((url) =>
      url.includes('limit=10') ? ok([{ id: '1'.repeat(18), extra: 1 }]) : ok({}),
    );
    expect(
      (await client.editMessage(CHANNEL, '2'.repeat(18), { content: 'x', label: 'Play' })).kind,
    ).toBe('ok');
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({ flags: 4 });
    expect(calls[0]?.init.method).toBe('PATCH');
    expect(await client.recentMessageIds(CHANNEL)).toEqual({ kind: 'ok', value: ['1'.repeat(18)] });
    expect((await client.deleteMessage(CHANNEL, '2'.repeat(18))).kind).toBe('ok');
    expect(calls[2]?.init.method).toBe('DELETE');
  });

  it('maps failures and refuses ids that are not snowflakes', async () => {
    const status = (n: number, headers: Record<string, string> = {}) =>
      clientWith(() => new Response(null, { status: n, headers })).client;
    const body = { content: 'x', label: 'Play' };
    expect((await status(404).editMessage(CHANNEL, '2'.repeat(18), body)).kind).toBe('not_found');
    expect((await status(403).createMessage(CHANNEL, body)).kind).toBe('forbidden');
    expect(await status(500).createMessage(CHANNEL, body)).toEqual({
      kind: 'retry',
      error: 'server_error',
      afterMs: null,
    });
    expect(await status(429, { 'Retry-After': '3' }).createMessage(CHANNEL, body)).toEqual({
      kind: 'retry',
      error: 'rate_limited',
      afterMs: 3000,
    });
    const { client, calls } = clientWith(() => ok({}));
    expect((await client.createMessage('../x', body)).kind).toBe('failed');
    expect((await client.deleteMessage(CHANNEL, 'abc')).kind).toBe('failed');
    expect(calls).toHaveLength(0);
  });
});

// --- The core ---

interface Fake extends LoungeClient {
  /** Players present per instance id; a missing key is an ended instance. */
  instances: Map<string, string[]>;
  lookupFails: boolean;
  log: string[];
  /** What the next call of each kind answers instead of success. */
  next: { create?: LoungeResult<string>; edit?: LoungeResult<null>; list?: LoungeResult<string[]> };
  recent: string[];
}

function fakeLounge(guildId: string): Fake {
  let counter = 0;
  const fake: Fake = {
    instances: new Map(),
    lookupFails: false,
    log: [],
    next: {},
    recent: [],
    getInstance(id): Promise<ActivityInstance | null> {
      if (fake.lookupFails) return Promise.reject(new Error('down'));
      const users = fake.instances.get(id);
      return Promise.resolve(
        users === undefined ? null : { location: { guild_id: guildId }, users },
      );
    },
    createMessage(channel, body) {
      const r = fake.next.create ?? {
        kind: 'ok' as const,
        value: String(900000000000000000n + BigInt(++counter)),
      };
      delete fake.next.create;
      fake.log.push(`create ${channel} ${body.label} | ${body.content}`);
      if (r.kind === 'ok') fake.recent = [r.value, ...fake.recent];
      return Promise.resolve(r);
    },
    editMessage(channel, id, body) {
      const r = fake.next.edit ?? { kind: 'ok' as const, value: null };
      delete fake.next.edit;
      fake.log.push(`edit ${channel} ${id} ${body.label} | ${body.content}`);
      return Promise.resolve(r);
    },
    deleteMessage(channel, id) {
      fake.log.push(`delete ${channel} ${id}`);
      return Promise.resolve({ kind: 'ok', value: null });
    },
    recentMessageIds() {
      const r = fake.next.list ?? { kind: 'ok' as const, value: fake.recent };
      delete fake.next.list;
      fake.log.push('list');
      return Promise.resolve(r);
    },
  };
  return fake;
}

async function withLounge<R>(
  fn: (ctx: CoreContext, fake: Fake) => Promise<R> | R,
  opts: { off?: boolean } = {},
): Promise<R> {
  const guild = nextGuild();
  const fake = fakeLounge(guild);
  return runCore(guild, (ctx) => fn(ctx, fake), opts.off === true ? {} : { lounge: fake });
}

const start = async (
  ctx: CoreContext,
  fake: Fake,
  userId = USER_ID,
  name = 'Misa',
  channel: string | null = CHANNEL,
) => {
  const present = fake.instances.get(INSTANCE) ?? [];
  if (!present.includes(userId)) fake.instances.set(INSTANCE, [...present, userId]);
  await ctx.core.createSession(ctx.guildId, { id: userId, displayName: name }, channel, INSTANCE);
};

/** Moves the clock and runs the check. */
const tick = async (ctx: CoreContext, ms: number) => {
  ctx.clock.t += ms;
  await ctx.core.runLounge();
};

describe('the lounge message: the core', () => {
  it('records the instance on a session and schedules a check 15 s later', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      const rows = ctx.sql.exec('SELECT instance_id, user_ids FROM lounge_instances').toArray();
      expect(rows).toEqual([{ instance_id: INSTANCE, user_ids: JSON.stringify([USER_ID]) }]);
      expect(readLounge(ctx.sql).nextCheckAt).toBe(ctx.clock.t + 15 * SECOND);
      expect(fake.log).toEqual([]);
    });
  });

  it('never moves a sooner check later', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      const first = readLounge(ctx.sql).nextCheckAt;
      ctx.clock.t += 5 * SECOND;
      await start(ctx, fake, OTHER_USER_ID, 'Other');
      expect(readLounge(ctx.sql).nextCheckAt).toBe(first);
    });
  });

  it('ignores an odd instance id', async () => {
    await withLounge(async (ctx) => {
      await ctx.core.createSession(
        ctx.guildId,
        { id: USER_ID, displayName: 'Misa' },
        CHANNEL,
        'a/b',
      );
      expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toEqual([]);
      expect(recordInstance(ctx.sql, 'a b', USER_ID, 0)).toBe(false);
    });
  });

  it('creates its tables where another branch already took migration 33 (shared staging)', async () => {
    await withLounge(async (ctx, fake) => {
      ctx.sql.exec('DROP TABLE lounge_instances');
      ctx.sql.exec('DROP TABLE lounge_message');
      ctx.core.migrate();
      await start(ctx, fake);
      expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toHaveLength(1);
      // Running it again changes nothing.
      ctx.core.migrate();
      expect(readLounge(ctx.sql).nextCheckAt).toBe(ctx.clock.t + 15 * SECOND);
    });
  });

  it('never stops a login when the lounge cannot record', async () => {
    await withLounge(async (ctx, fake) => {
      ctx.sql.exec('DROP TABLE lounge_instances');
      await expect(start(ctx, fake)).resolves.toBeUndefined();
      expect(ctx.sql.exec('SELECT 1 FROM sessions').toArray()).toHaveLength(1);
    });
  });

  it('posts one silent message, and nothing before the check is due', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 5 * SECOND);
      expect(fake.log).toEqual([]);
      await tick(ctx, 11 * SECOND);
      expect(fake.log).toEqual([
        `create ${CHANNEL} Join | 🔥 **Leet Creatures**\n1 in the lounge: Misa`,
      ]);
      expect(readLounge(ctx.sql).messageId).not.toBeNull();
      // The next checks change nothing, so nothing is written.
      await tick(ctx, 60 * SECOND);
      await tick(ctx, 60 * SECOND);
      expect(fake.log).toHaveLength(1);
    });
  });

  it('edits when someone joins or leaves, once per change', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      await start(ctx, fake, OTHER_USER_ID, 'Ana');
      await tick(ctx, 16 * SECOND);
      expect(fake.log.at(-1)).toMatch(/^edit .* Join \| .*2 in the lounge: Ana, Misa$/s);
      fake.instances.set(INSTANCE, [USER_ID]);
      await tick(ctx, 60 * SECOND);
      expect(fake.log.at(-1)).toMatch(/1 in the lounge: Misa$/);
      expect(fake.log.filter((l) => l.startsWith('edit'))).toHaveLength(2);
    });
  });

  it('shows the lounge as quiet with the last visit when the instance ends, and stops checking', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      fake.instances.delete(INSTANCE);
      await tick(ctx, 60 * SECOND);
      const seconds = Math.floor((ctx.clock.t - 60 * SECOND) / 1000);
      expect(fake.log.at(-1)).toBe(
        `edit ${CHANNEL} ${readLounge(ctx.sql).messageId} Play | 🌙 **Leet Creatures**\nThe lounge is quiet. Last visit: Misa, <t:${String(seconds)}:t>.`,
      );
      expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toEqual([]);
      expect(readLounge(ctx.sql).nextCheckAt).toBeNull();
    });
  });

  it('keeps the stored state when Discord cannot be asked, and tries again', async () => {
    await withLounge(async (ctx, fake) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      fake.lookupFails = true;
      await tick(ctx, 60 * SECOND);
      expect(fake.log).toHaveLength(1);
      expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toHaveLength(1);
      expect(readLounge(ctx.sql).nextCheckAt).toBe(ctx.clock.t + 60 * SECOND);
      expect(error.mock.calls.flat().join(' ')).not.toContain(INSTANCE);
      error.mockRestore();
    });
  });

  it('posts a new message when the edit finds the old one gone', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      const old = readLounge(ctx.sql).messageId;
      fake.next.edit = { kind: 'not_found' };
      await start(ctx, fake, OTHER_USER_ID, 'Ana');
      await tick(ctx, 16 * SECOND);
      expect(fake.log.at(-1)).toMatch(/^create [\s\S]*\n2 in the lounge/);
      expect(readLounge(ctx.sql).messageId).not.toBe(old);
    });
  });

  it('deletes and reposts a message that is buried when a new instance starts', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      const old = readLounge(ctx.sql).messageId;
      fake.recent = ['1'.repeat(18)];
      fake.instances.set('i-other-2', [OTHER_USER_ID]);
      await ctx.core.createSession(
        ctx.guildId,
        { id: OTHER_USER_ID, displayName: 'Ana' },
        CHANNEL,
        'i-other-2',
      );
      await tick(ctx, 16 * SECOND);
      expect(fake.log.slice(-3)).toEqual([
        'list',
        `delete ${CHANNEL} ${old}`,
        expect.stringMatching(/^create /),
      ]);
      expect(readLounge(ctx.sql).messageId).not.toBe(old);
    });
  });

  it('leaves a message that is still among the latest alone, and edits in place when listing fails', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      fake.instances.set('i-other-2', [OTHER_USER_ID]);
      await ctx.core.createSession(
        ctx.guildId,
        { id: OTHER_USER_ID, displayName: 'Ana' },
        CHANNEL,
        'i-other-2',
      );
      await tick(ctx, 16 * SECOND);
      expect(fake.log.slice(-2).map((l) => l.split(' ')[0])).toEqual(['list', 'edit']);

      fake.instances.set('i-third', [THIRD_USER]);
      fake.next.list = { kind: 'forbidden' };
      await ctx.core.createSession(
        ctx.guildId,
        { id: THIRD_USER, displayName: 'Cy' },
        CHANNEL,
        'i-third',
      );
      await tick(ctx, 16 * SECOND);
      expect(fake.log.slice(-2).map((l) => l.split(' ')[0])).toEqual(['list', 'edit']);
      expect(fake.log.some((l) => l.startsWith('delete'))).toBe(false);
    });
  });

  it('moves the message when the announcement channel changes', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      const old = readLounge(ctx.sql).messageId;
      await start(ctx, fake, OTHER_USER_ID, 'Ana', CHANNEL_2);
      await tick(ctx, 16 * SECOND);
      expect(fake.log.slice(-2)).toEqual([
        `delete ${CHANNEL} ${old}`,
        expect.stringContaining(`create ${CHANNEL_2} `),
      ]);
      expect(readLounge(ctx.sql).channelId).toBe(CHANNEL_2);
    });
  });

  it('does nothing without an announcement channel', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake, USER_ID, 'Misa', null);
      await tick(ctx, 16 * SECOND);
      expect(fake.log).toEqual([]);
    });
  });

  it('is off without the option', async () => {
    await withLounge(
      async (ctx, fake) => {
        await start(ctx, fake);
        await tick(ctx, 16 * SECOND);
        expect(fake.log).toEqual([]);
        expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toEqual([]);
        expect(readLounge(ctx.sql).nextCheckAt).toBeNull();
      },
      { off: true },
    );
  });

  it('backs off for 30 minutes after a 403 and does not loop', async () => {
    await withLounge(async (ctx, fake) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fake.next.create = { kind: 'forbidden' };
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      expect(fake.log).toHaveLength(1);
      expect(error).toHaveBeenCalledWith('lounge message failed', 'forbidden');
      await tick(ctx, 60 * SECOND);
      await tick(ctx, 60 * SECOND);
      expect(fake.log).toHaveLength(1);
      await tick(ctx, 30 * 60 * SECOND);
      expect(fake.log).toHaveLength(2);
      error.mockRestore();
    });
  });

  it('a new session lifts the 403 pause, so a fixed permission works at once', async () => {
    await withLounge(async (ctx, fake) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fake.next.create = { kind: 'forbidden' };
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      expect(readLounge(ctx.sql).blockedUntil).not.toBeNull();
      fake.instances.set('i-second', [OTHER_USER_ID]);
      await ctx.core.createSession(
        ctx.guildId,
        { id: OTHER_USER_ID, displayName: 'Ana' },
        CHANNEL,
        'i-second',
      );
      await tick(ctx, 16 * SECOND);
      expect(fake.log).toHaveLength(2);
      expect(readLounge(ctx.sql).messageId).not.toBeNull();
      error.mockRestore();
    });
  });

  it('retries after a transient failure at the next tick', async () => {
    await withLounge(async (ctx, fake) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      fake.next.create = { kind: 'retry', error: 'server_error', afterMs: null };
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      expect(readLounge(ctx.sql).messageId).toBeNull();
      await tick(ctx, 60 * SECOND);
      expect(readLounge(ctx.sql).messageId).not.toBeNull();
      error.mockRestore();
    });
  });

  it('runs from the alarm when due', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      ctx.clock.t += 16 * SECOND;
      await ctx.core.alarm();
      expect(fake.log).toHaveLength(1);
    });
  });

  it('tracks at most 10 instances, dropping the oldest', async () => {
    await withLounge((ctx) => {
      for (let i = 0; i < 12; i++) {
        ctx.clock.t += 1;
        recordInstance(ctx.sql, `i-${String(i)}`, USER_ID, ctx.clock.t);
      }
      const ids = ctx.sql
        .exec<{ instance_id: string }>(
          'SELECT instance_id FROM lounge_instances ORDER BY first_seen_at',
        )
        .toArray()
        .map((r) => r.instance_id);
      expect(ids).toHaveLength(10);
      expect(ids[0]).toBe('i-2');
    });
  });
});
