/**
 * One stage of a combat v2 week in the Raid tab's Results list: a compact row ("Stage 1 · 38% of its HP · Cleared") with Watch beside it.
 * It is the game's one expand and collapse (`ui/Accordion`): a tap on the row opens that stage's full card (`RaidSummary`, which asks for
 * the stage's numbers only when it opens), the way the shipped summary opens. Watch opens the stage on the v2 stage view. Names are text.
 */
import type { ComponentChildren } from 'preact';
import { removedPercent } from './fight-v2';
import { finaleProgress } from './raid-progress';
import type { PhaseResultView, RaidView } from './raid-api';
import { phaseName } from './raid-text';
import { summaryBoss } from './raid-summary-view';
import { RaidSummary } from './RaidSummary';
import { Accordion } from './ui/Accordion';

/** The row's words: the stage, how much of the boss's HP came off (or that it fell) and whether the stage was cleared. */
export function stageRowText(result: PhaseResultView): string {
  const fell = result.bossHpEnd <= 0;
  const removed = removedPercent(result.bossHpMax, result.bossHpStart, result.bossHpEnd);
  return [
    phaseName(result.phase, 2),
    fell ? 'Boss fell' : `${String(removed)}% of its HP`,
    result.cleared ? 'Cleared' : 'Not cleared',
  ].join(' · ');
}

export function StageResultRow({
  result,
  week,
  party,
  view,
  onReplay,
  body,
  defaultOpen = false,
}: {
  result: PhaseResultView;
  week: string;
  party: number;
  view: RaidView;
  onReplay: () => void;
  /** The card that opens (the workbench passes one drawn from a fight's own numbers); absent: the game's, which asks the server. */
  body?: ComponentChildren;
  /** Start with the card open (the workbench). */
  defaultOpen?: boolean;
}) {
  const name = phaseName(result.phase, 2);
  return (
    <li class="card-item stage-result">
      <Accordion
        title={stageRowText(result)}
        variant="compact"
        defaultOpen={defaultOpen}
        label={`${name}: open the result`}
      >
        {body ?? (
          <RaidSummary
            week={week}
            party={party}
            phase={result.phase}
            cleared={result.cleared}
            rules={2}
            mode="result"
            boss={summaryBoss(view, week)}
            paid={{
              essence: result.essence,
              festivalGrant: result.festivalGrant,
              rankChange: result.rankChange,
              progress: finaleProgress(
                { week, rankChange: result.rankChange },
                { weekId: view.weekId, season: view.season },
              ),
            }}
          />
        )}
      </Accordion>
      <button type="button" class="stage-watch" aria-label={`Watch ${name}`} onClick={onReplay}>
        Watch
      </button>
    </li>
  );
}
