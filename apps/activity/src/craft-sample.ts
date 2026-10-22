/**
 * Fixture data for the gear craft's job drawer (tests and the workbench): a server preview that follows the
 * crafter's Crafting level the way the real one does (Reach for Rare opens at 3, for Epic at 6).
 */
import fixture from './fixtures/workshop-preview-craft.json';
import { parseCraftPreview } from './gear-parse';
import type { CraftPreview } from './gear-types';

/** The preview of a craft for a creature at a Crafting level; the Reaches below their level are locked. */
export function samplePreview(
  blueprintId: string,
  creatureId: string,
  level: number,
): CraftPreview {
  const base = parseCraftPreview(fixture.result);
  return {
    ...base,
    blueprintId,
    creatureId,
    craftingLevel: level,
    itemLevel: 2 * level,
    options: base.options.map((o) => ({ ...o, unlocked: level >= o.minLevel })),
  };
}
