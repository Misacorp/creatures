/**
 * The pieces the raid summary mock-ups share (`RaidSummaryMock`): the scoreboard as a `DataTable`, a
 * highlight card, the rewards, the folded tables that hold the numbers the old card listed as bullets,
 * and the buttons. Workbench only for now. All text is plain text (names are player text).
 */
import type { ComponentChildren } from 'preact';
import { abilitySummary, percentText, whoText } from './after-action';
import { essenceCount, partCountItems } from './count-items';
import { FinaleProgress } from './FinaleProgress';
import { LootList } from './LootList';
import type { AfterActionStats } from './raid-api';
import { festivalGrantText, finaleProgress, rankChangeText } from './raid-progress';
import { grouped, type Highlight, type ScoreRow, type SummaryInput } from './raid-summary-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Accordion } from './ui/Accordion';
import { ActionButton } from './ui/ActionButton';
import { DataTable, type DataRow } from './ui/DataTable';
import { GameIcon } from './ui/GameIcon';
import { RewardSummary } from './ui/RewardSummary';
import { Tag } from './ui/Tag';

// --- The scoreboard ---

/** One scoreboard row: place, name, damage, share of the raid. The caller's row is marked. */
export function scoreRow(row: ScoreRow): DataRow {
  return {
    label: (
      <>
        <span class={row.rank <= 3 ? 'rs-rank top' : 'rs-rank'}>{row.rank}</span>
        <span class="rs-name">{row.name}</span>
      </>
    ),
    value: grouped(row.damage),
    extra: <span class="rs-share">{row.share}%</span>,
    mine: row.you,
  };
}

/** The players as a table of rank and name, damage and share. `total` adds the raid's total at the end. */
export function ScoreTable({
  rows,
  total = false,
}: {
  rows: readonly ScoreRow[];
  total?: boolean;
}) {
  const sum = rows.reduce((s, r) => s + r.damage, 0);
  const data: DataRow[] = rows.map(scoreRow);
  if (total) {
    data.push({
      label: <span class="rs-name">Raid total</span>,
      value: grouped(sum),
      extra: <span class="rs-share">100%</span>,
      total: true,
    });
  }
  return <DataTable rows={data} tabular class="rs-tight" />;
}

// --- Highlights ---

/** One highlight as a card: a picture, a small title, who, and the fact behind it. */
export function HighlightCard({ highlight: h }: { highlight: Highlight }) {
  return (
    <li class={h.you ? 'rs-card you' : 'rs-card'}>
      <span class="rs-card-pic" aria-hidden="true">
        {h.icon.kind === 'creature' ? (
          <Sprite sprite={creatureSpriteOrFallback(h.icon.species)} scale={2} />
        ) : (
          <GameIcon icon={h.icon.icon} scale={3} />
        )}
      </span>
      <span class="rs-card-text">
        <span class="rs-card-label">{h.label}</span>
        <strong class="rs-card-who">{h.who}</strong>
        <span class="rs-card-line">{h.line}</span>
      </span>
    </li>
  );
}

export function HighlightCards({ items }: { items: readonly Highlight[] }) {
  if (items.length === 0) return null;
  return (
    <ul class="rs-cards" aria-label="Highlights">
      {items.map((h) => (
        <HighlightCard key={h.id} highlight={h} />
      ))}
    </ul>
  );
}

/** A section heading with a small note at the right. */
export function SectionHead({ children, note }: { children: ComponentChildren; note?: string }) {
  return (
    <h4 class="rs-h">
      <span>{children}</span>
      {note !== undefined && <span class="muted">{note}</span>}
    </h4>
  );
}

// --- Rewards ---

/**
 * What the stage paid the caller: Essence and parts as count badges with the pile, then the gear and
 * blueprints, the Festival creature, and the server's rank with the season pips. Raids pay no
 * experience today, so there is no XP row (the shared `XpGain` has nothing to show).
 */
export function Rewards({ input }: { input: SummaryInput }) {
  const { rewards } = input;
  const parts = rewards.loot?.parts ?? {};
  const counts = [essenceCount(rewards.essence, { entry: true }), ...partCountItems(parts)];
  const progress = finaleProgress(
    { week: 'wb-week', rankChange: rewards.rankChange },
    rewards.seasonWeek === null
      ? null
      : { weekId: 'wb-week', season: { index: 1, week: rewards.seasonWeek } },
  );
  return (
    <>
      <RewardSummary
        source={{
          parts,
          essence: rewards.essence,
          ...(rewards.loot === null ? {} : { gear: rewards.loot.gear }),
        }}
        prefix="Rewards"
        countsLabel="Rewards"
        counts={counts}
      >
        {rewards.loot !== null && <LootList loot={rewards.loot} label="Finale reward" counted />}
      </RewardSummary>
      {rewards.festivalGrant !== null && (
        <div class="rs-festival">
          <Sprite sprite={creatureSpriteOrFallback(rewards.festivalGrant.species)} scale={4} />
          <p class="prose">{festivalGrantText(rewards.festivalGrant)}</p>
          {rewards.festivalGrant.firstOnServer && (
            <Tag kind="badge" tone="first">
              First on server
            </Tag>
          )}
        </div>
      )}
      {rewards.rankChange !== null && (
        <p class="rs-rank-line">{rankChangeText(rewards.rankChange)}</p>
      )}
      {progress !== null && <FinaleProgress progress={progress} />}
    </>
  );
}

// --- The numbers the old card listed as bullets, as folded tables ---

const plainName = (text: string) => <span class="rs-name">{text}</span>;

/** Reactions, abilities, knockouts, the counter-move, the boss and the creatures: each a folded table. */
export function MoreNumbers({
  stats,
  open = false,
  skipCreatures = false,
  folded = true,
}: {
  stats: AfterActionStats;
  /** Open all of them (for a review of what is inside). */
  open?: boolean;
  /** The creatures table is already on the screen (the "Your raid" variant shows them). */
  skipCreatures?: boolean;
  /** Fold them all under one "More numbers" header (the default), or list the folded tables directly. */
  folded?: boolean;
}) {
  const boss = stats.boss;
  const bossRows: DataRow[] = [
    {
      label: 'Boss HP left',
      value: `${grouped(boss.hpEnd)} / ${grouped(boss.hpMax)}`,
      extra: percentText(boss.leftBp, boss.hpEnd),
    },
    { label: 'Rounds', value: `${String(stats.rounds)} / ${String(stats.maxRounds)}` },
  ];
  if (stats.phase !== 'finale') {
    bossRows.push({
      label: 'Taken off the pool',
      value: `${grouped(boss.lost)} / ${grouped(boss.needed)}`,
    });
  }
  const adapt = stats.adaptation;
  const adaptRows: DataRow[] =
    adapt === null
      ? []
      : [
          { label: 'Name', value: adapt.name },
          { label: 'Resists', value: adapt.target ?? 'Nothing' },
          { label: 'Strength', value: `${String(Math.round(adapt.resistBp / 100))}%` },
          {
            label: 'Purged',
            value: adapt.purged ? `Round ${String(adapt.purgedRound ?? 0)}` : 'No',
          },
          ...(adapt.restoredRound === null
            ? []
            : [{ label: 'Applied again', value: `Round ${String(adapt.restoredRound)}` }]),
        ];
  const tables = (
    <div class="rs-more">
      <Accordion title="The fight" variant="compact" defaultOpen={open}>
        <DataTable rows={bossRows} tabular />
      </Accordion>
      {!skipCreatures && (
        <Accordion
          title="Top creatures"
          meta={String(stats.creatures.length)}
          variant="compact"
          defaultOpen={open}
        >
          <DataTable
            tabular
            rows={stats.creatures.map((c) => ({
              label: (
                <span class="rs-creature-name">
                  <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                  <span class="rs-stack">
                    <span class="rs-name">{c.name}</span>
                    <span class="rs-share">{whoText(c.owner, c.you)}</span>
                  </span>
                </span>
              ),
              value: grouped(c.damage),
              extra: <span class="rs-share">{`#${String(c.rank)}`}</span>,
              mine: c.you,
            }))}
          />
          <p class="rs-note">Damage, and the place among all creatures in the fight.</p>
        </Accordion>
      )}
      <Accordion
        title="Reactions"
        meta={String(stats.reactionsTotal)}
        variant="compact"
        defaultOpen={open}
      >
        {stats.reactions.length === 0 ? (
          <p class="rs-note">No reactions triggered.</p>
        ) : (
          <DataTable
            tabular
            rows={[
              ...stats.reactions.map((r) => ({
                label: r.name,
                value: r.count,
                extra: r.reflected > 0 ? `${String(r.reflected)} reflected` : '',
              })),
              { label: 'In total', value: stats.reactionsTotal, extra: '', total: true },
            ]}
          />
        )}
      </Accordion>
      {(stats.phase === 'finale' || stats.abilities.used.length > 0) && (
        <Accordion
          title="Abilities"
          meta={String(stats.abilities.used.length)}
          variant="compact"
          defaultOpen={open}
        >
          <p class="rs-note">{abilitySummary(stats.abilities)}</p>
          <DataTable
            rows={stats.abilities.used.map((u) => ({
              label: plainName(`${whoText(u.player, u.you)}: ${u.ability}`),
              value: `Round ${String(u.round)}`,
              extra: u.byDefault ? 'auto' : 'hand',
              mine: u.you,
            }))}
          />
        </Accordion>
      )}
      <Accordion
        title="Knockouts"
        meta={String(stats.knockouts.length)}
        variant="compact"
        defaultOpen={open}
      >
        {stats.knockouts.length === 0 ? (
          <p class="rs-note">No creature was knocked out.</p>
        ) : (
          <DataTable
            rows={stats.knockouts.map((k) => ({
              label: plainName(`${k.creature} (${whoText(k.owner, k.you)})`),
              value: `Round ${String(k.round)}`,
              mine: k.you,
            }))}
          />
        )}
      </Accordion>
      {adapt !== null && (
        <Accordion title="Boss counter-move" variant="compact" defaultOpen={open}>
          <DataTable rows={adaptRows} />
        </Accordion>
      )}
    </div>
  );
  return folded ? (
    <Accordion title="More numbers" variant="compact" defaultOpen={open}>
      {tables}
    </Accordion>
  ) : (
    tables
  );
}

// --- Buttons ---

/** "Watch replay" (the card's one gold button) and a quiet "Got it". */
export function SummaryActions({
  onReplay,
  onDismiss,
}: {
  onReplay: () => void;
  onDismiss: () => void;
}) {
  return (
    <div class="rs-actions">
      <ActionButton label="Watch replay" wide onClick={onReplay} />
      <button type="button" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
