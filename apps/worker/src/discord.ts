import * as v from 'valibot';
import {
  ActivityInstanceSchema,
  DiscordGuildSchema,
  DiscordMemberSchema,
  DiscordRolesSchema,
  DiscordTokenResponseSchema,
  DiscordUserSchema,
  SNOWFLAKE_RE,
  type ActivityInstance,
  type DiscordMember,
  type DiscordRole,
  type DiscordUser,
} from './schemas';

const API_BASE = 'https://discord.com/api/v10';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const TIMEOUT_MS = 5000;

export interface DiscordApi {
  /** Exchanges an OAuth code for an access token. */
  exchangeCode(code: string): Promise<string>;
  getCurrentUser(accessToken: string): Promise<DiscordUser>;
  /** Resolves to null when the activity instance does not exist. */
  getActivityInstance(instanceId: string): Promise<ActivityInstance | null>;
}

/**
 * - `auth_failed`: Discord rejected what the client gave us (bad code or token).
 * - `unavailable`: Discord is down or rate-limiting, replied oddly, or rejected our own credentials.
 * Messages are fixed strings: never put Discord response bodies or tokens in them.
 */
export class DiscordError extends Error {
  constructor(readonly kind: 'auth_failed' | 'unavailable') {
    super(`discord_${kind}`);
    this.name = 'DiscordError';
  }
}

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  botToken: string;
  fetch?: typeof fetch;
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

type Fetch = typeof fetch;

async function sendRequest(
  doFetch: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    // Network error or timeout. Details are dropped on purpose.
    throw new DiscordError('unavailable');
  }
}

async function parseResponse<S extends v.GenericSchema>(
  res: Response,
  schema: S,
): Promise<v.InferOutput<S>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new DiscordError('unavailable');
  }
  const result = v.safeParse(schema, body);
  if (!result.success) {
    throw new DiscordError('unavailable');
  }
  return result.output;
}

export function createDiscordApi(config: DiscordConfig): DiscordApi {
  const doFetch = config.fetch ?? fetch;
  const send = (url: string, init: RequestInit) => sendRequest(doFetch, url, init, TIMEOUT_MS);
  const parse = parseResponse;

  return {
    async exchangeCode(code) {
      const res = await send(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
        }),
      });
      if (isTransient(res.status)) throw new DiscordError('unavailable');
      if (!res.ok) throw new DiscordError('auth_failed');
      return (await parse(res, DiscordTokenResponseSchema)).access_token;
    },

    async getCurrentUser(accessToken) {
      const res = await send(`${API_BASE}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (isTransient(res.status)) throw new DiscordError('unavailable');
      if (!res.ok) throw new DiscordError('auth_failed');
      return parse(res, DiscordUserSchema);
    },

    async getActivityInstance(instanceId) {
      const url = `${API_BASE}/applications/${encodeURIComponent(config.clientId)}/activity-instances/${encodeURIComponent(instanceId)}`;
      const res = await send(url, { headers: { Authorization: `Bot ${config.botToken}` } });
      if (res.status === 404) return null;
      // Any other failure here (including 401/403) is our configuration, not the player's fault.
      if (!res.ok) throw new DiscordError('unavailable');
      return parse(res, ActivityInstanceSchema);
    },
  };
}

/**
 * Read-only guild lookups with the bot token, used to check who may manage the server. Every
 * failure (network, timeout, redirect, 5xx, 429, our own missing access, a reply of the wrong
 * shape) is `DiscordError('unavailable')`. The one exception is a member that does not exist.
 */
export interface GuildApi {
  /** The id of the guild's owner. */
  getGuildOwnerId(guildId: string): Promise<string>;
  /** Every role of the guild, the @everyone role (whose id equals the guild id) included. */
  getGuildRoles(guildId: string): Promise<DiscordRole[]>;
  /** Resolves to null when the user is not a member of the guild. */
  getGuildMember(guildId: string, userId: string): Promise<DiscordMember | null>;
}

export interface GuildApiConfig {
  botToken: string;
  fetch?: Fetch;
}

export function createGuildApi(config: GuildApiConfig): GuildApi {
  const doFetch = config.fetch ?? fetch;

  async function get(path: string): Promise<Response> {
    return sendRequest(
      doFetch,
      `${API_BASE}${path}`,
      {
        headers: { Authorization: `Bot ${config.botToken}` },
        // workerd rejects 'error'. A redirect is never expected from the API; it counts as a failure.
        redirect: 'manual',
      },
      TIMEOUT_MS,
    );
  }

  /** The ids go into URLs: only ever snowflakes. */
  function checkIds(...ids: string[]): void {
    if (!ids.every((id) => SNOWFLAKE_RE.test(id))) throw new DiscordError('unavailable');
  }

  return {
    async getGuildOwnerId(guildId) {
      checkIds(guildId);
      const res = await get(`/guilds/${guildId}`);
      // 401/403/404 here mean the bot is not in the guild or its token is wrong: our configuration.
      if (!res.ok) throw new DiscordError('unavailable');
      return (await parseResponse(res, DiscordGuildSchema)).owner_id;
    },

    async getGuildRoles(guildId) {
      checkIds(guildId);
      const res = await get(`/guilds/${guildId}/roles`);
      if (!res.ok) throw new DiscordError('unavailable');
      return parseResponse(res, DiscordRolesSchema);
    },

    async getGuildMember(guildId, userId) {
      checkIds(guildId, userId);
      const res = await get(`/guilds/${guildId}/members/${userId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new DiscordError('unavailable');
      return parseResponse(res, DiscordMemberSchema);
    },
  };
}
