import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_POST_ATTEMPTS,
  POST_BACKOFF_MS,
  createPostSender,
  enqueuePost,
  postBody,
  publicOrigin,
  type PostSender,
  type SendOutcome,
} from '../src/discord-posts';
import { USER_ID, runCore, type CoreContext } from './helpers';
import { MINUTE, nextGuild, rows } from './raid-helpers';
import { captureConsole } from './kit';

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKEN = 'secret-bot-token-value';
const CHANNEL = '555555555555555555';
const USER = { id: USER_ID, displayName: 'Misa' };

// --- The sender, with a fake fetch ---

interface Captured {
  url: string;
  init: RequestInit;
}

function senderWith(respond: (call: Captured) => Response | Promise<Response>) {
  const captured: Captured[] = [];
  const send = createPostSender({
    botToken: TOKEN,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const call = { url, init: init ?? {} };
      captured.push(call);
      return Promise.resolve(respond(call));
    },
  });
  return { send, captured };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('createPostSender: the request', () => {
  it('posts to the channel with the bot token, no mentions and no embeds', async () => {
    const { send, captured } = senderWith(() => json(200, { id: '1' }));
    expect(await send(CHANNEL, 'Hello **world**')).toEqual({ kind: 'sent' });
    expect(captured).toHaveLength(1);
    const call = captured[0] as Captured;
    expect(call.url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toEqual({
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(call.init.body as string)).toEqual({
      content: 'Hello **world**',
      allowed_mentions: { parse: [] },
      flags: 4,
    });
    // workerd rejects redirect: 'error'; a redirect is never followed.
    expect(call.init.redirect).toBe('manual');
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('builds a real Request from the init options inside workerd', async () => {
    let built: Request | null = null;
    const send = createPostSender({
      botToken: TOKEN,
      fetch: async (input, init) => {
        // This throws if any option is one workerd does not support (for example redirect 'error').
        built = new Request(input, init);
        expect(await built.clone().json()).toMatchObject({
          allowed_mentions: { parse: [] },
          flags: 4,
        });
        return json(200, {});
      },
    });
    expect(await send(CHANNEL, 'hi')).toEqual({ kind: 'sent' });
    const request = built as unknown as Request;
    expect(request.redirect).toBe('manual');
    expect(request.method).toBe('POST');
    expect(request.headers.get('Authorization')).toBe(`Bot ${TOKEN}`);
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('refuses a channel id that is not a snowflake, without calling Discord', async () => {
    const { send, captured } = senderWith(() => json(200, {}));
    expect(await send('123/../../users', 'x')).toEqual({ kind: 'failed', error: 'rejected' });
    expect(await send('', 'x')).toEqual({ kind: 'failed', error: 'rejected' });
    expect(captured).toHaveLength(0);
  });
});

describe('postBody: a stored raid post', () => {
  const stored = JSON.stringify({
    embeds: [
      {
        title: 'Thornmother',
        color: 1,
        fields: [],
        thumbnail: { url: '/discord/bosses/thornmother.png' },
      },
    ],
    components: [
      {
        type: 1,
        components: [{ type: 2, style: 1, label: 'Play Leet Creatures', custom_id: 'lounge:play' }],
      },
    ],
  });

  it('sends the embed with the portrait on the game\u2019s site, the button, and no mentions', () => {
    expect(postBody(stored, 'https://creatures.misacorp.dev')).toEqual({
      embeds: [
        {
          title: 'Thornmother',
          color: 1,
          fields: [],
          thumbnail: { url: 'https://creatures.misacorp.dev/discord/bosses/thornmother.png' },
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: 'Play Leet Creatures', custom_id: 'lounge:play' },
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    });
  });

  it('leaves the portrait out without a site, and never suppresses the embed', () => {
    const body = postBody(stored, null);
    expect(body['embeds']).toEqual([{ title: 'Thornmother', color: 1, fields: [] }]);
    expect(body).not.toHaveProperty('flags');
  });

  it('sends anything else as plain text, as before (posts queued before the embeds)', () => {
    for (const text of ['**Finale: Thornmother**', '{not json', '{"embeds":"x"}']) {
      expect(postBody(text, 'https://creatures.misacorp.dev')).toEqual({
        content: text,
        allowed_mentions: { parse: [] },
        flags: 4,
      });
    }
  });

  it('knows the site of each deployed environment', () => {
    expect(publicOrigin('production')).toBe('https://creatures.misacorp.dev');
    expect(publicOrigin('staging')).toBe('https://creatures-staging.misacorp.dev');
    expect(publicOrigin('development')).toBeNull();
    expect(publicOrigin(undefined)).toBeNull();
  });

  it('is what the sender posts', async () => {
    const send = createPostSender({
      botToken: TOKEN,
      origin: 'https://creatures-staging.misacorp.dev',
      fetch: (_input, init) => {
        expect(JSON.parse(init?.body as string)).toEqual(
          postBody(stored, 'https://creatures-staging.misacorp.dev'),
        );
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    });
    expect(await send(CHANNEL, stored)).toEqual({ kind: 'sent' });
  });
});

describe('createPostSender: outcomes', () => {
  const outcome = async (res: Response): Promise<SendOutcome> =>
    senderWith(() => res).send(CHANNEL, 'x');

  it('treats 5xx as retryable with the usual backoff', async () => {
    for (const status of [500, 502, 503]) {
      expect(await outcome(json(status, { message: 'oops' }))).toEqual({
        kind: 'retry',
        error: 'server_error',
        afterMs: null,
      });
    }
  });

  it('honours retry_after on 429 (seconds, rounded up to milliseconds)', async () => {
    expect(await outcome(json(429, { message: 'slow', retry_after: 2.5, global: false }))).toEqual({
      kind: 'retry',
      error: 'rate_limited',
      afterMs: 2500,
    });
    expect(await outcome(json(429, { retry_after: 0.0001 }))).toMatchObject({ afterMs: 1000 });
    // Never longer than two hours, whatever Discord says.
    expect(await outcome(json(429, { retry_after: 999_999 }))).toMatchObject({
      afterMs: 2 * 60 * 60 * 1000,
    });
  });

  it('falls back to the Retry-After header, then to the usual backoff', async () => {
    expect(await outcome(json(429, 'not an object', { 'Retry-After': '7' }))).toMatchObject({
      kind: 'retry',
      afterMs: 7000,
    });
    expect(await outcome(new Response('nope', { status: 429 }))).toEqual({
      kind: 'retry',
      error: 'rate_limited',
      afterMs: null,
    });
    expect(await outcome(json(429, { retry_after: 'soon' }))).toMatchObject({ afterMs: null });
  });

  it('gives up at once on 403 and 404', async () => {
    expect(await outcome(json(403, { code: 50013 }))).toEqual({
      kind: 'failed',
      error: 'forbidden',
    });
    expect(await outcome(json(404, { code: 10003 }))).toEqual({
      kind: 'failed',
      error: 'not_found',
    });
  });

  it('gives up on other client errors and on redirects', async () => {
    expect(await outcome(json(400, {}))).toEqual({ kind: 'failed', error: 'rejected' });
    expect(await outcome(json(401, {}))).toEqual({ kind: 'failed', error: 'rejected' });
    expect(
      await outcome(new Response(null, { status: 302, headers: { Location: 'https://x.test/' } })),
    ).toEqual({ kind: 'failed', error: 'redirect' });
  });

  it('retries after a network error or a timeout, naming only the kind', async () => {
    const failing = (err: Error) =>
      createPostSender({ botToken: TOKEN, fetch: () => Promise.reject(err) })(CHANNEL, 'x');
    const network = await failing(new Error(`connect failed to ${CHANNEL} with ${TOKEN}`));
    expect(network).toEqual({ kind: 'retry', error: 'network', afterMs: null });
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    expect(await failing(timeout)).toEqual({ kind: 'retry', error: 'timeout', afterMs: null });
    expect(JSON.stringify(network)).not.toContain(TOKEN);
  });

  it('passes the real 5 second timeout to fetch', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    await senderWith(() => json(200, {})).send(CHANNEL, 'x');
    expect(spy).toHaveBeenCalledWith(5000);
  });
});

// --- The queue and its delivery, in a real Durable Object ---

function scripted(outcomes: (SendOutcome | Error)[] | ((call: number) => SendOutcome)) {
  const calls: { channelId: string; content: string }[] = [];
  const send: PostSender = (channelId, content) => {
    const n = calls.length;
    calls.push({ channelId, content });
    const next = typeof outcomes === 'function' ? outcomes(n) : (outcomes[n] ?? { kind: 'sent' });
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { send, calls };
}

const SENT: SendOutcome = { kind: 'sent' };
const fiveHundred: SendOutcome = { kind: 'retry', error: 'server_error', afterMs: null };

const posts = (ctx: Pick<CoreContext, 'sql'>) =>
  rows<{
    key: string;
    channel_id: string;
    content: string;
    status: string;
    attempts: number;
    next_attempt_at: number;
    created_at: number;
  }>(
    ctx.sql,
    'SELECT key, channel_id, content, status, attempts, next_attempt_at, created_at FROM discord_posts ORDER BY id',
  );

/** Runs `fn` in a fresh guild whose announcement channel is set and whose sender is scripted. */
async function withQueue<R>(
  send: PostSender | null,
  fn: (ctx: CoreContext) => Promise<R> | R,
  channel: string | null = CHANNEL,
): Promise<R> {
  return runCore(
    nextGuild(),
    async (ctx) => {
      await ctx.core.createSession(ctx.guildId, USER, channel);
      return fn(ctx);
    },
    { postSender: send },
  );
}

describe('enqueuePost', () => {
  it('queues nothing when no announcement channel is known', async () => {
    await withQueue(
      null,
      (ctx) => {
        expect(enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t)).toBe(false);
        expect(posts(ctx)).toEqual([]);
      },
      null,
    );
  });

  it('queues one pending post per key and never changes an existing one', async () => {
    await withQueue(null, (ctx) => {
      expect(
        enqueuePost(ctx.sql, { key: 'raid:2027-W02:phase1:1', content: 'first' }, ctx.clock.t),
      ).toBe(true);
      expect(
        enqueuePost(ctx.sql, { key: 'raid:2027-W02:phase1:1', content: 'again' }, ctx.clock.t + 5),
      ).toBe(false);
      expect(
        enqueuePost(ctx.sql, { key: 'raid:2027-W02:phase1:2', content: 'other' }, ctx.clock.t),
      ).toBe(true);
      expect(posts(ctx)).toEqual([
        {
          key: 'raid:2027-W02:phase1:1',
          channel_id: CHANNEL,
          content: 'first',
          status: 'pending',
          attempts: 0,
          next_attempt_at: ctx.clock.t,
          created_at: ctx.clock.t,
        },
        expect.objectContaining({ key: 'raid:2027-W02:phase1:2', content: 'other' }),
      ]);
    });
  });

  it('rejects a bad status and a duplicate key at the database level', async () => {
    await withQueue(null, (ctx) => {
      const insert = (key: string, status: string) =>
        ctx.sql.exec(
          'INSERT INTO discord_posts (key, channel_id, content, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 0, 0, 0)',
          key,
          CHANNEL,
          'x',
          status,
        );
      insert('k', 'pending');
      expect(() => insert('k', 'pending')).toThrow();
      expect(() => insert('k2', 'unknown')).toThrow();
    });
  });
});

describe('delivery', () => {
  it('sends a due post once and marks it sent', async () => {
    const { send, calls } = scripted([SENT]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'hello' }, ctx.clock.t);
      await ctx.core.deliverPosts();
      await ctx.core.deliverPosts();
      expect(calls).toEqual([{ channelId: CHANNEL, content: 'hello' }]);
      expect(posts(ctx)[0]).toMatchObject({ status: 'sent', attempts: 1 });
    });
  });

  it('sends posts oldest first', async () => {
    const { send, calls } = scripted([]);
    await withQueue(send, async (ctx) => {
      for (const key of ['a', 'b', 'c']) enqueuePost(ctx.sql, { key, content: key }, ctx.clock.t);
      await ctx.core.deliverPosts();
      expect(calls.map((c) => c.content)).toEqual(['a', 'b', 'c']);
      expect(posts(ctx).map((p) => p.status)).toEqual(['sent', 'sent', 'sent']);
    });
  });

  it('does not send a post that is not due yet', async () => {
    const { send, calls } = scripted([]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'later', content: 'x' }, ctx.clock.t + 10 * MINUTE);
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(0);
      ctx.clock.t += 10 * MINUTE;
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(1);
    });
  });

  it('sends nothing, and changes nothing, without a sender', async () => {
    await withQueue(null, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      await ctx.core.deliverPosts();
      expect(posts(ctx)[0]).toMatchObject({ status: 'pending', attempts: 0 });
    });
  });

  it('runs one delivery at a time: concurrent calls never double-send', async () => {
    const { send, calls } = scripted([]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      await Promise.all([
        ctx.core.deliverPosts(),
        ctx.core.deliverPosts(),
        ctx.core.deliverPosts(),
      ]);
      expect(calls).toHaveLength(1);
    });
  });

  it('keeps a post that is being sent out of the queue meanwhile (lease)', async () => {
    let release: (o: SendOutcome) => void = () => undefined;
    const calls: string[] = [];
    const send: PostSender = (_channel, content) => {
      calls.push(content);
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      const run = ctx.core.deliverPosts();
      // Mid-send: counted as an attempt, and not due again soon.
      expect(posts(ctx)[0]).toMatchObject({ status: 'pending', attempts: 1 });
      expect((posts(ctx)[0]?.next_attempt_at ?? 0) - ctx.clock.t).toBeGreaterThan(5 * MINUTE);
      release(SENT);
      await run;
      expect(posts(ctx)[0]?.status).toBe('sent');
      expect(calls).toHaveLength(1);
    });
  });

  it('retries a 500 with backoff 1 min, 5 min, 30 min, 2 h and then marks it failed', async () => {
    const error = captureConsole();
    const { send, calls } = scripted(() => fiveHundred);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'secret text' }, ctx.clock.t);
      for (let attempt = 1; attempt <= MAX_POST_ATTEMPTS; attempt++) {
        const before = ctx.clock.t;
        await ctx.core.deliverPosts();
        expect(calls).toHaveLength(attempt);
        const post = posts(ctx)[0];
        expect(post?.attempts).toBe(attempt);
        if (attempt < MAX_POST_ATTEMPTS) {
          expect(post?.status).toBe('pending');
          expect(post?.next_attempt_at).toBe(before + (POST_BACKOFF_MS[attempt - 1] ?? 0));
          // Not due before its time.
          ctx.clock.t = (post?.next_attempt_at ?? 0) - 1;
          await ctx.core.deliverPosts();
          expect(calls).toHaveLength(attempt);
          ctx.clock.t += 1;
        } else {
          expect(post?.status).toBe('failed');
        }
      }
      expect(POST_BACKOFF_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000]);
      // A failed post is never sent again.
      ctx.clock.t += 24 * 60 * MINUTE;
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(MAX_POST_ATTEMPTS);
      // Only error kinds are logged: no token, channel id or text.
      expect(error.calls).toContainEqual(['discord post failed', 'server_error']);
      const logged = JSON.stringify(error.calls);
      expect(logged).not.toContain(CHANNEL);
      expect(logged).not.toContain('secret text');
    });
  });

  it('succeeds after a retry', async () => {
    captureConsole();
    const { send, calls } = scripted([fiveHundred, SENT]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      await ctx.core.deliverPosts();
      ctx.clock.t += 60_000;
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(2);
      expect(posts(ctx)[0]).toMatchObject({ status: 'sent', attempts: 2 });
    });
  });

  it('waits as long as Discord asks on 429, and holds back the rest of the run', async () => {
    captureConsole();
    const { send, calls } = scripted([{ kind: 'retry', error: 'rate_limited', afterMs: 12_500 }]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'first' }, ctx.clock.t);
      enqueuePost(ctx.sql, { key: 'b', content: 'second' }, ctx.clock.t);
      const start = ctx.clock.t;
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(1);
      expect(posts(ctx).map((p) => [p.status, p.next_attempt_at])).toEqual([
        ['pending', start + 12_500],
        ['pending', start],
      ]);
      // After the wait both go out, in order.
      ctx.clock.t = start + 12_500;
      await ctx.core.deliverPosts();
      // The post that was not tried goes first (it is due earliest), then the rate-limited one.
      expect(calls.map((c) => c.content)).toEqual(['first', 'second', 'first']);
      expect(posts(ctx).map((p) => p.status)).toEqual(['sent', 'sent']);
    });
  });

  it('marks a post failed at once on 403 (no permission) and on 404 (unknown channel)', async () => {
    const error = captureConsole();
    const { send, calls } = scripted([
      { kind: 'failed', error: 'forbidden' },
      { kind: 'failed', error: 'not_found' },
    ]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      enqueuePost(ctx.sql, { key: 'b', content: 'y' }, ctx.clock.t);
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(2);
      expect(posts(ctx).map((p) => [p.status, p.attempts])).toEqual([
        ['failed', 1],
        ['failed', 1],
      ]);
      ctx.clock.t += 3 * 60 * MINUTE;
      await ctx.core.deliverPosts();
      expect(calls).toHaveLength(2);
      expect(error.calls).toContainEqual(['discord post failed', 'forbidden']);
      expect(error.calls).toContainEqual(['discord post failed', 'not_found']);
    });
  });

  it('treats a sender that throws as a retryable failure', async () => {
    captureConsole();
    const { send } = scripted([new Error('boom with secret details')]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      await ctx.core.deliverPosts();
      expect(posts(ctx)[0]).toMatchObject({ status: 'pending', attempts: 1 });
      expect(posts(ctx)[0]?.next_attempt_at).toBe(ctx.clock.t + (POST_BACKOFF_MS[0] ?? 0));
    });
  });

  it('is started by a request and by the alarm', async () => {
    const { send, calls } = scripted([]);
    await withQueue(send, async (ctx) => {
      const secret = await ctx.core.createSession(ctx.guildId, USER, CHANNEL);
      enqueuePost(ctx.sql, { key: 'a', content: 'from a request' }, ctx.clock.t);
      const res = await ctx.request(secret, '/api/me');
      expect(res.status).toBe(200);
      // The request does not wait for Discord; the background run is shared.
      await ctx.core.deliverPosts();
      expect(calls.map((c) => c.content)).toEqual(['from a request']);

      enqueuePost(ctx.sql, { key: 'b', content: 'from the alarm' }, ctx.clock.t);
      await ctx.core.alarm();
      expect(calls.map((c) => c.content)).toEqual(['from a request', 'from the alarm']);
      expect(posts(ctx).map((p) => p.status)).toEqual(['sent', 'sent']);
    });
  });

  it('never fails the alarm or the request when posting breaks', async () => {
    captureConsole();
    await withQueue(
      () => {
        throw new Error('sync throw');
      },
      async (ctx) => {
        enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
        await expect(ctx.core.alarm()).resolves.toBeUndefined();
        expect(posts(ctx)[0]?.status).toBe('pending');
      },
    );
  });
});

describe('the alarm and pending posts', () => {
  it('is set no later than the earliest pending post', async () => {
    const { send } = scripted([]);
    await withQueue(send, async (ctx) => {
      // The next raid event (Friday phase 1) is hours away; a post is due in ten minutes.
      const postAt = ctx.clock.t + 10 * MINUTE;
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, postAt);
      await ctx.core.ensureAlarm();
      expect(await ctx.storage.getAlarm()).toBe(postAt);
    });
  });

  it('is set to the backoff time after a failed attempt', async () => {
    captureConsole();
    const { send } = scripted(() => fiveHundred);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t);
      await ctx.core.alarm();
      expect(await ctx.storage.getAlarm()).toBe(ctx.clock.t + 60_000);
    });
  });

  it('delivers an overdue post from the alarm, then goes back to the raid calendar', async () => {
    const { send } = scripted([]);
    await withQueue(send, async (ctx) => {
      // Inserted as already due, after the last delivery run: nothing has claimed it yet.
      ctx.sql.exec(
        "INSERT INTO discord_posts (key, channel_id, content, status, attempts, next_attempt_at, created_at) VALUES ('a', ?, 'x', 'pending', 0, ?, 0)",
        CHANNEL,
        ctx.clock.t - 1000,
      );
      await ctx.core.alarm();
      // The alarm delivered it, so nothing is pending and the alarm is back on the raid calendar.
      expect(posts(ctx)[0]?.status).toBe('sent');
      const at = await ctx.storage.getAlarm();
      expect(at).not.toBeNull();
      expect(at).toBeGreaterThan(ctx.clock.t + 60_000);
    });
  });

  it('ignores posts when there is no sender, so it cannot spin', async () => {
    await withQueue(null, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t - 1000);
      await ctx.core.ensureAlarm();
      const at = await ctx.storage.getAlarm();
      expect(at).toBeGreaterThan(ctx.clock.t + 60_000);
    });
  });

  it('ignores sent and failed posts', async () => {
    const { send } = scripted([]);
    await withQueue(send, async (ctx) => {
      enqueuePost(ctx.sql, { key: 'a', content: 'x' }, ctx.clock.t + 5 * MINUTE);
      ctx.sql.exec("UPDATE discord_posts SET status = 'failed'");
      await ctx.core.ensureAlarm();
      expect(await ctx.storage.getAlarm()).toBeGreaterThan(ctx.clock.t + 5 * MINUTE);
    });
  });
});
