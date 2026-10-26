/**
 * The pieces of the raid summary (`RaidSummaryCard`): the scoreboard as a `DataTable` with column
 * headings, a highlight card, the rewards, the folded tables that hold the numbers the old card listed
 * as bullets, and the buttons. All text is plain text (names are player text).
 */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { abilitySummary, percentText, whoText } from './after-action';
import { essenceCount, partCountItems } from './count-items';
import { FinaleProgress } from './FinaleProgress';
import { GlossaryTag } from './Glossary';
import { LootList } from './LootList';
import type { AfterActionStats } from './raid-api';
import { festivalFind } from './find-view';
import type { GrantLoot } from './gear-types';
import { rankChangeText } from './raid-progress';
import { FindCreature } from './ui/FindCreature';
import {
  grouped,
  rewardLoot,
  scoreboard,
  sortedBy,
  type Highlight,
  type ScoreRow,
  type ScoreSort,
  type SummaryRewards,
} from './raid-summary-view';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { Accordion } from './ui/Accordion';
import { ActionButton } from './ui/ActionButton';
import { DataTable, type DataRow } from './ui/DataTable';
import { GameIcon } from './ui/GameIcon';
import { RewardSummary } from './ui/RewardSummary';

// --- The scoreboard ---

/** One scoreboard row: place, name, damage and score. The caller's row is marked. */
export function scoreRow(row: ScoreRow): DataRow {
  return {
    label: (
      <>
        <span class={row.rank <= 3 ? 'rs-rank top' : 'rs-rank'}>{row.rank}</span>
        <span class="rs-name">{row.name}</span>
      </>
    ),
    value: grouped(row.damage),
    extra: grouped(row.score),
    mine: row.you,
  };
}

/** A small pixel triangle pointing down: the column the table is ordered by (highest first). */
function SortArrow() {
  return (
    <svg class="rs-sort-arrow" viewBox="0 0 5 3" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="0" width="5" height="1" />
      <rect x="1" y="1" width="3" height="1" />
      <rect x="2" y="2" width="1" height="1" />
    </svg>
  );
}

/**
 * A column heading the table can be ordered by: a button with the word, gold and with a small
 * triangle while the rows follow it. What the two numbers mean is one "?" by the Scoreboard heading
 * (`ScoreboardHead`).
 */
function SortHeading({
  word,
  active,
  onSort,
}: {
  word: 'Damage' | 'Score';
  active: boolean;
  onSort: () => void;
}) {
  return (
    <button
      type="button"
      class={active ? 'rs-sort on' : 'rs-sort'}
      aria-pressed={active}
      aria-label={`Sort by ${word.toLowerCase()}`}
      onClick={onSort}
    >
      {word}
      {active && <SortArrow />}
    </button>
  );
}

/** The headings of the damage and score columns: a tap on one orders the rows by it. */
function columnHeadings(label: string, sort: ScoreSort, onSort: (by: ScoreSort) => void) {
  return {
    label,
    value: (
      <SortHeading
        word="Damage"
        active={sort === 'damage'}
        onSort={() => {
          onSort('damage');
        }}
      />
    ),
    extra: (
      <SortHeading
        word="Score"
        active={sort === 'score'}
        onSort={() => {
          onSort('score');
        }}
      />
    ),
  };
}

/**
 * The Scoreboard heading with one "?" that explains damage and score in one place (#86: the old
 * "Damage" column was the score's share of the hits, which did not add up to the boss's HP).
 */
export function ScoreboardHead() {
  return (
    <SectionHead>
      <span class="rs-with-help">
        Scoreboard <GlossaryTag entry="raid-scoreboard" look="help" />
      </span>
    </SectionHead>
  );
}

/** Which column a sorted table follows, for `DataTable`'s `sorted`. */
const sortedColumn = (sort: ScoreSort) => (sort === 'damage' ? 'value' : 'extra');

/**
 * Every player as a table of place and name, damage and score, with column headings and the caller's
 * row marked: by damage until the player taps Score, and the places follow the order. `total` adds the
 * raid's total at the end.
 */
export function ScoreTable({
  stats,
  total = false,
}: {
  stats: Pick<AfterActionStats, 'players'>;
  total?: boolean;
}) {
  const [sort, setSort] = useState<ScoreSort>('damage');
  const rows = scoreboard(stats, sort);
  const data: DataRow[] = rows.map(scoreRow);
  if (total) {
    data.push({
      label: <span class="rs-name">Raid total</span>,
      value: grouped(rows.reduce((s, r) => s + r.damage, 0)),
      extra: grouped(rows.reduce((s, r) => s + r.score, 0)),
      total: true,
    });
  }
  return (
    <DataTable
      rows={data}
      tabular
      headings={columnHeadings('Player', sort, setSort)}
      sorted={sortedColumn(sort)}
      label="Scoreboard"
    />
  );
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
 * What the stage paid the caller, all in one place with the finds every screen uses: Essence and each kind
 * of part as count badges (no pile picture), then one list of finds: the gear pieces (`FindItem`), the
 * blueprints (`FindBlueprint`) and the Festival creature (`FindCreature`); then the server's rank with the
 * season pips. Raids pay no experience today, so there is no XP row (the shared `XpGain` has nothing to show).
 */
export function Rewards({ rewards }: { rewards: SummaryRewards }) {
  const loot = rewardLoot(rewards);
  const counts = [
    essenceCount(rewards.essence, { entry: true }),
    ...partCountItems(loot?.parts ?? {}),
  ];
  const festival = rewards.festivalGrant === null ? null : festivalFind(rewards.festivalGrant);
  const empty: GrantLoot = { gear: [], converted: [], parts: {}, blueprints: [] };
  return (
    <>
      <RewardSummary
        source={{ essence: rewards.essence }}
        prefix="Rewards"
        countsLabel="Rewards"
        counts={counts}
        pile={false}
      >
        <LootList loot={loot ?? empty} counted label="Gear, blueprints and creatures">
          {festival === null ? undefined : (
            <FindCreature creature={festival.creature}>
              {festival.note !== null && <p class="muted find-answered">{festival.note}</p>}
            </FindCreature>
          )}
        </LootList>
      </RewardSummary>
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
  const [creatureSort, setCreatureSort] = useState<ScoreSort>('damage');
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
            headings={columnHeadings('Creature', creatureSort, setCreatureSort)}
            sorted={sortedColumn(creatureSort)}
            label="Top creatures"
            rows={sortedBy(stats.creatures, creatureSort).map((c) => ({
              label: (
                <span class="rs-creature-name">
                  <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                  <span class="rs-stack">
                    <span class="rs-name">{c.name}</span>
                    <span class="rs-share">{`#${String(c.rank)} · ${whoText(c.owner, c.you)}`}</span>
                  </span>
                </span>
              ),
              value: grouped(c.damage),
              extra: grouped(c.score),
              mine: c.you,
            }))}
          />
          <p class="rs-note">
            The number is the place among all creatures in the fight, by damage.
          </p>
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
      {onReplay !== undefined && <ActionButton label="Watch replay" large onClick={onReplay} />}
      {onDismiss !== undefined && (
        <button type="button" disabled={busy} onClick={onDismiss}>
          Got it
        </button>
      )}
    </div>
  );
}
