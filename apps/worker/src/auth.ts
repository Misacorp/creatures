import * as v from 'valibot';
import { DiscordError, type DiscordApi } from './discord';
import { errorResponse, json, readJsonBody } from './http';
import type { SessionUser } from './guild-core';
import { sanitizeDisplayName } from './names';
import type { TokenBucketLimiter } from './ratelimit';
import { AuthSessionBodySchema, SNOWFLAKE_RE } from './schemas';

export const MAX_BODY_BYTES = 4096;

export interface AuthDeps {
  discord: DiscordApi;
  /**
   * Asks the guild's Durable Object to upsert the player and create a session; returns the secret.
   * `channelId` is the channel the Activity was launched from, as Discord reports it (or null).
   */
  createSession(guildId: string, user: SessionUser, channelId: string | null): Promise<string>;
  /** Signs the secret into the final `s1.<guildId>.<secret>.<mac>` token. */
  formatToken(guildId: string, secret: string): Promise<string>;
  /** Coarse per-instance limiter (best effort, per isolate). */
  limiter: TokenBucketLimiter;
}

export async function handleAuthSession(request: Request, deps: AuthDeps): Promise<Response> {
  const raw = await readJsonBody(request, MAX_BODY_BYTES);
  if (raw === undefined) return errorResponse('invalid_body', 400);
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
    // Likewise the announcement channel: Discord's answer only, and only if it is a snowflake.
    const channelId = instance.location.channel_id;
    const secret = await deps.createSession(
      guildId,
      user,
      typeof channelId === 'string' && SNOWFLAKE_RE.test(channelId) ? channelId : null,
    );
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
