import { GlossaryTag } from './Glossary';
import { useNow } from './hooks';
import { StreakPips } from './DungeonPrerun';
import { streakLine } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { formatEventTime, formatLongCountdown } from './raid-time';

/**
 * The end of the report answers "when can I go again?": the streak with its pips, and the time the
 * day resets (in the guild's timezone) with a countdown. Everything is read from the server's state.
 */
export function DungeonNext({ today, offset }: { today: DungeonToday; offset: number }) {
  const now = useNow(true);
  const remaining = today.resetsAt - (now + offset);
  return (
    <section class="dungeon-next" aria-labelledby="dungeon-next-heading">
      <h4 id="dungeon-next-heading">Next run</h4>
      <div class="dungeon-streak">
        <GlossaryTag entry="streak">Streak</GlossaryTag>
        <StreakPips streak={today.streak} plain />
        <span class="muted">{streakLine(today.streak)}</span>
      </div>
      <p class="muted">
        Resets at {formatEventTime(today.resetsAt, today.timezone)} ({today.timezone}), in{' '}
        {formatLongCountdown(remaining)}.
      </p>
    </section>
  );
}
