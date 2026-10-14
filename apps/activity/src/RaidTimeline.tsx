import { useState } from 'preact/hooks';
import type { FinaleWindow } from './live';
import type { PhaseResultView, RaidPhaseId, RaidView } from './raid-api';
import { nowAction, type NowTarget } from './raid-now';
import { scheduleSteps } from './raid-time';
import { stepMarks, toggleMark } from './raid-timeline';

/**
 * The top of the Raid tab: the week as four steps (Preparation, Phase 1, Phase 2, Finale), the one
 * thing to do now, and ticks on the phases that have been fought. A tap on a tick opens that
 * phase's short result; the full after-action card waits until the finale is over.
 */
export function RaidTimeline({
  view,
  serverNow,
  finale,
  onAct,
  onReplay,
}: {
  view: RaidView;
  serverNow: number;
  finale: FinaleWindow;
  /** The player tapped the "what to do now" button. */
  onAct: (target: NowTarget) => void;
  onReplay: (phase: RaidPhaseId) => void;
}) {
  const [open, setOpen] = useState<RaidPhaseId | null>(null);
  const steps = scheduleSteps(view.schedule, view.next, view.timezone);
  const action = nowAction(view, finale, serverNow);
  const results = view.party?.results ?? [];
  const marks = stepMarks(results);
  const opened: PhaseResultView | undefined = results.find((r) => r.phase === open);
  const openedMark = opened === undefined ? undefined : marks[opened.phase];
  return (
    <section class="raid-section raid-timeline" aria-labelledby="raid-schedule-heading">
      <h3 id="raid-schedule-heading">This week</h3>
      <div class={`now-action now-${action.kind}`}>
        {action.target === null ? (
          <p class="now-text" role="status" aria-live="off">
            <strong class="pix">{action.label}</strong>
          </p>
        ) : (
          <button
            type="button"
            class="primary now-button"
            onClick={() => {
              onAct(action.target ?? 'placement');
            }}
          >
            {action.label}
          </button>
        )}
        {action.detail !== null && <p class="muted small now-detail">{action.detail}</p>}
      </div>
      <ol class="schedule">
        {steps.map((step) => {
          const mark = marks[step.event];
          return (
            <li
              key={step.event}
              class={`schedule-step ${step.state}`}
              aria-current={step.state === 'now' ? 'step' : undefined}
            >
              <span class="schedule-title">{step.title}</span>
              <span class="schedule-when">
                {step.until === null ? step.when : `${step.when} to ${step.until}`}
              </span>
              {mark !== undefined && (
                <button
                  type="button"
                  class={mark.cleared ? 'step-mark cleared' : 'step-mark missed'}
                  aria-label={mark.label}
                  aria-expanded={open === mark.phase}
                  onClick={() => {
                    setOpen((current) => toggleMark(current, mark.phase));
                  }}
                >
                  <span aria-hidden="true">{mark.glyph}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {openedMark !== undefined && opened !== undefined && (
        <p class="schedule-result" role="status">
          <span>{openedMark.summary}</span>{' '}
          <button
            type="button"
            class="link-button"
            onClick={() => {
              onReplay(opened.phase);
            }}
          >
            Watch replay
          </button>
        </p>
      )}
    </section>
  );
}
