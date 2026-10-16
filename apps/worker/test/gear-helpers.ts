import { createSeededRng, itemOf, rollItem, type GearRarity } from '@creatures/game';
import { insertItem } from '../src/gear-store';

export interface GiveOptions {
  rarity?: GearRarity;
  /** Item level, 1 to 20. Default 1. */
  level?: number;
  /** Lines to give: `[id, tier index 0 to 4]`; rolled from a seed when absent. */
  lines?: [string, number][];
  seed?: string;
  now?: number;
  source?: string;
}

/**
 * Puts an item of a base straight in the table (not through a drop), for tests of what happens to
 * items: its lines are given, or rolled from a seeded stream. Returns the item's id.
 */
export function giveItem(
  sql: SqlStorage,
  userId: string,
  baseId: string,
  o: GiveOptions = {},
): string {
  const rarity = o.rarity ?? 'common';
  const level = o.level ?? 1;
  const item =
    o.lines === undefined
      ? rollItem(createSeededRng(`${o.seed ?? 'give'}:${baseId}:${rarity}`), {
          baseId,
          rarity,
          itemLevel: level,
        })
      : itemOf(
          baseId,
          rarity,
          level,
          o.lines.map(([id, tier]) => ({ id, tier })),
        );
  return insertItem(sql, userId, item, { source: o.source ?? 'test', now: o.now ?? 0 });
}
