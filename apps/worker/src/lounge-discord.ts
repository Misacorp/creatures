/**
 * The Discord calls of the lounge message (bot token). Every call returns a result and never throws,
 * except `getInstance`, which throws like the login's `getActivityInstance`. Ids go into URLs only
 * after a snowflake check; response bodies are discarded except a new message's id. Logs elsewhere
 * carry the failure kind only.
 */
import * as v from 'valibot';
import { createDiscordApi } from './discord';
import {
  API_BASE,
  FLAG_SUPPRESS_EMBEDS,
  TIMEOUT_MS,
  discard,
  readRetryAfter,
  type PostFailureKind,
} from './discord-posts';
import { loungeComponents } from './lounge';
import { SNOWFLAKE_RE, type ActivityInstance } from './schemas';

/** SUPPRESS_NOTIFICATIONS: a new post is "@silent". */
const FLAG_SUPPRESS_NOTIFICATIONS = 4096;

export type LoungeResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'retry'; error: PostFailureKind; afterMs: number | null }
  | { kind: 'failed'; error: PostFailureKind };

export interface LoungeMessageBody {
  content: string;
  label: string;
}

export interface LoungeClient {
  /** The Activity instance, or null when it has ended. Throws if Discord cannot be asked. */
  getInstance(instanceId: string): Promise<ActivityInstance | null>;
  /** Posts a silent message and returns its id. */
  createMessage(channelId: string, body: LoungeMessageBody): Promise<LoungeResult<string>>;
  editMessage(
    channelId: string,
    messageId: string,
    body: LoungeMessageBody,
  ): Promise<LoungeResult<null>>;
  deleteMessage(channelId: string, messageId: string): Promise<LoungeResult<null>>;
  /** The ids of the channel's latest messages (up to 10). */
  recentMessageIds(channelId: string): Promise<LoungeResult<string[]>>;
}

export interface LoungeClientConfig {
  botToken: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

const MessageIdSchema = v.object({ id: v.pipe(v.string(), v.regex(SNOWFLAKE_RE)) });
const MessageListSchema = v.pipe(v.array(MessageIdSchema), v.maxLength(100));

export function createLoungeClient(config: LoungeClientConfig): LoungeClient {
  const doFetch = config.fetch ?? fetch;
  const discord = createDiscordApi({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    botToken: config.botToken,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
  });

  async function call(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<{ res: Response } | { fail: LoungeResult<never> }> {
    try {
      const res = await doFetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${config.botToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { res };
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      return {
        fail: { kind: 'retry', error: timedOut ? 'timeout' : 'network', afterMs: null },
      };
    }
  }

  /** Maps a failed response to a result (and discards its body). */
  async function failure(res: Response): Promise<LoungeResult<never>> {
    if (res.status === 429) {
      return { kind: 'retry', error: 'rate_limited', afterMs: await readRetryAfter(res) };
    }
    await discard(res);
    if (res.status >= 500) return { kind: 'retry', error: 'server_error', afterMs: null };
    if (res.status === 403) return { kind: 'forbidden' };
    if (res.status === 404) return { kind: 'not_found' };
    if (res.status >= 300 && res.status < 400) return { kind: 'failed', error: 'redirect' };
    return { kind: 'failed', error: 'rejected' };
  }

  async function run<T>(
    path: string,
    method: string,
    body: unknown,
    onOk: (res: Response) => Promise<LoungeResult<T>>,
  ): Promise<LoungeResult<T>> {
    const sent = await call(path, method, body);
    if ('fail' in sent) return sent.fail;
    return sent.res.ok ? onOk(sent.res) : failure(sent.res);
  }

  const ok = async (res: Response): Promise<LoungeResult<null>> => {
    await discard(res);
    return { kind: 'ok', value: null };
  };

  const payload = (b: LoungeMessageBody, flags: number) => ({
    content: b.content,
    allowed_mentions: { parse: [] },
    flags,
    components: loungeComponents(b.label),
  });

  const rejected: LoungeResult<never> = { kind: 'failed', error: 'rejected' };
  const valid = (...ids: string[]): boolean => ids.every((id) => SNOWFLAKE_RE.test(id));

  return {
    getInstance: (instanceId) => discord.getActivityInstance(instanceId),

    createMessage(channelId, body) {
      if (!valid(channelId)) return Promise.resolve(rejected);
      return run(
        `/channels/${channelId}/messages`,
        'POST',
        payload(body, FLAG_SUPPRESS_EMBEDS | FLAG_SUPPRESS_NOTIFICATIONS),
        async (res) => {
          try {
            const parsed = v.safeParse(MessageIdSchema, await res.json());
            if (parsed.success) return { kind: 'ok', value: parsed.output.id };
          } catch {
            // Falls through to the same failure.
          }
          return { kind: 'failed', error: 'rejected' };
        },
      );
    },

    editMessage(channelId, messageId, body) {
      if (!valid(channelId, messageId)) return Promise.resolve(rejected);
      return run(
        `/channels/${channelId}/messages/${messageId}`,
        'PATCH',
        payload(body, FLAG_SUPPRESS_EMBEDS),
        ok,
      );
    },

    deleteMessage(channelId, messageId) {
      if (!valid(channelId, messageId)) return Promise.resolve(rejected);
      return run(`/channels/${channelId}/messages/${messageId}`, 'DELETE', undefined, ok);
    },

    recentMessageIds(channelId) {
      if (!valid(channelId)) return Promise.resolve(rejected);
      return run(`/channels/${channelId}/messages?limit=10`, 'GET', undefined, async (res) => {
        try {
          const parsed = v.safeParse(MessageListSchema, await res.json());
          if (parsed.success) return { kind: 'ok', value: parsed.output.map((m) => m.id) };
        } catch {
          // Falls through to the same failure.
        }
        return { kind: 'failed', error: 'rejected' };
      });
    },
  };
}
