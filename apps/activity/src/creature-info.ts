/**
 * What the creature popover (the popover of a small creature sprite) needs to know about a creature,
 * and the two spoken labels around it. Pure; `PopoverHost.tsx` draws the popover and `SmallCreature.tsx`
 * is the button that opens it.
 */
import type { WornItem } from './gear-view';

/** What the popover needs to know about a creature. Names can carry player text: draw them as text. */
export interface CreatureInfo {
  /** The name shown (the nickname or the species name). */
  name: string;
  /** The species id, for the picture. */
  species: string;
  level: number;
  /** An element id (`tide`...) and a role id (`guard`...). */
  element: string;
  role: string;
  /** Whose creature it is (a player's display name, as text); left out for your own team. */
  ownerName?: string;
  shiny?: boolean;
  /** The owner's Crafting level and this creature's Explorer rank, when known. */
  craftingLevel?: number;
  explorerRank?: number;
  /** One short line about what it does for the creatures around it (a board's `effectLine`), when it does something. */
  effect?: string;
  /** The items it wears, for a creature in the living room (set with `ownerName`); empty or missing for none. */
  gear?: readonly WornItem[];
  /** Your own lounger in the living room only: what lounging gave it today (its "Lounging 34 / 60 XP" tag). */
  loungeXp?: number;
}

/** The popover info of anything that is a creature on screen (a stage unit, a team member, an explorer). */
export function creatureInfoOf(c: CreatureInfo): CreatureInfo {
  return { name: c.name, species: c.species, level: c.level, element: c.element, role: c.role };
}

/** The spoken label of a small creature's button. */
export function creatureButtonLabel(info: Pick<CreatureInfo, 'name' | 'level'>): string {
  return `${info.name}, level ${String(info.level)}. Shows its role and element.`;
}

/** The label of the back control: where it goes. */
export function backLabel(info: Pick<CreatureInfo, 'name'>): string {
  return `Back to ${info.name}`;
}

/**
 * The facts of the popover, as rows of its data table: the level, then what the creature info carries beyond
 * its name: the owner (and then the species of a nicknamed creature), Crafting level and Explorer rank.
 * `speciesLabel` is the species' display name. Nothing is invented: a missing field gives no row. Shiny is a
 * tag beside the name, and a board's effect line is its own sentence under the table.
 */
export function creatureFactRows(
  info: CreatureInfo,
  speciesLabel: string,
): { label: string; value: string }[] {
  const rows = [{ label: 'Level', value: String(info.level) }];
  if (info.ownerName !== undefined) {
    rows.push({ label: 'Owner', value: info.ownerName });
    if (info.name !== speciesLabel) rows.push({ label: 'Species', value: speciesLabel });
  }
  if (info.craftingLevel !== undefined) {
    rows.push({ label: 'Crafting level', value: String(info.craftingLevel) });
  }
  if (info.explorerRank !== undefined) {
    rows.push({ label: 'Explorer rank', value: String(info.explorerRank) });
  }
  return rows;
}

/**
 * The worn items the popover shows: only for a creature in the living room (it has an owner) that wears
 * something. Every other popover (a stage unit, a team member, an explorer) shows no item lines.
 */
export function shownWornItems(info: CreatureInfo): readonly WornItem[] {
  return info.ownerName !== undefined && info.gear !== undefined ? info.gear : [];
}

/** The spoken label of a creature that belongs to someone else: "Misa's Splashet, level 12". */
export function ownedCreatureLabel(
  info: Pick<CreatureInfo, 'name' | 'level' | 'ownerName'>,
): string {
  const who = info.ownerName === undefined ? '' : `${info.ownerName}'s `;
  return `${who}${info.name}, level ${String(info.level)}`;
}
