import { useState } from 'preact/hooks';
import { COACH_TEXT, coachDismissed, dismissCoach } from './coach';
import { RoleChip } from './sprites/ElementChip';
import { Tag } from './ui/Tag';

/**
 * The one-time hint on the Raid tab. Shown until the player dismisses it (a flag in
 * `localStorage`; if storage is unavailable it still works and stays hidden for the session).
 * The two sample tags are real, so the hint can be tried on the spot.
 */
export function CoachMark() {
  const [visible, setVisible] = useState(() => !coachDismissed());
  if (!visible) return null;
  return (
    <aside class="coach" aria-label="Tip">
      <p class="coach-text">{COACH_TEXT}</p>
      <p class="coach-try">
        Try it: <RoleChip role="setter" />{' '}
        <Tag tone="rank" entry="boss-rank">
          Rank
        </Tag>
      </p>
      <button
        type="button"
        onClick={() => {
          dismissCoach();
          setVisible(false);
        }}
      >
        Got it
      </button>
    </aside>
  );
}
