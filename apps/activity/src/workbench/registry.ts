import { accordionEntries } from './entries/accordion';
import { barEntries } from './entries/bars';
import { controlEntries } from './entries/controls';
import { creatureCardEntries } from './entries/creature-card';
import { creaturePageEntries } from './entries/creature-page';
import { creatureEntries } from './entries/creatures';
import { evolveEntries } from './entries/evolve';
import { expeditionWorldEntries } from './entries/expedition-world';
import { flipperEntries } from './entries/flipper';
import { gamesArtEntries } from './entries/games-art';
import { gamesShowEntries } from './entries/games-show';
import { gamesTabEntries } from './entries/games-tab';
import { dataTableEntries } from './entries/data-table';
import { effectEntries } from './entries/effects';
import { dungeonMapEntries } from './entries/dungeon-map';
import { dungeonRunEntries } from './entries/dungeon-run';
import { headingEntries } from './entries/headings';
import { iconEntries } from './entries/icons';
import { jobRevealEntries } from './entries/job-reveal';
import { findEntries } from './entries/find';
import { lootEntries } from './entries/loot';
import { popoverEntries } from './entries/popovers';
import { recipeCardEntries } from './entries/recipe-card';
import { supplyCraftingEntries } from './entries/supply-crafting';
import { raidBoardEntries } from './entries/raid-board';
import { raidSummaryEntries } from './entries/raid-summary';
import { sendFormEntries } from './entries/send-form';
import { skyEntries } from './entries/sky';
import { slotDrawerEntries } from './entries/slot-drawer';
import { slotEntries } from './entries/slots';
import { stageEntries } from './entries/stage';
import { tagEntries } from './entries/tags';
import { talentEntries } from './entries/talents';
import { tripResult } from './entries/trip-result';
import { tripEntries } from './entries/trips';
import { wizardEntries } from './entries/wizard';
import { worldMapEntries } from './entries/world-map';
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
  ...slotDrawerEntries,
  ...raidBoardEntries,
  ...raidSummaryEntries,
  ...lootEntries,
  ...findEntries,
  ...jobRevealEntries,
  ...headingEntries,
  ...iconEntries,
  ...controlEntries,
  ...recipeCardEntries,
  ...supplyCraftingEntries,
  ...accordionEntries,
  ...creatureEntries,
  ...creatureCardEntries,
  ...creaturePageEntries,
  ...dataTableEntries,
  ...effectEntries,
  ...evolveEntries,
  ...flipperEntries,
  ...talentEntries,
  tripResult,
  ...tripEntries,
  ...sendFormEntries,
  ...wizardEntries,
  ...stageEntries,
  ...skyEntries,
  ...dungeonMapEntries,
  ...dungeonRunEntries,
  ...worldMapEntries,
  ...expeditionWorldEntries,
  ...gamesArtEntries,
  ...gamesShowEntries,
  ...gamesTabEntries,
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
