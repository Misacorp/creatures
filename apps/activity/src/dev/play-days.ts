/**
 * "Play days": the simulated month driven from the panel (the loop of `apps/worker/scripts/valley-month.mjs`, through the panel's own
 * dev API with the session, never a token). Pure: the tool call and the wait are passed in, so a test drives it with a fake.
 *
 * Order: `valley-sim-day` calls one after another; the first answer `no_bots` makes the bots (`valley-bots`, which also moves the dev clock to
 * the next Monday) and plays that day again. A day that fails as a whole is played again in parts of `SPLIT_VISITS` visits (the Worker's
 * CPU limit); a part that fails stops the run with its error. The pause between calls keeps under the per-player rate limit.
 */
import type { DataRow } from '../ui/DataTable';
import { isRecord } from '../parse-core';
import type { ToolOutcome } from './dev-api';
import type { DevToolId } from './forms';

export const MAX_DAYS = 28;
export const DEFAULT_DAYS = 28;
/** Visits per call when a whole day failed. */
export const SPLIT_VISITS = 3;
/** The wait between calls (the rate limit is a burst of 30, then one a second). */
export const PACE_MS = 1200;
const RATE_LIMIT_WAIT_MS = 2000;
const RATE_LIMIT_TRIES = 30;

export type CallTool = (tool: DevToolId, body: Record<string, unknown>) => Promise<ToolOutcome>;

export interface PlayProgress {
  /** Days finished in this run. */
  done: number;
  /** Days asked for. */
  total: number;
  /** What is happening now, one line. */
  line: string;
}

export interface PlayDaysEnv {
  call: CallTool;
  sleep: (ms: number) => Promise<void>;
  /** True once the Stop button was pressed: checked before every call. */
  stopped: () => boolean;
  onProgress: (progress: PlayProgress) => void;
}

export type PlayEnd =
  | { kind: 'finished'; played: number }
  | { kind: 'month-over'; played: number }
  | { kind: 'stopped'; played: number }
  | { kind: 'error'; played: number; error: string };

interface DayAnswer {
  done: boolean;
  finished: boolean;
  visits: number;
}

function parseDay(result: unknown): DayAnswer | null {
  if (!isRecord(result) || typeof result['done'] !== 'boolean') return null;
  return {
    done: result['done'],
    finished: result['finished'] === true,
    visits: typeof result['visits'] === 'number' ? result['visits'] : 0,
  };
}

type Step = { ok: true; answer: DayAnswer } | { ok: false; error: string };

/** One call of the day tool; a rate limit waits and tries again. */
async function callDay(env: PlayDaysEnv, maxVisits: number | undefined): Promise<Step> {
  for (let i = 0; i < RATE_LIMIT_TRIES; i++) {
    const outcome = await env.call('valley-sim-day', maxVisits === undefined ? {} : { maxVisits });
    if (!outcome.ok) {
      if (outcome.error === 'rate_limited' || outcome.error === 'http_429') {
        await env.sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }
      return { ok: false, error: outcome.error };
    }
    const answer = parseDay(outcome.result);
    return answer === null ? { ok: false, error: 'unexpected_answer' } : { ok: true, answer };
  }
  return { ok: false, error: 'rate_limited' };
}

/** Plays `days` game days (1 to 28) from wherever the month stands. Never throws. */
export async function playDays(days: number, env: PlayDaysEnv): Promise<PlayEnd> {
  const total = Math.min(MAX_DAYS, Math.max(1, Math.floor(days)));
  let played = 0;
  let botsMade = false;
  const report = (line: string): void => {
    env.onProgress({ done: played, total, line });
  };

  while (played < total) {
    if (env.stopped()) return { kind: 'stopped', played };
    const label = `Day ${String(played + 1)} / ${String(total)}`;
    report(label);
    let maxVisits: number | undefined;
    for (;;) {
      if (env.stopped()) return { kind: 'stopped', played };
      let step = await callDay(env, maxVisits);
      if (!step.ok && step.error === 'no_bots' && !botsMade) {
        report(`${label}: making the bots`);
        botsMade = true;
        const made = await env.call('valley-bots', {});
        if (!made.ok) return { kind: 'error', played, error: `valley-bots: ${made.error}` };
        await env.sleep(PACE_MS);
        step = await callDay(env, maxVisits);
      }
      if (!step.ok) {
        if (maxVisits === undefined && step.error !== 'no_bots') {
          // The whole day failed: the one retry plays it in parts.
          maxVisits = SPLIT_VISITS;
          report(`${label}: a whole day failed (${step.error}), playing it in parts`);
          await env.sleep(PACE_MS);
          continue;
        }
        return { kind: 'error', played, error: `valley-sim-day: ${step.error}` };
      }
      if (step.answer.finished && step.answer.visits === 0) return { kind: 'month-over', played };
      await env.sleep(PACE_MS);
      if (step.answer.done) break;
    }
    played += 1;
    report(
      played < total
        ? `Day ${String(played + 1)} / ${String(total)}`
        : `Played ${String(total)} days`,
    );
  }
  return { kind: 'finished', played };
}

const num = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];
  return typeof value === 'number' ? value : null;
};

const count = (value: number): string => value.toLocaleString('en-GB');

const numberEntries = (value: unknown): [string, number][] =>
  isRecord(value)
    ? Object.entries(value).filter((e): e is [string, number] => typeof e[1] === 'number')
    : [];

/** The main numbers of a `valley-report` answer as table rows, or null when it is not one. Only the `month` part is read. */
export function reportRows(result: unknown): DataRow[] | null {
  if (!isRecord(result) || !isRecord(result['month'])) return null;
  const month = result['month'];
  const rows: DataRow[] = [];
  const played = num(month, 'daysPlayed');
  if (played !== null) rows.push({ label: 'Days played', value: String(played) });
  if (isRecord(month['rowsTotal'])) {
    const read = num(month['rowsTotal'], 'read');
    const written = num(month['rowsTotal'], 'written');
    if (read !== null) rows.push({ label: 'Rows read', value: count(read) });
    if (written !== null) rows.push({ label: 'Rows written', value: count(written) });
  }
  const level = month['firstLevelUpDay'];
  rows.push({
    label: 'First level-up',
    value: typeof level === 'number' ? `day ${String(level)}` : 'none',
  });
  const places = numberEntries(month['placeDays'])
    .sort((a, b) => a[1] - b[1])
    .map(([name, day]) => `${name} day ${String(day)}`);
  rows.push({ label: 'Places opened', value: places.length === 0 ? 'none' : places.join(', ') });
  const declined = numberEntries(month['declined']).sort((a, b) => b[1] - a[1]);
  const sum = declined.reduce((s, e) => s + e[1], 0);
  rows.push({
    label: 'Declined intents',
    value:
      declined.length === 0
        ? '0'
        : `${count(sum)} (${declined
            .slice(0, 3)
            .map(([k, c]) => `${k} ${String(c)}`)
            .join(', ')})`,
  });
  if (Array.isArray(month['players'])) {
    (month['players'] as unknown[]).forEach((p, i) => {
      if (!isRecord(p) || !isRecord(p['metricsNow'])) return;
      const best = num(p['metricsNow'], 'levelBest');
      const kinds = num(p['metricsNow'], 'kindsOwned');
      if (best === null || kinds === null) return;
      rows.push({
        label: `Player ${String(i + 1)} now`,
        value: `best level ${String(best)}, ${String(kinds)} kinds`,
      });
    });
  }
  return rows;
}

/** The end of a run as one plain sentence. */
export function endLine(end: PlayEnd): string {
  const days = `${String(end.played)} ${end.played === 1 ? 'day' : 'days'}`;
  switch (end.kind) {
    case 'finished':
      return `Played ${days}.`;
    case 'month-over':
      return `The month is over (28 days), ${days} played in this run.`;
    case 'stopped':
      return `Stopped after ${days}.`;
    case 'error':
      return `Stopped after ${days}: ${end.error}`;
  }
}
