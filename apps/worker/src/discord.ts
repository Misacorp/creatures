import * as v from 'valibot';
import {
  ActivityInstanceSchema,
  DiscordTokenResponseSchema,
  DiscordUserSchema,
  type ActivityInstance,
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

export function createDiscordApi(config: DiscordConfig): DiscordApi {
  const doFetch = config.fetch ?? fetch;

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      // Network error or timeout. Details are dropped on purpose.
      throw new DiscordError('unavailable');
    }
  }

  async function parse<S extends v.GenericSchema>(
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
