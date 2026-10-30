import { LEVEL_XP, MAX_LEVEL, catchUpMultiplier } from './curves';
import type { Rules } from './rules';
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

/** Raises a creature's level to what its XP and ceiling allow (also after a ribbon or an evolution opens the way). */
export function relevel(c: Creature): void {
  while (c.level < c.ceiling && c.xp >= (LEVEL_XP[c.level + 1] ?? Infinity)) c.level += 1;
}

/** One hour of idle XP for every creature, at a post or at the fire (V-POST-3, V-BON-1), with the hearth, the away step and catch-up. */
export function accrueIdleXp(p: Player, hour: number, share: number, hearth: number): void {
  const base = p.rules.xp.idlePerHour * hearth * share;
  let bonus = 0;
  for (const c of p.creatures) {
    const mult = hour < c.catchUntil ? c.catchMult : 1;
    bonus += base * (mult - 1);
    addXp(p, c, base * mult);
  }
  p.wk.xpIdle += base * p.creatures.length;
  p.wk.creatureHours += p.creatures.length;
  p.wk.xpCatch += bonus;
}

/** The levels of a player's creatures, best first. */
export const levelsDesc = (p: Player): number[] =>
  p.creatures.map((c) => c.level).sort((a, b) => b - a);

/** The mean of the player's three best levels (the server's middle is the median of these over active players). */
export function topThreeMean(p: Player): number {
  const lv = levelsDesc(p).slice(0, 3);
  return lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 1;
}

/** V-BON-2: fixes each creature's catch-up multiplier for the next 24 hours, toward the higher of the 3rd best and the server's middle. */
export function setCatchUp(p: Player, hour: number, middle: number): void {
  const lv = levelsDesc(p);
  const third = lv[Math.min(2, lv.length - 1)] ?? 1;
  const target = Math.max(third, middle);
  for (const c of p.creatures) {
    c.catchMult = catchUpMultiplier(p.rules, target - c.level);
    c.catchUntil = hour + p.rules.bonfire.catchUp.holdHours;
  }
}

/** Fight XP to the `team` best creatures (the dungeon and the raid; away steps and catch-up never apply, V-POST-10). */
export function fightXp(
  p: Player,
  amount: number,
  source: 'xpDungeon' | 'xpRaid',
  hour: number,
): void {
  const team = [...p.creatures].sort((a, b) => b.xp - a.xp).slice(0, p.rules.fights.team);
  for (const c of team) {
    const boosted =
      p.rules.bonfire.catchUp.appliesToFights && hour < c.catchUntil ? c.catchMult : 1;
    addXp(p, c, amount * boosted);
    p.wk[source] += amount * boosted;
  }
}

/** The server's middle (V-BON-2): the median of the active players' top-three levels. */
export const serverMiddle = (players: readonly Player[], activeIds: readonly number[]): number =>
  median(activeIds.map((id) => topThreeMean(players[id] as Player)));

export const atTopLevel = (p: Player): number =>
  p.creatures.filter((c) => c.level >= MAX_LEVEL).length;

/** Whether a creature waits at its gate for a ribbon (its way is shut by the next ribbon, not by an evolution). */
export const waitsForRibbon = (rules: Rules, c: Creature): boolean =>
  c.level >= c.ceiling &&
  c.ceiling < MAX_LEVEL &&
  c.ceiling === (rules.xp.ribbons[c.ribbons]?.level ?? 0);
