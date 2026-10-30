import { expToReach, RULES as GAME } from '@creatures/game';
import type { AwayCurve, Rules } from './rules';
import { clamp } from './util';

/** The shipped level curve as a table: `LEVEL_XP[l]` is the total XP to be level `l` (index 0 unused). */
export const MAX_LEVEL = GAME.experience.maxLevel;
export const LEVEL_XP: readonly number[] = [
  0,
  ...Array.from({ length: MAX_LEVEL + 1 }, (_, i) => expToReach(i + 1)),
];

/** The level of a creature with this much XP (no ceiling). */
export function levelOfXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= (LEVEL_XP[level + 1] ?? Infinity)) level += 1;
  return level;
}

/** V-POST-10: the share of idle gains `hours` after the last visit. */
export function awayShare(rules: Rules, curve: AwayCurve, hours: number): number {
  for (const step of rules.away[curve]) if (hours < step.until) return step.share;
  return rules.away.beyond;
}

/** V-BON-2: the XP multiplier of a creature `gap` levels below its target: x2 at the full gap, fading to x1 at the target. */
export function catchUpMultiplier(rules: Rules, gap: number): number {
  const { maxMultiplier, fullAtGap } = rules.bonfire.catchUp;
  return 1 + (maxMultiplier - 1) * clamp(gap / fullAtGap, 0, 1);
}

/** V-BON-7: the hearth's growth multiplier at a bonfire level (level 1 is the plain fire). */
export const hearthMultiplier = (rules: Rules, level: number): number =>
  1 + rules.bonfire.hearth.perLevel * (level - 1);

/** V-POST-12: the output bonus of a seat's mastery after `hours` of effective work (0 below Skilled). */
export function masteryBonus(rules: Rules, hours: number): number {
  let bonus = 0;
  for (const step of rules.posts.mastery) if (hours >= step.hours) bonus = step.bonus;
  return bonus;
}
