import * as v from 'valibot';
import { DiscordError, type DiscordApi } from './discord';
import { errorResponse, json } from './http';
import type { SessionUser } from './guild-core';
import { sanitizeDisplayName } from './names';
import type { TokenBucketLimiter } from './ratelimit';
import { AuthSessionBodySchema, SNOWFLAKE_RE } from './schemas';

export const MAX_BODY_BYTES = 4096;

export interface AuthDeps {
  discord: DiscordApi;
  /** Asks the guild's Durable Object to upsert the player and create a session; returns the secret. */
  createSession(guildId: string, user: SessionUser): Promise<string>;
  /** Signs the secret into the final `s1.<guildId>.<secret>.<mac>` token. */
  formatToken(guildId: string, secret: string): Promise<string>;
  /** Coarse per-instance limiter (best effort, per isolate). */
  limiter: TokenBucketLimiter;
}

/** Reads the body as UTF-8 text, giving up (null) once it exceeds `maxBytes`. */
async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > maxBytes) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

export async function handleAuthSession(request: Request, deps: AuthDeps): Promise<Response> {
  const text = await readLimitedText(request, MAX_BODY_BYTES);
  if (text === null) return errorResponse('invalid_body', 400);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return errorResponse('invalid_body', 400);
  }
  const parsed = v.safeParse(AuthSessionBodySchema, raw);
  if (!parsed.success) return errorResponse('invalid_body', 400);
  const { code, instanceId } = parsed.output;

  const limit = deps.limiter.take(instanceId);
  if (!limit.allowed) {
    return errorResponse('rate_limited', 429, { 'Retry-After': String(limit.retryAfterSeconds) });
  }

  try {
    const accessToken = await deps.discord.exchangeCode(code);
    const discordUser = await deps.discord.getCurrentUser(accessToken);
    const instance = await deps.discord.getActivityInstance(instanceId);
    if (instance === null) return errorResponse('instance_not_found', 401);

    // The guild comes only from Discord's own answer about the instance, never from the client.
    const guildId = instance.location.guild_id;
    if (typeof guildId !== 'string' || !SNOWFLAKE_RE.test(guildId)) {
      return errorResponse('guild_required', 400);
    }
    if (!instance.users.includes(discordUser.id)) {
      return errorResponse('not_in_instance', 401);
    }

    const user: SessionUser = {
      id: discordUser.id,
      displayName: sanitizeDisplayName(
        discordUser.global_name !== undefined &&
          discordUser.global_name !== null &&
          discordUser.global_name !== ''
          ? discordUser.global_name
          : discordUser.username,
      ),
    };
    const secret = await deps.createSession(guildId, user);
    // The access token is passed straight back for the SDK's authenticate(); never stored or logged.
    return json({
      sessionToken: await deps.formatToken(guildId, secret),
      accessToken,
      user,
      guildId,
    });
  } catch (err) {
    if (err instanceof DiscordError) {
      return err.kind === 'auth_failed'
        ? errorResponse('discord_auth_failed', 401)
        : errorResponse('discord_unavailable', 503);
    }
    throw err;
  }
}
