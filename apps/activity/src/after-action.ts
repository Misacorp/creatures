/**
 * Plain-words text for the after-action card. It states what happened, in numbers, and never
 * suggests what to do about it. Pure: no DOM, no network. Everything returned is plain text (it can
 * contain player names and nicknames), to be rendered as text only.
 */
import { speciesName } from './game';
import type {
  AfterActionStats,
  RaidPhaseId,
  StatsAbilityUse,
  StatsAdaptation,
  StatsCreature,
  StatsKnockout,
  StatsReaction,
} from './raid-api';
import { phaseName } from './raid-text';

const num = (n: number): string => String(n);

/** The card's headline: "Close one!" when it was tight, otherwise the plain outcome. */
export function headline(stats: Pick<AfterActionStats, 'close' | 'outcome'>): string {
  if (stats.close) return 'Close one!';
  return stats.outcome === 'cleared' ? 'Cleared' : 'Not cleared';
}

/** One plain sentence about how the stage ended. */
export function outcomeLine(
  stats: Pick<AfterActionStats, 'phase' | 'outcome' | 'rounds' | 'maxRounds' | 'knockouts'>,
): string {
  const name = phaseName(stats.phase);
  const rounds = `${num(stats.rounds)} / ${num(stats.maxRounds)} rounds`;
  switch (stats.outcome) {
    case 'cleared':
      return `${name} cleared after ${rounds}.`;
    case 'wiped': {
      const last = stats.knockouts.reduce((max, k) => Math.max(max, k.round), 0);
      return last > 0
        ? `${name} not cleared. Every creature was knocked out by round ${num(last)}.`
        : `${name} not cleared. Every creature was knocked out.`;
    }
    default:
      return `${name} not cleared after ${rounds}.`;
  }
}

/**
 * A share in basis points as a whole percent. A pool that is not empty never reads "0%" (it reads
 * "less than 1%") or "100%" (it reads "99%"), because those would say something untrue.
 */
export function percentText(bp: number, hpLeft: number): string {
  if (hpLeft <= 0) return '0%';
  if (bp < 100) return 'less than 1%';
  return `${num(Math.min(99, Math.round(bp / 100)))}%`;
}

/** "Boss HP left: 449 / 5000 (9%)". */
export function hpLeftText(
  boss: Pick<AfterActionStats['boss'], 'hpEnd' | 'hpMax' | 'leftBp'>,
): string {
  return `Boss HP left: ${num(boss.hpEnd)} / ${num(boss.hpMax)} (${percentText(boss.leftBp, boss.hpEnd)})`;
}

/**
 * How far the pool went against what the stage needed. A phase has a threshold under the full pool;
 * the finale needs the whole pool, so there is nothing more to say than the HP left.
 */
export function thresholdText(stats: Pick<AfterActionStats, 'phase' | 'boss'>): string | null {
  if (stats.phase === 'finale') return null;
  return `HP taken off the pool this week: ${num(stats.boss.lost)} (${num(stats.boss.needed)} needed to clear).`;
}

/** "You" for the caller, the display name for others, "Guest" when there is no owner. */
export function whoText(name: string | null, you: boolean): string {
  if (you) return 'You';
  return name === null ? 'Guest' : name;
}

/** A share of a whole as a whole percent (0 when the whole is 0). */
export function sharePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part * 100) / total);
}

/** The value a bar is drawn against: the biggest of the list, at least 1 so a bar never divides by 0. */
export function barMax(values: readonly number[]): number {
  return Math.max(1, ...values);
}

/** The text next to a player's bar: "1200 damage (34%), 1500 contribution". */
export function playerLine(
  player: { damage: number; contribution: number },
  totalDamage: number,
): string {
  return `${num(player.damage)} damage (${num(sharePercent(player.damage, totalDamage))}%), ${num(player.contribution)} contribution`;
}

/** "3. Cindle (Cindle), Misa: 800 damage". The owner is "You" for the caller's own. */
export function creatureLine(c: StatsCreature): string {
  const kind = speciesName(c.species);
  const label = c.name === kind ? c.name : `${c.name} (${kind})`;
  return `${num(c.rank)}. ${label}, ${whoText(c.owner, c.you)}: ${num(c.damage)} damage, ${num(c.contribution)} contribution`;
}

/** "Steam: 9" or "Steam: 9 (2 reflected)". */
export function reactionLine(r: StatsReaction): string {
  return r.reflected > 0
    ? `${r.name}: ${num(r.count)} (${num(r.reflected)} reflected)`
    : `${r.name}: ${num(r.count)}`;
}

/** "Round 3: Bob, Cindle's Flare Strike (default)". */
export function abilityLine(u: StatsAbilityUse): string {
  const what = u.creature === null ? u.ability : `${u.creature}'s ${u.ability}`;
  return `Round ${num(u.round)}: ${whoText(u.player, u.you)}, ${what} (${u.byDefault ? 'default' : 'by hand'})`;
}

/** The count line above the ability list. */
export function abilitySummary(abilities: AfterActionStats['abilities']): string {
  const used = abilities.used.length;
  const byHand = abilities.used.filter((u) => !u.byDefault).length;
  const parts = [`${num(used)} used`, `${num(byHand)} by hand`];
  if (abilities.unused > 0)
    parts.push(`${num(abilities.unused)} did not fire before the fight ended`);
  return parts.join(', ');
}

/** "Round 4: Stormray (Dee)". */
export function knockoutLine(k: StatsKnockout): string {
  return `Round ${num(k.round)}: ${k.creature}, ${whoText(k.owner, k.you)}`;
}

/** The boss's counter-move and whether it was purged. */
export function adaptationLines(a: StatsAdaptation): string[] {
  const resists = a.target === null ? 'nothing to resist' : `resisted ${a.target}`;
  const lines = [
    `Boss counter-move: ${a.name} (${resists}, ${num(Math.round(a.resistBp / 100))}%).`,
  ];
  if (a.purged) {
    lines.push(
      a.restoredRound === null
        ? `Purged in round ${num(a.purgedRound ?? 0)}.`
        : `Purged in round ${num(a.purgedRound ?? 0)}; it applied again from round ${num(a.restoredRound)}.`,
    );
  } else {
    lines.push('Not purged.');
  }
  return lines;
}

/** The first `visible` items, and the rest (for a collapsed "show all"). */
export function splitVisible<T>(items: readonly T[], visible: number): { shown: T[]; rest: T[] } {
  return { shown: items.slice(0, visible), rest: items.slice(visible) };
}

/** The phase a stats card is for, as a heading. */
export function cardTitle(phase: RaidPhaseId): string {
  return `${phaseName(phase)}: after-action`;
}
