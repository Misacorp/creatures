/**
 * The explorer-rank ladder for `ProgressTrack`, built from the shared content and rules: what each rank
 * unlocks (places, push-on goals and the 24 h trip, from the content's own `minRank`s) and the one-time
 * gift every rank from 2 on brings (as tags). Nothing is copied here, so a place or goal moved to another rank
 * moves on the track too. No chances are shown: the gift and the unlocks are things, not odds.
 */
import {
  MAX_EXPLORER_RANK,
  rankGift,
  rankUnlocks,
  type RankGift,
  type RankUnlocks,
} from '@creatures/game';
import { groupSupplies } from './claim-view';
import { baitCount, partCountItems, supplyCounts } from './count-items';
import type { TrackStep, TrackUnlock } from './progress-track';
import { lengthLabel } from './trip-view';
import type { CountItem } from './ui/CountBadge';

/**
 * The gift as compact tags (icon and count; supplies and the gear piece also carry a name): Bait, parts,
 * shards, the gear piece and supplies. The ladder is for every creature, so the shards get the generic
 * grey shard icon (clearly not Glimmer's) (their element is the explorer's) and the piece shows only a rarity hint.
 */
export function giftTags(
  gift: Pick<RankGift, 'bait' | 'parts' | 'supplies'> &
    Partial<Pick<RankGift, 'shards' | 'gearOddsBp'>>,
): CountItem[] {
  const tags: CountItem[] = [];
  if (gift.bait > 0) tags.push(baitCount(gift.bait));
  tags.push(...partCountItems(gift.parts).map((item) => withoutEntry(item)));
  if ((gift.shards ?? 0) > 0) {
    tags.push({
      key: 'shards',
      icon: { kind: 'glyph', id: 'shard-any' },
      amount: gift.shards ?? 0,
      label: 'Shards of its element',
    });
  }
  if (gift.gearOddsBp !== null && gift.gearOddsBp !== undefined) {
    const rare = gift.gearOddsBp.common === 0;
    tags.push({
      key: 'gear',
      icon: { kind: 'glyph', id: 'blade' },
      amount: 1,
      label: rare ? 'Rare gear piece' : 'Gear piece',
      name: rare ? 'Rare gear' : 'Gear',
    });
  }
  tags.push(...supplyCounts(groupSupplies(gift.supplies)).map((item) => withoutEntry(item)));
  return tags;
}

/** The ladder is a small place: tags there are plain, not buttons that open help. */
function withoutEntry(item: CountItem): CountItem {
  const rest: Partial<CountItem> = { ...item };
  delete rest.entry;
  return rest as CountItem;
}

/** The unlocks of a rank, one entry each: places, goals, trip lengths, then the gift. */
function rankUnlockList(
  unlocks: RankUnlocks,
  gift: Parameters<typeof giftTags>[0] | null,
): TrackUnlock[] {
  const out: TrackUnlock[] = [];
  for (const place of unlocks.destinations) {
    out.push({ icon: place.access.night === true ? 'moon' : 'compass', text: place.name });
  }
  for (const goal of unlocks.goals) out.push({ icon: 'fork', text: `Goal: ${goal.name}` });
  for (const length of unlocks.lengths) {
    out.push({ icon: 'clock', text: `${lengthLabel(length)} trips` });
  }
  if (gift !== null) out.push({ icon: 'bait', text: 'Gift', tags: giftTags(gift) });
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
