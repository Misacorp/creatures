import { describe, expect, it } from 'vitest';
import { DiscordError, createDiscordApi } from '../src/discord';

interface Captured {
  url: string;
  init: RequestInit;
}

function clientWith(responder: (c: Captured) => Response | Promise<Response>) {
  const captured: Captured[] = [];
  // The client under test only ever passes a string URL.
  const fetchFn = ((url: string, init?: RequestInit) => {
    const c = { url, init: init ?? {} };
    captured.push(c);
    return Promise.resolve(responder(c));
  }) as unknown as typeof fetch;
  const api = createDiscordApi({
    clientId: '123456789012345678',
    clientSecret: 'test-client-secret',
    botToken: 'test-bot-token',
    fetch: fetchFn,
  });
  return { api, captured };
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof DiscordError) return err.kind;
    throw err;
  }
  return 'no error';
}

describe('exchangeCode', () => {
  it('posts a form-encoded body and returns the access token', async () => {
    const { api, captured } = clientWith(() => jsonRes({ access_token: 'tok', extra: 1 }));
    expect(await api.exchangeCode('the-code')).toBe('tok');
    const [call] = captured;
    expect(call?.url).toBe('https://discord.com/api/oauth2/token');
    expect(call?.init.method).toBe('POST');
    expect(new Headers(call?.init.headers).get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );
    const params = call?.init.body;
    expect(params).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(params as URLSearchParams)).toEqual({
      client_id: '123456789012345678',
      client_secret: 'test-client-secret',
      grant_type: 'authorization_code',
      code: 'the-code',
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a 400 to auth_failed and 429/5xx to unavailable', async () => {
    expect(await kindOf(clientWith(() => jsonRes({}, 400)).api.exchangeCode('c'))).toBe(
      'auth_failed',
    );
    expect(await kindOf(clientWith(() => jsonRes({}, 429)).api.exchangeCode('c'))).toBe(
      'unavailable',
    );
    expect(await kindOf(clientWith(() => jsonRes({}, 502)).api.exchangeCode('c'))).toBe(
      'unavailable',
    );
  });

  it('maps network failures and malformed responses to unavailable', async () => {
    const failing = clientWith(() => {
      throw new TypeError('network down with secret details');
    });
    expect(await kindOf(failing.api.exchangeCode('c'))).toBe('unavailable');
    expect(await kindOf(clientWith(() => jsonRes({ nope: 1 })).api.exchangeCode('c'))).toBe(
      'unavailable',
    );
    expect(await kindOf(clientWith(() => new Response('not json')).api.exchangeCode('c'))).toBe(
      'unavailable',
    );
  });

  it('never puts upstream details in the error message', async () => {
    const failing = clientWith(() => {
      throw new TypeError('leaky-detail');
    });
    await expect(failing.api.exchangeCode('c')).rejects.toThrow(/^discord_unavailable$/);
  });
});

describe('getCurrentUser', () => {
  it('sends the access token as a bearer token and validates the shape', async () => {
    const { api, captured } = clientWith(() =>
      jsonRes({ id: '111111111111111111', username: 'misa', global_name: null, avatar: 'x' }),
    );
    expect(await api.getCurrentUser('tok')).toMatchObject({
      id: '111111111111111111',
      username: 'misa',
    });
    expect(captured[0]?.url).toBe('https://discord.com/api/v10/users/@me');
    expect(new Headers(captured[0]?.init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('rejects ids that are not snowflakes', async () => {
    const { api } = clientWith(() => jsonRes({ id: 'abc', username: 'misa' }));
    expect(await kindOf(api.getCurrentUser('tok'))).toBe('unavailable');
  });

  it('maps 401 to auth_failed', async () => {
    expect(await kindOf(clientWith(() => jsonRes({}, 401)).api.getCurrentUser('t'))).toBe(
      'auth_failed',
    );
  });
});

describe('getActivityInstance', () => {
  it('uses the bot token and an encoded instance id', async () => {
    const { api, captured } = clientWith(() =>
      jsonRes({ location: { kind: 'gc', channel_id: '1', guild_id: '2' }, users: ['3'] }),
    );
    expect(await api.getActivityInstance('a/b c')).toEqual({
      location: { guild_id: '2' },
      users: ['3'],
    });
    expect(captured[0]?.url).toBe(
      'https://discord.com/api/v10/applications/123456789012345678/activity-instances/a%2Fb%20c',
    );
    expect(new Headers(captured[0]?.init.headers).get('Authorization')).toBe('Bot test-bot-token');
  });

  it('returns null on 404', async () => {
    expect(await clientWith(() => jsonRes({}, 404)).api.getActivityInstance('x')).toBeNull();
  });

  it('treats 401, 403 and 5xx as unavailable (our configuration, not the player)', async () => {
    for (const status of [401, 403, 500, 429]) {
      expect(await kindOf(clientWith(() => jsonRes({}, status)).api.getActivityInstance('x'))).toBe(
        'unavailable',
      );
    }
  });
});
