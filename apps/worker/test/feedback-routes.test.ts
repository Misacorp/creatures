import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { reporterHash } from '../src/feedback-reporter';
import {
  DAY,
  MINUTE,
  OPS,
  READ,
  T0,
  clearInbox,
  clock,
  fakeFetch,
  inbox,
  makeHandler,
  makeKeys,
  nextFeedbackGuild,
  nextUser,
  ops,
  pngBytes,
  reportsEnv,
  submitReport,
  workerEnv,
  attachment,
  ATTACHMENT_ID,
  jsonBody,
  type Keys,
} from './feedback-helpers';

let keys: Keys;
beforeAll(async () => {
  keys = await makeKeys();
});
beforeEach(clearInbox);

const PENDING = '/api/ops/feedback/pending';
const EXPORTED = '/api/ops/feedback/exported';
const REPORT = '/api/ops/feedback/report';
const SCREENSHOT = '/api/ops/feedback/screenshot';

let counter = 0;
/** Puts a report straight into the inbox; returns its id. */
async function seed(
  input: Partial<{
    guildId: string;
    reporterHash: string;
    shot: 'none' | 'pending';
    now: number;
    text: string;
  }> = {},
): Promise<number> {
  counter += 1;
  const result = await inbox().submit({
    kind: 'bug',
    text: input.text ?? `Seeded report number ${String(counter)}.`,
    guildId: input.guildId ?? nextFeedbackGuild(),
    reporterHash: input.reporterHash ?? `seed-reporter-${String(counter)}`,
    version: 'v-test',
    branch: null,
    shot: input.shot ?? 'none',
    now: input.now ?? clock.now,
  });
  if (!result.ok) throw new Error(`seed failed: ${result.reason}`);
  return result.id;
}

const handler = () => makeHandler();

describe('the feedback ops routes: access', () => {
  const routes: { path: string; method: string; token: string; body?: unknown }[] = [
    { path: PENDING, method: 'GET', token: OPS },
    { path: EXPORTED, method: 'POST', token: OPS, body: { id: 1, issue: 2 } },
    { path: `${REPORT}?id=1`, method: 'GET', token: READ },
    { path: `${SCREENSHOT}?id=1`, method: 'GET', token: READ },
  ];

  it('answers a plain 404 for an unset or empty token', async () => {
    for (const route of routes) {
      const name = route.token === OPS ? 'OPS_TOKEN' : 'FEEDBACK_READ_TOKEN';
      for (const value of [undefined, '']) {
        const res = await ops(handler(), route.path, {
          ...route,
          env: workerEnv({ [name]: value }),
        });
        expect(res.status, `${route.path} ${String(value)}`).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
      }
      // An empty presented token cannot match an empty configured one either.
      const emptyBearer = await ops(handler(), route.path, {
        ...route,
        token: '',
        env: workerEnv({ [name]: '' }),
      });
      expect(emptyBearer.status).toBe(404);
    }
  });

  it('answers 404 for a missing, wrong or session-like token and for a wrong method', async () => {
    const guild = nextFeedbackGuild();
    for (const route of routes) {
      for (const token of [null, 'wrong', `${route.token}x`, `s1.${guild}.abc.def`]) {
        const res = await ops(handler(), route.path, { ...route, token });
        expect(res.status, `${route.path} ${String(token)}`).toBe(404);
      }
      const otherMethod = route.method === 'GET' ? 'POST' : 'GET';
      const res = await ops(handler(), route.path, {
        token: route.token,
        method: otherMethod,
        ...(otherMethod === 'POST' ? { body: { id: 1, issue: 2 } } : {}),
      });
      expect(res.status, `${route.path} ${otherMethod}`).toBe(404);
    }
    for (const method of ['PUT', 'DELETE']) {
      const res = await ops(handler(), PENDING, { method });
      expect(res.status).toBe(404);
    }
  });

  it('keeps the read token out of pending and exported, and the ops token out of report and screenshot', async () => {
    const id = await seed();
    clock.now += 3 * MINUTE;
    expect((await ops(handler(), PENDING, { token: READ })).status).toBe(404);
    expect(
      (await ops(handler(), EXPORTED, { method: 'POST', token: READ, body: { id, issue: 3 } }))
        .status,
    ).toBe(404);
    expect((await ops(handler(), `${REPORT}?id=${String(id)}`, { token: OPS })).status).toBe(404);
    expect((await ops(handler(), `${SCREENSHOT}?id=${String(id)}`, { token: OPS })).status).toBe(
      404,
    );
    // The right tokens work, and nothing was marked by the refused calls.
    expect((await ops(handler(), PENDING)).status).toBe(200);
    expect((await ops(handler(), `${REPORT}?id=${String(id)}`, { token: READ })).status).toBe(200);
    const body = (await jsonBody(await ops(handler(), PENDING))) as { reports: unknown[] };
    expect(body.reports).toHaveLength(1);
  });

  it('is rate-limited per caller, with its own bucket', async () => {
    const limited = makeHandler();
    const statuses: number[] = [];
    for (let i = 0; i < 63; i++) statuses.push((await ops(limited, PENDING)).status);
    // A burst of 60 covers one export run (up to 20 reports) with room to spare.
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429, 429]);
    const res = await ops(limited, PENDING);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    // A new handler (a new limiter) is not limited, and a wrong token is also counted.
    const fresh = makeHandler();
    for (let i = 0; i < 60; i++) await ops(fresh, PENDING, { token: 'wrong' });
    expect((await ops(fresh, PENDING)).status).toBe(429);
  });
});

describe('pending and exported', () => {
  it('lists only reports at least 2 minutes old, oldest first, at most 20', async () => {
    const old = await seed({ now: T0 - 10 * MINUTE });
    const older = await seed({ now: T0 - 20 * MINUTE });
    await seed({ now: T0 - MINUTE });
    await seed({ now: T0 });
    const body = (await jsonBody(await ops(handler(), PENDING))) as {
      reports: { id: number }[];
    };
    expect(body.reports.map((r) => r.id)).toEqual([older, old]);

    await clearInbox();
    for (let i = 0; i < 25; i++) await seed({ now: T0 - 30 * MINUTE + i });
    const many = (await jsonBody(await ops(handler(), PENDING))) as { reports: { id: number }[] };
    expect(many.reports).toHaveLength(20);
    const ids = many.reports.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('has the documented fields and nothing else', async () => {
    const guildId = nextFeedbackGuild();
    await seed({ guildId, now: T0 - 5 * MINUTE, text: 'A short report of a bug.' });
    const body = (await jsonBody(await ops(handler(), PENDING))) as {
      reports: Record<string, unknown>[];
    };
    const [report] = body.reports;
    expect(Object.keys(report ?? {}).sort()).toEqual(
      ['branch', 'createdAt', 'guildAlias', 'id', 'kind', 'screenshot', 'text', 'version'].sort(),
    );
    expect(report).toMatchObject({
      kind: 'bug',
      text: 'A short report of a bug.',
      createdAt: T0 - 5 * MINUTE,
      version: 'v-test',
      branch: null,
      screenshot: 'none',
    });
    expect(report?.['guildAlias']).toMatch(/^g-[0-9a-f]{6}$/);
  });

  it('waits for a screenshot that is still being copied, and calls a lost one failed after 10 minutes', async () => {
    const id = await seed({ shot: 'pending', now: T0 - 5 * MINUTE });
    const waiting = (await jsonBody(await ops(handler(), PENDING))) as { reports: unknown[] };
    expect(waiting.reports).toHaveLength(0);
    expect((await inbox().report(id, T0))?.shot).toBe('pending');

    clock.now = T0 + 6 * MINUTE;
    const lost = (await jsonBody(await ops(handler(), PENDING))) as {
      reports: { id: number; screenshot: string }[];
    };
    expect(lost.reports).toEqual([expect.objectContaining({ id, screenshot: 'failed' })]);
    const one = (await jsonBody(
      await ops(handler(), `${REPORT}?id=${String(id)}`, { token: READ }),
    )) as {
      screenshot: string;
    };
    expect(one.screenshot).toBe('failed');
    // A copy that finishes late is still accepted while the row is pending.
    expect(await inbox().storeShot(id, 'image/png', pngBytes(50))).toBe(true);
    expect((await inbox().report(id, clock.now))?.shot).toBe('stored');
  });

  it('marks a report exported once, repeats are fine, another issue is a 409', async () => {
    const id = await seed({ now: T0 - 10 * MINUTE });
    const call = (issue: number, reportId = id) =>
      ops(handler(), EXPORTED, { method: 'POST', body: { id: reportId, issue } });

    const first = await call(345);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const again = await call(345);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
    const conflict = await call(346);
    expect(conflict.status).toBe(409);
    expect((await call(1, id + 1000)).status).toBe(404);

    const body = (await jsonBody(await ops(handler(), PENDING))) as { reports: unknown[] };
    expect(body.reports).toHaveLength(0);
    const report = (await jsonBody(
      await ops(handler(), `${REPORT}?id=${String(id)}`, { token: READ }),
    )) as {
      issue: number | null;
    };
    expect(report.issue).toBe(345);
    // The first answer stays, even after the conflict.
    const exportedAt = await runInDurableObject(
      inbox(),
      (_i, state) =>
        state.storage.sql
          .exec<{ exported_at: number }>(
            'SELECT exported_at FROM feedback_reports WHERE id = ?',
            id,
          )
          .one().exported_at,
    );
    expect(exportedAt).toBe(T0);
  });

  it('rejects a malformed body with 400', async () => {
    const id = await seed();
    const bodies: unknown[] = [
      {},
      { id },
      { issue: 3 },
      { id, issue: 0 },
      { id: 0, issue: 3 },
      { id: -1, issue: 3 },
      { id: 1.5, issue: 3 },
      { id: '1', issue: 3 },
      { id, issue: 3, extra: true },
      { id: 1e20, issue: 3 },
      [],
      'x',
    ];
    for (const body of bodies) {
      const res = await ops(handler(), EXPORTED, { method: 'POST', body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const noBody = await ops(handler(), EXPORTED, { method: 'POST' });
    expect(noBody.status).toBe(400);
  });
});

describe('report and screenshot', () => {
  it('reads one report, with its issue number', async () => {
    const id = await seed({ now: T0 - 5 * MINUTE });
    const res = await ops(handler(), `${REPORT}?id=${String(id)}`, { token: READ });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ id, kind: 'bug', issue: null, screenshot: 'none' });
    // Even a report younger than 2 minutes can be read.
    const fresh = await seed();
    expect((await ops(handler(), `${REPORT}?id=${String(fresh)}`, { token: READ })).status).toBe(
      200,
    );
  });

  it('checks the id query', async () => {
    for (const path of [REPORT, SCREENSHOT]) {
      for (const query of [
        '',
        '?id=',
        '?id=abc',
        '?id=0',
        '?id=-1',
        '?id=1.5',
        '?id=1234567890123456',
        '?id=1e3',
        '?id=%201',
      ]) {
        const res = await ops(handler(), `${path}${query}`, { token: READ });
        expect(res.status, `${path}${query}`).toBe(400);
      }
      expect((await ops(handler(), `${path}?id=999999999`, { token: READ })).status).toBe(404);
    }
  });

  it('answers 404 for a screenshot that is not stored', async () => {
    const none = await seed();
    const pending = await seed({ shot: 'pending' });
    for (const id of [none, pending]) {
      const res = await ops(handler(), `${SCREENSHOT}?id=${String(id)}`, { token: READ });
      expect(res.status).toBe(404);
    }
  });

  it('refuses a screenshot that is too big or not an image when storing', async () => {
    const id = await seed({ shot: 'pending' });
    expect(await inbox().storeShot(id, 'image/png', pngBytes(8 * 1024 * 1024 + 1))).toBe(false);
    expect(await inbox().storeShot(id, 'image/png', new Uint8Array(0))).toBe(false);
    expect(await inbox().storeShot(id, 'text/html' as 'image/png', pngBytes(10))).toBe(false);
    expect(await inbox().storeShot(id + 100, 'image/png', pngBytes(10))).toBe(false);
    const none = await seed();
    expect(await inbox().storeShot(none, 'image/png', pngBytes(10))).toBe(false);
    expect((await inbox().report(id, clock.now))?.shot).toBe('pending');
    await inbox().failShot(id);
    expect((await inbox().report(id, clock.now))?.shot).toBe('failed');
    // failShot never changes a stored screenshot or a report without one.
    const stored = await seed({ shot: 'pending' });
    expect(await inbox().storeShot(stored, 'image/png', pngBytes(10))).toBe(true);
    await inbox().failShot(stored);
    await inbox().failShot(none);
    expect((await inbox().report(stored, clock.now))?.shot).toBe('stored');
    expect((await inbox().report(none, clock.now))?.shot).toBe('none');
  });

  it('round-trips a screenshot through chunks exactly', async () => {
    const id = await seed({ shot: 'pending' });
    const bytes = pngBytes(3 * 1024 * 1024 + 17);
    expect(await inbox().storeShot(id, 'image/png', bytes)).toBe(true);
    const shot = await inbox().shot(id);
    expect(shot?.type).toBe('image/png');
    expect(shot?.bytes).toEqual(bytes);
  });
});

describe('retention', () => {
  it('deletes reports and screenshots 180 days after they were sent, on the next submit', async () => {
    const old = await seed({ shot: 'pending', now: T0 });
    expect(await inbox().storeShot(old, 'image/png', pngBytes(1024))).toBe(true);
    const recent = await seed({ shot: 'pending', now: T0 + 100 * DAY });
    expect(await inbox().storeShot(recent, 'image/png', pngBytes(1024))).toBe(true);

    // Not yet 180 days: both stay.
    await seed({ now: T0 + 179 * DAY });
    expect(await inbox().report(old, T0 + 179 * DAY)).not.toBeNull();

    await seed({ now: T0 + 181 * DAY });
    expect(await inbox().report(old, T0 + 181 * DAY)).toBeNull();
    expect(await inbox().shot(old)).toBeNull();
    expect(await inbox().report(recent, T0 + 181 * DAY)).not.toBeNull();
    expect((await inbox().shot(recent))?.bytes.byteLength).toBe(1024);
    const leftover = await runInDurableObject(
      inbox(),
      (_i, state) =>
        state.storage.sql
          .exec<{ n: number }>('SELECT COUNT(*) AS n FROM feedback_shots WHERE report_id = ?', old)
          .one().n,
    );
    expect(leftover).toBe(0);
    // Report numbers are never reused.
    const next = await seed({ now: T0 + 182 * DAY });
    expect(next).toBeGreaterThan(recent);
  });
});

describe('privacy', () => {
  it('shows no user id, guild id or reporter hash in any route', async () => {
    const worker = makeHandler(fakeFetch(() => new Response(pngBytes(2000))));
    const environment = reportsEnv(keys);
    const userId = nextUser();
    const guildId = nextFeedbackGuild();
    await submitReport(
      worker,
      keys,
      {
        userId,
        guildId,
        text: 'The raid screen is blank for me.',
        files: [ATTACHMENT_ID],
        attachments: attachment(ATTACHMENT_ID),
      },
      environment,
    );
    clock.now += 3 * MINUTE;

    const hash = await reporterHash(env.DISCORD_CLIENT_SECRET, userId);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    // The hash is stored, so the test really would catch a leak of it.
    const stored = await runInDurableObject(inbox(), (_i, state) =>
      state.storage.sql
        .exec<{ reporter_hash: string; guild_id: string }>(
          'SELECT reporter_hash, guild_id FROM feedback_reports',
        )
        .one(),
    );
    expect(stored).toEqual({ reporter_hash: hash, guild_id: guildId });
    expect(hash).not.toContain(userId);

    const pending = await ops(worker, PENDING, { env: environment });
    const pendingText = await pending.text();
    const id = (JSON.parse(pendingText) as { reports: { id: number }[] }).reports[0]?.id;
    expect(id).toBeDefined();
    const report = await ops(worker, `${REPORT}?id=${String(id)}`, {
      token: READ,
      env: environment,
    });
    const reportText = await report.text();
    const shot = await ops(worker, `${SCREENSHOT}?id=${String(id)}`, {
      token: READ,
      env: environment,
    });
    expect(shot.status).toBe(200);
    const everything = [pendingText, reportText, [...shot.headers].join('\n')].join('\n');
    for (const secret of [userId, guildId, hash, 'someone']) {
      expect(everything).not.toContain(secret);
    }
    expect(pendingText).toContain('guildAlias');
  });

  it('derives the reporter hash per user, per secret, and keeps it stable', async () => {
    const a = await reporterHash('secret-one', '811111111111111111');
    expect(await reporterHash('secret-one', '811111111111111111')).toBe(a);
    expect(await reporterHash('secret-one', '811111111111111112')).not.toBe(a);
    expect(await reporterHash('secret-two', '811111111111111111')).not.toBe(a);
  });

  it('uses the same server alias as the ops report', async () => {
    const { guildAliases } = await import('../src/ops-report');
    const guildId = nextFeedbackGuild();
    await seed({ guildId, now: T0 - 5 * MINUTE });
    const body = (await jsonBody(await ops(handler(), PENDING))) as {
      reports: { guildAlias: string }[];
    };
    const expected = (await guildAliases(env.DISCORD_CLIENT_SECRET, [guildId])).get(guildId);
    expect(body.reports[0]?.guildAlias).toBe(expected);
  });
});
