/**
 * What the creature popover (the popover of a small creature sprite) needs to know about a creature,
 * and the two spoken labels around it. Pure; `PopoverHost.tsx` draws the popover and `SmallCreature.tsx`
 * is the button that opens it.
 */

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
