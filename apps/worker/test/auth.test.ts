import { env } from 'cloudflare:workers';
import { listDurableObjectIds, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DiscordError } from '../src/discord';
import { createHandler } from '../src/index';
import { hashSecret, parseSessionToken } from '../src/session';
import {
  ACCESS_TOKEN,
  GUILD_ID,
  OTHER_USER_ID,
  USER_ID,
  expectApiHeaders,
  fakeDiscord,
  getWithToken,
  postAuth,
  callHandler,
  ORIGIN,
  type FakeDiscordOptions,
} from './helpers';

function setup(options: FakeDiscordOptions = {}) {
  const discord = fakeDiscord(options);
  const handler = createHandler({ createDiscord: () => discord });
  return { discord, handler };
}

const validBody = { code: 'oauth-code', instanceId: 'instance-1' };

describe('POST /api/auth/session', () => {
  it('creates a session using the guild from Discord and returns the access token', async () => {
    const { handler, discord } = setup();
    const res = await postAuth(handler, validBody);
    expect(res.status).toBe(200);
    expectApiHeaders(res);
    const body = await res.json<{
      sessionToken: string;
      accessToken: string;
      user: { id: string; displayName: string };
      guildId: string;
    }>();
    expect(body.accessToken).toBe(ACCESS_TOKEN);
    expect(body.user).toEqual({ id: USER_ID, displayName: 'Misa' });
    expect(body.guildId).toBe(GUILD_ID);
    expect(parseSessionToken(body.sessionToken)?.guildId).toBe(GUILD_ID);
    expect(discord.calls.exchangeCode).toEqual(['oauth-code']);
    expect(discord.calls.getCurrentUser).toEqual([ACCESS_TOKEN]);
    expect(discord.calls.getActivityInstance).toEqual(['instance-1']);

    // The new token works against /api/me.
    const me = await getWithToken(handler, '/api/me', body.sessionToken);
    expect(me.status).toBe(200);
    // Balances come from the mock leet history, which depends on the real date: only check shape.
    expect(await me.json()).toEqual({
      user: body.user,
      guildId: GUILD_ID,
      timezone: 'Europe/Helsinki',
      balances: { bait: expect.any(Number) as number, essence: 0 },
      leetSync: {
        source: 'mock',
        lastAttemptAt: expect.any(Number) as number,
        lastSyncedAt: expect.any(Number) as number,
        lastError: null,
        lastDays: expect.any(Number) as number,
      },
    });
  });

  it('takes the guild only from the instance response; a client-supplied guild is rejected', async () => {
    const { handler } = setup({
      instance: { location: { guild_id: '444444444444444444' }, users: [USER_ID] },
    });
    const injected = await postAuth(handler, { ...validBody, guildId: GUILD_ID });
    expect(injected.status).toBe(400);
    const res = await postAuth(handler, validBody);
    expect((await res.json<{ guildId: string }>()).guildId).toBe('444444444444444444');
  });

  describe('the announcement channel', () => {
    const CHANNEL_A = '555555555555555551';
    const CHANNEL_B = '555555555555555552';
    const channelOf = (guildId: string) =>
      runInDurableObject(
        env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId)),
        (_i, state) =>
          state.storage.sql
            .exec<{ announce_channel_id: string | null }>(
              'SELECT announce_channel_id FROM guild_meta',
            )
            .one().announce_channel_id,
      );
    const instance = (guildId: string, channelId: string | null | undefined) => ({
      location: {
        guild_id: guildId,
        ...(channelId === undefined ? {} : { channel_id: channelId }),
      },
      users: [USER_ID],
    });

    it('is taken from the activity instance Discord reports and updated on every login', async () => {
      const guildId = '777000000000000001';
      let channel: string | null | undefined = CHANNEL_A;
      const discord = fakeDiscord();
      discord.getActivityInstance = () => Promise.resolve(instance(guildId, channel));
      const handler = createHandler({ createDiscord: () => discord });

      expect((await postAuth(handler, validBody)).status).toBe(200);
      expect(await channelOf(guildId)).toBe(CHANNEL_A);
      channel = CHANNEL_B;
      await postAuth(handler, validBody);
      expect(await channelOf(guildId)).toBe(CHANNEL_B);
      // No channel in Discord's answer (or null): the last known one stays.
      channel = undefined;
      await postAuth(handler, validBody);
      channel = null;
      await postAuth(handler, validBody);
      expect(await channelOf(guildId)).toBe(CHANNEL_B);
    });

    it('ignores a client-supplied channel: the body is strict, and Discord decides', async () => {
      const guildId = '777000000000000002';
      const { handler } = setup({ instance: instance(guildId, CHANNEL_A) });
      for (const key of ['channelId', 'channel_id', 'announceChannelId']) {
        const res = await postAuth(handler, { ...validBody, [key]: CHANNEL_B });
        expect(res.status).toBe(400);
      }
      // Nothing was stored by the rejected requests: the guild was never created.
      const ids = await listDurableObjectIds(env.GUILD_WORLD);
      expect(ids.some((id) => id.name === guildId)).toBe(false);
      expect((await postAuth(handler, validBody)).status).toBe(200);
      expect(await channelOf(guildId)).toBe(CHANNEL_A);
    });

    it('ignores a channel id from Discord that is not a snowflake', async () => {
      const guildId = '777000000000000003';
      const { handler } = setup({ instance: instance(guildId, 'not-a-snowflake') });
      expect((await postAuth(handler, validBody)).status).toBe(200);
      expect(await channelOf(guildId)).toBeNull();
    });

    it('is passed from the verified instance into createSession', async () => {
      const calls: (string | null)[] = [];
      const discord = fakeDiscord({ instance: instance(GUILD_ID, CHANNEL_A) });
      const { handleAuthSession } = await import('../src/auth');
      const { TokenBucketLimiter } = await import('../src/ratelimit');
      const res = await handleAuthSession(
        new Request(`${ORIGIN}/api/auth/session`, {
          method: 'POST',
          body: JSON.stringify(validBody),
        }),
        {
          discord,
          limiter: new TokenBucketLimiter({
            capacity: 10,
            refillPerSecond: 1,
            now: () => 0,
            maxKeys: 10,
          }),
          createSession: (_guild, _user, channelId) => {
            calls.push(channelId);
            return Promise.resolve('secret');
          },
          formatToken: (_guild, secret) => Promise.resolve(secret),
        },
      );
      expect(res.status).toBe(200);
      expect(calls).toEqual([CHANNEL_A]);
    });
  });

  it('uses the username when there is no global name, and sanitises it', async () => {
    const { handler } = setup({
      user: { id: USER_ID, username: 'ev‮il​', global_name: null },
    });
    const res = await postAuth(handler, validBody);
    expect((await res.json<{ user: { displayName: string } }>()).user.displayName).toBe('evil');
  });

  it('401s when the code exchange fails', async () => {
    const { handler } = setup({ exchangeError: new DiscordError('auth_failed') });
    const res = await postAuth(handler, validBody);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'discord_auth_failed' });
    expectApiHeaders(res);
  });

  it('401s when the instance does not exist', async () => {
    const { handler } = setup({ instance: null });
    const res = await postAuth(handler, validBody);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'instance_not_found' });
  });

  it('400s for an activity launched outside a guild', async () => {
    for (const instance of [
      { location: {}, users: [USER_ID] },
      { location: { guild_id: null }, users: [USER_ID] },
      { location: { guild_id: 'not-a-snowflake' }, users: [USER_ID] },
    ]) {
      const { handler } = setup({ instance });
      const res = await postAuth(handler, validBody);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'guild_required' });
    }
  });

  it('401s when the user is not in the instance, and creates no session', async () => {
    const guildId = '555555555555555555';
    const { handler } = setup({
      instance: { location: { guild_id: guildId }, users: [OTHER_USER_ID] },
    });
    const res = await postAuth(handler, validBody);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_in_instance' });
    const ids = await listDurableObjectIds(env.GUILD_WORLD);
    expect(ids.map((id) => id.toString())).not.toContain(
      env.GUILD_WORLD.idFromName(guildId).toString(),
    );
  });

  it('503s when Discord is unavailable at any step', async () => {
    for (const options of [
      { exchangeError: new DiscordError('unavailable') },
      { userError: new DiscordError('unavailable') },
      { instanceError: new DiscordError('unavailable') },
    ]) {
      const { handler } = setup(options);
      const res = await postAuth(handler, validBody);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'discord_unavailable' });
      expectApiHeaders(res);
    }
  });

  it.each([
    ['missing code', { instanceId: 'i' }],
    ['missing instanceId', { code: 'c' }],
    ['empty code', { code: '', instanceId: 'i' }],
    ['code too long', { code: 'x'.repeat(513), instanceId: 'i' }],
    ['instanceId too long', { code: 'c', instanceId: 'x'.repeat(129) }],
    ['unknown key', { code: 'c', instanceId: 'i', extra: 1 }],
    ['wrong type', { code: 1, instanceId: 'i' }],
    ['array body', []],
    ['null body', null],
  ])('400s on invalid body: %s', async (_name, body) => {
    const { handler, discord } = setup();
    const res = await postAuth(handler, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
    expect(discord.calls.exchangeCode).toEqual([]);
  });

  it('400s on non-JSON and oversized bodies without calling Discord', async () => {
    const { handler, discord } = setup();
    expect((await postAuth(handler, 'not json', { raw: true })).status).toBe(400);
    const big = JSON.stringify({ code: 'c', instanceId: 'i', pad: 'x'.repeat(5000) });
    expect((await postAuth(handler, big, { raw: true })).status).toBe(400);
    expect(discord.calls.exchangeCode).toEqual([]);
  });

  it('rate limits per instance id', async () => {
    const { handler } = setup();
    let last = 200;
    for (let i = 0; i < 11; i++) last = (await postAuth(handler, validBody)).status;
    expect(last).toBe(429);
    const res = await postAuth(handler, validBody);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    // A different instance is unaffected.
    expect((await postAuth(handler, { ...validBody, instanceId: 'instance-2' })).status).toBe(200);
  });

  it('405s on other methods', async () => {
    const { handler } = setup();
    const res = await callHandler(handler, new Request(`${ORIGIN}/api/auth/session`));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });

  it('stores only the token hash, never the secret', async () => {
    const guildId = '666666666666666666';
    const { handler } = setup({
      instance: { location: { guild_id: guildId }, users: [USER_ID] },
    });
    const res = await postAuth(handler, validBody);
    const { sessionToken } = await res.json<{ sessionToken: string }>();
    const secret = parseSessionToken(sessionToken)?.secret;
    expect(secret).toBeDefined();
    const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
    const dump = await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql;
      return JSON.stringify({
        players: sql.exec('SELECT * FROM players').toArray(),
        sessions: sql.exec('SELECT * FROM sessions').toArray(),
        everything: sql.exec('SELECT name, sql FROM sqlite_master').toArray(),
      });
    });
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain(ACCESS_TOKEN);
    expect(dump).toContain(await hashSecret(secret ?? ''));
  });
});
