import { GlossaryTag } from './Glossary';
import type { RaidView } from './raid-api';
import { seasonPips, seasonText } from './raid-progress';

/**
 * The five weeks of the season as pips, with "Week 3 / 5 this season" under them (a link to the
 * glossary entry); the Festival is the last pip. It sits in the Raid tab's "This week" section.
 * Nothing when the week is not part of a season.
 */
export function SeasonPips({ season }: { season: RaidView['season'] }) {
  const pips = seasonPips(season);
  const text = seasonText(season);
  if (pips.length === 0 || text === null) return null;
  return (
    <div class="season">
      <ol class="season-pips" aria-label={text}>
        {pips.map((pip) => (
          <li
            key={pip.week}
            class={`season-pip ${pip.state}${pip.festival ? ' festival' : ''}`}
            aria-current={pip.state === 'now' ? 'step' : undefined}
          >
            <span class="visually-hidden">{pip.label}</span>
          </li>
        ))}
      </ol>
      <p class="muted">
        <GlossaryTag entry="season">{text}</GlossaryTag>
      </p>
    </div>
  );
}
