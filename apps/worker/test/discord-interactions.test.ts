import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runInDurableObject } from 'cloudflare:test';
import command from '../src/feedback-command.json';
import { FEEDBACK_COMMAND } from '../src/discord-interactions';
import {
  ATTACHMENT_ID,
  READ,
  T0,
  attachment,
  clearInbox,
  clock,
  expectSameBytes,
  fakeFetch,
  inbox,
  interact,
  jsonBody,
  makeCtx,
  makeHandler,
  makeKeys,
  modalSubmit,
  nextFeedbackGuild,
  nextUser,
  ops,
  pngBytes,
  reportsEnv,
  submitReport,
  workerEnv,
  type Keys,
  type Reply,
} from './feedback-helpers';
import { DAY, MINUTE, captureConsole } from './kit';

let keys: Keys;
let otherKeys: Keys;

beforeAll(async () => {
  keys = await makeKeys();
  otherKeys = await makeKeys();
});
beforeEach(clearInbox);

const PING = { type: 1 };

/** Makes everything older than two minutes and lists what the export would see. */
async function exportable(handler: ReturnType<typeof makeHandler>) {
  clock.now += 3 * MINUTE;
  const res = await ops(handler, '/api/ops/feedback/pending', { env: reportsEnv(keys) });
  expect(res.status).toBe(200);
  return ((await jsonBody(res)) as { reports: Record<string, unknown>[] }).reports;
}

describe('the interactions route: signature', () => {
  it('is a 404 without a usable public key, even for a signed request', async () => {
    const handler = makeHandler();
    for (const key of [undefined, '', 'abc', 'z'.repeat(64), `${keys.publicHex}00`]) {
      const res = await interact(
        handler,
        { keys, body: PING },
        workerEnv({ DISCORD_PUBLIC_KEY: key }),
        makeCtx().ctx,
      );
      expect(res.status).toBe(404);
    }
  });

  it('answers a PING with a PONG when the signature is good', async () => {
    const res = await interact(
      makeHandler(),
      { keys, body: PING },
      reportsEnv(keys),
      makeCtx().ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 1 });
  });

  it('only takes POST', async () => {
    const res = await interact(
      makeHandler(),
      { keys, body: PING, method: 'GET' },
      reportsEnv(keys),
      makeCtx().ctx,
    );
    expect(res.status).toBe(405);
  });

  it('rejects a missing, malformed or wrong signature with 401', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    const good = await interact(handler, { keys, body: PING }, environment, makeCtx().ctx);
    expect(good.status).toBe(200);

    const attempts = [
      { signature: null },
      { signature: 'not hex' },
      { signature: 'ab'.repeat(32) },
      { signature: '00'.repeat(64) },
      { omitTimestamp: true },
      // Signed for another body.
      { signedBody: JSON.stringify({ type: 2 }) },
    ];
    for (const attempt of attempts) {
      const res = await interact(
        handler,
        { keys, body: PING, ...attempt },
        environment,
        makeCtx().ctx,
      );
      expect(res.status).toBe(401);
    }
    // Signed with a different key.
    const wrongKey = await interact(
      handler,
      { keys: otherKeys, body: PING },
      environment,
      makeCtx().ctx,
    );
    expect(wrongKey.status).toBe(401);
    // Signed over the body but with another timestamp than the one sent.
    const body = JSON.stringify(PING);
    const timestamp = String(Math.floor(clock.now / 1000));
    const wrongStamp = await interact(
      handler,
      { keys, body: PING, signedBody: body, signedTimestamp: String(Number(timestamp) + 1) },
      environment,
      makeCtx().ctx,
    );
    expect(wrongStamp.status).toBe(401);
  });

  it('checks the signature before reading the JSON', async () => {
    const res = await interact(
      makeHandler(),
      { keys, body: null, raw: 'not json', signature: '00'.repeat(64) },
      reportsEnv(keys),
      makeCtx().ctx,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp more than 5 minutes from now, even with a valid signature', async () => {
    const handler = makeHandler();
    for (const offset of [-6 * MINUTE, 6 * MINUTE, -DAY]) {
      const res = await interact(
        handler,
        { keys, body: PING, timestamp: String(Math.floor((clock.now + offset) / 1000)) },
        reportsEnv(keys),
        makeCtx().ctx,
      );
      expect(res.status).toBe(401);
    }
    const inside = await interact(
      handler,
      { keys, body: PING, timestamp: String(Math.floor((clock.now - 4 * MINUTE) / 1000)) },
      reportsEnv(keys),
      makeCtx().ctx,
    );
    expect(inside.status).toBe(200);
  });

  it('answers 413 to a body over 64 KiB and 400 to an unknown type or non-object', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    const big = await interact(
      handler,
      { keys, body: null, raw: JSON.stringify({ type: 1, pad: 'x'.repeat(70_000) }) },
      environment,
      makeCtx().ctx,
    );
    expect(big.status).toBe(413);
    for (const body of [{ type: 3 }, { type: 'x' }, {}, { type: 1.5 }]) {
      const res = await interact(handler, { keys, body }, environment, makeCtx().ctx);
      expect(res.status).toBe(400);
    }
    for (const raw of ['[1]', 'null', '"x"', 'nope']) {
      const res = await interact(handler, { keys, body: null, raw }, environment, makeCtx().ctx);
      expect(res.status).toBe(400);
    }
  });
});

describe('the /feedback command', () => {
  it('opens the form (a modal) with the three fields', async () => {
    const res = await interact(
      makeHandler(),
      { keys, body: { type: 2, guild_id: nextFeedbackGuild(), data: { name: 'feedback' } } },
      reportsEnv(keys),
      makeCtx().ctx,
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as {
      type: number;
      data: {
        custom_id: string;
        title: string;
        components: {
          type: number;
          label: string;
          description?: string;
          component: Record<string, unknown>;
        }[];
      };
    };
    expect(body.type).toBe(9);
    expect(body.data.custom_id).toBe('feedback');
    expect(body.data.title).toBe('Send feedback');
    const [kind, text, shot] = body.data.components;
    expect(body.data.components.map((c) => c.type)).toEqual([18, 18, 18]);
    expect(kind?.component).toMatchObject({ type: 3, custom_id: 'kind' });
    expect(kind?.component['options']).toEqual([
      { label: 'Something is broken', value: 'bug' },
      { label: 'An idea', value: 'idea' },
      { label: 'Something else', value: 'other' },
    ]);
    expect(text?.component).toMatchObject({
      type: 4,
      custom_id: 'text',
      style: 2,
      min_length: 10,
      max_length: 1500,
    });
    expect(text?.description).toMatch(/public GitHub page/);
    expect(text?.description).toMatch(/without your name/);
    expect(text?.description?.length).toBeLessThanOrEqual(100);
    expect(shot?.component).toMatchObject({
      type: 19,
      custom_id: 'shot',
      min_values: 0,
      max_values: 1,
      required: false,
      file_types: ['.png', '.jpg', '.jpeg', '.webp'],
    });
    for (const c of body.data.components) expect(c.label.length).toBeLessThanOrEqual(45);
  });

  it('matches the command definition that is registered with Discord', () => {
    expect(command.name).toBe(FEEDBACK_COMMAND);
    expect(command.type).toBe(1);
    expect(command.contexts).toEqual([0]);
    expect(command.integration_types).toEqual([0]);
    expect(command.description.length).toBeLessThanOrEqual(100);
  });

  it('answers privately to another command, or one used outside a server', async () => {
    const handler = makeHandler();
    const bodies = [
      { type: 2, guild_id: nextFeedbackGuild(), data: { name: 'other' } },
      { type: 2, data: { name: 'feedback' } },
    ];
    for (const body of bodies) {
      const res = await interact(handler, { keys, body }, reportsEnv(keys), makeCtx().ctx);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        type: 4,
        data: {
          content: "That command isn't available here.",
          flags: 64,
          allowed_mentions: { parse: [] },
        },
      });
    }
  });
});

describe('launching the Activity', () => {
  const send = (body: unknown) =>
    interact(makeHandler(), { keys, body }, reportsEnv(keys), makeCtx().ctx);

  it('answers the entry point command with LAUNCH_ACTIVITY, in a server or a DM', async () => {
    for (const body of [
      { type: 2, guild_id: nextFeedbackGuild(), data: { name: 'whatever', type: 4 } },
      { type: 2, data: { name: 'anything', type: 4 } },
      { type: 2, data: { name: 'launch' } },
    ]) {
      const res = await send(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ type: 12 });
    }
  });

  it('answers the lounge button with LAUNCH_ACTIVITY and any other button privately', async () => {
    const press = (custom_id: string) => ({ type: 3, data: { custom_id, component_type: 2 } });
    expect(await (await send(press('lounge:play'))).json()).toEqual({ type: 12 });
    expect(await (await send(press('lounge:other'))).json()).toEqual({
      type: 4,
      data: {
        content: "That command isn't available here.",
        flags: 64,
        allowed_mentions: { parse: [] },
      },
    });
    expect((await send({ type: 3, data: {} })).status).toBe(400);
  });
});

describe('sending feedback', () => {
  it('stores a report and answers privately, without any mention', async () => {
    const handler = makeHandler();
    const guildId = nextFeedbackGuild();
    const reply = await submitReport(
      handler,
      keys,
      { userId: nextUser(), guildId, kind: 'idea', text: 'Please add a hat for every creature.' },
      reportsEnv(keys),
    );
    expect(reply.type).toBe(4);
    expect(reply.data.flags).toBe(64);
    expect(reply.data.allowed_mentions).toEqual({ parse: [] });
    expect(reply.data.content).toMatch(/Thank you/);
    expect(reply.data.content).not.toMatch(/screenshot/);

    const reports = await exportable(handler);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: 'idea',
      text: 'Please add a hat for every creature.',
      createdAt: T0,
      version: 'dev',
      branch: 'dev',
      screenshot: 'none',
    });
    expect(reports[0]?.['guildAlias']).toMatch(/^g-[0-9a-f]{6}$/);
  });

  it('cleans the text: controls, zero-width and bidi characters, line breaks', async () => {
    const handler = makeHandler();
    const text =
      '  Line one\u0000\u0007 with​ zero‮ width⁦ \r\nLine two\ttabbed\r\n\r\n\r\n\r\n\r\nLine three   \n\n\n  ';
    await submitReport(handler, keys, { userId: nextUser(), text }, reportsEnv(keys));
    const [report] = await exportable(handler);
    expect(report?.['text']).toBe('Line one with zero width\nLine two tabbed\n\nLine\nthree');
  });

  it('keeps ordinary text as it is (markdown, mentions and links stay plain text)', async () => {
    const handler = makeHandler();
    const text = '**bold** @everyone <@123456789012345678> https://example.test <b>x</b> ünï 😀';
    await submitReport(handler, keys, { userId: nextUser(), text }, reportsEnv(keys));
    const [report] = await exportable(handler);
    expect(report?.['text']).toBe(text);
  });

  it('needs 10 to 1500 characters after cleaning, counted in code points', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    const user = nextUser();
    const tooShort = ['', 'short', '123456789', '  ​ 12345678 ​ ', 'a\n\n\n\nb'];
    for (const text of tooShort) {
      const reply = await submitReport(handler, keys, { userId: user, text }, environment);
      expect(reply.data.content, JSON.stringify(text)).toBe(
        'Your message needs to be 10 to 1500 characters long. Please try again.',
      );
    }
    const tooLong = await submitReport(
      handler,
      keys,
      { userId: user, text: 'x'.repeat(1501) },
      environment,
    );
    expect(tooLong.data.content).toMatch(/10 to 1500 characters/);
    // Nothing was stored, so none of those used up the player's reports.
    expect(await exportable(handler)).toHaveLength(0);

    // Exactly the limits are fine; ten emoji are ten characters (twenty UTF-16 units).
    for (const text of ['x'.repeat(10), '😀'.repeat(10), '😀'.repeat(1500)]) {
      const reply = await submitReport(handler, keys, { userId: nextUser(), text }, environment);
      expect(reply.data.content).toMatch(/Thank you/);
    }
    const stored = await exportable(handler);
    expect(stored.map((r) => Array.from(r['text'] as string).length)).toEqual([10, 10, 1500]);
    const over = await submitReport(
      handler,
      keys,
      { userId: nextUser(), text: '😀'.repeat(1501) },
      environment,
    );
    expect(over.data.content).toMatch(/10 to 1500/);
  });

  it('needs a known kind', async () => {
    const handler = makeHandler();
    for (const kind of ['nope', '', null, 'BUG']) {
      const reply = await submitReport(
        handler,
        keys,
        { userId: nextUser(), kind },
        reportsEnv(keys),
      );
      expect(reply.data.content).toMatch(/pick what kind/);
    }
    expect(await exportable(handler)).toHaveLength(0);
  });

  it('also reads the older Action Row layout', async () => {
    const handler = makeHandler();
    const reply = await submitReport(
      handler,
      keys,
      { userId: nextUser(), kind: 'other', actionRows: true, text: 'Old style form works too.' },
      reportsEnv(keys),
    );
    expect(reply.data.content).toMatch(/Thank you/);
    const [report] = await exportable(handler);
    expect(report).toMatchObject({ kind: 'other', text: 'Old style form works too.' });
  });

  it('answers privately to a form that is not ours or has no server or member', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    const other = await submitReport(
      handler,
      keys,
      { userId: nextUser(), customId: 'something-else' },
      environment,
    );
    expect(other.data.flags).toBe(64);
    const noGuild = await submitReport(
      handler,
      keys,
      { userId: nextUser(), guildId: null },
      environment,
    );
    expect(noGuild.data.content).toBe("That command isn't available here.");
    const noMember = modalSubmit({ userId: nextUser() }) as Record<string, unknown>;
    delete noMember['member'];
    const { ctx } = makeCtx();
    const res = await interact(handler, { keys, body: noMember }, environment, ctx);
    expect(((await jsonBody(res)) as Reply).data.content).toBe(
      "That command isn't available here.",
    );
    expect(await exportable(handler)).toHaveLength(0);
  });

  it('rejects payloads whose fields are malformed with a 400', async () => {
    const handler = makeHandler();
    const good = modalSubmit({ userId: nextUser() }) as Record<string, unknown>;
    const variants: Record<string, unknown>[] = [
      { ...good, guild_id: 'not-a-snowflake' },
      { ...good, member: { user: { id: '12' } } },
      { ...good, data: 'x' },
      { ...good, data: { custom_id: 'feedback', components: 'x' } },
    ];
    for (const body of variants) {
      const res = await interact(handler, { keys, body }, reportsEnv(keys), makeCtx().ctx);
      expect(res.status).toBe(400);
    }
  });
});

describe('the limits', () => {
  it('allows 3 reports per player in 24 hours, then asks to wait', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    const user = nextUser();
    const guildId = nextFeedbackGuild();
    for (let i = 0; i < 3; i++) {
      const reply = await submitReport(handler, keys, { userId: user, guildId }, environment);
      expect(reply.data.content).toMatch(/Thank you/);
    }
    const blocked = await submitReport(handler, keys, { userId: user, guildId }, environment);
    expect(blocked.data.content).toBe(
      "You've sent a few reports already today. Please try again tomorrow.",
    );
    // Someone else in the same server is not blocked.
    const other = await submitReport(handler, keys, { userId: nextUser(), guildId }, environment);
    expect(other.data.content).toMatch(/Thank you/);
    // 24 hours later the player can send again.
    clock.now += DAY + MINUTE;
    const later = await submitReport(handler, keys, { userId: user, guildId }, environment);
    expect(later.data.content).toMatch(/Thank you/);
  });

  it('allows 20 reports per server in 24 hours', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    const guildId = nextFeedbackGuild();
    for (let i = 0; i < 20; i++) {
      const reply = await submitReport(handler, keys, { userId: nextUser(), guildId }, environment);
      expect(reply.data.content).toMatch(/Thank you/);
    }
    const blocked = await submitReport(handler, keys, { userId: nextUser(), guildId }, environment);
    expect(blocked.data.content).toBe(
      'Your server has sent a lot of feedback today. Please try again tomorrow.',
    );
    // Another server is not affected.
    const other = await submitReport(
      handler,
      keys,
      { userId: nextUser(), guildId: nextFeedbackGuild() },
      environment,
    );
    expect(other.data.content).toMatch(/Thank you/);
  });

  it('holds at most 200 reports that are not yet exported', async () => {
    const handler = makeHandler();
    const environment = reportsEnv(keys);
    let firstId = 0;
    for (let i = 0; i < 200; i++) {
      const result = await inbox().submit({
        kind: 'bug',
        text: `Report number ${String(i)} for the inbox.`,
        guildId: nextFeedbackGuild(),
        reporterHash: `hash-${String(i)}`,
        version: 'dev',
        branch: null,
        shot: 'none',
        now: clock.now,
      });
      expect(result.ok).toBe(true);
      if (result.ok && i === 0) firstId = result.id;
    }
    const blocked = await submitReport(handler, keys, { userId: nextUser() }, environment);
    expect(blocked.data.content).toBe(
      'The feedback inbox is full right now. Please try again a little later.',
    );
    // Marking one exported makes room for one more.
    expect(await inbox().markExported(firstId, 5, clock.now)).toBe('ok');
    const ok = await submitReport(handler, keys, { userId: nextUser() }, environment);
    expect(ok.data.content).toMatch(/Thank you/);
  });
});

describe('screenshots', () => {
  const copied = (id = ATTACHMENT_ID) => ({
    files: [id],
    attachments: attachment(id),
  });

  async function shotState(): Promise<string> {
    const [report] = await exportable(makeHandler());
    return report?.['screenshot'] as string;
  }

  it('copies a screenshot after answering, in 1 MiB chunks', async () => {
    const png = pngBytes(2.5 * 1024 * 1024);
    const fetched = fakeFetch(() => new Response(png));
    const handler = makeHandler(fetched);
    const { ctx, settle } = makeCtx();
    const res = await interact(
      handler,
      { keys, body: modalSubmit({ userId: nextUser(), ...copied() }) },
      reportsEnv(keys),
      ctx,
    );
    expect(((await jsonBody(res)) as Reply).data.content).toMatch(/Thank you/);
    await settle();

    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, init] = fetched.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://cdn.discordapp.com/attachments/1/830000000000000001/shot.png?ex=1&hm=2',
    );
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeDefined();

    const [report] = await exportable(handler);
    expect(report?.['screenshot']).toBe('stored');
    const id = report?.['id'] as number;
    const chunks = await runInDurableObject(inbox(), (_i, state) =>
      state.storage.sql
        .exec<{ seq: number; n: number }>(
          'SELECT seq, LENGTH(data) AS n FROM feedback_shots WHERE report_id = ? ORDER BY seq',
          id,
        )
        .toArray(),
    );
    expect(chunks.map((c) => c.n)).toEqual([1024 * 1024, 1024 * 1024, 0.5 * 1024 * 1024]);

    const shot = await ops(handler, `/api/ops/feedback/screenshot?id=${String(id)}`, {
      token: READ,
      env: reportsEnv(keys),
    });
    expect(shot.status).toBe(200);
    expect(shot.headers.get('Content-Type')).toBe('image/png');
    expect(shot.headers.get('Content-Disposition')).toBe(
      `attachment; filename="report-${String(id)}.png"`,
    );
    expect(shot.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(shot.headers.get('Cache-Control')).toBe('no-store');
    expectSameBytes(new Uint8Array(await shot.arrayBuffer()), png);
  });

  it('stores JPEG and WebP by their first bytes, whatever Discord called them', async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9, 9,
    ]);
    const types: [Uint8Array, string, string][] = [
      [jpeg, 'image/jpeg', 'jpg'],
      [webp, 'image/webp', 'webp'],
    ];
    for (const [bytes, type, ext] of types) {
      await clearInbox();
      const handler = makeHandler(fakeFetch(() => new Response(bytes)));
      await submitReport(handler, keys, { userId: nextUser(), ...copied() }, reportsEnv(keys));
      const [report] = await exportable(handler);
      expect(report?.['screenshot']).toBe('stored');
      const shot = await ops(handler, `/api/ops/feedback/screenshot?id=${String(report?.['id'])}`, {
        token: READ,
        env: reportsEnv(keys),
      });
      expect(shot.headers.get('Content-Type')).toBe(type);
      expect(shot.headers.get('Content-Disposition')).toMatch(new RegExp(`\\.${ext}"$`));
    }
  });

  it('does not fetch from other hosts, schemes or lookalike names', async () => {
    const urls = [
      'https://evil.example/shot.png',
      'http://cdn.discordapp.com/attachments/1/2/shot.png',
      'https://cdn.discordapp.com.evil.example/shot.png',
      'https://evilcdn.discordapp.com/shot.png',
      'https://cdn.discordapp.com@evil.example/shot.png',
      'https://cdn.discordapp.com:8443/shot.png',
      'https://user:pw@cdn.discordapp.com/shot.png',
      'ftp://cdn.discordapp.com/shot.png',
      'not a url',
      'https://discord.com/shot.png',
    ];
    for (const url of urls) {
      await clearInbox();
      const fetched = fakeFetch(() => new Response(pngBytes(100)));
      const reply = await submitReport(
        makeHandler(fetched),
        keys,
        {
          userId: nextUser(),
          files: [ATTACHMENT_ID],
          attachments: attachment(ATTACHMENT_ID, { url }),
        },
        reportsEnv(keys),
      );
      expect(fetched, url).not.toHaveBeenCalled();
      // The report itself is still kept.
      expect(reply.data.content, url).toMatch(/Thank you/);
      expect(await shotState(), url).toBe('none');
    }
    // The media host is allowed.
    const fetched = fakeFetch(() => new Response(pngBytes(100)));
    await submitReport(
      makeHandler(fetched),
      keys,
      {
        userId: nextUser(),
        files: [ATTACHMENT_ID],
        attachments: attachment(ATTACHMENT_ID, { url: 'https://media.discordapp.net/a/b/c.png' }),
      },
      reportsEnv(keys),
    );
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it('leaves out a file over 8 MiB and says so, without fetching it', async () => {
    const fetched = fakeFetch(() => new Response(pngBytes(100)));
    const reply = await submitReport(
      makeHandler(fetched),
      keys,
      {
        userId: nextUser(),
        files: [ATTACHMENT_ID],
        attachments: attachment(ATTACHMENT_ID, { size: 8 * 1024 * 1024 + 1 }),
      },
      reportsEnv(keys),
    );
    expect(fetched).not.toHaveBeenCalled();
    expect(reply.data.content).toMatch(/Thank you/);
    expect(reply.data.content).toMatch(/too big/);
    expect(await shotState()).toBe('none');
  });

  it('accepts a file of exactly 8 MiB', async () => {
    const png = pngBytes(8 * 1024 * 1024);
    const handler = makeHandler(fakeFetch(() => new Response(png)));
    await submitReport(
      handler,
      keys,
      {
        userId: nextUser(),
        files: [ATTACHMENT_ID],
        attachments: attachment(ATTACHMENT_ID, { size: 8 * 1024 * 1024 }),
      },
      reportsEnv(keys),
    );
    const [report] = await exportable(handler);
    expect(report?.['screenshot']).toBe('stored');
  });

  it('leaves out a file that is not an allowed type by name, and a missing attachment', async () => {
    const fetched = fakeFetch(() => new Response(pngBytes(100)));
    const handler = makeHandler(fetched);
    const odd = await submitReport(
      handler,
      keys,
      {
        userId: nextUser(),
        files: [ATTACHMENT_ID],
        attachments: attachment(ATTACHMENT_ID, { filename: 'notes.pdf' }),
      },
      reportsEnv(keys),
    );
    expect(odd.data.content).toMatch(/PNG, JPEG or WebP/);
    const missing = await submitReport(
      handler,
      keys,
      { userId: nextUser(), files: [ATTACHMENT_ID], attachments: {} },
      reportsEnv(keys),
    );
    expect(missing.data.content).toMatch(/Thank you/);
    const many = await submitReport(
      handler,
      keys,
      {
        userId: nextUser(),
        files: [ATTACHMENT_ID, '830000000000000002'],
        attachments: { ...attachment(ATTACHMENT_ID), ...attachment('830000000000000002') },
      },
      reportsEnv(keys),
    );
    expect(many.data.content).toMatch(/Thank you/);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('marks the screenshot failed when the file is not an image (bad first bytes)', async () => {
    const log = captureConsole();
    const handler = makeHandler(fakeFetch(() => new Response('<html>not an image</html>')));
    await submitReport(handler, keys, { userId: nextUser(), ...copied() }, reportsEnv(keys));
    const [report] = await exportable(handler);
    expect(report?.['screenshot']).toBe('failed');
    const shot = await ops(handler, `/api/ops/feedback/screenshot?id=${String(report?.['id'])}`, {
      token: READ,
      env: reportsEnv(keys),
    });
    expect(shot.status).toBe(404);
    expect(log.calls).toEqual([['feedback screenshot not copied', 'bad_type']]);
  });

  it('marks the screenshot failed on an error status, a redirect, a network error or an empty body', async () => {
    const log = captureConsole();
    const cases: (() => Response | Promise<Response>)[] = [
      () => new Response('nope', { status: 404 }),
      () => new Response('', { status: 302, headers: { Location: 'https://evil.example/x.png' } }),
      () => Promise.reject(new Error('network down')),
      () => new Response(new Uint8Array(0)),
    ];
    for (const respond of cases) {
      await clearInbox();
      const handler = makeHandler(fakeFetch(respond));
      await submitReport(handler, keys, { userId: nextUser(), ...copied() }, reportsEnv(keys));
      const [report] = await exportable(handler);
      expect(report?.['screenshot']).toBe('failed');
      expect(report?.['text']).toBeTypeOf('string');
    }
    // The kind of each failure: a redirect counts as a bad status.
    expect(log.calls).toEqual([
      ['feedback screenshot not copied', 'status'],
      ['feedback screenshot not copied', 'status'],
      ['feedback screenshot not copied', 'fetch'],
      ['feedback screenshot not copied', 'empty'],
    ]);
  });

  it('stops reading past 8 MiB even when the size Discord gave was small', async () => {
    const log = captureConsole();
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        const chunk = pngBytes(1024 * 1024);
        controller.enqueue(chunk);
        if (pulled > 40) controller.close();
      },
    });
    const handler = makeHandler(fakeFetch(() => new Response(stream)));
    await submitReport(handler, keys, { userId: nextUser(), ...copied() }, reportsEnv(keys));
    const [report] = await exportable(handler);
    expect(report?.['screenshot']).toBe('failed');
    expect(pulled).toBeLessThan(15);
    expect(log.calls).toEqual([['feedback screenshot not copied', 'too_big']]);
  });

  it('logs only the kind of failure', async () => {
    const log = captureConsole();
    const handler = makeHandler(fakeFetch(() => new Response('secret-body-text')));
    await submitReport(handler, keys, { userId: nextUser(), ...copied() }, reportsEnv(keys));
    const text = JSON.stringify(log.calls);
    expect(text).toContain('bad_type');
    expect(text).not.toContain('secret-body-text');
    expect(text).not.toContain('discordapp');
  });
});
