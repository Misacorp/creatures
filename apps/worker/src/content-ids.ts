import { content, expeditionContent, gearContent } from '@creatures/game';

/**
 * The content id lists that request schemas (`v.picklist`) and the analytics sanitizers check
 * against, built once from the content data. Non-empty tuples, as `v.picklist` wants.
 */
type Ids = [string, ...string[]];

export const SPECIES_IDS = content.creatures.map((c) => c.id) as Ids;
export const SUPPLY_IDS = expeditionContent.supplies.map((s) => s.id) as Ids;
export const DESTINATION_IDS = expeditionContent.destinations.map((d) => d.id) as Ids;
export const GOAL_IDS = expeditionContent.goals.map((g) => g.id) as Ids;
/** Every gear base id. */
export const BASE_IDS = gearContent.bases.map((b) => b.id) as Ids;
