import type { OwnHouseView } from '@creatures/game';
import type { CountItem } from '../count-types';
import { acornCount, resourceCount, scrapCount, shardCount } from '../resource-count';
import { CountBadgeList } from '../ui/CountBadge';

/** What the player holds that the house takes, as count items: Acorns, scrap, shards, luxury materials; only what is above zero. */
export function holdingItems(own: OwnHouseView): CountItem[] {
  const items: CountItem[] = [];
  if (own.purse.bait > 0) items.push(acornCount(own.purse.bait));
  if (own.purse.scrap > 0) items.push(scrapCount(own.purse.scrap));
  for (const [element, n] of Object.entries(own.purse.shards)) {
    if (n > 0) items.push(shardCount(element, n));
  }
  for (const [id, { have, fresh }] of Object.entries(own.materials)) {
    if (have <= 0) continue;
    // A material that grew since the last look shows its gain after the number (the way a nameplate shows XP gained).
    items.push({
      ...resourceCount(id, have),
      ...(fresh > 0
        ? {
            amount: `${String(have)} +${String(fresh)}`,
            spokenAmount: `${String(have)}, ${String(fresh)} new`,
          }
        : {}),
    });
  }
  return items;
}

/**
 * The player's holdings in a row of count badges, where they are spent (Build and the workbench): "show, don't tell",
 * no resource is named. Draws nothing when the player holds nothing.
 */
export function HoldingsStrip({ own }: { own: OwnHouseView }) {
  const items = holdingItems(own);
  if (items.length === 0) return null;
  return <CountBadgeList items={items} label="You hold" class="hp-holdings" />;
}
