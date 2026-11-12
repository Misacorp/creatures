/** Blueprints a player can use, and which sets are finished (`docs/design/housing.md` 2.2). */
import type { HousingContent } from './schema';

/**
 * The piece and skin ids the player may make: starters, ground skins (always known), everything learned, and whatever a
 * built part teaches (its `unlocks`, and items whose unlock names it).
 */
export function knownBlueprints(
  content: HousingContent,
  learned: ReadonlySet<string>,
  built: ReadonlySet<string>,
): Set<string> {
  const known = new Set<string>(learned);
  const items = [...content.pieces, ...content.skins];
  for (const item of items) {
    if (item.unlock.kind === 'starter') known.add(item.id);
    if (item.unlock.kind === 'part' && built.has(item.unlock.part)) known.add(item.id);
  }
  for (const part of content.parts) {
    if (built.has(part.id)) for (const id of part.unlocks) known.add(id);
  }
  return known;
}

/** Ids of the sets with every piece owned at least once (tier 0 included). A set with no pieces is never complete. */
export function completeSets(
  content: HousingContent,
  owned: ReadonlyMap<string, number>,
): string[] {
  return content.sets
    .filter((set) => {
      const pieces = content.pieces.filter((p) => p.set === set.id);
      return pieces.length > 0 && pieces.every((p) => (owned.get(p.id) ?? 0) > 0);
    })
    .map((s) => s.id);
}
