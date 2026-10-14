import { rewardPileItems, type PileSource } from './reward-pile';
import { GameIcon } from './ui/GameIcon';

/**
 * A small pile of reward icons, one for each kind earned (`rewardPileItems`), overlapping a little
 * so they read as a heap. It has a fixed, modest size (a line about 2.5 rem tall), draws nothing
 * when nothing was earned, and is decoration for the counts next to it: the picture is named once
 * as a whole for assistive technology. The icons pop in one after another when motion is allowed.
 */
export function RewardPile({ source, label }: { source: PileSource; label: string }) {
  const items = rewardPileItems(source);
  if (items.length === 0) return null;
  return (
    <span class="reward-pile" role="img" aria-label={label}>
      {items.map((item) => (
        <span key={item.key} class="pile-icon" aria-hidden="true">
          {/* One fixed size (32 px): gear art is drawn at half the scale of the 8 px icons. */}
          <GameIcon icon={item.icon} scale={item.icon.kind === 'gear' ? 2 : 4} />
        </span>
      ))}
    </span>
  );
}
