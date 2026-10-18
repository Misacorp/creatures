/**
 * An item of the server's gear view as the game's rules know it, so the inline compare can resolve its
 * lines with the game's own functions (`itemLines`). Pure.
 */
import { gearBase, gearLine, itemOf, type GearItem as RulesItem } from '@creatures/game';
import type { GearItem } from '../gear-types';

/** The item with its rolled lines (0-based tiers); null for a base the content does not have. */
export function rulesItemOf(item: GearItem): RulesItem | null {
  if (gearBase(item.baseId) === undefined) return null;
  const lines = item.lines
    .filter((l) => l.source === 'rolled' && gearLine(l.id) !== undefined)
    .map((l) => ({ id: l.id, tier: Math.max(0, (l.tier ?? 1) - 1) }));
  return itemOf(item.baseId, item.rarity, item.itemLevel, lines);
}
