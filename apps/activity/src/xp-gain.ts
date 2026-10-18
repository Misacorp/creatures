/**
 * What `ui/XpGain.tsx` is given for the two kinds of XP a claimed Workshop job pays: the worker's experience
 * (an `ExperienceView`, as on a trip or a dungeon run) and the Crafting skill's own XP. Pure. The server
 * decides every number (`gained`, `exp`, `needed`, `skillXp`); this only places them on a bar, with the
 * game's own Crafting thresholds (`skillLevel`, `nextSkillXp`, `RULES.gear.skill.xpForLevel`).
 */
import { RULES, nextSkillXp, skillLevel } from '@creatures/game';
import type { ExperienceView } from './experience';
import type { JobCommon } from './gear-types';
import type { XpGainBar } from './ui/XpGain';

/** A worker's experience as one line of the list: the level change, the gain, the tags and the bar. */
export interface ExperienceGain {
  levels: { from: number; to: number };
  /** "+8". */
  gain: string;
  treat: boolean;
  gold: boolean;
  /** Waits at its level for a ribbon or its evolution (not with the Gold Ribbon, which has its own tag). */
  waiting: boolean;
  bar: XpGainBar;
}

/** The experience a creature was paid: its level now and the way to the next, from what the server sent. */
export function experienceGain(view: ExperienceView, name: string): ExperienceGain {
  const bar: XpGainBar =
    view.needed === null
      ? { value: 1, max: 1, text: 'Top level', startCap: `Lv ${String(view.level)}`, label: '' }
      : {
          value: view.exp,
          max: view.needed,
          startCap: `Lv ${String(view.level)}`,
          endCap: `Lv ${String(view.level + 1)}`,
          label: '',
        };
  return {
    levels: { from: view.levelBefore, to: view.level },
    gain: `+${String(view.gained)}`,
    treat: view.treat,
    gold: view.gold,
    waiting: view.waiting && !view.gold,
    bar: { ...bar, label: `${name}'s experience` },
  };
}

/** The Crafting skill's XP paid by a job: the level change, the gain and the bar from the level's start to the next. */
export interface CraftingGain {
  levels: { from: number; to: number };
  gain: string;
  leveledUp: boolean;
  bar: XpGainBar;
}

export function craftingGain(
  result: Pick<JobCommon, 'xp' | 'skillXp' | 'skillLevel' | 'leveledUp'>,
  name: string,
): CraftingGain {
  const level = result.skillLevel;
  const startCap = `Lv ${String(level)}`;
  const from = Math.min(level, skillLevel(Math.max(0, result.skillXp - result.xp)));
  const next = nextSkillXp(level);
  const start = RULES.gear.skill.xpForLevel[level - 1] ?? 0;
  const label = `${name}'s Crafting XP`;
  const bar: XpGainBar =
    next === null
      ? { value: 1, max: 1, text: 'Top level', startCap, label, kind: 'crafting' }
      : {
          value: Math.max(0, result.skillXp - start),
          max: Math.max(1, next - start),
          startCap,
          endCap: `Lv ${String(level + 1)}`,
          label,
          kind: 'crafting',
        };
  return {
    levels: { from, to: level },
    gain: `+${String(result.xp)}`,
    leveledUp: result.leveledUp,
    bar,
  };
}
