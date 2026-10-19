/**
 * The three kinds of XP gain as the shared row (`ui/XpGain.tsx`) is given them: a creature's experience (an
 * `ExperienceView`, from a trip, a dungeon run or a Workshop job), a job's Crafting XP and a trip's explorer
 * XP. Pure. The server decides every number (`gained`, `exp`, `needed`, `skillXp`, the rank's XP) and what
 * changed it (`boost`); this only places them on the bars, with the game's own thresholds.
 */
import { RULES, nextSkillXp, skillLevel } from '@creatures/game';
import type { ExperienceView, XpBoost } from './experience';
import type { JobCommon } from './gear-types';
import { experienceBoost } from './xp-boost-view';
import { xpChange, type XpChange } from './xp-change';

/** A creature's experience: its level now and the way to the next, from what the server sent. */
export function experienceGain(view: ExperienceView, name: string): XpChange {
  return xpChange({
    kind: 'experience',
    levelBefore: view.levelBefore,
    level: view.level,
    value: view.exp,
    max: view.needed,
    gained: view.gained,
    label: `${name}'s experience`,
    boost: experienceBoost(view),
    gold: view.gold,
    waiting: view.waiting && !view.gold,
  });
}

/** The Crafting skill's XP paid by a job: the level it reached and the bar from the level's start to the next. */
export function craftingGain(
  result: Pick<JobCommon, 'xp' | 'xpBoost' | 'skillXp' | 'skillLevel'>,
  name: string,
): XpChange {
  const level = result.skillLevel;
  const next = nextSkillXp(level);
  const start = RULES.gear.skill.xpForLevel[level - 1] ?? 0;
  return xpChange({
    kind: 'crafting',
    levelBefore: Math.min(level, skillLevel(Math.max(0, result.skillXp - result.xp))),
    level,
    value: Math.max(0, result.skillXp - start),
    max: next === null ? null : Math.max(1, next - start),
    gained: result.xp,
    label: `${name}'s Crafting XP`,
    boost: result.xpBoost ?? null,
  });
}

/** A trip's explorer XP: the rank reached and the bar from the rank's start to the next (null at the top). */
export function explorerGain(input: {
  gained: number;
  rank: number;
  rankBefore: number;
  value: number;
  max: number | null;
  boost?: XpBoost | undefined;
  name: string;
}): XpChange {
  return xpChange({
    kind: 'explorer',
    levelBefore: input.rankBefore,
    level: input.rank,
    value: input.value,
    max: input.max,
    gained: input.gained,
    label: `${input.name}'s explorer XP`,
    boost: input.boost ?? null,
  });
}
