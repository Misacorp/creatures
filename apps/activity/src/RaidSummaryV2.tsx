/**
 * The raid summary of a combat v2 stage (the card in the Raid tab's Results list and the finale's reveal on a v2 week): the boss and how
 * far its HP came down, every player on a scoreboard (damage and creatures knocked out), the reactions, what the stage paid. The same frame,
 * rewards and buttons as the shipped card (`RaidSummaryCard`), over the lean numbers of a v2 stage (`StatsV2`). Names are player text:
 * drawn as text only. It only states what happened.
 */
import { removedPercent } from './fight-v2';
import type { StatsV2 } from './fight-v2-api';
import { grouped, type SummaryRewards } from './raid-summary-view';
import { Rewards, SectionHead, SummaryActions } from './RaidSummaryParts';
import { SummaryFrame, type SummaryMode } from './RaidSummaryCard';
import { phaseName } from './raid-text';
import { compactPair } from './number-format';
import { stageTicks } from './BossCardV2';
import { bossSprite, creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Sprite } from './sprites/Sprite';
import { Accordion } from './ui/Accordion';
import { DataTable, type DataRow } from './ui/DataTable';
import { OutcomeBadge } from './ui/RevealShell';
import { SegmentBar } from './ui/SegmentBar';
import { Tag } from './ui/Tag';
import type { RaidPhaseId } from './raid-api';

/** The raid view's name of a v2 stage (`phase1` is stage 1, as `parseRaidView` renames it). */
const PHASE_OF: Record<StatsV2['phase'], RaidPhaseId> = {
  stage1: 'phase1',
  stage2: 'phase2',
  finale: 'finale',
};

/** The title of a v2 stage's card: "Stage 1 result", "Finale result". */
export const stageTitle = (stats: Pick<StatsV2, 'phase'>): string =>
  `${phaseName(PHASE_OF[stats.phase], 2)} result`;

/** The scoreboard's rows: every player by damage, the caller's marked, then the raid's total. */
export function scoreRowsV2(stats: Pick<StatsV2, 'players'>): DataRow[] {
  const sorted = [...stats.players].sort((a, b) => b.damage - a.damage);
  const rows: DataRow[] = sorted.map((p, k) => ({
    label: (
      <>
        <span class={k < 3 ? 'rs-rank top' : 'rs-rank'}>{k + 1}</span>
        <span class="rs-name">{p.you ? 'You' : p.displayName}</span>
      </>
    ),
    value: grouped(p.damage),
    extra: String(p.knockouts),
    mine: p.you,
  }));
  rows.push({
    label: <span class="rs-name">Raid total</span>,
    value: grouped(sorted.reduce((sum, p) => sum + p.damage, 0)),
    extra: String(sorted.reduce((sum, p) => sum + p.knockouts, 0)),
    total: true,
  });
  return rows;
}

/** One line on how the stage went: the boss fell, or how much of its HP came off. Plain text. */
export function heroLineV2(stats: Pick<StatsV2, 'kill' | 'boss' | 'rounds'>): string {
  const { boss } = stats;
  if (stats.kill) return `${boss.name} fell in round ${String(stats.rounds)}.`;
  const removed = removedPercent(boss.hpMax, boss.hpStart, boss.hpEnd);
  return `${String(removed)}% of the boss's HP came off this stage.`;
}

/** The raid summary of one v2 stage, drawn from its numbers. */
export function RaidSummaryCardV2({
  stats,
  rewards,
  mode,
  id,
  onReplay,
  onDismiss,
  busy = false,
}: {
  stats: StatsV2;
  rewards: SummaryRewards;
  mode: SummaryMode;
  /** The title's id; one per card on the page. */
  id: string;
  /** Shows "Watch" when given. */
  onReplay?: (() => void) | undefined;
  /** Shows "Got it" when given. */
  onDismiss?: (() => void) | undefined;
  busy?: boolean;
}) {
  const { boss } = stats;
  const sprite = bossSprite(boss.id);
  return (
    <SummaryFrame
      mode={mode}
      id={id}
      title={stageTitle(stats)}
      badge={<OutcomeBadge cleared={stats.cleared} />}
      footer={
        <SummaryActions
          onReplay={onReplay}
          onDismiss={onDismiss}
          busy={busy}
          watchLabel="Watch"
        />
      }
    >
      <div class="rs">
        <div class="rs-hero">
          {sprite !== undefined && (
            <div class="rs-hero-art" aria-hidden="true">
              <Sprite sprite={sprite} scale={4} />
            </div>
          )}
          <p class={stats.kill ? 'rs-hero-title' : 'rs-hero-title held'}>{boss.name}</p>
          <p class="rs-hero-line prose">{heroLineV2(stats)}</p>
          <SegmentBar
            size="boss"
            current={boss.hpEnd}
            max={boss.hpMax}
            ticks={stageTicks()}
            label={`${boss.name} HP left: ${String(boss.hpEnd)} / ${String(boss.hpMax)}`}
            text={boss.hpEnd === 0 ? 'Down' : compactPair(boss.hpEnd, boss.hpMax)}
          />
          <p class="rs-yours">
            <Tag kind="chip">{`${grouped(stats.reactions.total)} reactions`}</Tag>
            <Tag kind="chip">{`${grouped(stats.knockouts)} knocked out`}</Tag>
          </p>
        </div>

        <SectionHead>Scoreboard</SectionHead>
        <DataTable
          rows={scoreRowsV2(stats)}
          tabular
          headings={{ label: 'Player', value: 'Damage', extra: 'Out' }}
          label="Scoreboard"
        />

        <SectionHead>Your rewards</SectionHead>
        <Rewards rewards={rewards} />

        <Accordion title="More numbers" variant="compact">
          <div class="rs-more">
            <Accordion title="Creatures" meta={String(stats.creatures.length)} variant="compact">
              <DataTable
                tabular
                headings={{ label: 'Creature', value: 'Damage', extra: 'HP left' }}
                label="Creatures"
                rows={[...stats.creatures]
                  .sort((a, b) => b.damage - a.damage)
                  .map((c) => ({
                    label: (
                      <span class="rs-creature-name">
                        <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                        <span class="rs-stack">
                          <span class="rs-name">{c.name}</span>
                          <span class="rs-share">{c.you ? 'You' : (c.owner ?? 'Guest')}</span>
                        </span>
                      </span>
                    ),
                    value: grouped(c.damage),
                    extra: c.out ? 'Out' : `${String(c.hp)} / ${String(c.maxHp)}`,
                    mine: c.you,
                  }))}
              />
            </Accordion>
            <Accordion title="The fight" variant="compact">
              <DataTable
                tabular
                rows={[
                  { label: 'Rounds', value: String(stats.rounds) },
                  { label: 'Blocked hits', value: String(stats.blocked) },
                  { label: 'Dodges', value: String(stats.dodges) },
                  { label: 'Hits taken for others', value: String(stats.intercepts) },
                  { label: 'Healed', value: grouped(stats.healed) },
                ]}
              />
            </Accordion>
          </div>
        </Accordion>
      </div>
    </SummaryFrame>
  );
}
