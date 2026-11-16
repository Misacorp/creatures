/**
 * What a board creature of a combat v2 week carries for the right drawer (`v2.creatures[]`: its slotted talents and what it wears), turned
 * into what the game's own talent chip and gear list draw. Pure. The server sends a talent as its id only, and the client does not carry
 * the combat data (it must stay out of the game's bundle), so a talent is named from its id ("first-pounce" is "First pounce"); sending the
 * name and text with the id would make it exact. Gear lines are the server's own text, drawn as text.
 */

import type { WornItem } from '../gear-view';
import type { TalentView } from '../talent-types';
import type { BoardCreatureV2 } from '../raid-v2-api';

/** A talent id as words: "first-pounce" is "First pounce". */
export const talentWords = (id: string): string => {
  const words = id.replace(/-/g, ' ');
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
};

/** The talents of a board creature in slot order. */
export function talentsOf(entry: BoardCreatureV2 | undefined): TalentView[] {
  return (entry?.talents ?? []).map((t) => ({
    id: t.id,
    name: talentWords(t.id),
    text: '',
    about: '',
    golden: t.golden,
    idle: false,
  }));
}

/** The gear a board creature wears, as the gear list draws it: only the lines that do something for the wearer. */
export function gearOf(entry: BoardCreatureV2 | undefined): WornItem[] {
  return (entry?.gear ?? []).map((g) => ({
    baseId: g.baseId,
    slot: g.slot,
    rarity: g.rarity,
    itemLevel: g.itemLevel,
    lines: g.lines.filter((l) => l.active !== false).map((l) => l.text),
  }));
}
