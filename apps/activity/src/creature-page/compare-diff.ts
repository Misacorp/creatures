/**
 * The inline compare of the item picker: the selected item's card against the item worn in the same slot.
 * Each base stat row gets its difference to the worn item's same stat, each mod line is matched by id (an
 * element or reaction line has its own id per element, "ember-hunter" and "tide-hunter", so those count as
 * different lines) and is new, changed (with the difference of its number) or the same, and a line or stat
 * only the worn item has is listed as lost. Numbers come from the game's own resolved lines (`itemLines`,
 * which counts a tier's value and the chance bonus) and the server's stat values; the words are the
 * server's. Pure; the card only draws it. A mark always has a sign and a spoken text: colour is never alone.
 */
import { formatBp, gearLine, itemLines, type ResolvedLine } from '@creatures/game';
import type { GearItem, GearLine, GearStat } from '../gear-types';
import { rulesItemOf } from './compare-view';

const MINUS = '−';

/** A difference to show after a number: "+12", "−3", "+2 pt"; `good` says whether it is better for the wearer. */
export interface Mark {
  /** Better for the wearer (green) or worse (red); the sign is in `text` either way. */
  good: boolean;
  text: string;
  spoken: string;
}

/** A base stat the worn item has and the selected one lacks, as a red row ("Crit damage −20 pt"). */
export interface GoneStat {
  stat: GearStat['stat'];
  text: string;
  spoken: string;
}

/** What happens to one of the selected item's lines. */
export type LineDiff = { kind: 'new' } | { kind: 'changed'; mark: Mark };

/** A line only the worn item has: the text it has now. */
export interface GoneLine {
  id: string;
  source: GearLine['source'];
  text: string;
}

export interface CardDiff {
  /** Base stat rows that differ, by stat. */
  stats: ReadonlyMap<GearStat['stat'], Mark>;
  goneStats: GoneStat[];
  /** The selected item's lines that are new or changed, by `lineKey` (id and source). */
  lines: ReadonlyMap<string, LineDiff>;
  goneLines: GoneLine[];
}

const STAT_NAMES: Record<GearStat['stat'], string> = {
  hp: 'HP',
  atk: 'Attack',
  critChance: 'Crit chance',
  critDamage: 'Crit damage',
};

function isCrit(stat: GearStat['stat']): boolean {
  return stat === 'critChance' || stat === 'critDamage';
}

/** A stat's number as text: points for Attack and HP, "pt" for crit (stored in basis points). */
export function statAmount(stat: GearStat['stat'], amount: number): string {
  return isCrit(stat) ? `${formatBp(amount)} pt` : String(Math.abs(amount));
}

/** "+12", "−3", "+2 pt": a change of a stat with its sign. */
export function statDelta(stat: GearStat['stat'], delta: number): string {
  return `${delta > 0 ? '+' : MINUS}${statAmount(stat, delta)}`;
}

/** The difference of a line's number in the line's own unit: "+2%", "−1 pt", "+5". */
function lineAmount(unit: ResolvedLine['unit'], amount: number): string {
  const size = Math.abs(amount);
  switch (unit) {
    case 'pct':
    case 'chance':
      return `${formatBp(size)}%`;
    case 'pt':
      return `${formatBp(size)} pt`;
    default:
      return String(size);
  }
}

/** The mark of a changed number: its text starts with the sign, and it is spoken with the sign as a word. */
function markOf(text: string, good: boolean): Mark {
  const sign = text.startsWith('+') ? 'plus' : 'minus';
  const rest = text.slice(1);
  return { good, text, spoken: `${sign} ${rest}, ${good ? 'better' : 'worse'}` };
}

/**
 * A line's key in a diff: its id and where it came from. An item's base line and a rolled line can share an
 * id (a Compass has Trail XP built in and can roll it too), and those are two lines.
 */
export function lineKey(line: Pick<GearLine, 'id' | 'source'>): string {
  return `${line.id}:${line.source}`;
}

/** The resolved lines of an item by `lineKey`, or an empty map when the rules cannot read it. */
function resolved(item: GearItem): Map<string, ResolvedLine> {
  const rules = rulesItemOf(item);
  const map = new Map<string, ResolvedLine>();
  if (rules === null) return map;
  for (const line of itemLines(rules)) map.set(lineKey(line), line);
  return map;
}

/**
 * The inline diff of `next` against `worn` (the item in the same slot). Stats are matched by kind, lines by
 * id and source; equal numbers say nothing.
 */
export function diffItems(next: GearItem, worn: GearItem): CardDiff {
  const stats = new Map<GearStat['stat'], Mark>();
  for (const stat of next.stats) {
    const before = worn.stats.find((s) => s.stat === stat.stat)?.value ?? 0;
    const delta = stat.value - before;
    if (delta !== 0) {
      const text = statDelta(stat.stat, delta);
      stats.set(stat.stat, markOf(text, delta > 0));
    }
  }
  const goneStats: GoneStat[] = worn.stats
    .filter((s) => !next.stats.some((n) => n.stat === s.stat) && s.value !== 0)
    .map((s) => {
      const amount = statAmount(s.stat, s.value);
      return {
        stat: s.stat,
        text: `${STAT_NAMES[s.stat]} ${MINUS}${amount}`,
        spoken: `Lost: ${STAT_NAMES[s.stat]} minus ${amount}`,
      };
    });

  const mine = resolved(next);
  const theirs = resolved(worn);
  const lines = new Map<string, LineDiff>();
  for (const line of next.lines) {
    const key = lineKey(line);
    if (!worn.lines.some((w) => lineKey(w) === key)) {
      lines.set(key, { kind: 'new' });
      continue;
    }
    // On both items: the numbers come from the rules (a line they cannot read is not compared).
    const before = theirs.get(key);
    const now = mine.get(key);
    if (before === undefined || now === undefined) continue;
    const delta = now.value - before.value;
    if (delta === 0 || now.unit === 'once') continue;
    const reduction = gearLine(line.id)?.reduction === true;
    // A ward reads "Area ward −9%": a bigger reduction is a bigger number, shown as a bigger minus, and better.
    const up = reduction ? delta < 0 : delta > 0;
    const text = `${up ? '+' : MINUS}${lineAmount(now.unit, delta)}`;
    lines.set(key, { kind: 'changed', mark: markOf(text, delta > 0) });
  }
  const goneLines = worn.lines
    .filter((l) => !next.lines.some((n) => lineKey(n) === lineKey(l)))
    .map((l) => ({ id: l.id, source: l.source, text: l.text }));
  return { stats, goneStats, lines, goneLines };
}
