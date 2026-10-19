/**
 * What a claimed trip shows, as plain data: how it went (home, recalled or failed), the pile of loot,
 * the explorer's XP and rank-ups, the familiarity stars, a slot unlock and the journal pages found. It is
 * worked out from the server's result alone (names and texts come from the shared content), so nothing
 * here can disagree with what the server paid.
 */
import { journalEntry, expeditionContent } from '@creatures/game';
import type { ClaimResult } from './api';
import { BAIT_ICON } from './count-items';
import type { JournalFind, RankGift, TripResult } from './expedition-types';
import { lootIsEmpty } from './gear-view';
import { partName, partsEntries } from './gear-view';
import type { IconRef } from './icon-ref';
import { rewardPileItems, type PileSource } from './reward-pile';
import { goalName, kindName, supplyKindOf, supplyName } from './trip-view';

export type RevealTone = 'home' | 'recalled' | 'failed';

/** How the trip went: a failed risky goal, a recall, or a trip that came home. */
export function revealTone(result: Pick<TripResult, 'recalled' | 'failed'>): RevealTone {
  if (result.failed === true) return 'failed';
  return result.recalled ? 'recalled' : 'home';
}

/** The line about a failed risky goal: which one. The odds are not shown. Null when nothing failed. */
export function failureLine(result: Pick<TripResult, 'failed' | 'pushOn'>): string | null {
  if (result.failed !== true || result.pushOn === undefined) return null;
  return `${goalName(result.pushOn.goalId)} did not work out. Nothing came back, and the explorer learned nothing this time.`;
}

/** The line about the push-on goal of a trip that did not fail; null when none was chosen. */
export function pushOnLine(result: Pick<TripResult, 'failed' | 'pushOn'>): string | null {
  const goal = result.pushOn;
  if (goal === undefined || result.failed === true) return null;
  const name = goalName(goal.goalId);
  switch (goal.outcome) {
    case 'worked':
      return goal.risk === 'risky' ? `${name} paid off.` : `${name} added its reward.`;
    case 'declined':
      return `${name} was cut short: the explorer came home before it ended.`;
    case 'failed':
      return null;
  }
}

/** True when the trip brought nothing in the loot (no gear, parts, blueprint or supply). */
export function nothingInLoot(result: Pick<ClaimResult, 'loot'>): boolean {
  const loot = result.loot;
  return loot === undefined || lootIsEmpty(loot);
}

/** The supplies found, each with its amount: "Plain Lure, Plain Lure" becomes "2 Plain Lure". */
export function foundSupplies(
  result: Pick<ClaimResult, 'loot'>,
): { id: string; name: string; amount: number }[] {
  return groupSupplies(result.loot?.supplies ?? []);
}

/** Supply ids counted by id, in the order they first appear, each with its name. */
export function groupSupplies(
  ids: readonly string[],
): { id: string; name: string; amount: number }[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, amount]) => ({ id, name: supplyName(id), amount }));
}

interface XpView {
  gained: number;
  total: number;
  rank: number;
  rankBefore: number;
  /** True when the explorer reached a higher rank on this trip. */
  rankedUp: boolean;
}

export function xpView(result: Pick<ClaimResult, 'xp'>): XpView | null {
  const xp = result.xp;
  if (xp === undefined) return null;
  return { ...xp, rankedUp: xp.rank > xp.rankBefore };
}

interface StarsView {
  stars: number;
  starsBefore: number;
  trips: number;
  /** A star was earned on this trip. */
  gained: boolean;
}

export function starsView(result: Pick<ClaimResult, 'familiarity'>): StarsView | null {
  const f = result.familiarity;
  if (f === undefined) return null;
  return { ...f, gained: f.stars > f.starsBefore };
}

/** The new expedition slot a trip opened, as a sentence; null when none opened. */
export function slotLine(result: Pick<ClaimResult, 'slotUnlocked'>): string | null {
  const unlocked = result.slotUnlocked;
  if (unlocked === undefined) return null;
  return unlocked.total === 1
    ? 'You have an expedition slot.'
    : `A new expedition slot opened! You have ${String(unlocked.total)} now.`;
}

interface JournalPage {
  entryId: string;
  title: string;
  text: string;
  /** The name of the set it belongs to, or null. */
  setName: string | null;
  setComplete: boolean;
}

/** The journal pages a trip found, with their title and text from the content. Unknown pages are left out. */
export function journalPages(result: Pick<ClaimResult, 'journal'>): JournalPage[] {
  return (result.journal ?? []).flatMap((find: JournalFind) => {
    const entry = journalEntry(find.entryId);
    if (entry === undefined) return [];
    const set =
      find.set === null ? undefined : expeditionContent.journal.sets.find((s) => s.id === find.set);
    return [
      {
        entryId: entry.id,
        title: entry.title,
        text: entry.text,
        setName: set?.name ?? null,
        setComplete: find.setComplete,
      },
    ];
  });
}

/** The pile in words, for assistive technology: "Loot: Scrap, Ember Shard, Lure" (or "Rewards: ..."). */
export function pileLabel(source: PileSource, prefix: 'Loot' | 'Rewards'): string {
  const kinds = rewardPileItems(source).map((item) => {
    switch (item.icon.kind) {
      case 'part':
        return partName(item.icon.part);
      case 'gear':
        return 'Gear';
      case 'glyph':
        return item.key.startsWith('supply-') ? kindName(item.icon.id) : kindName(item.key);
    }
  });
  return `${prefix}: ${kinds.join(', ')}`;
}

/** One thing a rank-up gift gives: a picture and a few words. */
interface GiftLine {
  key: string;
  icon: IconRef;
  text: string;
}

export interface RankGiftView {
  rank: number;
  /** "Rank 4 gift". */
  title: string;
  lines: GiftLine[];
}

/** The things of one rank's gift, one line each: Bait, parts, supplies (several of a kind are counted). */
export function giftLines(gift: Pick<RankGift, 'bait' | 'parts' | 'supplies'>): GiftLine[] {
  const lines: GiftLine[] = [];
  if (gift.bait > 0) {
    lines.push({
      key: 'bait',
      icon: BAIT_ICON,
      text: `${String(gift.bait)} Bait`,
    });
  }
  for (const part of partsEntries(gift.parts)) {
    lines.push({
      key: part.kind,
      icon: { kind: 'part', part: part.kind },
      text: `${String(part.amount)} ${partName(part.kind)}`,
    });
  }
  const counts = new Map<string, number>();
  for (const id of gift.supplies) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, amount] of counts) {
    lines.push({
      key: id,
      icon: { kind: 'supply', id: supplyKindOf(id) ?? 'unknown' },
      text: amount === 1 ? supplyName(id) : `${String(amount)} ${supplyName(id)}`,
    });
  }
  return lines;
}

/** The gifts of the ranks a trip reached, lowest first. Empty when the rank did not rise. */
export function rankGiftViews(result: Pick<ClaimResult, 'rankGifts'>): RankGiftView[] {
  return (result.rankGifts ?? []).map((gift) => ({
    rank: gift.rank,
    title: `Rank ${String(gift.rank)} gift`,
    lines: giftLines(gift),
  }));
}
