/**
 * The explorer-rank ladder for `ProgressTrack`, built from the shared content and rules: what each rank
 * unlocks (places, push-on goals and the 24 h trip, from the content's own `minRank`s) and the one-time
 * gift every rank from 2 on brings. Nothing is copied here, so a place or goal moved to another rank
 * moves on the track too. No chances are shown: the gift and the unlocks are things, not odds.
 */
import {
  MAX_EXPLORER_RANK,
  rankGift,
  rankUnlocks,
  type RankGift,
  type RankUnlocks,
} from '@creatures/game';
import { partName } from './gear-view';
import type { PartKind } from './gear-types';
import type { TrackStep, TrackUnlock } from './progress-track';
import { lengthLabel, supplyName } from './trip-view';

/** The gift as short words: "20 Bait, 2 scrap, Candle Lantern". Parts are lower-cased names. */
export function giftText(gift: Pick<RankGift, 'bait' | 'parts' | 'supplies'>): string {
  const items: string[] = [];
  if (gift.bait > 0) items.push(`${String(gift.bait)} Bait`);
  for (const [kind, amount] of Object.entries(gift.parts) as [PartKind, number][]) {
    if (amount > 0) items.push(`${String(amount)} ${partName(kind).toLowerCase()}`);
  }
  for (const id of gift.supplies) items.push(supplyName(id));
  return items.join(', ');
}

/** The unlocks of a rank, one entry each: places, goals, trip lengths, then the gift. */
export function rankUnlockList(
  unlocks: RankUnlocks,
  gift: Pick<RankGift, 'bait' | 'parts' | 'supplies'> | null,
): TrackUnlock[] {
  const out: TrackUnlock[] = [];
  for (const place of unlocks.destinations) {
    out.push({ icon: place.access.night === true ? 'moon' : 'compass', text: place.name });
  }
  for (const goal of unlocks.goals) out.push({ icon: 'fork', text: `Goal: ${goal.name}` });
  for (const length of unlocks.lengths) {
    out.push({ icon: 'clock', text: `${lengthLabel(length)} trips` });
  }
  if (gift !== null) out.push({ icon: 'bait', text: `Gift: ${giftText(gift)}` });
  return out;
}

/** Ranks 1 to the top as `ProgressTrack` steps; the step of rank `n` is at index `n - 1`. */
export function rankSteps(): TrackStep[] {
  return Array.from({ length: MAX_EXPLORER_RANK }, (_, i) => {
    const rank = i + 1;
    return {
      id: rank,
      label: `Rank ${String(rank)}`,
      unlocks: rankUnlockList(rankUnlocks(rank), rankGift(rank)),
    };
  });
}

/** The index of an explorer's rank on `rankSteps()`. */
export function rankIndex(rank: number): number {
  return Math.min(MAX_EXPLORER_RANK, Math.max(1, Math.trunc(rank))) - 1;
}
