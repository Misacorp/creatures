/**
 * The element chart as the Help pages draw it: a grid (rows are the attacker, columns the defender)
 * and one line for each element. Everything is read from the chart's own helpers, so the pictures
 * cannot disagree with the game. Pure; `ui/ElementChartGrid.tsx` draws it.
 */
import {
  chartBp,
  content,
  joinNames,
  resists,
  strongAgainst,
  strongOver,
  type Element,
  type ElementChart,
} from '@creatures/game';

/** What a hit of one element does to a foe of another, for one cell of the grid. */
export interface ChartCell {
  attacker: Element;
  defender: Element;
  bp: number;
  kind: 'strong' | 'weak' | 'neutral';
  /** "150%", "75%", or "" for a pair that is not listed (100%). */
  text: string;
}

export interface ChartGrid {
  /** The elements in content order: the rows, and the columns in the same order. */
  elements: readonly Element[];
  rows: readonly { attacker: Element; cells: readonly ChartCell[] }[];
}

/** "150%", "75%": basis points as a percentage, no decimals unless needed. */
export function percentText(bp: number): string {
  return `${String(Math.round(bp / 100))}%`;
}

function cellOf(chart: ElementChart, attacker: Element, defender: Element): ChartCell {
  const bp = chartBp(chart, attacker, defender);
  const kind = bp === 10_000 ? 'neutral' : bp > 10_000 ? 'strong' : 'weak';
  return { attacker, defender, bp, kind, text: bp === 10_000 ? '' : percentText(bp) };
}

/** The grid for a chart and an element list (the shipped content's by default). */
export function chartGrid(
  chart: ElementChart = content.elementChart,
  elements: readonly Element[] = content.elements.map((e) => e.id),
): ChartGrid {
  return {
    elements,
    rows: elements.map((attacker) => ({
      attacker,
      cells: elements.map((defender) => cellOf(chart, attacker, defender)),
    })),
  };
}

/**
 * One element's line: "Mire: strong against Ember · weak to Ember · resists Tide". "Strong against"
 * is who it deals 150% to, "weak to" who deals 150% to it, "resists" who deals it less than 100%
 * (the grid shows the rest). A clause with no elements is left out; an element with no matchups at all reads "no matchups".
 */
export function elementLine(
  element: Element,
  chart: ElementChart = content.elementChart,
  nameOf: (id: string) => string = (id) => content.elements.find((e) => e.id === id)?.name ?? id,
): string {
  const names = (list: readonly Element[]): string => joinNames(list.map(nameOf));
  const clauses: string[] = [];
  const strong = strongAgainst(chart, element);
  if (strong.length > 0) clauses.push(`strong against ${names(strong)}`);
  const weak = strongOver(chart, element);
  if (weak.length > 0) clauses.push(`weak to ${names(weak)}`);
  const resisted = resists(chart, element);
  if (resisted.length > 0) clauses.push(`resists ${names(resisted)}`);
  return `${nameOf(element)}: ${clauses.length === 0 ? 'no matchups' : clauses.join(' · ')}`;
}

/** The line of every element, in content order. */
export function elementLines(
  chart: ElementChart = content.elementChart,
  elements: readonly Element[] = content.elements.map((e) => e.id),
): { element: Element; text: string }[] {
  return elements.map((element) => ({ element, text: elementLine(element, chart) }));
}
