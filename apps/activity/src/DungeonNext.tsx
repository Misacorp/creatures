import { DepthProgress } from './DepthProgress';
import { GlossaryTag } from './Glossary';
import { useServerNow } from './hooks';
import { streakPips } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { StreakTrack } from './ui/StreakTrack';
import { formatCountdown, formatZoned } from './time-format';

/** What a screen reader says for the streak row. */
function streakLabel(streak: number): string {
  const pips = streakPips(streak);
  const lit = pips.filter((p) => p.on).length;
  const rewards = pips
    .filter((p) => p.bonus)
    .map((p) => String(p.day))
    .join(' and ');
  return `Streak: ${String(lit)} / ${String(pips.length)} days of the cycle. Days ${rewards} pay a reward.`;
}

/**
 * The end of the report answers "what is next?": the depth now (after this run) and the way to the
 * next landmark, the streak with its reward days, and the time the day resets (in the guild's timezone,
 * which the line does not name: the countdown after it says when) with that countdown. Everything is read
 * from the server's state.
 */
export function DungeonNext({ today, offset }: { today: DungeonToday; offset: number }) {
  const serverNow = useServerNow(offset, true);
  const remaining = today.resetsAt - serverNow;
  return (
    <section class="dungeon-next" aria-labelledby="dungeon-next-heading">
      <h4 id="dungeon-next-heading">Next run</h4>
      <DepthProgress depth={today.depth} />
      <div class="dungeon-streak">
        <h5 class="dungeon-streak-title">
          Streak <GlossaryTag entry="streak" look="help" />
        </h5>
        <StreakTrack pips={streakPips(today.streak)} label={streakLabel(today.streak)} />
        <p class="dungeon-streak-reset">
          Resets at {formatZoned(today.resetsAt, today.timezone, 'short')}, in{' '}
          {formatCountdown(remaining, 'days')}.
        </p>
      </div>
    </section>
  );
}
