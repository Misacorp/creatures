import type { ComponentChildren } from 'preact';
import { pileLabel } from '../claim-view';
import type { PileSource } from '../reward-pile';
import { RewardPile } from '../RewardPile';
import { CountBadge, type CountItem } from './CountBadge';

/**
 * The rewards of a screen: the pile of icons (one per kind earned) with its count badges beside it,
 * then whatever else goes under it (the gear and blueprints, which the counts must not repeat).
 */
export function RewardSummary({
  source,
  prefix,
  countsLabel,
  counts,
  children,
}: {
  source: PileSource;
  /** The first word of the pile's spoken name: "Loot: Scrap, Lure" or "Rewards: Scrap, Bait". */
  prefix: 'Loot' | 'Rewards';
  /** What the list of count badges is called for assistive technology. */
  countsLabel: string;
  counts: readonly CountItem[];
  children?: ComponentChildren;
}) {
  return (
    <>
      <div class="reward-row">
        <RewardPile source={source} label={pileLabel(source, prefix)} />
        <ul class="reward-badges" aria-label={countsLabel}>
          {counts.map(({ key, ...badge }) => (
            <li key={key}>
              <CountBadge {...badge} />
            </li>
          ))}
        </ul>
      </div>
      {children}
    </>
  );
}
