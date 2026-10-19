// The shared kit of the worker tests: the small helpers that used to be copied into each test file.
// Keep it small and plain; anything specific to one area belongs in that area's helpers file.
import { onTestFinished, vi } from 'vitest';
import { SPEND_KEY_RE } from '../src/ledger';
import { T0, type CoreContext } from './helpers';
import { DAY, HOUR, MINUTE } from './raid-helpers';

export { T0, MINUTE, HOUR, DAY };

/** A response as the tests read it: the status and the parsed body. */
export interface Json<T = Record<string, unknown>> {
  status: number;
  body: T;
}

const keyCounters = new Map<string, number>();

/**
 * A valid client idempotency key (`SPEND_KEY_RE`), unique per call within a test file: the prefix,
 * a counter that runs separately for each prefix, then the suffix. The recorded fixtures carry these
 * keys, so a scenario keeps its own prefix and suffix; elsewhere the defaults will do.
 */
export function newKey(prefix = 'test', suffix = 'key'): string {
  const n = (keyCounters.get(prefix) ?? 0) + 1;
  keyCounters.set(prefix, n);
  const key = `${prefix}-${String(n).padStart(8, '0')}-${suffix}`;
  if (!SPEND_KEY_RE.test(key)) throw new Error(`newKey: "${key}" is not a valid client key`);
  return key;
}

/** How long a session may sit idle before the server drops it. The kit signs in again before that. */
const RESIGN_AFTER = 30 * MINUTE;

export interface SessionCaller<T = Record<string, unknown>> {
  /** One API request as the player, with a session that is still alive. */
  call: (method: string, path: string, body?: unknown) => Promise<Json<T>>;
  /** The secret of the player's current session (signed in again if the clock moved), for raw requests. */
  secret: () => Promise<string>;
}

/**
 * A session for `user`, for tests that move the fake clock. Tests jump the clock by hours and
 * sessions idle out, so it signs in again when the clock moved 30 minutes ahead or went backwards.
 */
export async function sessionCaller<T = Record<string, unknown>>(
  ctx: CoreContext,
  user: { id: string; displayName: string },
): Promise<SessionCaller<T>> {
  let current = await ctx.core.createSession(ctx.guildId, user);
  let signedAt = ctx.clock.t;
  const secret = async (): Promise<string> => {
    if (ctx.clock.t - signedAt >= RESIGN_AFTER || ctx.clock.t < signedAt) {
      current = await ctx.core.createSession(ctx.guildId, user);
      signedAt = ctx.clock.t;
    }
    return current;
  };
  const call = async (method: string, path: string, body?: unknown): Promise<Json<T>> => {
    const res = await ctx.request(await secret(), path, method, body);
    return { status: res.status, body: await res.json<T>() };
  };
  return { call, secret };
}

/**
 * Funds a player through the ledger (a key of its own, so every call adds). The source is `test`
 * unless a test that reads the ledger needs another.
 */
export function give(
  ctx: CoreContext,
  userId: string,
  amounts: { bait?: number; essence?: number; source?: string },
): void {
  for (const currency of ['bait', 'essence'] as const) {
    const amount = amounts[currency];
    if (amount === undefined) continue;
    ctx.core.credit({
      userId,
      currency,
      amount,
      source: amounts.source ?? 'test',
      idempotencyKey: newKey(`give-${currency}`),
    });
  }
}

/** The creature columns a test sets directly (these are the table's own names). */
export interface CreaturePatch {
  level?: number;
  exp?: number;
  ribbons?: number;
  fusion_count?: number;
  shiny?: 0 | 1;
  nickname?: string | null;
  quirk_id?: string | null;
  away_expedition_id?: string | null;
}

const CREATURE_COLUMNS: readonly string[] = [
  'level',
  'exp',
  'ribbons',
  'fusion_count',
  'shiny',
  'nickname',
  'quirk_id',
  'away_expedition_id',
];

/** Sets columns of one creature straight in the table. */
export function setCreature(ctx: Pick<CoreContext, 'sql'>, id: string, patch: CreaturePatch): void {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw new Error('setCreature: nothing to set');
  for (const [column] of entries) {
    if (!CREATURE_COLUMNS.includes(column))
      throw new Error(`setCreature: unknown column ${column}`);
  }
  ctx.sql.exec(
    `UPDATE creatures SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
    ...entries.map(([, value]) => value as string | number | null),
    id,
  );
}

export interface ConsoleCapture {
  /** The arguments of each call, in order. */
  calls: unknown[][];
  /** Everything logged, as one string, for `toContain` / `not.toContain` checks. */
  text: () => string;
  /** Puts the console back (it is also put back when the test ends). */
  restore: () => void;
}

/**
 * Silences `console[method]` for the rest of the test and records what the server logged, for
 * tests that cause a failure on purpose: assert on the logged kind rather than let it print.
 */
export function captureConsole(method: 'error' | 'warn' | 'log' = 'error'): ConsoleCapture {
  const calls: unknown[][] = [];
  const spy = vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
    calls.push(args);
  });
  const restore = (): void => {
    spy.mockRestore();
  };
  onTestFinished(restore);
  const show = (arg: unknown): string =>
    typeof arg === 'string'
      ? arg
      : arg instanceof Error
        ? `${arg.name}: ${arg.message}`
        : JSON.stringify(arg);
  return { calls, text: () => calls.map((args) => args.map(show).join(' ')).join('\n'), restore };
}
