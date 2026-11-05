import { LEVEL_XP, MAX_LEVEL, catchUpMultiplier } from './curves';
import type { Creature, Player } from './types';
import { median } from './util';

/** Adds XP to a creature (V-BON-1 ...): it levels while it has the XP and the way is open; XP above the bank is lost. */
export function addXp(p: Player, c: Creature, amount: number): void {
  c.xp += amount;
  if (c.xp > c.capXp) {
    p.wk.xpLost += c.xp - c.capXp;
    c.xp = c.capXp;
  }
  relevel(c);
}

/** Raises a creature's level to what its XP and ceiling allow (also after an evolution opens the way). */
export function relevel(c: Creature): void {
  while (c.level < c.ceiling && c.xp >= (LEVEL_XP[c.level + 1] ?? Infinity)) c.level += 1;
}

/** One hour of idle XP for every creature, at a post or at the fire (V-POST-3, V-BON-1), with the hearth, the away step and catch-up. */
export function accrueIdleXp(p: Player, share: number, hearth: number): void {
  const base = p.rules.xp.idlePerHour * hearth * share;
  let bonus = 0;
  for (const c of p.creatures) {
    const mult = effectiveCatchUp(p, c);
    bonus += base * (mult - 1);
    addXp(p, c, base * mult);
  }
  p.wk.xpIdle += base * p.creatures.length;
  p.wk.creatureHours += p.creatures.length;
  p.wk.xpCatch += bonus;
}

/**
 * V-BON-2 (Q35 B): the multiplier a creature earns now. It was fixed at the last visit and holds until the next one, but never above
 * the target it was fixed for: it fades as the creature closes the gap, exactly as it would if it were worked out every hour, and it
 * never rises, so a player who visits less often cannot earn more of it than one who visits daily (tested).
 */
export function effectiveCatchUp(p: Player, c: Creature): number {
  if (c.catchMult <= 1) return 1;
  return Math.min(c.catchMult, catchUpMultiplier(p.rules, c.catchTarget - c.level));
}

/** The levels of a player's creatures, best first. */
export const levelsDesc = (p: Player): number[] =>
  p.creatures.map((c) => c.level).sort((a, b) => b - a);

/** The mean of the player's three best levels (the server's middle is the median of these over active players). */
export function topThreeMean(p: Player): number {
  const lv = levelsDesc(p).slice(0, 3);
  return lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 1;
}

/** V-BON-2 (Q35 B): fixes each creature's catch-up multiplier at a visit, toward the higher of the 3rd best and the server's middle; it holds until the next visit. */
export function setCatchUp(p: Player, middle: number): void {
  const lv = levelsDesc(p);
  const third = lv[Math.min(2, lv.length - 1)] ?? 1;
  const target = Math.max(third, middle);
  for (const c of p.creatures) {
    c.catchMult = catchUpMultiplier(p.rules, target - c.level);
    c.catchTarget = target;
  }
}

/** Fight XP to a team (the dungeon and the raid; away steps and catch-up never apply, V-POST-10). */
export function fightXp(
  p: Player,
  amount: number,
  source: 'xpDungeon' | 'xpRaid',
  team: readonly Creature[],
): void {
  for (const c of team) {
    const boosted = p.rules.bonfire.catchUp.appliesToFights ? effectiveCatchUp(p, c) : 1;
    addXp(p, c, amount * boosted);
    p.wk[source] += amount * boosted;
  }
}

/** The server's middle (V-BON-2): the median of the active players' top-three levels. */
export const serverMiddle = (players: readonly Player[], activeIds: readonly number[]): number =>
  median(activeIds.map((id) => topThreeMean(players[id] as Player)));

export const atTopLevel = (p: Player): number =>
  p.creatures.filter((c) => c.level >= MAX_LEVEL).length;
