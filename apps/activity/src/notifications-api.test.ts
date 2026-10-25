import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from './api';
import { fetchNotifications, parseNotifications, saveNotifications } from './notifications-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The shape the server answers with (`apps/worker/test/dm-notify.test.ts` asserts the same literal). */
const ANSWER = {
  kinds: { trip: true, job: false, finale: false, stall: true },
  blocked: false,
  available: true,
};

async function signIn(): Promise<void> {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      Response.json({
        sessionToken: 't',
        accessToken: 'a',
        guildId: 'g',
        user: { id: '1', displayName: 'Misa' },
      }),
    ),
  );
  await createSession('code', 'instance');
}

describe('parseNotifications', () => {
  it('reads the answer', () => {
    expect(parseNotifications(ANSWER)).toEqual(ANSWER);
  });

  it.each([
    null,
    {},
    { ...ANSWER, kinds: { trip: true } },
    { ...ANSWER, kinds: { ...ANSWER.kinds, job: 'no' } },
    { ...ANSWER, blocked: 1 },
    { kinds: ANSWER.kinds, blocked: false },
  ])('refuses %j', (raw) => {
    expect(() => parseNotifications(raw)).toThrow();
  });
});

describe('the notification requests', () => {
  it('GETs /api/notifications', async () => {
    await signIn();
    const sent: { path: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
      sent.push({ path, init });
      return Promise.resolve(Response.json(ANSWER));
    });
    expect(await fetchNotifications()).toEqual(ANSWER);
    expect(sent[0]?.path).toBe('/api/notifications');
  });

  it('PUTs { kinds } and returns the new settings', async () => {
    await signIn();
    const sent: { path: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
      sent.push({ path, init });
      return Promise.resolve(Response.json(ANSWER));
    });
    expect(await saveNotifications({ trip: true })).toEqual(ANSWER);
    expect(sent[0]?.path).toBe('/api/notifications');
    expect(sent[0]?.init.method).toBe('PUT');
    expect(sent[0]?.init.body).toBe('{"kinds":{"trip":true}}');
  });

  it('refuses an answer of the wrong shape', async () => {
    await signIn();
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ kinds: {} })));
    await expect(saveNotifications({ job: true })).rejects.toThrow();
  });
});
