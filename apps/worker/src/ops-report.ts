/**
 * `GET /api/ops/report?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|md[&weekly=1]`: the aggregate
 * analytics report for agents and Misa (plan in `docs/design/analytics.md`).
 *
 * - **Auth is a bearer `OPS_TOKEN`, nothing else.** Session tokens and cookies are never read here:
 *   a session token simply fails the comparison. With no `OPS_TOKEN` configured (unset or empty), a
 *   wrong token, or a method other than GET, the answer is the same plain 404 (not hidden: unknown
 *   routes answer 401, as the session check comes first). The comparison hashes both sides with SHA-256 and compares the digests in
 *   constant time.
 * - Requests are rate-limited per caller (a hash of the connecting IP, kept in memory only).
 * - The report holds counts only, summed across servers. A per-server breakdown (`byGuild`, under
 *   stable aliases) is left out unless the query has `byGuild=1`. Rows come from each guild's rollup table (`analytics_daily`); every
 *   row is checked again here (`parseRow`), guild ids become stable short aliases, and nothing else
 *   about a guild or a player is read.
 */
import type { Report } from './ops-aggregate';
import { buildPeriod, parseOpsQuery, type GuildRows } from './ops-aggregate';
import { renderMarkdown } from './ops-render';
import { DIRECTORY_NAME } from './guild-directory';
import { API_HEADERS, errorResponse, json, notFound } from './http';
import type { TokenBucketLimiter } from './ratelimit';

export const OPS_REPORT_PATH = '/api/ops/report';

/** Guild objects asked at once. */
const FAN_OUT = 8;
/** The most guilds one report asks (most recently seen first); `guilds.known` is the true count. */
export const MAX_GUILDS_ASKED = 400;
/** Alias lengths: at least 6 hex characters, longer only when two guilds would collide. */
const MIN_ALIAS_HEX = 6;
const MAX_ALIAS_HEX = 16;

const encoder = new TextEncoder();

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

/** True when `presented` equals `expected`; both are hashed first so lengths never leak. */
export async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** The token of an `Authorization: Bearer <token>` header, or null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header === null) return null;
  const match = /^Bearer ([^\s]{1,512})$/.exec(header);
  return match?.[1] ?? null;
}

// --- Guild aliases ---

let cachedAliasKey: { secret: string; key: Promise<CryptoKey> } | null = null;

/** The alias HMAC key: HKDF from the Discord client secret, with its own salt and info label. */
function aliasKey(secret: string): Promise<CryptoKey> {
  if (cachedAliasKey?.secret === secret) return cachedAliasKey.key;
  const key = (async () => {
    const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode('leet-creatures/analytics'),
        info: encoder.encode('analytics-guild-alias-v1'),
      },
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
  })();
  const entry = { secret, key };
  cachedAliasKey = entry;
  key.catch(() => {
    if (cachedAliasKey === entry) cachedAliasKey = null;
  });
  return key;
}

/**
 * Stable short aliases for guild ids: `g-` plus the first 6 hex characters of an HMAC of the id
 * (a longer prefix only when two guilds in the directory would share one). The same guild gets the
 * same alias in every report for as long as the Discord client secret is the same. The aliases are
 * not reversible without the secret.
 */
export async function guildAliases(
  secret: string,
  guildIds: readonly string[],
): Promise<Map<string, string>> {
  const key = await aliasKey(secret);
  const full = await Promise.all(
    guildIds.map(async (id) => {
      const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(id)));
      return [id, Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')] as const;
    }),
  );
  const aliases = new Map<string, string>();
  for (let length = MIN_ALIAS_HEX; length <= MAX_ALIAS_HEX; length += 2) {
    const counts = new Map<string, number>();
    for (const [, hex] of full) {
      const prefix = hex.slice(0, length);
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    for (const [id, hex] of full) {
      const prefix = hex.slice(0, length);
      if (!aliases.has(id) && (counts.get(prefix) === 1 || length === MAX_ALIAS_HEX)) {
        aliases.set(id, `g-${prefix}`);
      }
    }
  }
  return aliases;
}

// --- The handler ---

export interface OpsDeps {
  limiter: TokenBucketLimiter;
}

/** A short, non-identifying key for the rate limiter: a hash of the connecting IP. */
async function limiterKey(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const digest = await sha256(`ops-limit:${ip}`);
  return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fanOut<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += FAN_OUT) {
    out.push(...(await Promise.all(items.slice(i, i + FAN_OUT).map(run))));
  }
  return out;
}

export async function handleOpsReport(
  request: Request,
  env: Env,
  deps: OpsDeps,
): Promise<Response> {
  const expected = env.OPS_TOKEN;
  if (request.method !== 'GET' || expected === undefined || expected === '') return notFound();

  const limit = deps.limiter.take(await limiterKey(request));
  if (!limit.allowed) {
    return errorResponse('rate_limited', 429, { 'Retry-After': String(limit.retryAfterSeconds) });
  }
  const presented = bearerToken(request);
  if (presented === null || !(await tokenMatches(presented, expected))) return notFound();

  const query = parseOpsQuery(new URL(request.url));
  if (!query.ok) return errorResponse('invalid_query', 400);

  const directory = env.GUILD_DIRECTORY.get(env.GUILD_DIRECTORY.idFromName(DIRECTORY_NAME));
  const { ids: guildIds, total: guildsKnown } = await directory.list(MAX_GUILDS_ASKED);
  const aliases = await guildAliases(env.DISCORD_CLIENT_SECRET, guildIds);

  const loaded = await fanOut(guildIds, async (guildId) => {
    const alias = aliases.get(guildId);
    if (alias === undefined) return null;
    try {
      const stub = env.GUILD_WORLD.get(env.GUILD_WORLD.idFromName(guildId));
      const { current, previous } = await stub.analyticsDaily(query.from, query.to, query.compare);
      return { alias, current, previous };
    } catch (err) {
      // Only the error type is logged: never a guild id or a message.
      console.error(
        'ops report: a guild did not answer',
        err instanceof Error ? err.name : 'unknown',
      );
      return null;
    }
  });
  const answered = loaded.flatMap((entry) => (entry === null ? [] : [entry]));

  const current: GuildRows[] = answered.map((e) => ({ alias: e.alias, rows: e.current }));
  const built = buildPeriod(query.from, query.to, current);
  const report: Report = {
    version: 1,
    ...built.period,
    guilds: { known: guildsKnown, reporting: answered.length },
    daily: built.daily,
  };
  // Per-server totals are only for a deliberate `byGuild=1` request; the workflow never asks.
  if (query.byGuild) report.byGuild = built.byGuild;
  if (query.compare !== null) {
    const previous: GuildRows[] = answered.map((e) => ({ alias: e.alias, rows: e.previous ?? [] }));
    report.previous = buildPeriod(query.compare.from, query.compare.to, previous).period;
  }

  if (query.format === 'md') {
    return new Response(renderMarkdown(report), {
      status: 200,
      headers: { ...API_HEADERS, 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }
  return json(report);
}
