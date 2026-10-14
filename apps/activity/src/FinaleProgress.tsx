import { GlossaryTag } from './Glossary';
import { ProgressTrack } from './ProgressTrack';
import type { FinaleProgress as Progress } from './raid-progress';
import { PipRow } from './ui/PipRow';

/**
 * What a finale did to the Boss Rank and where the season stands, in the dungeon's visual language:
 * the Rank as the same edge-to-edge track as the depth (this Rank, the next one), and the season as
 * a row of pips, the 5th (the Festival) a gold ring until it is reached. It is under the finale
 * result and its sentence ("The server climbs to Rank 4."). Either part is left out when its facts are not known yet.
 */
export function FinaleProgress({ progress }: { progress: Progress }) {
  const { rank, season } = progress;
  return (
    <section class="finale-progress" aria-label="Boss Rank and season">
      {rank !== null && (
        <div class="finale-rank">
          <ProgressTrack
            steps={rank.steps}
            current={rank.current}
            label="Boss Rank, and the next"
            edge
            labelEntry="boss-rank"
          />
        </div>
      )}
      {season !== null && (
        <div class="finale-season">
          <div class="finale-season-head">
            <GlossaryTag entry="season">Season</GlossaryTag>
            <span class="muted">{season.text}</span>
          </div>
          <PipRow
            count={season.weeks}
            lit={season.week}
            mark={(i) => (i === season.weeks - 1 ? 'fest' : undefined)}
            size="md"
            label={season.label}
          />
        </div>
      )}
    </section>
  );
}
