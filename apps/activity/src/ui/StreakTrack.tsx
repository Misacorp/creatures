import { glyphOrUnknown } from '../glyphs';
import type { StreakPip } from '../dungeon-text';
import { Sprite } from '../sprites/Sprite';

interface StreakTrackProps {
  /** The days of the streak's cycle, from `streakPips`: lit up to today, the reward days marked. */
  pips: readonly StreakPip[];
  /** What a screen reader says for the whole row. */
  label: string;
}

/**
 * The daily streak as a row of days, a little bigger than a pip row: each day a square, lit up to
 * today's count, and a small gift under each reward day (the 3rd and 7th pay a bonus). The row is one
 * picture for assistive technology, described by `label`.
 */
export function StreakTrack({ pips, label }: StreakTrackProps) {
  return (
    <div class="streak-track" role="img" aria-label={label}>
      {pips.map((pip) => (
        <span key={pip.day} class={`streak-day${pip.on ? ' on' : ''}${pip.bonus ? ' bonus' : ''}`}>
          <i />
          <span class="streak-gift">
            {pip.bonus && <Sprite sprite={glyphOrUnknown('gift')} scale={2} />}
          </span>
        </span>
      ))}
    </div>
  );
}
