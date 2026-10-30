import type { Rules } from './rules';
import type { Player } from './types';
import { uniform } from './util';
import type { Rng } from '@creatures/game';

/**
 * Modifier lines, minimal (V-GEAR-12, `rules.gear`): a worn piece has 1, 3 or 5 lines by rarity, each a pip tier drawn from what its item
 * level allows. The lab does not model what a line does; it only needs "how good are the best piece's lines" for the visitor's rerolls.
 */

/** The highest pip tier a piece of this item level can roll (1 below the first threshold, then one more at each). */
export const tiersAt = (rules: Rules, ilvl: number): number =>
  1 + rules.gear.pipFrom.filter((t) => ilvl >= t).length;

/** Rolls the lines of a piece: each is the top pip its level allows with `topPipChance`, else a lower tier with equal chances. */
export function rollLines(rng: Rng, rules: Rules, rarity: number, ilvl: number): number[] {
  const count = rules.gear.lines[rarity] ?? 1;
  const top = tiersAt(rules, ilvl);
  return Array.from({ length: count }, () => {
    if (top === 1) return 1;
    if (uniform(rng) < rules.gear.topPipChance) return top;
    return 1 + Math.floor(uniform(rng) * (top - 1));
  });
}

/** How many lines are the top pip the item level allows (0 below the first threshold: one pip is not a "top" line). */
export const topCount = (rules: Rules, ilvl: number, lines: readonly number[]): number => {
  const top = tiersAt(rules, ilvl);
  return top <= 1 ? 0 : lines.filter((l) => l === top).length;
};

export interface Worn {
  creature: number;
  slot: number;
  ilvl: number;
  rarity: number;
  lines: number[];
}

/** Every piece worn by the player's creatures. */
export function wornPieces(p: Player): Worn[] {
  const out: Worn[] = [];
  p.creatures.forEach((c, creature) =>
    c.gear.forEach((ilvl, slot) => {
      if (ilvl > 0) {
        out.push({
          creature,
          slot,
          ilvl,
          rarity: c.gearRarity[slot] ?? 0,
          lines: c.gearLines[slot] ?? [],
        });
      }
    }),
  );
  return out;
}

/** Whether the player wears an epic with at least 4 of its 5 lines at the top pip (the panel's "4-of-5 top-pip epic"). */
export const hasFourOfFive = (p: Player): boolean =>
  wornPieces(p).some((w) => w.rarity === 2 && topCount(p.rules, w.ilvl, w.lines) >= 4);

/** The worn piece with the most pips in all, its pips and their share of the most a piece of its rarity and level could have. */
export function bestPiece(p: Player): { pips: number; share: number } {
  let best = { pips: 0, share: 0 };
  for (const w of wornPieces(p)) {
    const pips = w.lines.reduce((a, b) => a + b, 0);
    const most = w.lines.length * tiersAt(p.rules, w.ilvl);
    // The best piece has the most pips; ties go to the higher share.
    if (pips > best.pips || (pips === best.pips && most > 0 && pips / most > best.share))
      best = { pips, share: most > 0 ? pips / most : 0 };
  }
  return best;
}
