/**
 * Mock-ups of the raid summary (the result screen after a stage and after the Sunday finale), for Misa
 * to choose from (2026-10-19: the after-action card is "lists and lists of bullet points that are
 * incredibly cursed in their alignment"; wanted: "a scoreboard or stuff like that, maybe a few
 * highlights"). Workbench only: nothing here is drawn by the game. Every variant is fed the same data
 * (`SummaryInput`: the after-action stats and what the stage paid) and shows the same rewards; they
 * differ in what comes first.
 *
 * - `now`: today's card (the finale reveal's text, rewards, and the bullet lists), for comparison.
 * - `A`: the scoreboard first, then three highlight cards.
 * - `B`: one big moment (the boss and how it ended), then a short scoreboard.
 * - `C`: your own raid first (your place, your numbers, your creatures); the server folded away.
 * - `D`: a podium of the top three, the rest as a tight list.
 */
import { AfterActionCard } from './AfterAction';
import { revealSummary } from './live';
import { LootList } from './LootList';
import { FinaleProgress } from './FinaleProgress';
import { hpLeftText, outcomeLine } from './after-action';
import {
  grouped,
  heroHeadline,
  heroLine,
  ordinal,
  pickHighlights,
  scoreboard,
  summaryTitle,
  yourCreatures,
  yourPlace,
  bestCreatureOf,
  highlights,
  type SummaryInput,
} from './raid-summary-view';
import { compactPair } from './number-format';
import { finaleProgress } from './raid-progress';
import { bossSprite } from './sprites/creature-sprites';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { glyphOrUnknown } from './glyphs';
import { Accordion } from './ui/Accordion';
import { DataTable, type DataRow } from './ui/DataTable';
import { GameIcon } from './ui/GameIcon';
import { OutcomeBadge, RevealShell } from './ui/RevealShell';
import { SegmentBar } from './ui/SegmentBar';
import { Tag } from './ui/Tag';
import {
  HighlightCards,
  MoreNumbers,
  Rewards,
  ScoreTable,
  SectionHead,
  SummaryActions,
} from './RaidSummaryParts';

export type SummaryVariant = 'now' | 'A' | 'B' | 'C' | 'D';

interface MockProps {
  variant: SummaryVariant;
  input: SummaryInput;
  /** Open every folded table (to review what is inside them). */
  detailsOpen?: boolean;
}

const noop = (): void => undefined;

/** "Close one!" as a gold tag, only when the server says so. */
function CloseTag({ input }: { input: SummaryInput }) {
  return input.stats.close ? (
    <Tag kind="badge" tone="first">
      Close one!
    </Tag>
  ) : null;
}

/** The raid summary in one of its mock-up variants. */
export function RaidSummaryMock({ variant, input, detailsOpen = false }: MockProps) {
  switch (variant) {
    case 'now':
      return <NowCard input={input} />;
    case 'A':
      return <ScoreboardFirst input={input} detailsOpen={detailsOpen} />;
    case 'B':
      return <HeroMoment input={input} detailsOpen={detailsOpen} />;
    case 'C':
      return <YourRaid input={input} detailsOpen={detailsOpen} />;
    case 'D':
      return <Podium input={input} detailsOpen={detailsOpen} />;
  }
}

// --- Today's card, for comparison ---

/** What the finale reveal and the Raid tab's result card show now: sentences, rewards, then the bullet lists. */
function NowCard({ input }: { input: SummaryInput }) {
  const { stats, rewards } = input;
  const summary = revealSummary({
    cleared: stats.outcome === 'cleared',
    essence: rewards.essence,
    rankChange: rewards.rankChange,
    festivalGrant: rewards.festivalGrant,
    ...(stats.enraged === true ? { enraged: true } : {}),
  });
  const progress = finaleProgress(
    { week: 'wb-week', rankChange: rewards.rankChange },
    rewards.seasonWeek === null
      ? null
      : { weekId: 'wb-week', season: { index: 1, week: rewards.seasonWeek } },
  );
  return (
    <RevealShell
      id="rs-now"
      title={summaryTitle(stats)}
      badge={<OutcomeBadge cleared={stats.outcome === 'cleared'} />}
      onDismiss={noop}
    >
      <p>{summary.outcome}</p>
      <p class="reveal-essence">
        <Sprite sprite={glyphOrUnknown('gem')} scale={2} /> You got{' '}
        <span class="reveal-count">{rewards.essence}</span> Essence
      </p>
      {summary.festival !== null && <p class="reveal-festival">{summary.festival.text}</p>}
      {summary.rank !== null && <p class="reveal-rank">{summary.rank}</p>}
      {progress !== null && <FinaleProgress progress={progress} />}
      {rewards.loot !== null && <LootList loot={rewards.loot} label="Your finale reward" />}
      <div class="rs-now">
        <AfterActionCard stats={stats} />
      </div>
    </RevealShell>
  );
}

// --- A: the scoreboard first ---

function ScoreboardFirst({ input, detailsOpen }: { input: SummaryInput; detailsOpen: boolean }) {
  const { stats } = input;
  const rows = scoreboard(stats);
  return (
    <RevealShell
      id="rs-a"
      pix
      title={summaryTitle(stats)}
      badge={<OutcomeBadge cleared={stats.outcome === 'cleared'} />}
      status
      footer={<SummaryActions onReplay={noop} onDismiss={noop} />}
    >
      <div class="rs">
        <p class="rs-head">
          <CloseTag input={input} />
        </p>
        <p class="rs-lead prose">{outcomeLine(stats)}</p>

        <SectionHead note="damage, share of the raid">Scoreboard</SectionHead>
        <ScoreTable rows={rows} total />

        <SectionHead>Highlights</SectionHead>
        <HighlightCards
          items={pickHighlights(stats, 3, ['hardest-hitter', 'star-creature', 'backbone'])}
        />

        <SectionHead>Your rewards</SectionHead>
        <Rewards input={input} />

        <MoreNumbers stats={stats} open={detailsOpen} />
      </div>
    </RevealShell>
  );
}

// --- B: one big moment, then a short scoreboard ---

function HeroMoment({ input, detailsOpen }: { input: SummaryInput; detailsOpen: boolean }) {
  const { stats, boss } = input;
  const rows = scoreboard(stats);
  const sprite = bossSprite(boss.id);
  const top = rows.slice(0, 3);
  const yours = rows.find((r) => r.you);
  const short = yours !== undefined && yours.rank > 3 ? [...top, yours] : top;
  const cleared = stats.outcome === 'cleared';
  const place = yourPlace(stats);
  return (
    <RevealShell
      id="rs-b"
      pix
      title={<span class="visually-hidden">{summaryTitle(stats)}</span>}
      status
      footer={<SummaryActions onReplay={noop} onDismiss={noop} />}
    >
      <div class="rs">
        <div class="rs-hero">
          {sprite !== undefined && (
            <div class="rs-hero-art" aria-hidden="true">
              <Sprite sprite={sprite} scale={4} />
            </div>
          )}
          <p class="rs-head">
            <OutcomeBadge cleared={cleared} />
            <CloseTag input={input} />
          </p>
          <p class={cleared ? 'rs-hero-title' : 'rs-hero-title held'}>{heroHeadline(input)}</p>
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
        </div>

        <SectionHead note={`top 3${yours !== undefined && yours.rank > 3 ? ' and you' : ''}`}>
          Scoreboard
        </SectionHead>
        <ScoreTable rows={short} />
        {rows.length > short.length && (
          <Accordion title={`All ${String(rows.length)} players`} variant="compact">
            <ScoreTable rows={rows} total />
          </Accordion>
        )}

        <SectionHead>Highlights</SectionHead>
        <HighlightCards items={pickHighlights(stats, 2, ['star-creature', 'backbone'])} />

        <SectionHead>Your rewards</SectionHead>
        <Rewards input={input} />

        <MoreNumbers stats={stats} open={detailsOpen} />
      </div>
    </RevealShell>
  );
}

// --- C: your raid first ---

function YourRaid({ input, detailsOpen }: { input: SummaryInput; detailsOpen: boolean }) {
  const { stats } = input;
  const place = yourPlace(stats);
  const mine = yourCreatures(stats);
  const mineKnocked = stats.knockouts.filter((k) => k.you).length;
  const byHand = stats.abilities.used.filter((u) => u.you && !u.byDefault).length;
  const earned = highlights(stats).filter((h) => h.you);
  const youRows: DataRow[] =
    place === null
      ? []
      : [
          { label: 'Damage', value: grouped(place.row.damage) },
          { label: 'Share of the raid', value: `${String(place.row.share)}%` },
          { label: 'Help', value: grouped(place.row.contribution) },
          { label: 'Creatures down', value: `${String(mineKnocked)} / ${String(mine.length)}` },
          { label: 'Abilities by hand', value: byHand },
        ];
  return (
    <RevealShell
      id="rs-c"
      pix
      title="Your raid"
      badge={<OutcomeBadge cleared={stats.outcome === 'cleared'} />}
      status
      footer={<SummaryActions onReplay={noop} onDismiss={noop} />}
    >
      <div class="rs">
        <p class="rs-head">
          <CloseTag input={input} />
        </p>
        <p class="rs-lead prose">{outcomeLine(stats)}</p>

        {place !== null && (
          <>
            <div class="rs-place">
              <span class="rs-place-rank" aria-hidden="true">
                {ordinal(place.row.rank)}
              </span>
              <span class="rs-place-text">
                <span class="rs-place-big">{`${String(place.of)} players`}</span>
                <span class="muted">ranked by damage</span>
              </span>
            </div>
            <DataTable rows={youRows} tabular />
            {earned.length > 0 && (
              <ul class="rs-chips" aria-label="Your highlights">
                {earned.map((h) => (
                  <li key={h.id}>
                    <Tag
                      kind="chip"
                      icon={h.icon.kind === 'icon' ? h.icon.icon : { kind: 'glyph', id: 'sparkle' }}
                    >
                      {h.label}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {mine.length > 0 && (
          <>
            <SectionHead note="damage, place in the fight">Your creatures</SectionHead>
            <DataTable
              tabular
              rows={mine.map((c) => ({
                label: (
                  <span class="rs-creature-name">
                    <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                    <span class="rs-name">{c.name}</span>
                  </span>
                ),
                value: grouped(c.damage),
                extra: <span class="rs-share">{`#${String(c.rank)}`}</span>,
              }))}
            />
          </>
        )}

        <SectionHead>Your rewards</SectionHead>
        <Rewards input={input} />

        <Accordion
          title="The whole server"
          meta={String(stats.players.length)}
          variant="compact"
          defaultOpen={detailsOpen}
          class="rs-server"
        >
          <SectionHead note="damage, share">Scoreboard</SectionHead>
          <ScoreTable rows={scoreboard(stats)} total />
          <SectionHead>Highlights</SectionHead>
          <HighlightCards
            items={pickHighlights(stats, 3, ['hardest-hitter', 'star-creature', 'backbone'])}
          />
          <SectionHead>More numbers</SectionHead>
          <MoreNumbers stats={stats} open={detailsOpen} skipCreatures folded={false} />
        </Accordion>
      </div>
    </RevealShell>
  );
}

// --- D: a podium ---

function Podium({ input, detailsOpen }: { input: SummaryInput; detailsOpen: boolean }) {
  const { stats } = input;
  const rows = scoreboard(stats);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  // The podium reads 2nd, 1st, 3rd: the winner in the middle.
  const order = [podium[1], podium[0], podium[2]].filter((r) => r !== undefined);
  const chips = pickHighlights(stats, 3, ['star-creature', 'backbone', 'favourite-reaction']);
  return (
    <RevealShell
      id="rs-d"
      pix
      title={summaryTitle(stats)}
      badge={<OutcomeBadge cleared={stats.outcome === 'cleared'} />}
      status
      footer={<SummaryActions onReplay={noop} onDismiss={noop} />}
    >
      <div class="rs">
        <p class="rs-head">
          <CloseTag input={input} />
        </p>
        <p class="rs-lead prose">{outcomeLine(stats)}</p>

        <div class={order.length === 2 ? 'rs-podium two' : 'rs-podium'}>
          {order.map((row) => {
            const best = bestCreatureOf(stats, row.name, row.you);
            return (
              <div key={row.rank} class={row.you ? 'rs-stand you' : 'rs-stand'}>
                <span class="rs-stand-pic" aria-hidden="true">
                  <Sprite
                    sprite={
                      best === undefined
                        ? glyphOrUnknown('paw')
                        : creatureSpriteOrFallback(best.species)
                    }
                    scale={best === undefined ? 3 : 3}
                  />
                </span>
                <span class="rs-stand-name">{row.name}</span>
                <span class="rs-stand-damage">{grouped(row.damage)}</span>
                <span class={`rs-block p${String(row.rank)}`}>{row.rank}</span>
              </div>
            );
          })}
        </div>

        {rest.length > 0 && (
          <>
            <SectionHead note="damage, share">The rest</SectionHead>
            <ScoreTable rows={rest} />
          </>
        )}

        <SectionHead>Highlights</SectionHead>
        <DataTable
          rows={chips.map((h) => ({
            icon:
              h.icon.kind === 'creature' ? (
                <Sprite sprite={creatureSpriteOrFallback(h.icon.species)} scale={2} />
              ) : (
                <GameIcon icon={h.icon.icon} scale={2} />
              ),
            label: h.label,
            value: <span class="rs-name">{h.who}</span>,
            mine: h.you,
          }))}
        />

        <SectionHead>Your rewards</SectionHead>
        <Rewards input={input} />

        <MoreNumbers stats={stats} open={detailsOpen} />
      </div>
    </RevealShell>
  );
}
