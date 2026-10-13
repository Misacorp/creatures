import type { RaidView } from './raid-api';

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
