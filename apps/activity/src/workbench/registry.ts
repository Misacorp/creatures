import { barEntries } from './entries/bars';
import { controlEntries } from './entries/controls';
import { creatureCardEntries } from './entries/creature-card';
import { creatureEntries } from './entries/creatures';
import { headingEntries } from './entries/headings';
import { iconEntries } from './entries/icons';
import { lootEntries } from './entries/loot';
import { popoverEntries } from './entries/popovers';
import { raidBoardEntries } from './entries/raid-board';
import { skyEntries } from './entries/sky';
import { slotEntries } from './entries/slots';
import { stageEntries } from './entries/stage';
import { tagEntries } from './entries/tags';
import { talentEntries } from './entries/talents';
import { GROUPS, type Entry, type Group } from './types';

/**
 * Every component page of the workbench. To add one: write an `Entry` in the file of its group
 * under `entries/` and it shows up here (see `docs/design/workbench.md`). The registry test
 * (`registry.test.ts`) fails when a component of `src/ui/` has no page.
 */
export const ENTRIES: readonly Entry[] = [
  ...barEntries,
  ...tagEntries,
  ...popoverEntries,
  ...slotEntries,
  ...raidBoardEntries,
  ...lootEntries,
  ...headingEntries,
  ...iconEntries,
  ...controlEntries,
  ...creatureEntries,
  ...creatureCardEntries,
  ...talentEntries,
  ...stageEntries,
  ...skyEntries,
];

export function findEntry(name: string | null): Entry | null {
  return ENTRIES.find((e) => e.name === name) ?? null;
}

/** A page by name; throws when there is none (for tests and code that knows the name). */
export function requireEntry(name: string): Entry {
  const entry = findEntry(name);
  if (entry === null) throw new Error(`The workbench has no page named ${name}`);
  return entry;
}

/** The pages of each group, in the order of the groups; empty groups are left out. */
export function entriesByGroup(
  entries: readonly Entry[] = ENTRIES,
): { group: Group; entries: Entry[] }[] {
  return GROUPS.map((group) => ({
    group,
    entries: entries.filter((e) => e.group === group),
  })).filter((g) => g.entries.length > 0);
}

/** Every exported name the workbench shows: the page names and what pages say they cover. */
export function coveredNames(entries: readonly Entry[] = ENTRIES): Set<string> {
  return new Set(entries.flatMap((e) => [e.name, ...(e.covers ?? [])]));
}
