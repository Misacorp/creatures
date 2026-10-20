/**
 * The raid summary: the card after a raid stage and after the Sunday finale (Misa chose it on
 * 2026-10-19 and 2026-10-20: the scoreboard first, with the boss's moment on top). From the top: the
 * title with the Cleared / Not cleared badge on one line, the boss and how it ended (its HP bar, your
 * place, and its attack order and moves as tappable icons), every player in a scoreboard with column
 * headings, three highlights, your rewards, and the old lists folded under "More numbers".
 *
 * This is the drawing only: it takes the numbers it shows (`SummaryInput`), so the workbench can show it
 * with sample data. `RaidSummary` fetches them for the game.
 */
import type { ComponentChildren } from 'preact';
import { BossIconList } from './BossIcons';
import { hpLeftText } from './after-action';
import { compactPair } from './number-format';
import {
  grouped,
  heroHeadline,
  heroLine,
  pickHighlights,
  scoreboard,
  summaryTitle,
  yourPlace,
  type SummaryInput,
} from './raid-summary-view';
import {
  HighlightCards,
  MoreNumbers,
  Rewards,
  ScoreTable,
  SectionHead,
  SummaryActions,
} from './RaidSummaryParts';
import { bossSprite } from './sprites/creature-sprites';
import { Sprite } from './sprites/Sprite';
import { OutcomeBadge, RevealShell } from './ui/RevealShell';
import { SegmentBar } from './ui/SegmentBar';
import { Tag } from './ui/Tag';

/**
 * Where the card sits. `reveal`: the finale's result card at the top of the Raid tab or the live view,
 * a gold-framed card with a "Got it". `result`: the card of a stage in the Raid tab's Results list, inside
 * its own list item, with no "Got it".
 */
export type SummaryMode = 'reveal' | 'result';

/** "Close one!" as a gold tag, only when the server says so. */
function CloseTag({ close }: { close: boolean }) {
  return close ? (
    <Tag kind="badge" tone="first">
      Close one!
    </Tag>
  ) : null;
}

/**
 * The frame of a summary: the title and badge (centred on one line, whatever the badge's height), the
 * content and the buttons. A reveal is the shared `RevealShell`; a result is a quiet panel of its own.
 */
export function SummaryFrame({
  mode,
  id,
  title,
  badge,
  footer,
  children,
}: {
  mode: SummaryMode;
  id: string;
  title: string;
  badge?: ComponentChildren;
  footer?: ComponentChildren;
  children: ComponentChildren;
}) {
  if (mode === 'reveal') {
    return (
      <RevealShell id={id} pix status title={title} badge={badge} footer={footer ?? <></>}>
        {children}
      </RevealShell>
    );
  }
  return (
    <section class="rs-embed pix-panel" aria-labelledby={id}>
      <h4 id={id}>
        {title}
        {badge !== undefined && <> {badge}</>}
      </h4>
      {children}
      {footer}
    </section>
  );
}

/** The boss and how the stage ended: its picture, a headline, the HP bar, your place, and its moves. */
function Hero({ input }: { input: SummaryInput }) {
  const { stats, boss } = input;
  const sprite = boss === null ? undefined : bossSprite(boss.id);
  const place = yourPlace(stats);
  return (
    <div class="rs-hero">
      {sprite !== undefined && (
        <div class="rs-hero-art" aria-hidden="true">
          <Sprite sprite={sprite} scale={4} />
        </div>
      )}
      <p class={stats.outcome === 'cleared' ? 'rs-hero-title' : 'rs-hero-title held'}>
        {heroHeadline(input)}
      </p>
      <p class="rs-hero-line prose">{heroLine(stats)}</p>
      <SegmentBar
        size="boss"
        current={stats.boss.hpEnd}
        max={stats.boss.hpMax}
        label={hpLeftText(stats.boss)}
        text={stats.boss.hpEnd === 0 ? 'Down' : compactPair(stats.boss.hpEnd, stats.boss.hpMax)}
      />
      {place !== null && (
        <p class="rs-yours">
          <Tag kind="chip">{`Place ${String(place.row.rank)} / ${String(place.of)}`}</Tag>
          <Tag kind="chip">{`${grouped(place.row.damage)} damage`}</Tag>
        </p>
      )}
      {boss !== null && boss.turnOrder !== null && (
        <BossIconList
          boss={{ id: boss.id, turnOrder: boss.turnOrder, gimmicks: boss.gimmicks }}
          effectiveRank={boss.effectiveRank}
        />
      )}
    </div>
  );
}

/** The raid summary, drawn from the numbers in `input`. */
export function RaidSummaryCard({
  input,
  mode,
  id,
  onReplay,
  onDismiss,
  busy = false,
  detailsOpen = false,
}: {
  input: SummaryInput;
  mode: SummaryMode;
  /** The title's id (the card is named by it); one per card on the page. */
  id: string;
  /** Shows "Watch replay" when given. */
  onReplay?: (() => void) | undefined;
  /** Shows "Got it" when given. */
  onDismiss?: (() => void) | undefined;
  busy?: boolean;
  /** Open every folded table (a workbench review of what is inside them). */
  detailsOpen?: boolean;
}) {
  const { stats, rewards } = input;
  return (
    <SummaryFrame
      mode={mode}
      id={id}
      title={summaryTitle(stats)}
      badge={
        <>
          <OutcomeBadge cleared={stats.outcome === 'cleared'} /> <CloseTag close={stats.close} />
        </>
      }
      footer={<SummaryActions onReplay={onReplay} onDismiss={onDismiss} busy={busy} />}
    >
      <div class="rs">
        <Hero input={input} />

        <SectionHead note="damage, share of the raid">Scoreboard</SectionHead>
        <ScoreTable rows={scoreboard(stats)} total />

        <SectionHead>Highlights</SectionHead>
        <HighlightCards
          items={pickHighlights(stats, 3, ['hardest-hitter', 'star-creature', 'backbone'])}
        />

        <SectionHead>Your rewards</SectionHead>
        <Rewards rewards={rewards} />

        <MoreNumbers stats={stats} open={detailsOpen} />
      </div>
    </SummaryFrame>
  );
}
