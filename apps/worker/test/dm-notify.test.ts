import { afterEach, describe, expect, it, vi } from 'vitest';
import { DM_KINDS, FOOTER, nextDmDueAt, pruneSent, readPrefs, scanDm } from '../src/dm-notify';
import { OUTBOX_KEEP_MS, pruneOutbox } from '../src/dm-queue';
import { createDmSender, type DmSender, type OpenOutcome } from '../src/dm-send';
import type { SendOutcome } from '../src/discord-posts';
import { stallWeek } from '../src/games-stall';
import { eventTimes } from '../src/raid-schedule';
import { OTHER_USER_ID, USER_ID, runCore, type CoreContext } from './helpers';
import { HELSINKI, HOUR, MINUTE, W02, nextGuild, rows, seedPlayer } from './raid-helpers';
import { captureConsole } from './kit';

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKEN = 'secret-bot-token-value';
const DM_CHANNEL = '444444444444444444';
const NOW = 1_800_000_000_000;
const PLACE = 'Tidepools';

// --- The sender, with a fake fetch ---

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

function senderWith(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sender = createDmSender({
    botToken: TOKEN,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init: init ?? {} });
      return Promise.resolve(respond(url, init ?? {}));
    },
  });
  return { sender, calls };
}

describe('createDmSender', () => {
  it('opens the DM channel with the bot token and the recipient id only', async () => {
    const { sender, calls } = senderWith(() => json(200, { id: DM_CHANNEL, type: 1 }));
    expect(await sender.openChannel(USER_ID)).toEqual({ kind: 'ok', channelId: DM_CHANNEL });
    expect(calls[0]?.url).toBe('https://discord.com/api/v10/users/@me/channels');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toEqual({
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ recipient_id: USER_ID });
    expect(calls[0]?.init.redirect).toBe('manual');
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never calls Discord for an id that is not a snowflake, and rejects a bad channel id', async () => {
    const { sender, calls } = senderWith(() => json(200, { id: 'not-a-snowflake' }));
    expect(await sender.openChannel('../x')).toEqual({ kind: 'failed', error: 'rejected' });
    expect(calls).toHaveLength(0);
    expect(await sender.openChannel(USER_ID)).toEqual({ kind: 'failed', error: 'rejected' });
  });

  it.each([
    [429, { retry_after: 2.5 }, { kind: 'retry', error: 'rate_limited', afterMs: 2500 }],
    [500, {}, { kind: 'retry', error: 'server_error', afterMs: null }],
    [403, { code: 50007 }, { kind: 'failed', error: 'forbidden' }],
    [404, {}, { kind: 'failed', error: 'not_found' }],
    [400, {}, { kind: 'failed', error: 'rejected' }],
  ] as [number, unknown, OpenOutcome][])(
    'sorts a %i answer when opening',
    async (status, body, want) => {
      const { sender } = senderWith(() => json(status, body));
      expect(await sender.openChannel(USER_ID)).toEqual(want);
    },
  );

  it('retries after a network error, naming only the kind', async () => {
    const sender = createDmSender({
      botToken: TOKEN,
      fetch: () => Promise.reject(new Error(`failed for ${USER_ID} with ${TOKEN}`)),
    });
    const outcome = await sender.openChannel(USER_ID);
    expect(outcome).toEqual({ kind: 'retry', error: 'network', afterMs: null });
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
  });

  it('sends text with no mentions through the channel', async () => {
    const { sender, calls } = senderWith(() => json(200, { id: '1' }));
    expect(await sender.send(DM_CHANNEL, 'hello @everyone')).toEqual({ kind: 'sent' });
    expect(calls[0]?.url).toBe(`https://discord.com/api/v10/channels/${DM_CHANNEL}/messages`);
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      content: 'hello @everyone',
      allowed_mentions: { parse: [] },
    });
  });
});

// --- The scan ---

type Ctx = CoreContext;

/** A scripted sender: every open and send is recorded, outcomes come from the scripts. */
function scripted(
  opts: { open?: OpenOutcome[]; send?: SendOutcome[] } = {},
): DmSender & { opened: string[]; sent: { channelId: string; content: string }[] } {
  const opened: string[] = [];
  const sent: { channelId: string; content: string }[] = [];
  return {
    opened,
    sent,
    openChannel(userId) {
      const n = opened.length;
      opened.push(userId);
      return Promise.resolve(opts.open?.[n] ?? { kind: 'ok', channelId: DM_CHANNEL });
    },
    send(channelId, content) {
      const n = sent.length;
      sent.push({ channelId, content });
      return Promise.resolve(opts.send?.[n] ?? { kind: 'sent' });
    },
  };
}

function withDm<R>(
  sender: DmSender | null,
  fn: (ctx: Ctx) => Promise<R> | R,
  start = NOW,
): Promise<R> {
  return runCore(
    nextGuild(),
    (ctx) => {
      ctx.clock.t = start;
      return fn(ctx);
    },
    { dmSender: sender },
  );
}

const scan = (ctx: Ctx, now = ctx.clock.t) =>
  scanDm(ctx.sql, { now, tz: HELSINKI, realAt: (ms) => ms });

const outbox = (ctx: Ctx) =>
  rows<{
    key: string;
    user_id: string;
    content: string;
    status: string;
    attempts: number;
    next_attempt_at: number;
  }>(
    ctx.sql,
    'SELECT key, user_id, content, status, attempts, next_attempt_at FROM dm_outbox WHERE key NOT LIKE ? ORDER BY id',
    'welcome:%',
  );

/** Opted in to the given kinds since `at`. */
function optIn(ctx: Ctx, userId: string, at: number, kinds: readonly string[] = DM_KINDS): void {
  ctx.sql.exec('INSERT OR IGNORE INTO dm_prefs (user_id) VALUES (?)', userId);
  for (const kind of kinds) {
    ctx.sql.exec(`UPDATE dm_prefs SET ${kind}_on_at = ? WHERE user_id = ?`, at, userId);
  }
}

function addTrip(
  ctx: Ctx,
  id: string,
  userId: string,
  creatureId: string,
  endsAt: number,
  extra: { status?: string; pushEndsAt?: number } = {},
): void {
  ctx.sql.exec(
    `INSERT INTO expeditions (id, user_id, creature_id, duration, supplies, rolls, cost, started_at, ends_at, status,
       destination_id, push_goal, push_ends_at)
     VALUES (?, ?, ?, 'short', 'none', 1, 0, ?, ?, ?, 'tidepools', ?, ?)`,
    id,
    userId,
    creatureId,
    endsAt - HOUR,
    endsAt,
    extra.status ?? 'active',
    extra.pushEndsAt === undefined ? null : 'some-goal',
    extra.pushEndsAt ?? null,
  );
}

function addJob(
  ctx: Ctx,
  id: string,
  userId: string,
  creatureId: string,
  endsAt: number,
  kind = 'craft',
  claimedAt: number | null = null,
): void {
  ctx.sql.exec(
    `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at, claimed_at)
     VALUES (?, ?, ?, ?, '{}', ?, ?, ?)`,
    id,
    userId,
    creatureId,
    kind,
    endsAt - HOUR,
    endsAt,
    claimedAt,
  );
}

const player = (ctx: Ctx, n = 1) =>
  seedPlayer(ctx, n, { species: ['splashet', 'cindle', 'sproutle'] });

describe('scanDm: trips', () => {
  it('pings an ended trip once, with the place, and ends with how to turn it off', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      optIn(ctx, p.id, NOW - HOUR, ['trip']);
      addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW - 5 * MINUTE);
      expect(scan(ctx)).toBe(1);
      expect(scan(ctx)).toBe(0);
      expect(scan(ctx, NOW + HOUR)).toBe(0);
      const [dm] = outbox(ctx);
      expect(dm).toMatchObject({ user_id: p.id, status: 'pending', key: 'dm:trip:t1:end' });
      expect(dm?.content).toBe(`🧭 Splashet is home from ${PLACE}.\n\n${FOOTER}`);
    });
  });

  it('uses the nickname, escaped', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      ctx.sql.exec(
        "UPDATE creatures SET nickname = '@everyone *Moss*' WHERE id = ?",
        p.creatureIds[0],
      );
      optIn(ctx, p.id, NOW - HOUR, ['trip']);
      addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW - MINUTE);
      scan(ctx);
      const content = outbox(ctx)[0]?.content ?? '';
      expect(content).toContain('\\*Moss\\*');
      expect(content).not.toContain('@everyone');
    });
  });

  it('skips a trip that ended before the kind was turned on, or is older than 12 hours', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      const c = p.creatureIds[0] as string;
      optIn(ctx, p.id, NOW - 30 * MINUTE, ['trip']);
      addTrip(ctx, 'before', p.id, c, NOW - HOUR);
      addTrip(ctx, 'stale', p.id, p.creatureIds[1] as string, NOW - 13 * HOUR);
      ctx.sql.exec('UPDATE dm_prefs SET trip_on_at = ?', NOW - 20 * HOUR);
      ctx.sql.exec("UPDATE expeditions SET ends_at = ? WHERE id = 'before'", NOW - 20 * HOUR);
      expect(scan(ctx)).toBe(0);
      expect(outbox(ctx)).toEqual([]);
    });
  });

  it('never pings a trip that was claimed, recalled or cancelled', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      optIn(ctx, p.id, NOW - HOUR, ['trip']);
      addTrip(ctx, 'a', p.id, p.creatureIds[0] as string, NOW - MINUTE, { status: 'claimed' });
      addTrip(ctx, 'b', p.id, p.creatureIds[1] as string, NOW - MINUTE, { status: 'cancelled' });
      expect(scan(ctx)).toBe(0);
    });
  });

  it('pings again when a chosen push-on is over, and not for the end of a trip that pushed on', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      const c = p.creatureIds[0] as string;
      optIn(ctx, p.id, NOW - 3 * HOUR, ['trip']);
      addTrip(ctx, 't1', p.id, c, NOW - 2 * HOUR);
      expect(scan(ctx, NOW - 2 * HOUR + MINUTE)).toBe(1);
      // The player pushes on; the push is not over yet.
      ctx.sql.exec(
        "UPDATE expeditions SET push_goal = 'g', push_ends_at = ? WHERE id = 't1'",
        NOW + HOUR,
      );
      expect(scan(ctx)).toBe(0);
      expect(scan(ctx, NOW + HOUR)).toBe(1);
      expect(outbox(ctx).map((m) => m.key)).toEqual(['dm:trip:t1:end', 'dm:trip:t1:push']);
      expect(outbox(ctx)[1]?.content).toContain(`is back from pushing on at ${PLACE}`);
      // A trip that pushed on before anyone looked is only told about once, at the end of the push.
      addTrip(ctx, 't2', p.id, p.creatureIds[1] as string, NOW - HOUR, {
        pushEndsAt: NOW + 2 * HOUR,
      });
      expect(scan(ctx, NOW + 2 * HOUR)).toBe(1);
      expect(rows(ctx.sql, "SELECT key FROM dm_sent WHERE key LIKE 'trip:t2%'")).toEqual([
        { key: 'trip:t2:push' },
      ]);
    });
  });
});

describe('scanDm: jobs, grouping and who is asked', () => {
  it('pings a finished unclaimed job, by its kind of work', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      optIn(ctx, p.id, NOW - HOUR, ['job']);
      addJob(ctx, 'j1', p.id, p.creatureIds[0] as string, NOW - MINUTE, 'supply');
      addJob(ctx, 'j2', p.id, p.creatureIds[1] as string, NOW - MINUTE, 'craft', NOW - 30_000);
      addJob(ctx, 'j3', p.id, p.creatureIds[2] as string, NOW + MINUTE);
      expect(scan(ctx)).toBe(1);
      expect(outbox(ctx)[0]?.content).toBe(
        `🔨 Splashet finished making supplies at the Workshop.\n\n${FOOTER}`,
      );
    });
  });

  it('sends one DM per player with a line per event, and none twice', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      const q = player(ctx, 2);
      optIn(ctx, p.id, NOW - HOUR);
      optIn(ctx, q.id, NOW - HOUR, ['job']);
      addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW - 2 * MINUTE);
      addTrip(ctx, 't2', p.id, p.creatureIds[1] as string, NOW - MINUTE);
      addJob(ctx, 'j1', p.id, p.creatureIds[2] as string, NOW - MINUTE);
      addTrip(ctx, 't3', q.id, q.creatureIds[0] as string, NOW - MINUTE);
      expect(scan(ctx)).toBe(1);
      const [dm] = outbox(ctx);
      expect(dm?.user_id).toBe(p.id);
      expect(dm?.content.split('\n').filter((l) => /^[🧭🔨]/u.test(l))).toHaveLength(3);
      // The second player has trips off: nothing for them.
      expect(scan(ctx)).toBe(0);
      expect(outbox(ctx)).toHaveLength(1);
    });
  });

  it('skips a blocked player, and nobody is asked who is off', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      optIn(ctx, p.id, NOW - HOUR, ['trip']);
      ctx.sql.exec('UPDATE dm_prefs SET blocked_at = ?', NOW - MINUTE);
      addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW - MINUTE);
      expect(scan(ctx)).toBe(0);
      ctx.sql.exec('UPDATE dm_prefs SET blocked_at = NULL, trip_on_at = NULL');
      expect(scan(ctx)).toBe(0);
    });
  });

  it('counts the lines it cannot fit', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      optIn(ctx, p.id, NOW - HOUR, ['job']);
      for (let i = 0; i < 14; i++) {
        ctx.sql.exec(
          `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, input_json, started_at, ends_at)
           VALUES (?, ?, ?, 'craft', '{}', 1, ?)`,
          `j${String(i)}`,
          p.id,
          `c${String(i)}`,
          NOW - MINUTE,
        );
      }
      scan(ctx);
      expect(outbox(ctx)[0]?.content).toContain('…and 2 more.');
    });
  });
});

describe('scanDm: the finale and the Prize Stall', () => {
  const finale = eventTimes(W02.id, HELSINKI).finale;

  it('pings ten minutes before the finale starts, once per player, never after it started', async () => {
    await withDm(null, (ctx) => {
      ctx.core.raid.ensureWeek(W02.id);
      optIn(ctx, USER_ID, finale - 3 * HOUR, ['finale']);
      optIn(ctx, OTHER_USER_ID, finale - 3 * HOUR, ['finale']);
      expect(scan(ctx, finale - 11 * MINUTE)).toBe(0);
      expect(scan(ctx, finale - 10 * MINUTE)).toBe(2);
      expect(scan(ctx, finale - 9 * MINUTE)).toBe(0);
      expect(outbox(ctx)[0]?.content).toBe(`⚔️ The raid finale starts in 10 minutes.\n\n${FOOTER}`);
    });
  });

  it('does not ping when the finale has started, was fought, has no week, or the kind came on late', async () => {
    await withDm(null, (ctx) => {
      optIn(ctx, USER_ID, finale - 3 * HOUR, ['finale']);
      // No raid week yet.
      expect(scan(ctx, finale - 5 * MINUTE)).toBe(0);
      ctx.core.raid.ensureWeek(W02.id);
      expect(scan(ctx, finale + MINUTE)).toBe(0);
      ctx.sql.exec("UPDATE raid_weeks SET status = 'finale'");
      expect(scan(ctx, finale - 5 * MINUTE)).toBe(0);
      ctx.sql.exec("UPDATE raid_weeks SET status = 'phase2'");
      ctx.sql.exec('UPDATE dm_prefs SET finale_on_at = ?', finale - 8 * MINUTE);
      expect(scan(ctx, finale - 5 * MINUTE)).toBe(0);
    });
  });

  it('pings when the Prize Stall opens, and not after it closed or when turned on later', async () => {
    const stall = stallWeek(NOW, HELSINKI);
    await withDm(null, (ctx) => {
      optIn(ctx, USER_ID, stall.opensAt - HOUR, ['stall']);
      expect(scan(ctx, stall.opensAt - MINUTE)).toBe(0);
      expect(scan(ctx, stall.opensAt + MINUTE)).toBe(1);
      expect(scan(ctx, stall.opensAt + 2 * MINUTE)).toBe(0);
      const content = outbox(ctx)[0]?.content ?? '';
      expect(content).toContain('🏅 The Prize Stall is open today.');
      expect(content).toContain(`<t:${String(Math.floor(stall.closesAt / 1000))}:F>`);
      expect(content.endsWith(FOOTER)).toBe(true);
      ctx.sql.exec('DELETE FROM dm_sent');
      expect(scan(ctx, stall.closesAt + MINUTE)).toBe(0);
      ctx.sql.exec('UPDATE dm_prefs SET stall_on_at = ?', stall.opensAt + MINUTE);
      expect(scan(ctx, stall.opensAt + 5 * MINUTE)).toBe(0);
    });
  });
});

describe('nextDmDueAt and the alarm', () => {
  it('is the earliest future due time of an opted-in player', async () => {
    await withDm(null, (ctx) => {
      const p = player(ctx);
      expect(nextDmDueAt(ctx.sql, NOW, HELSINKI)).toBeNull();
      optIn(ctx, p.id, NOW - HOUR, ['trip', 'job']);
      addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW + 3 * HOUR);
      addTrip(ctx, 't2', p.id, p.creatureIds[1] as string, NOW + HOUR, {
        pushEndsAt: NOW + 2 * HOUR,
      });
      addTrip(ctx, 'past', p.id, p.creatureIds[2] as string, NOW - HOUR);
      expect(nextDmDueAt(ctx.sql, NOW, HELSINKI)).toBe(NOW + 2 * HOUR);
      addJob(ctx, 'j1', p.id, p.creatureIds[2] as string, NOW + 30 * MINUTE);
      expect(nextDmDueAt(ctx.sql, NOW, HELSINKI)).toBe(NOW + 30 * MINUTE);
      ctx.sql.exec('UPDATE dm_prefs SET blocked_at = ?', NOW);
      expect(nextDmDueAt(ctx.sql, NOW, HELSINKI)).toBeNull();
    });
  });

  it('knows the next finale ping and the next Prize Stall opening', async () => {
    const finale = eventTimes(W02.id, HELSINKI).finale;
    await withDm(null, (ctx) => {
      ctx.core.raid.ensureWeek(W02.id);
      optIn(ctx, USER_ID, finale - 3 * HOUR, ['finale']);
      expect(nextDmDueAt(ctx.sql, finale - HOUR, HELSINKI)).toBe(finale - 10 * MINUTE);
      expect(nextDmDueAt(ctx.sql, finale - 5 * MINUTE, HELSINKI)).toBeNull();
      ctx.sql.exec('UPDATE dm_prefs SET finale_on_at = NULL, stall_on_at = ?', finale);
      const next = stallWeek(finale, HELSINKI);
      expect(nextDmDueAt(ctx.sql, finale, HELSINKI)).toBe(next.opensAt);
      // While it is open the next opening is a week later.
      expect(nextDmDueAt(ctx.sql, next.opensAt + HOUR, HELSINKI)).toBe(
        next.opensAt + 7 * 24 * HOUR,
      );
    });
  });

  it('sets the alarm for it only when a sender is configured', async () => {
    for (const sender of [scripted(), null]) {
      await withDm(sender, async (ctx) => {
        const p = player(ctx);
        optIn(ctx, p.id, NOW - HOUR, ['trip']);
        addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW + MINUTE);
        await ctx.core.ensureAlarm();
        const alarm = await ctx.storage.getAlarm();
        if (sender === null) expect(alarm === null || alarm > NOW + MINUTE).toBe(true);
        else expect(alarm).toBe(NOW + MINUTE);
      });
    }
  });

  it('delivers a due DM when the alarm runs', async () => {
    await withDm(scripted(), async (ctx) => {
      ctx.sql.exec(
        "INSERT INTO dm_outbox (key, user_id, content, status, attempts, next_attempt_at, created_at) VALUES ('k', ?, 'x', 'pending', 0, ?, ?)",
        USER_ID,
        NOW - HOUR,
        NOW - HOUR,
      );
      ctx.sql.exec('INSERT INTO dm_prefs (user_id) VALUES (?)', USER_ID);
      await ctx.core.alarm();
      expect(outbox(ctx)[0]?.status).toBe('sent');
    });
  });
});

describe('delivery', () => {
  const queue = (ctx: Ctx, key: string, userId = USER_ID, content = 'hello') => {
    ctx.sql.exec('INSERT OR IGNORE INTO dm_prefs (user_id) VALUES (?)', userId);
    ctx.sql.exec(
      "INSERT INTO dm_outbox (key, user_id, content, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, 'pending', 0, ?, ?)",
      key,
      userId,
      content,
      ctx.clock.t,
      ctx.clock.t,
    );
  };
  const prefs = (ctx: Ctx, userId = USER_ID) =>
    rows<{ dm_channel_id: string | null; blocked_at: number | null }>(
      ctx.sql,
      'SELECT dm_channel_id, blocked_at FROM dm_prefs WHERE user_id = ?',
      userId,
    )[0];

  it('opens the channel once, caches it and sends', async () => {
    const send = scripted();
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      queue(ctx, 'b');
      await ctx.core.deliverDms();
      expect(send.opened).toEqual([USER_ID]);
      expect(send.sent.map((s) => s.channelId)).toEqual([DM_CHANNEL, DM_CHANNEL]);
      expect(outbox(ctx).map((m) => m.status)).toEqual(['sent', 'sent']);
      expect(prefs(ctx)?.dm_channel_id).toBe(DM_CHANNEL);
    });
  });

  it('uses a cached channel without opening one', async () => {
    const send = scripted();
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      ctx.sql.exec('UPDATE dm_prefs SET dm_channel_id = ?', DM_CHANNEL);
      await ctx.core.deliverDms();
      expect(send.opened).toEqual([]);
      expect(send.sent).toHaveLength(1);
    });
  });

  it('blocks the player on a 403 when sending, fails the message and asks no more', async () => {
    const log = captureConsole();
    const send = scripted({ send: [{ kind: 'failed', error: 'forbidden' }] });
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      queue(ctx, 'b');
      await ctx.core.deliverDms();
      expect(outbox(ctx).map((m) => m.status)).toEqual(['failed', 'failed']);
      expect(send.sent).toHaveLength(1);
      expect(prefs(ctx)?.blocked_at).toBe(NOW);
      expect(log.text()).toContain('forbidden');
      expect(log.text()).not.toContain(USER_ID);
    });
  });

  it('blocks the player when opening the channel is refused', async () => {
    captureConsole();
    const send = scripted({ open: [{ kind: 'failed', error: 'forbidden' }] });
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      await ctx.core.deliverDms();
      expect(send.sent).toHaveLength(0);
      expect(prefs(ctx)?.blocked_at).toBe(NOW);
      expect(outbox(ctx)[0]?.status).toBe('failed');
    });
  });

  it('forgets a channel that is gone (404) and opens a new one, once', async () => {
    const send = scripted({ send: [{ kind: 'failed', error: 'not_found' }] });
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      ctx.sql.exec("UPDATE dm_prefs SET dm_channel_id = '555555555555555555'");
      await ctx.core.deliverDms();
      expect(send.opened).toEqual([USER_ID]);
      expect(send.sent.map((s) => s.channelId)).toEqual(['555555555555555555', DM_CHANNEL]);
      expect(outbox(ctx)[0]?.status).toBe('sent');
      expect(prefs(ctx)?.dm_channel_id).toBe(DM_CHANNEL);
    });
    captureConsole();
    const again = scripted({
      send: [
        { kind: 'failed', error: 'not_found' },
        { kind: 'failed', error: 'not_found' },
      ],
    });
    await withDm(again, async (ctx) => {
      queue(ctx, 'a');
      ctx.sql.exec("UPDATE dm_prefs SET dm_channel_id = '555555555555555555'");
      await ctx.core.deliverDms();
      expect(again.sent).toHaveLength(2);
      expect(outbox(ctx)[0]?.status).toBe('failed');
      expect(prefs(ctx)?.blocked_at).toBeNull();
    });
  });

  it('waits what Discord asks after a 429 and ends the run', async () => {
    captureConsole();
    const send = scripted({ send: [{ kind: 'retry', error: 'rate_limited', afterMs: 7000 }] });
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      queue(ctx, 'b', OTHER_USER_ID);
      await ctx.core.deliverDms();
      expect(send.sent).toHaveLength(1);
      expect(outbox(ctx)[0]).toMatchObject({
        status: 'pending',
        attempts: 1,
        next_attempt_at: NOW + 7000,
      });
      expect(outbox(ctx)[1]).toMatchObject({ status: 'pending', attempts: 0 });
    });
  });

  it('backs off after a transient failure and gives up after five attempts', async () => {
    captureConsole();
    const send = scripted({
      send: Array.from(
        { length: 5 },
        () => ({ kind: 'retry', error: 'server_error', afterMs: null }) as const,
      ),
    });
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      await ctx.core.deliverDms();
      expect(outbox(ctx)[0]).toMatchObject({
        status: 'pending',
        attempts: 1,
        next_attempt_at: NOW + MINUTE,
      });
      for (let i = 0; i < 4; i++) {
        ctx.clock.t += 3 * HOUR;
        await ctx.core.deliverDms();
      }
      expect(outbox(ctx)[0]).toMatchObject({ status: 'failed', attempts: 5 });
    });
  });

  it('survives a sender that throws', async () => {
    captureConsole();
    const send = scripted();
    send.send = () => Promise.reject(new Error('boom'));
    await withDm(send, async (ctx) => {
      queue(ctx, 'a');
      await ctx.core.deliverDms();
      expect(outbox(ctx)[0]).toMatchObject({ status: 'pending', attempts: 1 });
    });
  });

  it('does nothing without a sender, and the alarm delivers what a scan queued', async () => {
    await withDm(null, async (ctx) => {
      queue(ctx, 'a');
      await ctx.core.deliverDms();
      expect(outbox(ctx)[0]?.status).toBe('pending');
    });
    const send = scripted();
    await withDm(send, async (ctx) => {
      const p = player(ctx);
      optIn(ctx, p.id, NOW - HOUR, ['trip']);
      addTrip(ctx, 't1', p.id, p.creatureIds[0] as string, NOW - MINUTE);
      await ctx.core.alarm();
      expect(send.sent).toHaveLength(1);
      expect(send.sent[0]?.content).toContain('is home from');
      // Another alarm tells nothing twice.
      await ctx.core.alarm();
      expect(send.sent).toHaveLength(1);
    });
  });

  it('turns the player on again after a block: any setting clears it', async () => {
    captureConsole();
    const send = scripted({ send: [{ kind: 'failed', error: 'forbidden' }] });
    await withDm(send, async (ctx) => {
      await ctx.core.setDmPrefs(USER_ID, { trip: true });
      await ctx.core.deliverDms();
      expect(readPrefs(ctx.sql, USER_ID).blocked).toBe(true);
      ctx.clock.t += MINUTE;
      await ctx.core.setDmPrefs(USER_ID, { trip: true });
      await ctx.core.deliverDms();
      expect(readPrefs(ctx.sql, USER_ID)).toEqual({
        kinds: { trip: true, job: false, finale: false, stall: false },
        blocked: false,
      });
      expect(send.sent).toHaveLength(2);
    });
  });
});

describe('cleanup', () => {
  it('drops sent events after 30 days and finished messages after 7', async () => {
    await withDm(null, (ctx) => {
      const day = 24 * HOUR;
      ctx.sql.exec(
        "INSERT INTO dm_sent (key, user_id, at) VALUES ('old', 'u', ?), ('new', 'u', ?)",
        NOW - 31 * day,
        NOW - 29 * day,
      );
      pruneSent(ctx.sql, NOW);
      expect(rows(ctx.sql, 'SELECT key FROM dm_sent')).toEqual([{ key: 'new' }]);
      const add = (key: string, status: string, age: number) =>
        ctx.sql.exec(
          'INSERT INTO dm_outbox (key, user_id, content, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)',
          key,
          'u',
          'x',
          status,
          NOW - age,
        );
      add('sent-old', 'sent', OUTBOX_KEEP_MS + 1);
      add('failed-old', 'failed', OUTBOX_KEEP_MS + 1);
      add('pending-old', 'pending', OUTBOX_KEEP_MS + 1);
      add('sent-new', 'sent', day);
      pruneOutbox(ctx.sql, NOW);
      expect(rows(ctx.sql, 'SELECT key FROM dm_outbox ORDER BY key')).toEqual([
        { key: 'pending-old' },
        { key: 'sent-new' },
      ]);
    });
  });
});

// --- The routes ---

describe('GET and PUT /api/notifications', () => {
  async function call(ctx: Ctx, method: string, body?: unknown) {
    const secret = await ctx.core.createSession(ctx.guildId, { id: USER_ID, displayName: 'Misa' });
    const res = await ctx.request(secret, '/api/notifications', method, body);
    return { status: res.status, body: await res.json<Record<string, unknown>>() };
  }
  const off = { trip: false, job: false, finale: false, stall: false };

  it('starts with everything off, and says whether DMs are available', async () => {
    await withDm(scripted(), async (ctx) => {
      expect(await call(ctx, 'GET')).toEqual({
        status: 200,
        body: { kinds: off, blocked: false, available: true },
      });
    });
    await withDm(null, async (ctx) => {
      expect((await call(ctx, 'GET')).body).toEqual({
        kinds: off,
        blocked: false,
        available: false,
      });
    });
  });

  it('turns kinds on and off for the signed-in player only, keeping the first turn-on time', async () => {
    await withDm(scripted(), async (ctx) => {
      const on = await call(ctx, 'PUT', { kinds: { trip: true, stall: true } });
      expect(on).toEqual({
        status: 200,
        body: { kinds: { ...off, trip: true, stall: true }, blocked: false, available: true },
      });
      ctx.clock.t += HOUR;
      await call(ctx, 'PUT', { kinds: { trip: true, job: true } });
      const row = rows<{ trip_on_at: number; job_on_at: number; stall_on_at: number }>(
        ctx.sql,
        'SELECT trip_on_at, job_on_at, stall_on_at FROM dm_prefs',
      )[0];
      expect(row).toEqual({ trip_on_at: NOW, job_on_at: NOW + HOUR, stall_on_at: NOW });
      const after = await call(ctx, 'PUT', { kinds: { trip: false } });
      expect(after.body['kinds']).toEqual({ ...off, job: true, stall: true });
      expect(rows(ctx.sql, 'SELECT user_id FROM dm_prefs')).toEqual([{ user_id: USER_ID }]);
    });
  });

  it('sends a welcome DM when the first kind comes on, not for the next ones, and keeps the DM list quiet when off', async () => {
    const send = scripted();
    await withDm(send, async (ctx) => {
      await call(ctx, 'PUT', { kinds: { trip: true, job: true } });
      await call(ctx, 'PUT', { kinds: { finale: true } });
      expect(send.sent).toHaveLength(1);
      expect(send.sent[0]?.content).toBe(
        `👋 You'll get a DM here when a creature comes home from a trip or a Workshop job is done.\n\n${FOOTER}`,
      );
      // Off and on again within the hour is not a second welcome.
      await call(ctx, 'PUT', { kinds: { trip: false, job: false, finale: false } });
      await call(ctx, 'PUT', { kinds: { trip: true } });
      expect(send.sent).toHaveLength(1);
      ctx.clock.t += 2 * HOUR;
      await call(ctx, 'PUT', { kinds: { trip: false } });
      await call(ctx, 'PUT', { kinds: { trip: true } });
      expect(send.sent).toHaveLength(2);
    });
    // Without a sender nothing is queued.
    await withDm(null, async (ctx) => {
      await call(ctx, 'PUT', { kinds: { trip: true } });
      expect(rows(ctx.sql, 'SELECT id FROM dm_outbox')).toEqual([]);
    });
  });

  it('shows a block and clears it when a setting changes', async () => {
    await withDm(scripted(), async (ctx) => {
      await call(ctx, 'PUT', { kinds: { trip: true } });
      ctx.sql.exec('UPDATE dm_prefs SET blocked_at = ?', NOW);
      expect((await call(ctx, 'GET')).body['blocked']).toBe(true);
      expect((await call(ctx, 'PUT', { kinds: { job: true } })).body['blocked']).toBe(false);
    });
  });

  it.each([
    [{}],
    [{ kinds: {} }],
    [{ kinds: { trip: 'yes' } }],
    [{ kinds: { trip: true, other: true } }],
    [{ kinds: { trip: true }, userId: OTHER_USER_ID }],
    [{ trip: true }],
  ])('rejects the body %j', async (body) => {
    await withDm(scripted(), async (ctx) => {
      expect(await call(ctx, 'PUT', body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
      expect(rows(ctx.sql, 'SELECT user_id FROM dm_prefs')).toEqual([]);
    });
  });

  it('records the turn-on and turn-off as analytics without any id', async () => {
    await withDm(scripted(), async (ctx) => {
      await call(ctx, 'PUT', { kinds: { trip: true } });
      await call(ctx, 'PUT', { kinds: { trip: true, job: false } });
      await call(ctx, 'PUT', { kinds: { trip: false } });
      const events = rows<{ props_json: string }>(
        ctx.sql,
        "SELECT props_json FROM analytics_events WHERE kind = 'dm_pref' ORDER BY id",
      ).map((r) => JSON.parse(r.props_json) as unknown);
      expect(events).toEqual([
        { which: 'trip', on: true },
        { which: 'trip', on: false },
      ]);
    });
  });

  it('records delivery results without ids', async () => {
    const send = scripted({ send: [{ kind: 'sent' }, { kind: 'failed', error: 'forbidden' }] });
    captureConsole();
    await withDm(send, async (ctx) => {
      await call(ctx, 'PUT', { kinds: { trip: true } });
      await ctx.core.deliverDms();
      await call(ctx, 'PUT', { kinds: { job: true } });
      await ctx.core.deliverDms();
      const events = rows<{ props_json: string; actor_hash: string | null }>(
        ctx.sql,
        "SELECT props_json, actor_hash FROM analytics_events WHERE kind = 'dm_result' ORDER BY id",
      );
      expect(events.map((e) => JSON.parse(e.props_json) as unknown)).toEqual([
        { result: 'sent', error: null, attempts: 1 },
      ]);
    });
  });
});
