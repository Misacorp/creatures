import { describe, expect, it } from 'vitest';
import raidChannelFixture from '../../activity/src/fixtures/raid-channel.json';
import requestBodies from '../../activity/src/fixtures/request-bodies.json';
import { DiscordError } from '../src/discord';
import { PERMISSION_ADMINISTRATOR, PERMISSION_MANAGE_GUILD } from '../src/discord-permissions';
import { announceChannelId } from '../src/discord-posts';
import type { GuildCoreOptions } from '../src/guild-core';
import {
  OTHER_USER_ID,
  USER_ID,
  fakeGuildApi,
  runCore,
  type CoreContext,
  type FakeGuildOptions,
} from './helpers';
import { nextGuild } from './raid-helpers';
import { captureConsole } from './kit';

const CHANNEL_A = '555555555555555551';
const CHANNEL_B = '555555555555555552';
const CHANNEL_C = '555555555555555553';
const ROLE_ADMIN = '700000000000000001';
const ROLE_MANAGER = '700000000000000002';
const ROLE_CHAT = '700000000000000003';
const ME = { id: USER_ID, displayName: 'Misa' };
const THEM = { id: OTHER_USER_ID, displayName: 'Them' };

const ROLES = [
  { id: ROLE_ADMIN, permissions: String(PERMISSION_ADMINISTRATOR) },
  { id: ROLE_MANAGER, permissions: String(PERMISSION_MANAGE_GUILD) },
  // View Channel, Send Messages, Manage Messages, Manage Roles: close, but not Manage Server.
  { id: ROLE_CHAT, permissions: String((1n << 10n) | (1n << 11n) | (1n << 13n) | (1n << 28n)) },
];

interface Setup {
  guild?: FakeGuildOptions;
  /** No guild API at all (the bot token is not configured). */
  noApi?: boolean;
}

/** Runs `fn` in a fresh guild whose Discord guild API is mocked. */
function withGuild<R>(
  setup: Setup,
  fn: (
    ctx: CoreContext,
    api: ReturnType<typeof fakeGuildApi>,
    opts: FakeGuildOptions,
  ) => Promise<R>,
): Promise<R> {
  const guildId = nextGuild();
  const opts: FakeGuildOptions = { roles: ROLES, ...setup.guild };
  const api = fakeGuildApi(guildId, opts);
  const options: GuildCoreOptions = { guildApi: setup.noApi === true ? null : api };
  return runCore(guildId, (ctx) => fn(ctx, api, opts), options);
}

interface ChannelAnswer {
  pinned: boolean;
  here: boolean;
  canManage: boolean;
}

async function call<T = ChannelAnswer>(
  ctx: CoreContext,
  secret: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown,
): Promise<{ status: number; body: T; text: string }> {
  const res = await ctx.request(secret, '/api/raid/channel', method, body);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as T, text };
}

const announce = (ctx: CoreContext) => announceChannelId(ctx.sql);

describe('who may manage the raid-post channel', () => {
  const cases: [string, FakeGuildOptions, boolean][] = [
    ['the owner', { ownerId: USER_ID }, true],
    ['an Administrator role', { members: { [USER_ID]: [ROLE_ADMIN] } }, true],
    ['a Manage Server role', { members: { [USER_ID]: [ROLE_MANAGER] } }, true],
    ['a plain member', { members: { [USER_ID]: [] } }, false],
    ['a member with only chat roles', { members: { [USER_ID]: [ROLE_CHAT] } }, false],
    [
      'a member whose @everyone role has Manage Server',
      {
        roles: [{ id: 'GUILD', permissions: String(PERMISSION_MANAGE_GUILD) }],
        members: { [USER_ID]: [] },
      },
      true,
    ],
    ['someone who is not in the guild', {}, false],
  ];

  for (const [name, guild, expected] of cases) {
    it(`${expected ? 'allows' : 'refuses'} ${name}`, async () => {
      const guildId = nextGuild();
      const roles = guild.roles?.map((r) => (r.id === 'GUILD' ? { ...r, id: guildId } : r));
      const api = fakeGuildApi(guildId, { roles: ROLES, ...guild, ...(roles ? { roles } : {}) });
      await runCore(
        guildId,
        async (ctx) => {
          const secret = await ctx.core.createSession(guildId, ME, CHANNEL_A);
          const get = await call(ctx, secret, 'GET');
          expect(get).toMatchObject({ status: 200, body: { canManage: expected } });

          const post = await call<{ error?: string } & Partial<ChannelAnswer>>(
            ctx,
            secret,
            'POST',
            {
              action: 'pin',
            },
          );
          if (expected) {
            expect(post).toMatchObject({ status: 200, body: { pinned: true, here: true } });
            expect(announce(ctx)).toBe(CHANNEL_A);
          } else {
            expect(post).toMatchObject({ status: 403, body: { error: 'forbidden' } });
            expect(ctx.core.channelPinned()).toBe(false);
          }
        },
        { guildApi: api },
      );
    });
  }

  it('reads permissions above 2^53 exactly', async () => {
    const big = (1n << 60n) | PERMISSION_MANAGE_GUILD;
    await withGuild(
      {
        guild: {
          roles: [{ id: ROLE_MANAGER, permissions: String(big) }],
          members: { [USER_ID]: [ROLE_MANAGER] },
        },
      },
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
        expect((await call(ctx, secret, 'GET')).body.canManage).toBe(true);
      },
    );
    const noBits = (1n << 60n) | (1n << 40n);
    await withGuild(
      {
        guild: {
          roles: [{ id: ROLE_MANAGER, permissions: String(noBits) }],
          members: { [USER_ID]: [ROLE_MANAGER] },
        },
      },
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
        expect((await call(ctx, secret, 'GET')).body.canManage).toBe(false);
      },
    );
  });
});

describe('pinning', () => {
  const owner: Setup = { guild: { ownerId: USER_ID } };

  it('pins the channel the session was launched from, and a login from another channel keeps it', async () => {
    await withGuild(owner, async (ctx) => {
      const secretA = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      expect(announce(ctx)).toBe(CHANNEL_A);
      expect(await call(ctx, secretA, 'GET')).toMatchObject({
        body: { pinned: false, here: false, canManage: true },
      });
      expect(await call(ctx, secretA, 'POST', { action: 'pin' })).toMatchObject({
        status: 200,
        body: { pinned: true, here: true, canManage: true },
      });

      // Someone launches from another channel: the pin stays.
      const secretB = await ctx.core.createSession(ctx.guildId, THEM, CHANNEL_B);
      expect(announce(ctx)).toBe(CHANNEL_A);
      expect(await call(ctx, secretB, 'GET')).toMatchObject({
        body: { pinned: true, here: false, canManage: false },
      });
      // The first session is still "here".
      expect((await call(ctx, secretA, 'GET')).body.here).toBe(true);
      // Even the pinning player logging in elsewhere does not move it.
      await ctx.core.createSession(ctx.guildId, ME, CHANNEL_C);
      expect(announce(ctx)).toBe(CHANNEL_A);
    });
  });

  it('can be moved: pinning from another channel replaces the pin', async () => {
    await withGuild(owner, async (ctx) => {
      const secretA = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const secretB = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_B);
      await call(ctx, secretA, 'POST', { action: 'pin' });
      expect((await call(ctx, secretB, 'GET')).body).toMatchObject({ pinned: true, here: false });
      expect((await call(ctx, secretB, 'POST', { action: 'pin' })).body).toMatchObject({
        pinned: true,
        here: true,
      });
      expect(announce(ctx)).toBe(CHANNEL_B);
      expect((await call(ctx, secretA, 'GET')).body.here).toBe(false);
    });
  });

  it('unpins: logins follow the launch channel again', async () => {
    await withGuild(owner, async (ctx) => {
      const secretA = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      await call(ctx, secretA, 'POST', { action: 'pin' });
      expect(await call(ctx, secretA, 'POST', { action: 'unpin' })).toMatchObject({
        status: 200,
        body: { pinned: false, here: false, canManage: true },
      });
      // Nothing changes until the next login, which updates the channel as before.
      expect(announce(ctx)).toBe(CHANNEL_A);
      await ctx.core.createSession(ctx.guildId, THEM, CHANNEL_C);
      expect(announce(ctx)).toBe(CHANNEL_C);
      // Unpinning when nothing is pinned is fine.
      expect((await call(ctx, secretA, 'POST', { action: 'unpin' })).status).toBe(200);
    });
  });

  it('refuses to unpin for someone who may not manage the server', async () => {
    await withGuild(
      { guild: { ownerId: USER_ID, members: { [OTHER_USER_ID]: [] } } },
      async (ctx) => {
        const secretA = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
        await call(ctx, secretA, 'POST', { action: 'pin' });
        const secretB = await ctx.core.createSession(ctx.guildId, THEM, CHANNEL_B);
        expect(await call(ctx, secretB, 'POST', { action: 'unpin' })).toMatchObject({
          status: 403,
          body: { error: 'forbidden' },
        });
        expect(await call(ctx, secretB, 'POST', { action: 'pin' })).toMatchObject({ status: 403 });
        expect(ctx.core.channelPinned()).toBe(true);
        expect(announce(ctx)).toBe(CHANNEL_A);
      },
    );
  });

  it('cannot pin from a session without a known launch channel', async () => {
    await withGuild(owner, async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, null);
      expect(await call(ctx, secret, 'POST', { action: 'pin' })).toMatchObject({
        status: 409,
        body: { error: 'channel_unknown' },
      });
      expect(ctx.core.channelPinned()).toBe(false);
      expect((await call(ctx, secret, 'GET')).body).toMatchObject({ pinned: false, here: false });
    });
  });

  it('remembers the launch channel per session', async () => {
    await withGuild(owner, async (ctx) => {
      const secretA = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const secretB = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_B);
      await call(ctx, secretB, 'POST', { action: 'pin' });
      expect(announce(ctx)).toBe(CHANNEL_B);
      expect((await call(ctx, secretA, 'GET')).body.here).toBe(false);
      expect((await call(ctx, secretB, 'GET')).body.here).toBe(true);
    });
  });

  it('queues raid posts to the pinned channel', async () => {
    await withGuild(owner, async (ctx) => {
      const secretA = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      await call(ctx, secretA, 'POST', { action: 'pin' });
      await ctx.core.createSession(ctx.guildId, THEM, CHANNEL_B);
      expect(announceChannelId(ctx.sql)).toBe(CHANNEL_A);
    });
  });

  it('never exposes channel ids', async () => {
    await withGuild(owner, async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const answers = [
        await call(ctx, secret, 'GET'),
        await call(ctx, secret, 'POST', { action: 'pin' }),
        await call(ctx, secret, 'GET'),
      ];
      for (const a of answers) expect(a.text).not.toContain(CHANNEL_A);
      const raid = await ctx.request(secret, '/api/raid');
      expect(await raid.text()).not.toContain(CHANNEL_A);
    });
  });
});

describe('the request', () => {
  const owner: Setup = { guild: { ownerId: USER_ID } };

  it('accepts the bodies the client sends, and answers in the shape the client reads', async () => {
    await withGuild(owner, async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const send = async (key: 'channel-pin' | 'channel-unpin') => {
        const { method, path, body } = requestBodies[key];
        expect(path).toBe('/api/raid/channel');
        return call(ctx, secret, method as 'POST', body);
      };
      const pinned = await send('channel-pin');
      expect(pinned.status).toBe(200);
      // The saved answer the client's parser is tested against: pinned, here, can manage.
      expect(pinned.body).toEqual(raidChannelFixture);
      expect((await send('channel-unpin')).status).toBe(200);
    });
  });

  it('is strict: only { action: "pin" | "unpin" }', async () => {
    await withGuild(owner, async (ctx, api) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const bad: unknown[] = [
        {},
        { action: 'toggle' },
        { action: 'PIN' },
        { action: 1 },
        { action: null },
        { action: 'pin', channelId: CHANNEL_B },
        { action: 'pin', extra: true },
        { channelId: CHANNEL_B },
        ['pin'],
        'pin',
        null,
      ];
      for (const body of bad) {
        expect(await call(ctx, secret, 'POST', body), JSON.stringify(body)).toMatchObject({
          status: 400,
          body: { error: 'invalid_body' },
        });
      }
      // Junk never reaches Discord and never changes anything.
      expect(api.calls).toEqual([]);
      expect(ctx.core.channelPinned()).toBe(false);
      expect(announce(ctx)).toBe(CHANNEL_A);
    });
  });

  it('rejects a missing or oversized body and other methods', async () => {
    await withGuild(owner, async (ctx, api) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      expect((await call(ctx, secret, 'POST')).status).toBe(400);
      const big = await call(ctx, secret, 'POST', { action: 'pin', pad: 'x'.repeat(5000) });
      expect(big.status).toBe(400);
      expect((await call(ctx, secret, 'PUT', { action: 'pin' })).status).toBe(405);
      expect(api.calls).toEqual([]);
    });
  });

  it('needs a session', async () => {
    await withGuild(owner, async (ctx) => {
      const res = await ctx.core.handle(
        new Request('https://creatures.test/api/raid/channel', {
          method: 'POST',
          body: JSON.stringify({ action: 'pin' }),
        }),
      );
      expect(res.status).toBe(401);
    });
  });
});

describe('when Discord cannot answer', () => {
  it('answers 503 discord_unavailable and changes nothing', async () => {
    const log = captureConsole();
    const guild: FakeGuildOptions = { ownerId: USER_ID, failure: new DiscordError('unavailable') };
    await withGuild({ guild }, async (ctx, api, opts) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      expect(await call(ctx, secret, 'GET')).toMatchObject({
        status: 503,
        body: { error: 'discord_unavailable' },
      });
      expect(await call(ctx, secret, 'POST', { action: 'pin' })).toMatchObject({
        status: 503,
        body: { error: 'discord_unavailable' },
      });
      expect(await call(ctx, secret, 'POST', { action: 'unpin' })).toMatchObject({ status: 503 });
      expect(ctx.core.channelPinned()).toBe(false);
      // The failure was not remembered: once Discord is back, the check works.
      delete opts.failure;
      expect((await call(ctx, secret, 'GET')).body.canManage).toBe(true);
      expect(api.calls.length).toBeGreaterThan(0);
      // Each failed check logged its kind and nothing else (the check that worked logged nothing).
      expect(log.calls).toEqual(Array(3).fill(['discord permission check failed', 'unavailable']));
    });
  });

  it('does not break the raid view, which never asks Discord', async () => {
    const guild: FakeGuildOptions = { ownerId: USER_ID, failure: new DiscordError('unavailable') };
    await withGuild({ guild }, async (ctx, api) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const res = await ctx.request(secret, '/api/raid');
      expect(res.status).toBe(200);
      expect((await res.json<{ channel: unknown }>()).channel).toEqual({
        pinned: false,
        canManage: null,
      });
      expect(api.calls).toEqual([]);
    });
  });

  it('fails closed when no bot token is configured', async () => {
    const log = captureConsole();
    await withGuild({ noApi: true }, async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      expect((await call(ctx, secret, 'GET')).status).toBe(503);
      expect((await call(ctx, secret, 'POST', { action: 'pin' })).status).toBe(503);
      expect(log.calls).toEqual(Array(2).fill(['discord permission check failed', 'unavailable']));
    });
  });

  it('treats a member Discord does not know (404) as no permission, not as a failure', async () => {
    await withGuild(
      { guild: { noMembers: true, members: { [USER_ID]: [ROLE_ADMIN] } } },
      async (ctx) => {
        const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
        expect(await call(ctx, secret, 'GET')).toMatchObject({
          status: 200,
          body: { canManage: false },
        });
        expect((await call(ctx, secret, 'POST', { action: 'pin' })).status).toBe(403);
      },
    );
  });
});

describe('the 60 second answer cache', () => {
  const admin: Setup = { guild: { members: { [USER_ID]: [ROLE_ADMIN] } } };

  it('asks Discord once per minute per player, and GET /api/raid only reports what is known', async () => {
    await withGuild(admin, async (ctx, api) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const raidChannel = async () =>
        (await (await ctx.request(secret, '/api/raid')).json<{ channel: unknown }>()).channel;
      expect(await raidChannel()).toEqual({ pinned: false, canManage: null });

      await call(ctx, secret, 'GET');
      expect(api.calls).toEqual([
        `guild:${ctx.guildId}`,
        `roles:${ctx.guildId}`,
        `member:${USER_ID}`,
      ]);
      expect(await raidChannel()).toEqual({ pinned: false, canManage: true });
      await call(ctx, secret, 'GET');
      expect(api.calls).toHaveLength(3);

      ctx.clock.t += 59_000;
      await call(ctx, secret, 'GET');
      expect(api.calls).toHaveLength(3);

      ctx.clock.t += 2_000;
      expect(await raidChannel()).toEqual({ pinned: false, canManage: null });
      await call(ctx, secret, 'GET');
      expect(api.calls).toHaveLength(6);
    });
  });

  it('remembers a "no" too, but a change always asks again', async () => {
    await withGuild({ guild: { members: { [USER_ID]: [] } } }, async (ctx, api, opts) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      expect((await call(ctx, secret, 'GET')).body.canManage).toBe(false);
      expect((await call(ctx, secret, 'GET')).body.canManage).toBe(false);
      expect(api.calls).toHaveLength(3);
      const raid = await (await ctx.request(secret, '/api/raid')).json<{ channel: unknown }>();
      expect(raid.channel).toEqual({ pinned: false, canManage: false });

      // The player was just given a role: pinning checks again instead of trusting the old "no".
      opts.members = { [USER_ID]: [ROLE_MANAGER] };
      expect((await call(ctx, secret, 'POST', { action: 'pin' })).status).toBe(200);
      expect(api.calls).toHaveLength(6);
      expect((await call(ctx, secret, 'GET')).body.canManage).toBe(true);
      expect(api.calls).toHaveLength(6);
    });
  });

  it('keeps players apart', async () => {
    await withGuild(
      { guild: { members: { [USER_ID]: [ROLE_ADMIN], [OTHER_USER_ID]: [] } } },
      async (ctx) => {
        const a = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
        const b = await ctx.core.createSession(ctx.guildId, THEM, CHANNEL_A);
        expect((await call(ctx, a, 'GET')).body.canManage).toBe(true);
        expect((await call(ctx, b, 'GET')).body.canManage).toBe(false);
        expect((await call(ctx, a, 'GET')).body.canManage).toBe(true);
      },
    );
  });
});

describe('GET /api/raid', () => {
  it('has channel.pinned and channel.canManage', async () => {
    await withGuild({ guild: { ownerId: USER_ID } }, async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, ME, CHANNEL_A);
      const get = async () =>
        (await (await ctx.request(secret, '/api/raid')).json<{ channel: unknown }>()).channel;
      expect(await get()).toEqual({ pinned: false, canManage: null });
      await call(ctx, secret, 'POST', { action: 'pin' });
      expect(await get()).toEqual({ pinned: true, canManage: true });
    });
  });
});
