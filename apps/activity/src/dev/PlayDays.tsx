/**
 * "Play days" of the Valley section: runs the simulated month from the panel (`play-days.ts` is the loop), one game day after another,
 * with a progress line and a Stop button, and shows the month's main numbers at the end. The controls are the panel's own
 * (`dev-form`, `dev-field`, `dev-btn`); the numbers are a `ui/DataTable`.
 */
import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { DataRow } from '../ui/DataTable';
import { DataTable } from '../ui/DataTable';
import { errorSentence, runTool } from './dev-api';
import {
  DEFAULT_DAYS,
  MAX_DAYS,
  endLine,
  playDays,
  reportRows,
  type CallTool,
  type PlayProgress,
} from './play-days';

interface Props {
  /** Another tool is running (the panel runs one at a time). */
  busy: boolean;
  /** Tells the panel a run started or ended, so its other tools wait meanwhile. */
  onRunning?: (running: boolean) => void;
  /** Called once a run ended, so the clock and the game read their state again. */
  onDone: () => void;
  /** Replaced in tests. */
  call?: CallTool;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function PlayDays({
  busy,
  onRunning,
  onDone,
  call = runTool,
  sleep = wait,
}: Props): JSX.Element {
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PlayProgress | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<DataRow[] | null>(null);
  const stop = useRef(false);

  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_DAYS;

  const start = (): void => {
    if (running || !valid) return;
    stop.current = false;
    setRunning(true);
    onRunning?.(true);
    setOutcome(null);
    setRows(null);
    void (async () => {
      const end = await playDays(n, {
        call,
        sleep,
        stopped: () => stop.current,
        onProgress: setProgress,
      });
      const report = await call('valley-report', {});
      setRows(report.ok ? reportRows(report.result) : null);
      const text =
        end.kind === 'error'
          ? endLine({ ...end, error: errorSentence(end.error.replace(/^[\w-]+: /, '')) })
          : endLine(end);
      setOutcome({ ok: end.kind !== 'error', text });
      setRunning(false);
      onRunning?.(false);
      onDone();
    })();
  };

  return (
    <form
      class="dev-form"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <p class="dev-form-title">Play days</p>
      <div class="dev-fields">
        <label class="dev-field">
          <span>Days (1 to {String(MAX_DAYS)})</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_DAYS}
            value={days}
            disabled={running}
            onInput={(e) => {
              setDays(e.currentTarget.value);
            }}
          />
        </label>
      </div>
      <div class="dev-quick-row">
        <button type="submit" class="dev-btn" disabled={busy || running || !valid}>
          Play days
        </button>
        {running && (
          <button
            type="button"
            class="dev-btn dev-danger"
            onClick={() => {
              stop.current = true;
            }}
          >
            Stop
          </button>
        )}
      </div>
      {running && progress !== null && (
        <p class="dev-status" role="status">
          {progress.line}
        </p>
      )}
      {outcome !== null && (
        <p class={outcome.ok ? 'dev-ok' : 'dev-problem'} role="status">
          {outcome.text}
        </p>
      )}
      {rows !== null && <DataTable class="dev-clock" rows={rows} />}
      <p class="dev-hint">
        Makes the eight bots first if they are not there yet (and moves the clock to the next
        Monday), then plays one game day after another. Each day takes a few seconds. Stop ends it
        after the call in progress. Start from Valley fresh for a clean month.
      </p>
    </form>
  );
}
