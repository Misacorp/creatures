import { content, dungeonContent } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { formStats as formStatsOf, type FormStats, type Shipped } from '@creatures/engine/v2';

export type { FormStats };

/** The shipped species, raid bosses and dungeon foes the engine's resolver reads beside the combat v2 pack. */
export const SHIPPED: Shipped = {
  creatures: content.creatures,
  bosses: content.bosses,
  foes: dungeonContent.foes,
};

/** A form's stats at a level (the engine's `formStats` on the game's pack and the shipped species: levels above its cap are capped). */
export function formStats(formId: string, level: number): FormStats {
  return formStatsOf(combatV2, SHIPPED, formId, level);
}

/** Every element id in the shipped content. */
export const ELEMENTS: readonly string[] = content.elements.map((e) => e.id);

/** True when an attacker of `attacker` cashes a mark of `mark` (the element chart's strong pairs). */
export function triggers(attacker: string, mark: string): boolean {
  return content.elementChart.some(
    (p) => p.attacker === attacker && p.defender === mark && p.bp === 15_000,
  );
}

/** The element chart multiplier (bp) of an attacker against the boss's element. */
export function matchupBp(attacker: string, defender: string): number {
  return (
    content.elementChart.find((p) => p.attacker === attacker && p.defender === defender)?.bp ??
    10_000
  );
}
