import resourcesJson from './data/resources.json';
import { loadResources, type ResourceDef, type ResourceIcon } from './resources-schema';

export * from './resources-schema';

/** The shipped resource library, validated at module load. */
export const resources: readonly ResourceDef[] = loadResources(resourcesJson);

const BY_ID = new Map<string, ResourceDef>(resources.map((r) => [r.id, r]));

/** A resource by id, or undefined. */
export function resource(id: string): ResourceDef | undefined {
  return BY_ID.get(id);
}

/** What one is called ("Bait", "Tide Shard"); the id itself for an id the library does not know. */
export function resourceName(id: string, count = 1): string {
  const def = BY_ID.get(id);
  if (def === undefined) return id;
  return count === 1 ? def.name : def.plural;
}

/** "6 Scrap", "1 Tide Shard", "3 Tide Shards": the count and the right form of the name. */
export function resourceAmount(id: string, count: number): string {
  return `${String(count)} ${resourceName(id, count)}`;
}

/** A resource's icon, or undefined for an id the library does not know. */
export function resourceIcon(id: string): ResourceIcon | undefined {
  return BY_ID.get(id)?.icon;
}
