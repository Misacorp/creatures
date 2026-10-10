import * as v from 'valibot';
import { SNOWFLAKE_RE } from './schemas';
import { addDays, isValidTimeZone, zonedDate, zonedTimeToEpoch } from './time';

/** How many days back a guild's history starts when it syncs for the first time. */
export const LEET_BACKFILL_DAYS = 7;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_ID_RE = /^\d{17,20}:\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_DAYS = 100;
const DEFAULT_PAGE_DAYS = 31;
const MAX_PARTICIPANTS_PER_DAY = 500;
const MAX_RESPONSE_CHARS = 2_000_000;
/** Timeout of one HTTP call to the leet bot. Keep it below the sync budget in guild-core. */
export const DEFAULT_TIMEOUT_MS = 5000;

export interface LeetParticipant {
  userId: string;
  leetAt: string;
}

export interface LeetDay {
  id: string;
  date: string;
  participants: LeetParticipant[];
}

export interface LeetDaysPage {
  days: LeetDay[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface LeetDaysOptions {
  /**
   * The guild's timezone, resolved once by the caller. Sources that work out day boundaries
   * themselves (the mock) use it; the HTTP source leaves day boundaries to the bot.
   */
  timezone: string;
  after?: string;
  since?: string;
  limit?: number;
}

/** Read-only source of finalised leet days, matching docs/design/leet-api.md. */
export interface LeetSource {
  /** Which kind of source this is, shown to players in the sync status. Absent means "mock". */
  readonly kind?: 'http' | 'mock';
  getDays(guildId: string, opts: LeetDaysOptions): Promise<LeetDaysPage>;
}

export type LeetSourceErrorKind =
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'upstream'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'invalid_request';

/** Why the last sync failed, as stored and shown to players. Only ever a kind, never a message. */
export type LeetSyncErrorKind = LeetSourceErrorKind | 'disabled' | 'internal';

/** Failure of a leet source. The message never contains upstream data or secrets. */
export class LeetSourceError extends Error {
  constructor(readonly kind: LeetSourceErrorKind) {
    super(`leet source error (${kind})`);
    this.name = 'LeetSourceError';
  }
}

const dateString = v.pipe(
  v.string(),
  v.regex(DATE_RE),
  v.check((s) => {
    const t = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(s);
  }),
);

// Upstream data may carry extra keys (`v.object` ignores them), but the fields we use are strict.
const LeetDaySchema = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.regex(DAY_ID_RE)),
    date: dateString,
    participants: v.pipe(
      v.array(
        v.object({
          userId: v.pipe(v.string(), v.regex(SNOWFLAKE_RE)),
          leetAt: v.pipe(v.string(), v.maxLength(64)),
        }),
      ),
      v.maxLength(MAX_PARTICIPANTS_PER_DAY),
    ),
  }),
  v.check((day) => day.id.endsWith(`:${day.date}`), 'id must end with the date'),
);

export const LeetDaysPageSchema = v.object({
  days: v.pipe(v.array(LeetDaySchema), v.maxLength(MAX_PAGE_DAYS)),
  nextCursor: v.nullable(v.pipe(v.string(), v.maxLength(512))),
  hasMore: v.boolean(),
});

/**
 * Validates an upstream page and normalises it: each user counts once per day, and every day must
 * belong to the requested guild. Throws `LeetSourceError('invalid_response')` otherwise.
 */
export function parseLeetPage(guildId: string, data: unknown): LeetDaysPage {
  const result = v.safeParse(LeetDaysPageSchema, data);
  if (!result.success) throw new LeetSourceError('invalid_response');
  const page = result.output;
  const days = page.days.map((day): LeetDay => {
    if (!day.id.startsWith(`${guildId}:`)) throw new LeetSourceError('invalid_response');
    const seen = new Set<string>();
    const participants: LeetParticipant[] = [];
    for (const p of day.participants) {
      if (seen.has(p.userId)) continue;
      seen.add(p.userId);
      participants.push({ userId: p.userId, leetAt: p.leetAt });
    }
    return { id: day.id, date: day.date, participants };
  });
  return { days, nextCursor: page.nextCursor, hasMore: page.hasMore };
}

export interface HttpLeetSourceOptions {
  baseUrl: string;
  apiKey: string;
  fetch: typeof fetch;
  /** Request timeout in milliseconds (default 5000). */
  timeoutMs?: number;
}

/** Talks to the real leet bot API. Not enabled anywhere until the bot exposes it. */
export function createHttpLeetSource(options: HttpLeetSourceOptions): LeetSource {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  if (!baseUrl.startsWith('https://')) throw new Error('leet API URL must be https');
  if (options.apiKey.length === 0) throw new Error('leet API key is empty');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    kind: 'http',
    async getDays(guildId, opts) {
      if (!SNOWFLAKE_RE.test(guildId)) throw new LeetSourceError('invalid_request');
      const query = new URLSearchParams();
      if (opts.after !== undefined) query.set('after', opts.after);
      else if (opts.since !== undefined) query.set('since', opts.since);
      if (opts.limit !== undefined) query.set('limit', String(opts.limit));
      const qs = query.size > 0 ? `?${query.toString()}` : '';
      const url = `${baseUrl}/v1/guilds/${guildId}/days${qs}`;

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        let res: Response;
        try {
          res = await options.fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
            signal: controller.signal,
            redirect: 'error',
          });
        } catch {
          throw new LeetSourceError(controller.signal.aborted ? 'timeout' : 'network');
        }
        if (res.status === 401 || res.status === 403) throw new LeetSourceError('unauthorized');
        if (res.status === 404) throw new LeetSourceError('not_found');
        if (res.status === 429) throw new LeetSourceError('rate_limited');
        if (!res.ok) throw new LeetSourceError('upstream');
        let text: string;
        try {
          text = await res.text();
        } catch {
          throw new LeetSourceError(controller.signal.aborted ? 'timeout' : 'network');
        }
        if (text.length > MAX_RESPONSE_CHARS) throw new LeetSourceError('invalid_response');
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw new LeetSourceError('invalid_response');
        }
        return parseLeetPage(guildId, body);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface MockLeetSourceOptions {
  now(): number;
  /** Discord user ids that may take part. The mock never invents players. */
  knownPlayers(): string[];
  /** Days of history when no `since` is given. */
  backfillDays: number;
}

/** A day is finalised once its leet window has closed (13:38 guild-local time). */
const FINALISED_HOUR = 13;
const FINALISED_MINUTE = 38;
/** The mock's leet happens at 13:37 guild-local time plus a hash-derived number of seconds. */
const LEET_HOUR = 13;
const LEET_MINUTE = 37;
/** A player takes part when the first hash byte is below this: 154 / 256, about 60%. */
const PARTICIPATION_THRESHOLD = 154;

function encodeCursor(date: string): string {
  return btoa(JSON.stringify({ d: date }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeCursor(cursor: string): string {
  try {
    const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const parsed: unknown = JSON.parse(atob(b64));
    const date = v.parse(v.object({ d: dateString }), parsed).d;
    return date;
  } catch {
    throw new LeetSourceError('invalid_request');
  }
}

async function hashBytes(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/**
 * A deterministic synthetic leet history for local, staging and (until the leet bot API is live)
 * production. A player's presence on a day depends only on the guild, date and player id, so the
 * same history is produced on every call. Players who join later are not back-filled for days
 * that were already synced. No `Math.random`.
 */
export function createMockLeetSource(options: MockLeetSourceOptions): LeetSource {
  function lastFinalisedDate(timezone: string): string {
    const now = options.now();
    const today = zonedDate(now, timezone);
    return now >= zonedTimeToEpoch(today, FINALISED_HOUR, FINALISED_MINUTE, timezone)
      ? today
      : addDays(today, -1);
  }

  async function buildDay(
    guildId: string,
    timezone: string,
    date: string,
    players: string[],
  ): Promise<LeetDay> {
    const base = zonedTimeToEpoch(date, LEET_HOUR, LEET_MINUTE, timezone);
    const participants: LeetParticipant[] = [];
    for (const userId of players) {
      const hash = await hashBytes(`${guildId}:${date}:${userId}`);
      const first = hash[0] ?? 255;
      if (first >= PARTICIPATION_THRESHOLD) continue;
      const seconds = (hash[1] ?? 0) % 60;
      participants.push({ userId, leetAt: new Date(base + seconds * 1000).toISOString() });
    }
    participants.sort((a, b) =>
      a.leetAt === b.leetAt ? a.userId.localeCompare(b.userId) : a.leetAt.localeCompare(b.leetAt),
    );
    return { id: `${guildId}:${date}`, date, participants };
  }

  return {
    kind: 'mock',
    async getDays(guildId, opts) {
      if (!SNOWFLAKE_RE.test(guildId) || !isValidTimeZone(opts.timezone)) {
        throw new LeetSourceError('invalid_request');
      }
      const limit = opts.limit ?? DEFAULT_PAGE_DAYS;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_DAYS) {
        throw new LeetSourceError('invalid_request');
      }
      let first: string;
      if (opts.after !== undefined) {
        first = addDays(decodeCursor(opts.after), 1);
      } else if (opts.since !== undefined) {
        if (!v.is(dateString, opts.since)) throw new LeetSourceError('invalid_request');
        first = opts.since;
      } else {
        first = addDays(zonedDate(options.now(), opts.timezone), -options.backfillDays);
      }

      const last = lastFinalisedDate(opts.timezone);
      const players = [...new Set(options.knownPlayers())].sort();
      const days: LeetDay[] = [];
      let date = first;
      // ISO dates compare correctly as strings.
      while (date <= last && days.length < limit) {
        days.push(await buildDay(guildId, opts.timezone, date, players));
        date = addDays(date, 1);
      }
      const lastReturned = days[days.length - 1]?.date;
      return {
        days,
        nextCursor:
          lastReturned !== undefined
            ? encodeCursor(lastReturned)
            : opts.after !== undefined
              ? opts.after
              : null,
        hasMore: date <= last,
      };
    },
  };
}

/** The slice of the Worker's env that selects a leet source. */
export interface LeetEnv {
  LEET_SOURCE?: string;
  LEET_API_URL?: string;
  LEET_API_KEY?: string;
}

/**
 * Picks the leet source from env. Fails closed: any unknown `LEET_SOURCE` (or an incomplete
 * "http" setup) yields null, which disables syncing. Logs a warning without any secret values.
 */
export function createLeetSourceFromEnv(
  env: LeetEnv,
  deps: MockLeetSourceOptions & { fetch: typeof fetch },
): LeetSource | null {
  switch (env.LEET_SOURCE) {
    case 'mock':
      return createMockLeetSource(deps);
    case 'http': {
      const baseUrl = env.LEET_API_URL ?? '';
      const apiKey = env.LEET_API_KEY ?? '';
      if (baseUrl === '' || apiKey === '') {
        console.warn('leet sync disabled: LEET_SOURCE is "http" but URL or key is missing');
        return null;
      }
      try {
        return createHttpLeetSource({ baseUrl, apiKey, fetch: deps.fetch });
      } catch {
        console.warn('leet sync disabled: LEET_API_URL is not a valid https URL');
        return null;
      }
    }
    default:
      console.warn('leet sync disabled: LEET_SOURCE is not "mock" or "http"');
      return null;
  }
}
