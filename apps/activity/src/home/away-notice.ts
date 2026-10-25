/**
 * The "While you were away" paper on the Today board (decisions.md, 2026-10-26), as plain data. The server
 * records what it paid on its own while the player was gone (`AwaySummary`); this turns one summary into
 * a row per source (its name and its count badges) and one line for what waits to be claimed. Pure.
 *
 * To show a new source: add its kind to `AwayKind` (api.ts) and a name to `SOURCE_NAMES`. The badges come
 * from the counts, so a source that pays the same kinds of thing needs nothing else.
 */
import type { AwayKind, AwaySource, AwaySummary } from '../api';
import { baitCount, essenceCount } from '../count-items';
import type { CountItem } from '../ui/CountBadge';

/** The paper's heading. */
export const AWAY_TITLE = 'While you were away';

/** What a row is called. The leet Bait is the daily gift, and the game never names where it comes from. */
const SOURCE_NAMES: Readonly<Record<AwayKind, string>> = {
  leet: 'Daily gifts',
  raid: 'Raid',
  games: 'Valley Games',
};

export interface AwayRow {
  kind: AwayKind;
  name: string;
  badges: CountItem[];
}

const plain = (key: string, glyph: string, amount: number, label: string): CountItem => ({
  key,
  icon: { kind: 'glyph', id: glyph },
  amount,
  label,
  name: label,
});

/** The count badges of one source, a badge for each kind it paid (none for zero). */
export function awayBadges(source: AwaySource): CountItem[] {
  const badges: CountItem[] = [];
  if (source.bait > 0) badges.push(baitCount(source.bait));
  if (source.essence > 0) badges.push(essenceCount(source.essence));
  if (source.items > 0) badges.push(plain('items', 'gift', source.items, 'Finds'));
  if (source.creatures > 0) badges.push(plain('creatures', 'paw', source.creatures, 'Creatures'));
  if (source.medals > 0) badges.push(plain('medals', 'trophy', source.medals, 'Medals'));
  if (source.xp > 0) badges.push(plain('xp', 'sparkle', source.xp, 'XP'));
  return badges;
}

/** One row per source that paid something, in the server's order. */
export function awayRows(summary: AwaySummary): AwayRow[] {
  return summary.sources
    .map((source) => ({
      kind: source.kind,
      name: SOURCE_NAMES[source.kind],
      badges: awayBadges(source),
    }))
    .filter((row) => row.badges.length > 0);
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

/** What waits to be claimed ("2 trips and 1 job are waiting for you"), or null when nothing does. */
export function awayWaitingLine(summary: AwaySummary): string | null {
  const parts = [
    summary.tripsWaiting > 0 ? plural(summary.tripsWaiting, 'trip', 'trips') : null,
    summary.jobsWaiting > 0 ? plural(summary.jobsWaiting, 'job', 'jobs') : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  const count = summary.tripsWaiting + summary.jobsWaiting;
  return `${parts.join(' and ')} ${count === 1 ? 'is' : 'are'} waiting for you`;
}

/** Whether the paper has anything to show: a row. (Waiting trips and jobs alone have their own notices.) */
export function hasAwayNotice(summary: AwaySummary | null | undefined): summary is AwaySummary {
  return summary !== null && summary !== undefined && awayRows(summary).length > 0;
}
