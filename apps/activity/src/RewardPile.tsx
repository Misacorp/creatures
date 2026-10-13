import { ItemSprite } from './GearArt';
import { partIcon } from './gear-sprites';
import { glyphOrUnknown } from './glyphs';
import { rewardPileItems, type PileIcon, type PileSource } from './reward-pile';
import { Sprite } from './sprites/Sprite';

/** One icon of the pile, at one fixed size (32 px), whatever it is. */
function PileIconView({ icon }: { icon: PileIcon }) {
  switch (icon.kind) {
    case 'glyph':
      return <Sprite sprite={glyphOrUnknown(icon.id)} scale={4} />;
    case 'part':
      return <Sprite sprite={partIcon(icon.part)} scale={4} />;
    case 'gear':
      return <ItemSprite baseId={icon.baseId} scale={2} />;
  }
}

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
          <PileIconView icon={item.icon} />
        </span>
      ))}
    </span>
  );
}
