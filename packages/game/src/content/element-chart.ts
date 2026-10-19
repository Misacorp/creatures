import { CHART_STRONG_BP, type Element, type ElementChart } from './schema';

const NEUTRAL_BP = 10_000;

/** What an `attacker`-element hit deals to a `defender`-element foe, in basis points (10000 when unlisted). */
export function chartBp(chart: ElementChart, attacker: Element, defender: Element): number {
  return chart.find((p) => p.attacker === attacker && p.defender === defender)?.bp ?? NEUTRAL_BP;
}

/** Elements that `element` deals 150% to, in chart order (Tide: Ember). A Hunter's targets. */
export function strongAgainst(chart: ElementChart, element: Element): Element[] {
  return chart
    .filter((p) => p.attacker === element && p.bp === CHART_STRONG_BP)
    .map((p) => p.defender);
}

/** Elements that deal 150% to `element`, in chart order (Ember: Tide). A Ward's foes; a mark's triggers. */
export function strongOver(chart: ElementChart, element: Element): Element[] {
  return chart
    .filter((p) => p.defender === element && p.bp === CHART_STRONG_BP)
    .map((p) => p.attacker);
}

/** Elements that `element` deals less than 100% to. */
export function weakAgainst(chart: ElementChart, element: Element): Element[] {
  return chart.filter((p) => p.attacker === element && p.bp < NEUTRAL_BP).map((p) => p.defender);
}

/** Elements that deal less than 100% to `element` (what `element` resists). */
export function resists(chart: ElementChart, element: Element): Element[] {
  return chart.filter((p) => p.defender === element && p.bp < NEUTRAL_BP).map((p) => p.attacker);
}

/** "Tide", "Tide and Mire", "Tide, Mire and Ember": names joined for player-facing text. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] as string}`;
}
