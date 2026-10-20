/**
 * The pieces of the raid summary (`RaidSummaryCard`): the scoreboard as a `DataTable` with column
 * headings, a highlight card, the rewards, the folded tables that hold the numbers the old card listed
 * as bullets, and the buttons. All text is plain text (names are player text).
 */
import type { ComponentChildren } from 'preact';
import { abilitySummary, percentText, whoText } from './after-action';
import { essenceCount, partCountItems } from './count-items';
import { FinaleProgress } from './FinaleProgress';
import { lootIsEmpty } from './gear-view';
import type { GrantLoot, PartsBundle } from './gear-types';
import { LootList } from './LootList';
import type { AfterActionStats } from './raid-api';
import { festivalGrantText, rankChangeText } from './raid-progress';
import { grouped, type Highlight, type ScoreRow, type SummaryRewards } from './raid-summary-view';
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

/** The scoreboard's column headings: the last column is just "%". */
const SCORE_HEADINGS = { label: 'Player', value: 'Damage', extra: '%' } as const;

/**
 * Every player as a table of place and name, damage and share, with column headings and the caller's
 * row marked. `total` adds the raid's total at the end.
 */
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
  return <DataTable rows={data} tabular headings={SCORE_HEADINGS} label="Scoreboard" />;
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

/** The parts of two grants added together (the counts above the gear list cover both). */
function addParts(a: PartsBundle, b: PartsBundle): PartsBundle {
  const sum: Record<string, number> = { ...a };
  for (const [kind, amount] of Object.entries(b)) sum[kind] = (sum[kind] ?? 0) + (amount ?? 0);
  return sum;
}

/** One grant's gear, blueprints and notes under a small name ("Finale reward"); nothing when it gave none. */
function GrantBlock({ loot, label }: { loot: GrantLoot | null; label: string }) {
  if (loot === null || lootIsEmpty(loot)) return null;
  // Parts and supplies are in the count badges above, so the list leaves them out.
  const rest = { ...loot, parts: {}, supplies: [] };
  if (lootIsEmpty(rest)) return null;
  return (
    <section class="rs-grant">
      <p class="rs-grant-label">{label}</p>
      <LootList loot={loot} label={label} counted />
    </section>
  );
}

/**
 * What the stage paid the caller: one count badge for Essence and one for each kind of part (no pile
 * picture), then the gear and blueprints under their names, the Festival creature, and the server's
 * rank with the season pips. Raids pay no experience today, so there is no XP row (the shared `XpGain`
 * has nothing to show).
 */
export function Rewards({ rewards }: { rewards: SummaryRewards }) {
  const { finaleLoot, festivalLoot } = rewards;
  const parts = addParts(finaleLoot?.parts ?? {}, festivalLoot?.parts ?? {});
  const counts = [essenceCount(rewards.essence, { entry: true }), ...partCountItems(parts)];
  return (
    <>
      <RewardSummary
        source={{ parts, essence: rewards.essence }}
        prefix="Rewards"
        countsLabel="Rewards"
        counts={counts}
        pile={false}
      >
        <GrantBlock loot={finaleLoot} label="Finale reward" />
        <GrantBlock loot={festivalLoot} label="Festival gear" />
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
      {rewards.progress !== null && <FinaleProgress progress={rewards.progress} />}
    </>
  );
}

// --- The numbers the old card listed as bullets, as folded tables ---

const plainName = (text: string) => <span class="rs-name">{text}</span>;

/** Reactions, abilities, knockouts, the counter-move, the boss and the creatures: each a folded table. */
export function MoreNumbers({
  stats,
  open = false,
}: {
  stats: AfterActionStats;
  /** Open all of them (for a review of what is inside). */
  open?: boolean;
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
  return (
    <Accordion title="More numbers" variant="compact" defaultOpen={open}>
      <div class="rs-more">
        <Accordion title="The fight" variant="compact" defaultOpen={open}>
          <DataTable rows={bossRows} tabular />
        </Accordion>
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
    </Accordion>
  );
}

// --- Buttons ---

/**
 * "Watch replay" (the card's one gold button) and a quiet "Got it". Each shows only when its action is
 * given: the finale reveal has both, a result card on the Raid tab has no "Got it".
 */
export function SummaryActions({
  onReplay,
  onDismiss,
  busy = false,
}: {
  onReplay?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
  busy?: boolean;
}) {
  if (onReplay === undefined && onDismiss === undefined) return null;
  return (
    <div class="rs-actions">
      {onReplay !== undefined && <ActionButton label="Watch replay" wide onClick={onReplay} />}
      {onDismiss !== undefined && (
        <button type="button" disabled={busy} onClick={onDismiss}>
          Got it
        </button>
      )}
    </div>
  );
}
