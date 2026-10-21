import { partCountItems, supplyCounts } from './count-items';
import { supplyName } from './trip-view';
import type { DungeonTreasureView } from './dungeon-types';
import { CountBadgeList } from './ui/CountBadge';
import { FindBlueprint } from './ui/FindBlueprint';
import { FindItem } from './ui/FindItem';
import { FindList } from './ui/FindRow';

/**
 * A rare room's treasure as a find: a gear piece or a blueprint is a row (`FindItem`, `FindBlueprint`, the
 * piece itself with its rarity and level), supplies and shards are count badges, like every find. Shown in
 * the Blue Chasm before the player chooses, and on the end screen when the treasure was lost with the run.
 * Everything is drawn as text and images from ids; nothing here is free player text.
 */
export function DungeonTreasure({
  treasure,
  label = 'The treasure',
}: {
  treasure: DungeonTreasureView;
  /** What the list is called for assistive technology. */
  label?: string;
}) {
  switch (treasure.kind) {
    case 'gear':
      return (
        <FindList label={label} class="dungeon-treasure">
          <FindItem
            baseId={treasure.baseId}
            rarity={treasure.rarity}
            level={treasure.itemLevel}
            card={treasure.card}
          />
        </FindList>
      );
    case 'blueprint':
      return (
        <FindList label={label} class="dungeon-treasure">
          <FindBlueprint baseId={treasure.baseId} />
        </FindList>
      );
    case 'supplies':
      return (
        <CountBadgeList
          label={label}
          class="reward-badges dungeon-treasure"
          items={supplyCounts([
            { id: treasure.supplyId, name: supplyName(treasure.supplyId), amount: treasure.count },
          ])}
        />
      );
    case 'shards':
      return (
        <CountBadgeList
          label={label}
          class="reward-badges dungeon-treasure"
          items={partCountItems(treasure.parts)}
        />
      );
  }
}
