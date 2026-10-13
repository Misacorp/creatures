import { useState } from 'preact/hooks';
import type { RaidView } from './raid-api';
import { avatarStrip, rosterCountText, rosterNote } from './raid-roster';

/**
 * Who is in this week, as a strip of small avatar tiles (each player's initial, in the colour their
 * creatures have in the party row) with the count. A tap opens the names. Names are other players'
 * text and are only ever rendered as text. The opt-out controls stay here, as the server allows.
 */
export function RosterStrip({
  view,
  busy,
  onOptOut,
}: {
  view: RaidView;
  busy: boolean;
  onOptOut: (optOut: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { you } = view;
  const { shown, extra } = avatarStrip(view.roster);
  return (
    <section class="raid-section roster-strip" aria-label="Who is in this week">
      <button
        type="button"
        class="avatar-strip"
        aria-expanded={open}
        aria-controls="raid-roster-list"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span class="avatars" aria-hidden="true">
          {shown.map((a, index) => (
            <span
              key={index}
              class={
                a.you ? `avatar owner-${String(a.colour)} you` : `avatar owner-${String(a.colour)}`
              }
            >
              {a.initial}
            </span>
          ))}
          {extra > 0 && <span class="avatar more">+{extra}</span>}
        </span>
        <span class="roster-count">{rosterCountText(view.roster.length)}</span>
        <span class="roster-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div id="raid-roster-list" class="roster-open">
          {view.roster.length > 0 && (
            <ul class="roster">
              {view.roster.map((entry, index) => {
                const note = rosterNote(entry, view.parties);
                return (
                  <li key={index} class={entry.you ? 'roster-entry you' : 'roster-entry'}>
                    {entry.displayName}
                    {note !== '' && <span class="muted"> ({note})</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {you.canOptOut && !you.optOut && (
            <p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onOptOut(true);
                }}
              >
                Sit this week out
              </button>
            </p>
          )}
        </div>
      )}
      {!you.inRoster && !you.optOut && (
        <p class="muted">
          You are not on this week&apos;s roster. Pick a starter and open the game to join.
        </p>
      )}
      {you.optOut && (
        <p class="muted">
          You are sitting this week out.{' '}
          {you.canOptOut && (
            <button
              type="button"
              class="link-button"
              disabled={busy}
              onClick={() => {
                onOptOut(false);
              }}
            >
              Join this week&apos;s raid
            </button>
          )}
        </p>
      )}
    </section>
  );
}
