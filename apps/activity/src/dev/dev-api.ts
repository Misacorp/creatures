/**
 * The panel's calls to `/api/dev/*` (staging only). They go through the app's own `apiFetch`, so they
 * carry the session token like every other call and the identity is the session's, never the body's.
 */
import { ApiError, apiFetch, jsonRequest } from '../api';
import { isRecord } from '../parse-core';
import type { DevToolId } from './forms';

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/** The server's machine-readable error code, or a short note for anything else. */
export function errorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code ?? `http_${String(err.status)}`;
  return 'network_error';
}

/**
 * Plain sentences for the error codes a tool is expected to give, so the panel does not show a bare
 * code. Any other code is shown as it is.
 */
const ERROR_SENTENCES: Readonly<Record<string, string>> = {
  roster_locked:
    'The roster is locked: Phase 1 has been fought this week. Jump the week to Week done, then to Preparation to start next week, then fill it.',
};

/** What the panel shows for an error code: a plain sentence when there is one, else the code. */
export function errorSentence(code: string): string {
  return Object.hasOwn(ERROR_SENTENCES, code) ? (ERROR_SENTENCES[code] ?? code) : code;
}

/** Runs one tool and answers its result, or the error code. Never throws. */
export async function runTool(
  tool: DevToolId,
  body: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    const data = await apiFetch(`/api/dev/${tool}`, jsonRequest('POST', body));
    if (!isRecord(data) || data['ok'] !== true) return { ok: false, error: 'unexpected_answer' };
    return { ok: true, result: data['result'] };
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
}

/** What the panel shows about the dev clock and the raid week. */
export interface DevStateView {
  offsetMs: number;
  /** Game time: the real time plus the offset. */
  now: number;
  timezone: string;
  gameDay: string;
  raid: { weekId: string; status: string; bossId: string | null } | null;
  guests: number;
}

const isNum = (value: unknown): value is number => typeof value === 'number';

export function parseDevState(data: unknown): DevStateView | null {
  if (!isRecord(data) || !isRecord(data['clock'])) return null;
  const clock = data['clock'];
  if (
    !isNum(clock['offsetMs']) ||
    !isNum(clock['now']) ||
    typeof clock['timezone'] !== 'string' ||
    (typeof clock['gameDay'] !== 'string' && !isNum(clock['gameDay']))
  ) {
    return null;
  }
  const raid = data['raid'];
  return {
    offsetMs: clock['offsetMs'],
    now: clock['now'],
    timezone: clock['timezone'],
    gameDay: String(clock['gameDay']),
    raid:
      isRecord(raid) && typeof raid['weekId'] === 'string' && typeof raid['status'] === 'string'
        ? {
            weekId: raid['weekId'],
            status: raid['status'],
            bossId: typeof raid['bossId'] === 'string' ? raid['bossId'] : null,
          }
        : null,
    guests: isNum(data['guests']) ? data['guests'] : 0,
  };
}

/** The clock and the raid week, or null when the call failed. */
export async function fetchDevState(): Promise<DevStateView | null> {
  try {
    return parseDevState(await apiFetch('/api/dev/state'));
  } catch {
    return null;
  }
}

interface DevEvent {
  at: number;
  kind: string;
  props: unknown;
}

export function parseDevEvents(data: unknown): DevEvent[] | null {
  if (!isRecord(data) || !Array.isArray(data['events'])) return null;
  const out: DevEvent[] = [];
  for (const e of data['events'] as unknown[]) {
    if (!isRecord(e) || !isNum(e['at']) || typeof e['kind'] !== 'string') return null;
    out.push({ at: e['at'], kind: e['kind'], props: e['props'] });
  }
  return out;
}

/** The last 50 analytics events of this guild (newest first), or null when the call failed. */
export async function fetchDevEvents(): Promise<DevEvent[] | null> {
  try {
    return parseDevEvents(await apiFetch('/api/dev/events'));
  } catch {
    return null;
  }
}

/** One line of text for an event: time (UTC), kind and its properties. */
export function eventLine(event: DevEvent): string {
  const time = new Date(event.at).toISOString().slice(5, 19).replace('T', ' ');
  const props =
    event.props === null || event.props === undefined ? '' : ` ${JSON.stringify(event.props)}`;
  return `${time} ${event.kind}${props}`;
}

const RESULT_LIMIT = 300;

/** A tool's result as short plain text (cut off when long). */
export function describeResult(result: unknown): string {
  const text = result === undefined ? 'done' : (JSON.stringify(result) ?? 'done');
  return text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}...` : text;
}

/** "Wed 14 Oct, 13:37:00" in the guild's timezone. */
export function formatGameTime(now: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(now));
  } catch {
    return new Date(now).toISOString();
  }
}

/** "+1d 6h 0m" for an offset in ms, or "none". */
export function formatOffset(ms: number): string {
  if (ms <= 0) return 'none';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `+${days > 0 ? `${String(days)}d ` : ''}${String(hours)}h ${String(minutes % 60)}m`;
}
