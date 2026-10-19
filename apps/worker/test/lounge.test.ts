import { describe, expect, it } from 'vitest';
import {
  renderLounge,
  renderedSignature,
  recordInstance,
  readLounge,
  isInstanceId,
  type RaidLine,
  type RenderedLounge,
} from '../src/lounge';
import {
  createLoungeClient,
  type LoungeClient,
  type LoungeMessageBody,
  type LoungeResult,
} from '../src/lounge-discord';
import type { ActivityInstance } from '../src/schemas';
import { bossAtRank, content } from '@creatures/game';
import { safeName } from '../src/discord-format';
import { USER_ID, OTHER_USER_ID, runCore, type CoreContext } from './helpers';
import { nextRaidBoundary } from '../src/lounge-raid';
import { eventTimes } from '../src/raid-schedule';
import { HELSINKI, HOUR, MINUTE, W02, nextGuild } from './raid-helpers';
import { captureConsole } from './kit';

const CHANNEL = '555555555555555555';
const CHANNEL_2 = '555555555555555556';
const THIRD_USER = '444444444444444444';
const INSTANCE = 'i-1234-gc-5678';
const SECOND = 1000;
const times = eventTimes(W02.id, HELSINKI);

// --- The text ---

describe('renderLounge', () => {
  it('is quiet without a last visit', () => {
    expect(renderLounge({ names: [], unknown: 0, lastVisit: null })).toEqual({
      title: '🌙 Leet Creatures',
      description: 'The lounge is quiet.',
      color: 0x6b3fa0,
      label: 'Play',
    });
  });

  it('is quiet with the last visit as a Discord timestamp', () => {
    const r = renderLounge({
      names: [],
      unknown: 0,
      lastVisit: { name: 'Misa', at: 1_700_000_123_456 },
    });
    expect(r.description).toBe('The lounge is quiet. Last visit: Misa, <t:1700000123:t>.');
    expect(r.label).toBe('Play');
  });

  it('shows one player in the singular', () => {
    expect(renderLounge({ names: ['Misa'], unknown: 0, lastVisit: null })).toEqual({
      title: '🔥 Leet Creatures',
      description: '1 in the lounge: Misa',
      color: 0xef6a3a,
      label: 'Join',
    });
  });

  it('sorts names and cuts the list after 8 with "and N more"', () => {
    const names = ['k', 'j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', 'B', 'a'];
    expect(renderLounge({ names, unknown: 1, lastVisit: null }).description).toBe(
      '12 in the lounge: a, B, c, d, e, f, g, h and 4 more',
    );
  });

  it('counts players whose names are unknown without naming them', () => {
    expect(renderLounge({ names: ['Misa'], unknown: 1, lastVisit: null }).description).toBe(
      '2 in the lounge: Misa and 1 more',
    );
    expect(renderLounge({ names: [], unknown: 2, lastVisit: null }).description).toBe(
      '2 in the lounge',
    );
  });

  it('escapes markdown and mentions in names', () => {
    const r = renderLounge({ names: ['*@everyone* <@123>'], unknown: 0, lastVisit: null });
    expect(r.description).not.toContain('@everyone');
    expect(r.description).toContain('\\*@\u200Beveryone\\*');
    expect(r.description).toContain('<@\u200B123\\>');
    const quiet = renderLounge({ names: [], unknown: 0, lastVisit: { name: '**x**', at: 0 } });
    expect(quiet.description).toContain('\\*\\*x\\*\\*');
  });

  it('adds each raid stage after a blank line', () => {
    const quiet = { names: [], unknown: 0, lastVisit: null };
    const line = (raid: RaidLine) => renderLounge({ ...quiet, raid }).description;
    const base = 'The lounge is quiet.\n\n⚔️ Raid weekend: **Gorm**';
    expect(line({ boss: 'Gorm', stage: 'phase2', at: 1_700_000_123_456 })).toBe(
      `${base} · Phase 2 <t:1700000123:R>`,
    );
    expect(line({ boss: 'Gorm', stage: 'finale', at: 1_700_000_123_456 })).toBe(
      `${base} · Finale <t:1700000123:R>`,
    );
    expect(line({ boss: 'Gorm', stage: 'live' })).toBe(`${base} · Finale under way`);
    expect(line({ boss: 'Gorm', stage: 'over', fell: true })).toBe(`${base} fell!`);
    expect(line({ boss: 'Gorm', stage: 'over', fell: false })).toBe(`${base} held on.`);
  });

  it('adds the raid line to a playing lounge too, and escapes the boss name', () => {
    const r = renderLounge({
      names: ['Misa'],
      unknown: 0,
      lastVisit: null,
      raid: { boss: '*Gorm*', stage: 'live' },
    });
    expect(r.description).toBe(
      '1 in the lounge: Misa\n\n⚔️ Raid weekend: **\\*Gorm\\*** · Finale under way',
    );
    expect(r.color).toBe(0xef6a3a);
    expect(renderLounge({ names: [], unknown: 0, lastVisit: null, raid: null }).description).toBe(
      'The lounge is quiet.',
    );
  });

  it('has a signature of all four fields', () => {
    const a = renderLounge({ names: ['Misa'], unknown: 0, lastVisit: null });
    const b = renderLounge({ names: [], unknown: 0, lastVisit: null });
    expect(renderedSignature(a)).toBe(renderedSignature({ ...a }));
    expect(renderedSignature(a)).not.toBe(renderedSignature(b));
    expect(renderedSignature(a)).not.toBe(renderedSignature({ ...a, color: 1 }));
    expect(renderedSignature(a)).not.toBe(renderedSignature({ ...a, label: 'x' }));
    expect(renderedSignature(a)).not.toBe(renderedSignature({ ...a, title: 'x' }));
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

  const BODY: RenderedLounge = { title: 'T', description: 'D', color: 7, label: 'Join' };
  const ICON = `https://cdn.discordapp.com/app-icons/123456789012345678/${'a'.repeat(32)}.png?size=128`;

  it('posts silently as an embed with the thumbnail and the button', async () => {
    const { client, calls } = clientWith(() => ok({ id: '999999999999999999' }));
    expect(await client.createMessage(CHANNEL, { ...BODY, iconUrl: ICON })).toEqual({
      kind: 'ok',
      value: '999999999999999999',
    });
    const call = calls[0];
    expect(call?.url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
    expect(call?.init.redirect).toBe('manual');
    expect(JSON.parse(call?.init.body as string)).toEqual({
      content: '',
      embeds: [{ title: 'T', description: 'D', color: 7, thumbnail: { url: ICON } }],
      allowed_mentions: { parse: [] },
      flags: 4096,
      components: [
        { type: 1, components: [{ type: 2, style: 1, label: 'Join', custom_id: 'lounge:play' }] },
      ],
    });
  });

  it('sends no thumbnail without an icon', async () => {
    const { client, calls } = clientWith(() => ok({ id: '999999999999999999' }));
    await client.createMessage(CHANNEL, { ...BODY, iconUrl: null });
    expect((JSON.parse(calls[0]?.init.body as string) as { embeds: unknown }).embeds).toEqual([
      { title: 'T', description: 'D', color: 7 },
    ]);
  });

  it('edits with PATCH and no flags, lists ids, and deletes', async () => {
    const { client, calls } = clientWith((url) =>
      url.includes('limit=10') ? ok([{ id: '1'.repeat(18), extra: 1 }]) : ok({}),
    );
    expect(
      (await client.editMessage(CHANNEL, '2'.repeat(18), { ...BODY, iconUrl: ICON })).kind,
    ).toBe('ok');
    const edit = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(edit).not.toHaveProperty('flags');
    expect(edit).toMatchObject({ content: '', embeds: [{ thumbnail: { url: ICON } }] });
    expect(calls[0]?.init.method).toBe('PATCH');
    expect(await client.recentMessageIds(CHANNEL)).toEqual({ kind: 'ok', value: ['1'.repeat(18)] });
    expect((await client.deleteMessage(CHANNEL, '2'.repeat(18))).kind).toBe('ok');
    expect(calls[2]?.init.method).toBe('DELETE');
  });

  it('maps failures and refuses ids that are not snowflakes', async () => {
    const status = (n: number, headers: Record<string, string> = {}) =>
      clientWith(() => new Response(null, { status: n, headers })).client;
    const body = BODY;
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

  describe('appIconUrl', () => {
    const app = { id: '123456789012345678', icon: 'a'.repeat(32) };
    const ICON_URL = `https://cdn.discordapp.com/app-icons/123456789012345678/${'a'.repeat(32)}.png?size=128`;

    it('reads the icon with the bot token and caches a success', async () => {
      const { client, calls } = clientWith(() => ok(app));
      expect(await client.appIconUrl()).toBe(ICON_URL);
      expect(await client.appIconUrl()).toBe(ICON_URL);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://discord.com/api/v10/applications/@me');
      expect(calls[0]?.init.method).toBe('GET');
      expect(new Headers(calls[0]?.init.headers).get('Authorization')).toBe('Bot tok');
    });

    it('accepts an animated icon hash', async () => {
      const { client } = clientWith(() => ok({ ...app, icon: `a_${'b'.repeat(32)}` }));
      expect(await client.appIconUrl()).toContain(`/a_${'b'.repeat(32)}.png`);
    });

    it('is null on a failure or a bad shape, and tries again next time', async () => {
      let answer: () => Response = () => new Response(null, { status: 404 });
      const { client, calls } = clientWith(() => answer());
      expect(await client.appIconUrl()).toBeNull();
      answer = () => ok({ id: 'x', icon: app.icon });
      expect(await client.appIconUrl()).toBeNull();
      answer = () => ok({ ...app, icon: '../evil' });
      expect(await client.appIconUrl()).toBeNull();
      answer = () => ok({ id: app.id, icon: null });
      expect(await client.appIconUrl()).toBeNull();
      answer = () => new Response('not json', { status: 200 });
      expect(await client.appIconUrl()).toBeNull();
      answer = () => ok(app);
      expect(await client.appIconUrl()).toBe(ICON_URL);
      expect(calls).toHaveLength(6);
    });
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
  /** The last body sent by create or edit. */
  lastBody: LoungeMessageBody | null;
  iconCalls: number;
}

const FAKE_ICON = 'https://cdn.discordapp.com/app-icons/1/x.png?size=128';

function fakeLounge(guildId: string): Fake {
  let counter = 0;
  const fake: Fake = {
    instances: new Map(),
    lookupFails: false,
    log: [],
    next: {},
    recent: [],
    lastBody: null,
    iconCalls: 0,
    appIconUrl() {
      fake.iconCalls++;
      return Promise.resolve(FAKE_ICON);
    },
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
      fake.lastBody = body;
      fake.log.push(`create ${channel} ${body.label} | ${body.title} | ${body.description}`);
      if (r.kind === 'ok') fake.recent = [r.value, ...fake.recent];
      return Promise.resolve(r);
    },
    editMessage(channel, id, body) {
      const r = fake.next.edit ?? { kind: 'ok' as const, value: null };
      delete fake.next.edit;
      fake.lastBody = body;
      fake.log.push(`edit ${channel} ${id} ${body.label} | ${body.title} | ${body.description}`);
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
    const log = captureConsole();
    await withLounge(async (ctx, fake) => {
      ctx.sql.exec('DROP TABLE lounge_instances');
      await expect(start(ctx, fake)).resolves.toBeUndefined();
      expect(ctx.sql.exec('SELECT 1 FROM sessions').toArray()).toHaveLength(1);
      // Only the kind of the error is logged.
      expect(log.calls).toEqual([['lounge record failed', 'Error']]);
    });
  });

  it('posts one silent message, and nothing before the check is due', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 5 * SECOND);
      expect(fake.log).toEqual([]);
      await tick(ctx, 11 * SECOND);
      expect(fake.log).toEqual([
        `create ${CHANNEL} Join | 🔥 Leet Creatures | 1 in the lounge: Misa`,
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
      expect(fake.log.at(-1)).toMatch(/^edit .* Join \| .*2 in the lounge: Ana, Misa$/);
      fake.instances.set(INSTANCE, [USER_ID]);
      await tick(ctx, 60 * SECOND);
      expect(fake.log.at(-1)).toMatch(/1 in the lounge: Misa$/);
      expect(fake.log.filter((l) => l.startsWith('edit'))).toHaveLength(2);
    });
  });

  it('shows the lounge as quiet with the last visit when the instance ends, and next checks at a raid boundary', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      fake.instances.delete(INSTANCE);
      await tick(ctx, 60 * SECOND);
      const seconds = Math.floor((ctx.clock.t - 60 * SECOND) / 1000);
      expect(fake.log.at(-1)).toBe(
        `edit ${CHANNEL} ${readLounge(ctx.sql).messageId} Play | 🌙 Leet Creatures | The lounge is quiet. Last visit: Misa, <t:${String(seconds)}:t>.`,
      );
      expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toEqual([]);
      expect(readLounge(ctx.sql).nextCheckAt).toBe(
        nextRaidBoundary(ctx.clock.t, HELSINKI) + 2 * MINUTE,
      );
    });
  });

  it('keeps the stored state when Discord cannot be asked, and tries again', async () => {
    await withLounge(async (ctx, fake) => {
      const error = captureConsole();
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      fake.lookupFails = true;
      await tick(ctx, 60 * SECOND);
      expect(fake.log).toHaveLength(1);
      expect(ctx.sql.exec('SELECT 1 FROM lounge_instances').toArray()).toHaveLength(1);
      expect(readLounge(ctx.sql).nextCheckAt).toBe(ctx.clock.t + 60 * SECOND);
      expect(error.calls.flat().join(' ')).not.toContain(INSTANCE);
      error.restore();
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
      expect(fake.log.at(-1)).toMatch(/^create .* \| 2 in the lounge/);
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

  it('replaces a message posted before the embed, once', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      const old = readLounge(ctx.sql).messageId;
      // The plain-text version stored its text, not a JSON signature.
      ctx.sql.exec(
        "UPDATE lounge_message SET content = 'Join\n🔥 **Leet Creatures**\n1 in the lounge: Misa'",
      );
      await tick(ctx, 60 * SECOND);
      expect(fake.log.slice(-2)).toEqual([
        `delete ${CHANNEL} ${old}`,
        expect.stringContaining(`create ${CHANNEL} `),
      ]);
      await tick(ctx, 60 * SECOND);
      expect(fake.log).toHaveLength(3);
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
      const error = captureConsole();
      fake.next.create = { kind: 'forbidden' };
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      expect(fake.log).toHaveLength(1);
      expect(error.calls).toContainEqual(['lounge message failed', 'forbidden']);
      await tick(ctx, 60 * SECOND);
      await tick(ctx, 60 * SECOND);
      expect(fake.log).toHaveLength(1);
      await tick(ctx, 30 * 60 * SECOND);
      expect(fake.log).toHaveLength(2);
      error.restore();
    });
  });

  it('a new session lifts the 403 pause, so a fixed permission works at once', async () => {
    await withLounge(async (ctx, fake) => {
      const error = captureConsole();
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
      error.restore();
    });
  });

  it('retries after a transient failure at the next tick', async () => {
    await withLounge(async (ctx, fake) => {
      const error = captureConsole();
      fake.next.create = { kind: 'retry', error: 'server_error', afterMs: null };
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      expect(readLounge(ctx.sql).messageId).toBeNull();
      await tick(ctx, 60 * SECOND);
      expect(readLounge(ctx.sql).messageId).not.toBeNull();
      error.restore();
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

describe('the lounge message: the raid line', () => {
  const secs = (ms: number) => String(Math.floor(ms / 1000));
  const bossName = (ctx: CoreContext) => {
    const id = ctx.sql
      .exec<{ boss_id: string }>('SELECT boss_id FROM raid_weeks WHERE week_id = ?', W02.id)
      .one().boss_id;
    const found = content.bosses.find((b) => b.id === id);
    if (found === undefined) throw new Error('boss');
    return safeName(bossAtRank(found, 1).name);
  };
  /** Seeds the raid week at `at`, plays one session and posts the message. */
  const post = async (ctx: CoreContext, fake: Fake, at: number, seed = true) => {
    ctx.clock.t = at;
    if (seed) ctx.core.raid.ensureWeek(W02.id);
    await start(ctx, fake);
    // A login creates the week; drop it to test a server without one.
    if (!seed) ctx.sql.exec('DELETE FROM raid_weeks');
    await tick(ctx, 16 * SECOND);
  };

  it('shows the next stage during the weekend, with real-time timestamps', async () => {
    await withLounge(async (ctx, fake) => {
      await post(ctx, fake, times.phase1 + HOUR);
      expect(fake.log).toEqual([
        `create ${CHANNEL} Join | 🔥 Leet Creatures | 1 in the lounge: Misa\n\n⚔️ Raid weekend: **${bossName(ctx)}** · Phase 2 <t:${secs(times.phase2)}:R>`,
      ]);
      expect(fake.lastBody?.iconUrl).toBe(FAKE_ICON);
    });
  });

  it('has no raid line before the weekend or without a raid week', async () => {
    await withLounge(async (ctx, fake) => {
      await post(ctx, fake, times.phase1 - HOUR);
      expect(fake.lastBody?.description).toBe('1 in the lounge: Misa');
    });
    await withLounge(async (ctx, fake) => {
      await post(ctx, fake, times.phase1 + HOUR, false);
      expect(fake.lastBody?.description).toBe('1 in the lounge: Misa');
    });
  });

  it('never breaks the lounge when the raid lookup fails', async () => {
    await withLounge(async (ctx, fake) => {
      const error = captureConsole();
      ctx.sql.exec(
        `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
         VALUES (?, 1, 'finale', 's', '{}', '{}', 'not json', 0)`,
        W02.id,
      );
      await post(ctx, fake, times.finale + HOUR);
      expect(fake.lastBody?.description).toBe('1 in the lounge: Misa');
      expect(error.calls).toContainEqual(['lounge raid line failed', expect.any(String)]);
      error.restore();
    });
  });

  it('moves a quiet message along at each raid boundary, 2 minutes after', async () => {
    await withLounge(async (ctx, fake) => {
      await post(ctx, fake, times.phase1 + HOUR);
      fake.instances.delete(INSTANCE);
      await tick(ctx, 60 * SECOND);
      expect(readLounge(ctx.sql).nextCheckAt).toBe(times.phase2 + 2 * MINUTE);

      // Nothing happens before the boundary check, and a no-op check writes nothing.
      const writes = fake.log.length;
      const icons = fake.iconCalls;
      await ctx.core.runLounge();
      expect(fake.log).toHaveLength(writes);
      expect(fake.iconCalls).toBe(icons);

      ctx.clock.t = times.phase2 + 2 * MINUTE;
      await ctx.core.runLounge();
      expect(fake.log.at(-1)).toMatch(
        new RegExp(
          `^edit .* Play \\| 🌙 Leet Creatures \\| [\\s\\S]*Finale <t:${secs(times.finale)}:R>$`,
        ),
      );
      expect(readLounge(ctx.sql).nextCheckAt).toBe(times.finale + 2 * MINUTE);

      ctx.clock.t = times.finale + 2 * MINUTE;
      await ctx.core.runLounge();
      expect(fake.log.at(-1)).toMatch(/Finale under way$/);
      // The next boundary is next week's phase 1.
      expect(readLounge(ctx.sql).nextCheckAt).toBe(
        nextRaidBoundary(ctx.clock.t, HELSINKI) + 2 * MINUTE,
      );
    });
  });

  it('says how the finale ended once a party has a result', async () => {
    await withLounge(async (ctx, fake) => {
      await post(ctx, fake, times.phase1 + HOUR);
      fake.instances.delete(INSTANCE);
      const result = (party: number, cleared: boolean) =>
        ctx.sql.exec(
          `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
           VALUES (?, ?, 'finale', 's', '{}', '{}', ?, ?)`,
          W02.id,
          party,
          JSON.stringify({ cleared }),
          times.finale,
        );
      result(1, false);
      ctx.clock.t = times.finale + 3 * MINUTE;
      await ctx.core.runLounge();
      expect(fake.log.at(-1)).toMatch(/held on\.$/);
      result(2, true);
      ctx.sql.exec('UPDATE lounge_message SET next_check_at = ?', ctx.clock.t);
      await ctx.core.runLounge();
      expect(fake.log.at(-1)).toMatch(/fell!$/);
    });
  });

  it('schedules no check for a quiet lounge that has no message', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake, USER_ID, 'Misa', null);
      fake.instances.delete(INSTANCE);
      await tick(ctx, 16 * SECOND);
      expect(fake.log).toEqual([]);
      expect(readLounge(ctx.sql).nextCheckAt).toBeNull();
    });
  });

  it('fetches the icon only when it writes', async () => {
    await withLounge(async (ctx, fake) => {
      await start(ctx, fake);
      await tick(ctx, 16 * SECOND);
      expect(fake.iconCalls).toBe(1);
      await tick(ctx, 60 * SECOND);
      expect(fake.iconCalls).toBe(1);
      await start(ctx, fake, OTHER_USER_ID, 'Ana');
      await tick(ctx, 16 * SECOND);
      expect(fake.iconCalls).toBe(2);
    });
  });
});
