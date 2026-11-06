import { expect } from 'vitest';
import type { GuildApi } from '../src/discord';
import { PERMISSION_ADMINISTRATOR } from '../src/discord-permissions';
import { ORIGIN, tokenFor, type CoreContext } from './helpers';
import { sessionCaller, type Json as KitJson } from './kit';
import { seedPlayer, type SeedOptions } from './raid-helpers';

// The tests read parts of many different bodies; typing each would hide what they check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = KitJson<any>;

/** A Discord guild API in which every player is an Administrator: the dev tools are for server managers only. */
export const MANAGERS_API: GuildApi = {
  getGuildOwnerId: () => Promise.resolve('999999999999999999'),
  getGuildRoles: (guildId) =>
    Promise.resolve([
      { id: guildId, permissions: '0' },
      { id: 'admins', permissions: String(PERMISSION_ADMINISTRATOR) },
    ]),
  getGuildMember: () => Promise.resolve({ roles: ['admins'] }),
};

/** A guild core with the dev tools on (and the practice finale, as on staging), whose players all manage the server. */
export const ON = { devTools: true, raidPractice: true, guildApi: MANAGERS_API } as const;

export interface Dev {
  id: string;
  creatureIds: string[];
  call: (method: string, path: string, body?: unknown) => Promise<Json>;
  /** POST /api/dev/<tool>. */
  dev: (tool: string, body?: unknown) => Promise<Json>;
  /** A dev tool that must succeed: its `result`. */
  tool: (tool: string, body?: unknown) => Promise<Json['body']>;
  /** A POST whose body is sent as given (text). */
  raw: (path: string, text: string) => Promise<Json>;
}

/** A seeded player with a session. Go through `call`: it is the player's own session. */
export async function player(ctx: CoreContext, n = 1, options: SeedOptions = {}): Promise<Dev> {
  const seeded = seedPlayer(ctx, n, { level: 8, creatures: 3, ...options });
  const { call, secret } = await sessionCaller<Json['body']>(ctx, {
    id: seeded.id,
    displayName: seeded.name,
  });
  const dev = (tool: string, body: unknown = {}) => call('POST', `/api/dev/${tool}`, body);
  const tool = async (name: string, body: unknown = {}): Promise<Json['body']> => {
    const res = await dev(name, body);
    expect(res, `${name} ${JSON.stringify(body)}`).toMatchObject({ status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return res.body.result;
  };
  const raw = async (path: string, text: string): Promise<Json> => {
    const res = await ctx.core.handle(
      new Request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await tokenFor(ctx.guildId, await secret())}` },
        body: text,
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  return { id: seeded.id, creatureIds: seeded.creatureIds, call, dev, tool, raw };
}
