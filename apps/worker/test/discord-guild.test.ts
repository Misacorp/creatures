import { describe, expect, it } from 'vitest';
import { DiscordError, createGuildApi, type GuildApi } from '../src/discord';
import {
  PERMISSION_ADMINISTRATOR,
  PERMISSION_MANAGE_GUILD,
  basePermissions,
  canManageGuild,
  hasManagePermission,
} from '../src/discord-permissions';

const GUILD = '333333333333333333';
const USER = '111111111111111111';
const ROLE = '700000000000000001';

interface Captured {
  url: string;
  init: RequestInit;
}

function clientWith(responder: (c: Captured) => Response | Promise<Response>) {
  const captured: Captured[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    const c = { url, init: init ?? {} };
    captured.push(c);
    return Promise.resolve(responder(c));
  }) as unknown as typeof fetch;
  return { api: createGuildApi({ botToken: 'test-bot-token', fetch: fetchFn }), captured };
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function outcome(p: Promise<unknown>): Promise<unknown> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof DiscordError) return `error:${err.kind}`;
    throw err;
  }
}

describe('the guild API client', () => {
  it('reads the owner, with the bot token, a timeout and no redirects', async () => {
    const { api, captured } = clientWith(() => jsonRes({ owner_id: USER, name: 'x', extra: [1] }));
    expect(await api.getGuildOwnerId(GUILD)).toBe(USER);
    const [call] = captured;
    expect(call?.url).toBe(`https://discord.com/api/v10/guilds/${GUILD}`);
    expect(new Headers(call?.init.headers).get('Authorization')).toBe('Bot test-bot-token');
    expect(call?.init.redirect).toBe('manual');
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    expect(call?.init.method ?? 'GET').toBe('GET');
  });

  it('reads the roles', async () => {
    const roles = [
      { id: GUILD, name: '@everyone', permissions: '1071698660929' },
      { id: ROLE, permissions: '8' },
    ];
    const { api, captured } = clientWith(() => jsonRes(roles));
    expect(await api.getGuildRoles(GUILD)).toEqual([
      { id: GUILD, permissions: '1071698660929' },
      { id: ROLE, permissions: '8' },
    ]);
    expect(captured[0]?.url).toBe(`https://discord.com/api/v10/guilds/${GUILD}/roles`);
  });

  it('reads a member, and a 404 is "not a member"', async () => {
    const { api, captured } = clientWith(() => jsonRes({ roles: [ROLE], nick: null, user: {} }));
    expect(await api.getGuildMember(GUILD, USER)).toEqual({ roles: [ROLE] });
    expect(captured[0]?.url).toBe(`https://discord.com/api/v10/guilds/${GUILD}/members/${USER}`);
    const missing = clientWith(() => jsonRes({ code: 10007, message: 'Unknown Member' }, 404));
    expect(await missing.api.getGuildMember(GUILD, USER)).toBeNull();
  });

  it('treats everything else that goes wrong as unavailable', async () => {
    for (const status of [401, 403, 404, 429, 500, 502, 503, 302]) {
      const { api } = clientWith(() => jsonRes({}, status));
      expect(await outcome(api.getGuildOwnerId(GUILD)), String(status)).toBe('error:unavailable');
      expect(await outcome(api.getGuildRoles(GUILD)), String(status)).toBe('error:unavailable');
      if (status !== 404) {
        expect(await outcome(api.getGuildMember(GUILD, USER)), String(status)).toBe(
          'error:unavailable',
        );
      }
    }
  });

  it('treats network errors, timeouts and bad JSON as unavailable', async () => {
    const down = createGuildApi({
      botToken: 't',
      fetch: () => Promise.reject(new TypeError('boom')),
    });
    expect(await outcome(down.getGuildOwnerId(GUILD))).toBe('error:unavailable');
    const junk = clientWith(() => new Response('<html>', { status: 200 }));
    expect(await outcome(junk.api.getGuildRoles(GUILD))).toBe('error:unavailable');
  });

  it('refuses replies of the wrong shape', async () => {
    const bad: [keyof GuildApi, unknown][] = [
      ['getGuildOwnerId', {}],
      ['getGuildOwnerId', { owner_id: 5 }],
      ['getGuildOwnerId', { owner_id: 'abc' }],
      ['getGuildRoles', { id: ROLE }],
      ['getGuildRoles', [{ id: ROLE }]],
      ['getGuildRoles', [{ id: ROLE, permissions: 8 }]],
      ['getGuildRoles', [{ id: ROLE, permissions: '0x8' }]],
      ['getGuildRoles', [{ id: ROLE, permissions: '-8' }]],
      ['getGuildRoles', [{ id: 'nope', permissions: '8' }]],
      ['getGuildMember', {}],
      ['getGuildMember', { roles: 'x' }],
      ['getGuildMember', { roles: ['abc'] }],
    ];
    for (const [method, body] of bad) {
      const { api } = clientWith(() => jsonRes(body));
      const result = method === 'getGuildMember' ? api[method](GUILD, USER) : api[method](GUILD);
      expect(await outcome(result), JSON.stringify(body)).toBe('error:unavailable');
    }
  });

  it('only puts snowflakes into URLs', async () => {
    const { api, captured } = clientWith(() => jsonRes({ owner_id: USER }));
    expect(await outcome(api.getGuildOwnerId('../users/@me'))).toBe('error:unavailable');
    expect(await outcome(api.getGuildRoles(`${GUILD}/x`))).toBe('error:unavailable');
    expect(await outcome(api.getGuildMember(GUILD, '1/../2'))).toBe('error:unavailable');
    expect(captured).toEqual([]);
  });

  it('puts no token or body text into the error', async () => {
    const { api } = clientWith(() => jsonRes({ message: 'secret-detail' }, 500));
    try {
      await api.getGuildOwnerId(GUILD);
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain('test-bot-token');
      expect(String(err)).not.toContain('secret-detail');
    }
  });
});

describe('permission maths', () => {
  it('knows the bits', () => {
    expect(PERMISSION_ADMINISTRATOR).toBe(8n);
    expect(PERMISSION_MANAGE_GUILD).toBe(32n);
    expect(hasManagePermission(0n)).toBe(false);
    expect(hasManagePermission(8n)).toBe(true);
    expect(hasManagePermission(32n)).toBe(true);
    expect(hasManagePermission(~40n & ((1n << 64n) - 1n))).toBe(false);
  });

  it('combines @everyone and the member roles only', () => {
    const roles = [
      { id: GUILD, permissions: '1024' },
      { id: ROLE, permissions: '32' },
      { id: '700000000000000002', permissions: '8' },
    ];
    expect(basePermissions(GUILD, roles, [])).toBe(1024n);
    expect(basePermissions(GUILD, roles, [ROLE])).toBe(1056n);
    expect(basePermissions(GUILD, roles, ['700000000000000009'])).toBe(1024n);
    expect(basePermissions(GUILD, [], [ROLE])).toBe(0n);
  });
});

describe('canManageGuild', () => {
  function api(parts: Partial<GuildApi>): GuildApi & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      getGuildOwnerId: () => {
        calls.push('guild');
        return Promise.resolve('999999999999999999');
      },
      getGuildRoles: () => {
        calls.push('roles');
        return Promise.resolve([{ id: GUILD, permissions: '0' }]);
      },
      getGuildMember: () => {
        calls.push('member');
        return Promise.resolve({ roles: [] });
      },
      ...parts,
    };
  }

  it('stops at the owner without asking for roles or the member', async () => {
    const a = api({ getGuildOwnerId: () => Promise.resolve(USER) });
    expect(await canManageGuild(a, GUILD, USER)).toBe(true);
    expect(a.calls).toEqual([]);
  });

  it('is false for a user who is not a member', async () => {
    const a = api({ getGuildMember: () => Promise.resolve(null) });
    expect(await canManageGuild(a, GUILD, USER)).toBe(false);
  });

  it('passes failures on', async () => {
    const boom = () => Promise.reject(new DiscordError('unavailable'));
    expect(await outcome(canManageGuild(api({ getGuildOwnerId: boom }), GUILD, USER))).toBe(
      'error:unavailable',
    );
    expect(await outcome(canManageGuild(api({ getGuildRoles: boom }), GUILD, USER))).toBe(
      'error:unavailable',
    );
    expect(await outcome(canManageGuild(api({ getGuildMember: boom }), GUILD, USER))).toBe(
      'error:unavailable',
    );
  });
});
