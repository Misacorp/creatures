import { elementName } from './game';
import type { RaidView } from './raid-api';
import { countdownText, scheduleSteps } from './raid-time';
import { gimmickLines, turnOrderShort, turnOrderText } from './raid-text';

export function BossCard({ view }: { view: RaidView }) {
  const { boss } = view;
  const gimmicks = gimmickLines(boss.id, boss.gimmicks);
  const adaptation = view.party?.adaptation ?? null;
  const hp = view.party?.bossHp ?? null;
  return (
    <section class="raid-section" aria-labelledby="raid-boss-name">
      <h3 id="raid-boss-name">{boss.name}</h3>
      <p class="tags">
        <span class="tag">{elementName(boss.element)}</span>
        <span class="tag">{turnOrderShort(boss.turnOrder)}</span>
      </p>
      <p>{turnOrderText(boss.turnOrder)}</p>
      {gimmicks.length > 0 && (
        <>
          <h4>Tricks</h4>
          <ul class="plain-list">
            {gimmicks.map((g) => (
              <li key={g.id}>
                <strong>{g.name}</strong>
                {g.text !== '' && <> {g.text}</>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Phase 2 counter-move</h4>
      {adaptation === null ? (
        <p class="muted">The boss shows its counter-move after Phase 1.</p>
      ) : (
        <p>{adaptation.description}</p>
      )}
      {hp !== null && (
        <p>
          <label for="raid-boss-hp">
            Boss HP this week: {hp.current} / {hp.max}
          </label>
          <progress id="raid-boss-hp" class="hp-bar" max={hp.max} value={hp.current} />
        </p>
      )}
    </section>
  );
}

export function ScheduleStrip({ view, serverNow }: { view: RaidView; serverNow: number }) {
  const steps = scheduleSteps(view.schedule, view.next, view.timezone);
  return (
    <section class="raid-section" aria-labelledby="raid-schedule-heading">
      <h3 id="raid-schedule-heading">This week</h3>
      <ol class="schedule">
        {steps.map((step) => (
          <li
            key={step.event}
            class={`schedule-step ${step.state}`}
            aria-current={step.state === 'next' ? 'step' : undefined}
          >
            <span class="schedule-title">{step.title}</span>
            <span class="schedule-when">{step.when}</span>
          </li>
        ))}
      </ol>
      <p aria-live="off">{countdownText(view.next, serverNow)}</p>
      <p class="muted">Times are in {view.timezone}.</p>
    </section>
  );
}

export function Roster({
  view,
  busy,
  onOptOut,
}: {
  view: RaidView;
  busy: boolean;
  onOptOut: (optOut: boolean) => void;
}) {
  const { you } = view;
  return (
    <section class="raid-section" aria-labelledby="raid-roster-heading">
      <h3 id="raid-roster-heading">Who is in this week ({view.roster.length})</h3>
      {view.roster.length === 0 ? (
        <p class="muted">Nobody yet.</p>
      ) : (
        <ul class="roster">
          {view.roster.map((entry, index) => (
            <li key={index} class={entry.you ? 'roster-entry you' : 'roster-entry'}>
              {entry.displayName}
              {entry.you && <span class="badge you-badge">you</span>}
              {view.parties.length > 1 && <span class="muted"> party {entry.party}</span>}
            </li>
          ))}
        </ul>
      )}
      {!you.inRoster && !you.optOut && (
        <p class="muted">
          You are not on this week&apos;s roster. Pick a starter and open the game to join.
        </p>
      )}
      {you.canOptOut && (
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onOptOut(!you.optOut);
            }}
          >
            {you.optOut ? "Join this week's raid" : 'Sit this week out'}
          </button>
        </p>
      )}
      {you.optOut && <p class="muted">You are sitting this week out.</p>}
    </section>
  );
}
