import { content as shippedContent } from '../content';
import type { ContentPack, FinaleAbilityDef } from '../content/schema';
import { RULES } from './config';

/** One creature ability a team brings to a finale. */
export interface AbilitySource {
  /** The team creature the ability belongs to (the engine's `creatureId`). */
  creatureId: string;
  speciesId: string;
  abilityId: string;
}

/**
 * The creature abilities a team brings to the finale, in team order: one for each creature whose
 * level is at least `RULES.abilities.unlockLevel` and whose species has an ability. Creatures
 * below the unlock level, and species without an ability, add nothing. The basic ability is not
 * included (every player has one on top of these).
 */
export function abilitiesFor<T extends { id: string; speciesId: string }>(
  team: readonly T[],
  levelOf: (creature: T) => number,
  pack: ContentPack = shippedContent,
): AbilitySource[] {
  const out: AbilitySource[] = [];
  for (const creature of team) {
    if (levelOf(creature) < RULES.abilities.unlockLevel) continue;
    const abilityId = pack.creatures.find((s) => s.id === creature.speciesId)?.ability?.id;
    if (abilityId === undefined) continue;
    out.push({ creatureId: creature.id, speciesId: creature.speciesId, abilityId });
  }
  return out;
}

/** The four basic abilities everyone can pick, in content order. */
export function basicAbilities(pack: ContentPack = shippedContent): FinaleAbilityDef[] {
  return pack.finaleAbilities.filter((a) => a.kind === 'basic');
}
