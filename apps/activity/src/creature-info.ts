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
  /** The item it wears, for a creature in the living room (set with `ownerName`); null or missing for none. */
  gear?: WornItem | null;
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
 * The plain lines under the popover's title for what the creature info carries beyond its name and
 * level: the owner (and then the species of a nicknamed creature), shiny, Crafting level and Explorer rank.
 * `speciesLabel` is the species' display name. Nothing is invented: a missing field gives no line.
 */
export function creatureFacts(info: CreatureInfo, speciesLabel: string): string[] {
  const lines: string[] = [];
  if (info.ownerName !== undefined) {
    lines.push(`Owner: ${info.ownerName}`);
    if (info.name !== speciesLabel) lines.push(`Species: ${speciesLabel}`);
  }
  if (info.shiny === true) lines.push('Shiny');
  if (info.craftingLevel !== undefined) lines.push(`Crafting level ${String(info.craftingLevel)}`);
  if (info.explorerRank !== undefined) lines.push(`Explorer rank ${String(info.explorerRank)}`);
  return lines;
}

/**
 * The worn item the popover shows: only for a creature in the living room (it has an owner) that wears
 * something. Every other popover (a stage unit, a team member, an explorer) shows no item line.
 */
export function shownWornItem(info: CreatureInfo): WornItem | null {
  return info.ownerName !== undefined && info.gear != null ? info.gear : null;
}

/** The spoken label of a creature that belongs to someone else: "Misa's Splashet, level 12". */
export function ownedCreatureLabel(
  info: Pick<CreatureInfo, 'name' | 'level' | 'ownerName'>,
): string {
  const who = info.ownerName === undefined ? '' : `${info.ownerName}'s `;
  return `${who}${info.name}, level ${String(info.level)}`;
}
