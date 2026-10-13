import { describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { DIRECTORY_NAME } from '../src/guild-directory';
import { createHandler } from '../src/index';
import { GUILD_ID, OTHER_USER_ID, fakeDiscord, getWithToken, postAuth } from './helpers';
import { nextGuild, rows } from './raid-helpers';

function directory() {
  return env.GUILD_DIRECTORY.get(env.GUILD_DIRECTORY.idFromName(DIRECTORY_NAME));
}

interface Entry {
  guild_id: string;
  first_seen: string;
  last_seen: string;
}

function entries(): Promise<Entry[]> {
  return runInDurableObject(directory(), (_instance, state) =>
    rows<Entry & Record<string, string>>(
      state.storage.sql,
      'SELECT guild_id, first_seen, last_seen FROM guild_directory ORDER BY guild_id',
    ),
  );
}

const body = { code: 'oauth-code', instanceId: 'instance-1' };

describe('GuildDirectory', () => {
  it('keeps one row per guild with the first and the last day it was seen', async () => {
    const a = nextGuild();
    const b = nextGuild();
    await directory().note(a, '2027-01-10');
    await directory().note(b, '2027-01-11');
    await directory().note(a, '2027-01-12');
    // An older day never moves "last seen" back, and never moves "first seen".
    await directory().note(a, '2027-01-05');
    const all = await entries();
    expect(all.find((e) => e.guild_id === a)).toMatchObject({
      first_seen: '2027-01-10',
      last_seen: '2027-01-12',
    });
    expect(all.find((e) => e.guild_id === b)).toMatchObject({
      first_seen: '2027-01-11',
      last_seen: '2027-01-11',
    });
    const { ids: listed } = await directory().list(2000);
    // Most recently seen first: a was seen last (2027-01-12), then b (2027-01-11).
    expect(listed.indexOf(a)).toBeLessThan(listed.indexOf(b));
    expect(listed.filter((id) => id === a)).toHaveLength(1);
  });

  it('caps the list but reports the true total', async () => {
    const guilds = [nextGuild(), nextGuild(), nextGuild()];
    await directory().note(guilds[0] ?? '', '2037-01-01');
    await directory().note(guilds[1] ?? '', '2037-01-03');
    await directory().note(guilds[2] ?? '', '2037-01-02');
    const { ids, total } = await directory().list(2);
    expect(ids).toEqual([guilds[1], guilds[2]]);
    expect(total).toBe((await entries()).length);
    expect(total).toBeGreaterThan(ids.length);
    expect((await directory().list(0)).ids).toEqual([]);
    expect((await directory().list(1_000_000)).total).toBe(total);
  });

  it('stores nothing but guild ids and days, and ignores anything else', async () => {
    const before = (await entries()).length;
    await directory().note('not a snowflake', '2027-01-10');
    await directory().note(nextGuild(), 'yesterday');
    await directory().note("1'; DROP TABLE guild_directory;--", '2027-01-10');
    expect((await entries()).length).toBe(before);
    const columns = await runInDurableObject(directory(), (_instance, state) =>
      rows<{ name: string }>(
        state.storage.sql,
        "SELECT name FROM pragma_table_info('guild_directory') ORDER BY cid",
      ).map((c) => c.name),
    );
    expect(columns).toEqual(['guild_id', 'first_seen', 'last_seen']);
  });
});

describe('the directory and login', () => {
  it('records the guild when a session is created', async () => {
    const handler = createHandler({ createDiscord: () => fakeDiscord() });
    const res = await postAuth(handler, body);
    expect(res.status).toBe(200);
    await vi.waitFor(async () => {
      expect((await entries()).map((e) => e.guild_id)).toContain(GUILD_ID);
    });
    const today = new Date().toISOString().slice(0, 10);
    const entry = (await entries()).find((e) => e.guild_id === GUILD_ID);
    expect(entry).toMatchObject({ first_seen: today, last_seen: today });
  });

  it('writes at most once a day per guild object', async () => {
    const handler = createHandler({ createDiscord: () => fakeDiscord() });
    await postAuth(handler, body);
    await vi.waitFor(async () => {
      expect((await entries()).map((e) => e.guild_id)).toContain(GUILD_ID);
    });
    // Put the stored day far back; a second login the same day must not touch it.
    await runInDurableObject(directory(), (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE guild_directory SET last_seen = '2000-01-01' WHERE guild_id = ?",
        GUILD_ID,
      );
    });
    const other = createHandler({
      createDiscord: () =>
        fakeDiscord({
          user: { id: OTHER_USER_ID, username: 'other', global_name: 'Other' },
          instance: { location: { guild_id: GUILD_ID }, users: [OTHER_USER_ID] },
        }),
    });
    const second = await postAuth(other, body);
    expect(second.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await entries()).find((e) => e.guild_id === GUILD_ID)?.last_seen).toBe('2000-01-01');
  });
});

// Last on purpose: it breaks the directory for the rest of the file.
describe('a directory that fails', () => {
  it('never delays or fails a login', async () => {
    await runInDurableObject(directory(), (_instance, state) => {
      state.storage.sql.exec('DROP TABLE guild_directory');
    });
    const guild = nextGuild();
    const handler = createHandler({
      createDiscord: () =>
        fakeDiscord({
          user: { id: OTHER_USER_ID, username: 'other', global_name: 'Other' },
          instance: { location: { guild_id: guild }, users: [OTHER_USER_ID] },
        }),
    });
    const res = await postAuth(handler, body);
    expect(res.status).toBe(200);
    const { sessionToken } = await res.json<{ sessionToken: string }>();
    // The session works, so the failure stayed in the background.
    expect((await getWithToken(handler, '/api/me', sessionToken)).status).toBe(200);
  });
});
