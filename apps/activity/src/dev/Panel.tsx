/**
 * The staging-only debug panel: a small "DEV" button and a drawer with the dev tools of
 * `docs/design/dev-tools.md`. This module (with `dev.css` and everything else in `src/dev/`) is loaded
 * lazily by `dev-gate.ts` and is not part of the production build.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DevPanelProps } from '../dev-gate';
import { creatureName } from '../game';
import {
  clockRows,
  describeResult,
  errorSentence,
  eventLine,
  fetchDevEvents,
  fetchDevState,
  runTool,
  type DevStateView,
} from './dev-api';
import './dev.css';
import { openExternalLink } from '../external-link';
import { resetLocalFlags } from './flags';
import type { CreatureChoice, ToolSpec } from './forms';
import { CLOCK_SPECS, GOODS_SPECS, RESET_ACCOUNT_SPEC, orderedSections } from './specs';
import { ToolForm } from './ToolForm';
import { WORKBENCH_URL } from './workbench-link';
import { Accordion } from '../ui/Accordion';
import { DataTable } from '../ui/DataTable';

/** A string only this module tree contains: the production build test searches the output for it. */
const DEV_PANEL_MARKER = 'DEV_PANEL_MARKER_7f3a';

interface Status {
  ok: boolean;
  text: string;
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <Accordion title={title} variant="compact" class="dev-section" open={open} onToggle={onToggle}>
      <div class="dev-section-body">{children}</div>
    </Accordion>
  );
}

/** The link to the component workbench: opened through Discord when inside it, else shown to copy. */
function WorkbenchLink({ onStatus }: { onStatus: (status: Status) => void }): JSX.Element {
  return (
    <div class="dev-workbench">
      <p class="dev-hint">
        Every reusable piece of the game on one page, with controls and a feedback button. It opens
        in your browser, no sign-in.
      </p>
      <p class="dev-url">{WORKBENCH_URL}</p>
      <div class="dev-quick-row">
        <button
          type="button"
          class="dev-btn"
          onClick={() => {
            void openExternalLink(WORKBENCH_URL).then((ok) => {
              onStatus(
                ok
                  ? { ok: true, text: 'Component workbench: link opened' }
                  : { ok: false, text: 'Component workbench: could not open it, copy the address' },
              );
            });
          }}
        >
          Open
        </button>
        <button
          type="button"
          class="dev-btn"
          onClick={() => {
            navigator.clipboard.writeText(WORKBENCH_URL).then(
              () => {
                onStatus({ ok: true, text: 'Component workbench: address copied' });
              },
              () => {
                onStatus({
                  ok: false,
                  text: 'Component workbench: could not copy, select the address',
                });
              },
            );
          }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}

function ClockStatus({ view }: { view: DevStateView | null }): JSX.Element {
  if (view === null) return <p class="dev-hint">Loading the clock...</p>;
  return <DataTable class="dev-clock" rows={clockRows(view)} />;
}

export default function DevPanel({ tab, creatures, onChanged }: DevPanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DevStateView | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<string[] | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);

  const choices = useMemo<CreatureChoice[]>(
    () => creatures.map((c) => ({ id: c.id, label: `${creatureName(c)} (Lv ${String(c.level)})` })),
    [creatures],
  );

  const reloadView = (): void => {
    void fetchDevState().then(setView);
  };
  const loadEvents = (): void => {
    void fetchDevEvents().then((list) => {
      if (list === null) setStatus({ ok: false, text: 'Could not load the events' });
      else setEvents(list.map(eventLine));
    });
  };

  useEffect(() => {
    if (open) reloadView();
  }, [open]);
  // A new tab opens its own section first and folds the rest again.
  useEffect(() => {
    setOpened({});
  }, [tab]);

  const run = (spec: ToolSpec, body: Record<string, unknown>): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    void runTool(spec.tool, body).then((outcome) => {
      inFlight.current = false;
      setBusy(false);
      if (!outcome.ok) {
        setStatus({ ok: false, text: `${spec.label}: ${errorSentence(outcome.error)}` });
        return;
      }
      setStatus({ ok: true, text: `${spec.label}: ${describeResult(outcome.result)}` });
      reloadView();
      if (spec.tool === 'analytics-rollup' && events !== null) loadEvents();
      onChanged();
    });
  };

  const forms = (specs: readonly ToolSpec[]): JSX.Element => (
    <>
      <div class="dev-quick-row">
        {specs
          .filter((s) => s.fields.length === 0)
          .map((s) => (
            <ToolForm
              key={`${s.tool}:${s.label}`}
              spec={s}
              choices={choices}
              busy={busy}
              onRun={run}
            />
          ))}
      </div>
      {specs
        .filter((s) => s.fields.length > 0)
        .map((s) => (
          <ToolForm
            key={`${s.tool}:${s.label}`}
            spec={s}
            choices={choices}
            busy={busy}
            onRun={run}
          />
        ))}
    </>
  );

  const sectionOpen = (id: string, fallback: boolean): boolean => opened[id] ?? fallback;
  const toggle = (id: string) => (isOpen: boolean) => {
    setOpened((prev) => (prev[id] === isOpen ? prev : { ...prev, [id]: isOpen }));
  };

  return (
    <div data-dev-panel={DEV_PANEL_MARKER}>
      <button
        type="button"
        class="dev-fab"
        aria-expanded={open}
        aria-controls="dev-drawer"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        DEV
      </button>
      {open && (
        <div class="dev-drawer" id="dev-drawer" role="region" aria-label="Dev tools">
          <header class="dev-head">
            <h2>Dev tools (staging)</h2>
            <button
              type="button"
              class="dev-close"
              onClick={() => {
                setOpen(false);
              }}
            >
              Close
            </button>
          </header>
          {status !== null && (
            <p class={status.ok ? 'dev-status dev-ok' : 'dev-status dev-bad'} role="status">
              {status.ok ? 'OK ' : 'Error '}
              {status.text}
            </p>
          )}
          <div class="dev-scroll">
            <Section title="Dev clock" open={sectionOpen('clock', true)} onToggle={toggle('clock')}>
              <ClockStatus view={view} />
              {forms(CLOCK_SPECS)}
            </Section>
            <Section
              title="Bait, parts, supplies, blueprints"
              open={sectionOpen('goods', false)}
              onToggle={toggle('goods')}
            >
              {forms(GOODS_SPECS)}
            </Section>
            <Section
              title="This browser and my account"
              open={sectionOpen('account', false)}
              onToggle={toggle('account')}
            >
              <div class="dev-quick-row">
                <button
                  type="button"
                  class="dev-btn"
                  onClick={() => {
                    const removed = resetLocalFlags();
                    setStatus({
                      ok: true,
                      text: `Reset local flags: ${String(removed)} removed (coach marks, slot-wipe notice)`,
                    });
                    onChanged();
                  }}
                >
                  Reset local flags
                </button>
              </div>
              <ToolForm spec={RESET_ACCOUNT_SPEC} choices={choices} busy={busy} onRun={run} />
            </Section>
            <Section
              title="Component workbench"
              open={sectionOpen('workbench', false)}
              onToggle={toggle('workbench')}
            >
              <WorkbenchLink onStatus={setStatus} />
            </Section>
            {orderedSections(tab).map((section) => (
              <Section
                key={section.id}
                title={section.title}
                open={sectionOpen(section.id, section.tab === tab)}
                onToggle={toggle(section.id)}
              >
                {forms(section.specs)}
                {section.id === 'analytics' && (
                  <div class="dev-events">
                    <button type="button" class="dev-btn" onClick={loadEvents}>
                      Show last 50 events
                    </button>
                    {events !== null && (
                      <ol class="dev-event-list">
                        {events.length === 0 && <li>No events yet</li>}
                        {events.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </Section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
