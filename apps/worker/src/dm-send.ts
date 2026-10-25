/**
 * The Discord calls behind the DMs: opening a player's DM channel and sending a message to it. The
 * message itself goes through the same sender as the announcement posts (`createPostSender`: no
 * mentions, rate limits and failures sorted the same way). Nothing here throws, and nothing is logged
 * from here: the caller logs error kinds only, never ids, tokens or message text.
 */
import * as v from 'valibot';
import {
  API_BASE,
  TIMEOUT_MS,
  createPostSender,
  discard,
  readRetryAfter,
  type PostFailureKind,
  type PostSender,
  type PostSenderConfig,
} from './discord-posts';
import { SNOWFLAKE_RE } from './schemas';

export type OpenOutcome =
  | { kind: 'ok'; channelId: string }
  | { kind: 'retry'; error: PostFailureKind; afterMs: number | null }
  | { kind: 'failed'; error: PostFailureKind };

export interface DmSender {
  /** Opens (or finds) the DM channel between the bot and one player. */
  openChannel(userId: string): Promise<OpenOutcome>;
  /** Sends one text message to a channel. */
  send: PostSender;
}

export type DmSenderConfig = Pick<PostSenderConfig, 'botToken' | 'fetch'>;

const ChannelSchema = v.object({ id: v.pipe(v.string(), v.regex(SNOWFLAKE_RE)) });

export function createDmSender(config: DmSenderConfig): DmSender {
  const doFetch = config.fetch ?? fetch;
  return {
    send: createPostSender(config),
    async openChannel(userId) {
      // The id goes into the request body: only ever a snowflake.
      if (!SNOWFLAKE_RE.test(userId)) return { kind: 'failed', error: 'rejected' };
      let res: Response;
      try {
        res = await doFetch(`${API_BASE}/users/@me/channels`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${config.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ recipient_id: userId }),
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        const timedOut = err instanceof Error && err.name === 'TimeoutError';
        return { kind: 'retry', error: timedOut ? 'timeout' : 'network', afterMs: null };
      }
      if (res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // Not JSON: rejected below.
        }
        const channel = v.safeParse(ChannelSchema, body);
        return channel.success
          ? { kind: 'ok', channelId: channel.output.id }
          : { kind: 'failed', error: 'rejected' };
      }
      if (res.status === 429) {
        return { kind: 'retry', error: 'rate_limited', afterMs: await readRetryAfter(res) };
      }
      await discard(res);
      if (res.status >= 500) return { kind: 'retry', error: 'server_error', afterMs: null };
      if (res.status === 403) return { kind: 'failed', error: 'forbidden' };
      if (res.status === 404) return { kind: 'failed', error: 'not_found' };
      if (res.status >= 300 && res.status < 400) return { kind: 'failed', error: 'redirect' };
      return { kind: 'failed', error: 'rejected' };
    },
  };
}
