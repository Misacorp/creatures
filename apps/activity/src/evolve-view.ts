/**
 * What the evolve screen shows (`EvolveDrawer.tsx`), for every evolve. A line that grows two ways shows both
 * forms side by side; a line with one form shows that form alone, already picked, with no sentence about it
 * (the owner's call, 2026-10-19: the same screen every time, so the player sees what they evolve into; show,
 * don't tell). Pure: the facts come from the shared content (species, abilities, stats) and the server's
 * `evolution` of the creature.
 */
import { effectiveStats } from '@creatures/game';
import type { Creature } from './api';
import { getSpecies, speciesName } from './game';
import { abilityDef } from './live';

/** One form a creature can grow into: what the player compares before choosing. */
export interface EvolveForm {
  species: string;
  name: string;
  element: string;
  role: string;
  /** Its finale ability: the name and what it does, in one sentence. Null for a species without one. */
  ability: { name: string; text: string } | null;
  /** HP, Attack and Speed it would have now (this creature's level and fusions on the new form's numbers). */
  stats: { hp: number; atk: number; spd: number };
}

/** The species a creature can grow into, the first branch first (none: it cannot evolve). */
export function evolveTargets(creature: Pick<Creature, 'evolution'>): string[] {
  const evolution = creature.evolution;
  if (evolution === undefined) return [];
  return evolution.alt === undefined
    ? [evolution.toSpecies]
    : [evolution.toSpecies, evolution.alt.toSpecies];
}

/** The forms to show, in order; a form the content does not know is left out. */
export function evolveForms(
  creature: Pick<Creature, 'evolution' | 'level' | 'fusionCount'>,
): EvolveForm[] {
  const forms: EvolveForm[] = [];
  for (const id of evolveTargets(creature)) {
    const species = getSpecies(id);
    if (species === undefined) continue;
    const ability = species.ability === undefined ? undefined : abilityDef(species.ability.id);
    forms.push({
      species: id,
      name: speciesName(id),
      element: species.element,
      role: species.role,
      ability: ability === undefined ? null : { name: ability.name, text: ability.description },
      stats: effectiveStats(
        species,
        Math.min(creature.level, species.levelCap),
        creature.fusionCount,
      ),
    });
  }
  return forms;
}

/** The label of the button that evolves into a form (the price is on the line above it). */
export function evolveButtonLabel(form: EvolveForm | undefined): string {
  return form === undefined ? 'Pick a form' : `Evolve into ${form.name}`;
}
