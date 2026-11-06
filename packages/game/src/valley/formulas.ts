import { RULES as GAME } from '../rules/config';
import { expToReach } from '../rules/experience';
import type { AwayCurve, ValleyRules } from './rules';

/**
 * The valley's pure formulas (docs/design/valley/economy/model.md): the lab and the server share them, so a number moves in one
 * place. Each takes the rules (the lab's tuner passes its own copy with a dial moved) and nothing else.
 */

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** The parts of the rules these formulas read. */
type AwayRules = Pick<ValleyRules, 'away'>;
type CatchUpRules = Pick<ValleyRules, 'bonfire'>;
type MasteryRules = Pick<ValleyRules, 'posts'>;

/** V-POST-10: the share of idle gains `hours` after the last visit (the away steps). */
export function awayShare(rules: AwayRules, curve: AwayCurve, hours: number): number {
  for (const step of rules.away[curve]) if (hours < step.until) return step.share;
  return rules.away.beyond;
}

/** V-BON-2: the XP multiplier of a creature `gap` levels below its target: the top multiplier at the full gap, fading to x1 at the target. */
export function catchUpMultiplier(rules: CatchUpRules, gap: number): number {
  const { maxMultiplier, fullAtGap } = rules.bonfire.catchUp;
  return 1 + (maxMultiplier - 1) * clamp(gap / fullAtGap, 0, 1);
}

/** V-BON-7: the hearth's growth multiplier at a bonfire level (level 1 is the plain fire). */
export const hearthMultiplier = (rules: CatchUpRules, level: number): number =>
  1 + rules.bonfire.hearth.perLevel * (level - 1);

/** V-POST-12: the output bonus of a seat's mastery after `hours` of effective work (0 below Skilled). */
export function masteryBonus(rules: MasteryRules, hours: number): number {
  let bonus = 0;
  for (const step of rules.posts.mastery) if (hours >= step.hours) bonus = step.bonus;
  return bonus;
}

/** The creature level table as total XP (`xpAtLevel(l)` is the XP to be level `l`), built once. */
let levelXp: number[] | null = null;
function levelTable(): number[] {
  if (levelXp === null) {
    levelXp = [0];
    for (let l = 1; l <= GAME.experience.maxLevel; l++) levelXp.push(expToReach(l));
  }
  return levelXp;
}

/** The total XP a creature holds at the start of `level` (1 and below: 0; above the top level: the top's). */
export function xpAtLevel(level: number): number {
  const table = levelTable();
  return table[Math.min(Math.max(1, Math.floor(level)), GAME.experience.maxLevel)] ?? 0;
}

/** The level a total of `xp` reaches (no ribbons or species cap; a hair of tolerance so an exact total counts). */
export function levelAtXp(xp: number): number {
  const table = levelTable();
  let level = 1;
  while (level < GAME.experience.maxLevel && xp + 1e-9 >= (table[level + 1] ?? Infinity)) level += 1;
  return level;
}
