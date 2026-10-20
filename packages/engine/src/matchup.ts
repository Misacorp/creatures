import { chartBp, content, type ContentPack, type Element } from '@creatures/game';

/**
 * Damage multiplier in basis points for an `attacker`-element hit on a `defender`-element foe, read
 * from the element chart: 15000 strong, 7500 weak, 10000 for a pair the chart does not list.
 */
export function matchupBp(
  attacker: Element,
  defender: Element,
  chart: ContentPack['elementChart'] = content.elementChart,
): number {
  return chartBp(chart, attacker, defender);
}
