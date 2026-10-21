/**
 * Who can do a Workshop job, as the job wizard's first step lists them. Pure: the server checks every start
 * again, this only sorts the creatures and says why nobody can.
 *
 * Three groups: the creatures that can do it now (free, at the job's Crafting level, best crafter first), the
 * ones at the level that are busy (listed, greyed, with "On a job" or "Away on a trip"), and the ones under the
 * level, which the screen folds into one summary row instead of listing them one by one (Misa, 2026-10-21).
 */
import type { Creature } from './api';
import type { GearState } from './gear-types';
import { pickerOptions, type PickerOption } from './gear-view';

export interface JobWho {
  /** Free and at the level, best crafter (shortest time) first. */
  able: PickerOption[];
  /** At the level but busy, each with its reason. */
  busy: PickerOption[];
  /** Under the level, closest first, each with "Needs Crafting level N" as its reason. */
  tooLow: PickerOption[];
  /** The creature picked when the player has not picked: the first that can do it; null when nobody can. */
  pick: string | null;
  /** The folded row's words ("4 more need Crafting level 3"); null when nobody is under the level. */
  summary: string | null;
  /** Why nobody can do it; null when somebody can. Said in the footer, so a grey button is never silent. */
  blocker: string | null;
}

/** The reason of a creature under the level (also the words of its row). */
export function needsLevelReason(minLevel: number): string {
  return `Needs Crafting level ${String(minLevel)}`;
}

/** The folded row: "4 more need Crafting level 3", "1 more needs ..."; without "more" when nobody else is listed. */
function summaryText(count: number, minLevel: number, others: boolean): string {
  const more = others ? ' more' : '';
  return `${String(count)}${more} ${count === 1 ? 'needs' : 'need'} Crafting level ${String(minLevel)}`;
}

export function jobWho(
  creatures: readonly Creature[],
  skills: GearState['skills'],
  durationAtLevel: (level: number) => number,
  minLevel: number,
): JobWho {
  const all = pickerOptions(creatures, skills, durationAtLevel);
  const reason = needsLevelReason(minLevel);
  const tooLow = all
    .filter((o) => o.level < minLevel)
    .sort((a, b) => b.level - a.level)
    .map((o) => ({ ...o, busy: reason }));
  const atLevel = all.filter((o) => o.level >= minLevel);
  const able = atLevel.filter((o) => o.busy === null);
  const busy = atLevel.filter((o) => o.busy !== null);
  let blocker: string | null = null;
  if (able.length === 0 && creatures.length > 0) {
    blocker =
      atLevel.length === 0 ? `${reason}.` : `Nobody free has Crafting level ${String(minLevel)}.`;
  }
  return {
    able,
    busy,
    tooLow,
    pick: able[0]?.creature.id ?? null,
    summary: tooLow.length === 0 ? null : summaryText(tooLow.length, minLevel, atLevel.length > 0),
    blocker,
  };
}
