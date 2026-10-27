import {
  baseMinLevel,
  createSeededRng,
  gearBase,
  itemLines,
  itemStats,
  rollItem,
  statText,
} from '@creatures/game';
import type { GearItem, GearRarity } from '../gear-types';

/**
 * A gear view item for a piece the workbench shows as a find (`GearItemsContext`), so its item card has
 * stats and lines. Rolled from the id, so the same piece always gives the same card.
 */
export function sampleGearItem(piece: {
  id: string;
  baseId: string;
  rarity: GearRarity;
  itemLevel?: number | undefined;
}): GearItem {
  const base = gearBase(piece.baseId);
  const level = Math.max(piece.itemLevel ?? 1, base === undefined ? 1 : baseMinLevel(base));
  const rolled = rollItem(createSeededRng(piece.id), {
    baseId: piece.baseId,
    rarity: piece.rarity,
    itemLevel: level,
  });
  return {
    id: piece.id,
    baseId: piece.baseId,
    slot: base?.slot ?? 'hat',
    tag: base?.tag ?? 'neutral',
    rarity: piece.rarity,
    festival: piece.baseId.startsWith('festival-'),
    itemLevel: level,
    stats: itemStats(rolled).map((s) => ({
      stat: s.stat,
      value: s.value,
      base: s.base,
      text: statText(s.stat, s.value),
    })),
    lines: itemLines(rolled).map((l) => ({ ...l, active: null })),
    needs: { level: 1, role: null },
    equippedOn: null,
    markedForDismantle: false,
    dismantle: {
      scrap: { min: 0, max: 0 },
      shards: { min: 0, max: 0, element: null },
      glimmer: { min: 0, max: 0 },
      essence: { min: 0, max: 0 },
    },
    source: 'workbench',
    createdAt: 0,
    madeBy: null,
    origin: null,
  };
}
