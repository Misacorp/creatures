import { RULES, content, type ContentPack, type Element } from '@creatures/game';

/** Damage multiplier in basis points: strong 15000, weak 7500, otherwise 10000. */
export function matchupBp(
  attacker: Element,
  defender: Element,
  elements: ContentPack['elements'] = content.elements,
): number {
  const strong = elements.find((e) => e.id === attacker)?.strongAgainst;
  if (strong === defender) return RULES.combat.strongBp;
  const defenderStrong = elements.find((e) => e.id === defender)?.strongAgainst;
  if (defenderStrong === attacker) return RULES.combat.weakBp;
  return 10_000;
}
