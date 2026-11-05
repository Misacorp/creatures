import { expToReach, RULES as GAME } from '@creatures/game';

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

export { awayShare, catchUpMultiplier, hearthMultiplier, masteryBonus } from '@creatures/game';
