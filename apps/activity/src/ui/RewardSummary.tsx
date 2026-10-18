import type { ComponentChildren } from 'preact';
import { pileLabel } from '../claim-view';
import type { PileSource } from '../reward-pile';
import { RewardPile } from '../RewardPile';
import { CountBadgeList, type CountItem } from './CountBadge';

/**
 * The rewards of a screen: the pile of icons (one per kind earned) with its count badges beside it,
 * then whatever else goes under it (the gear and blueprints, which the counts must not repeat).
 */
export function RewardSummary({
  source,
  prefix,
  countsLabel,
  counts,
  pile = true,
  children,
}: {
  source: PileSource;
  /** The first word of the pile's spoken name: "Loot: Scrap, Lure" or "Rewards: Scrap, Bait". */
  prefix: 'Loot' | 'Rewards';
  /** What the list of count badges is called for assistive technology. */
  countsLabel: string;
  counts: readonly CountItem[];
  /** False leaves the picture of the pile out, so only the count badges show (the dungeon results). */
  pile?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <>
      <div class={pile ? 'reward-row' : 'reward-row no-pile'}>
        {pile && <RewardPile source={source} label={pileLabel(source, prefix)} />}
        <CountBadgeList items={counts} label={countsLabel} class="reward-badges" />
      </div>
      {children}
    </>
  );
}
