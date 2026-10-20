/**
 * What the foe popover tells about a dungeon foe or a raid boss: its name, element, HP, a line about
 * it and what it does (its basic attack and its tricks), all read from the content data by id. Pure;
 * the popover draws it (`PopoverHost.tsx`, opened by tapping the foe on the fight stage). Every string
 * is plain text.
 */
import { content, dungeonContent, lore, type Gimmick } from '@creatures/game';
import { foeDodgeText } from './dodge-view';
import { gimmickText } from './raid-text';

/** What the foe popover shows. */
export interface FoeInfo {
  /** The content id of the foe or boss: it picks the picture. */
  id: string;
  name: string;
  /** An element id (`tide`...). */
  element: string;
  /** Its HP when the fight starts. */
  hp: number;
  /** A line about it from the content (a foe's flavour, a boss's description), or null. */
  about: string | null;
  /** Its dodge chance ("Dodge 2%") while dodge is on; null while it is off or the foe has no Speed. */
  dodge: string | null;
  /** What it does, one line each: the basic attack first, then its tricks. */
  moves: readonly string[];
}

/** The basic attack every foe and boss has. */
const ATTACK_LINE = 'Attack. Every round: strikes one of your creatures.';

/** The element of a foe or boss from its content, or null for an id the content does not have. */
export function foeElement(id: string): string | null {
  const boss = content.bosses.find((b) => b.id === id);
  if (boss !== undefined) return boss.element;
  return dungeonContent.foes.find((f) => f.id === id)?.element ?? null;
}

/**
 * The gimmicks a foe or boss has in this fight: its own from the content, then those its room's
 * modifier adds (Thorns' reflect), each once.
 */
function gimmicksOf(id: string, added: readonly Gimmick[]): Gimmick[] {
  const own =
    content.bosses.find((b) => b.id === id)?.gimmicks ??
    dungeonContent.foes.find((f) => f.id === id)?.gimmicks ??
    [];
  const all: Gimmick[] = [...own];
  for (const g of added) if (!all.some((o) => o.id === g.id)) all.push(g);
  return all;
}

/** The foe's or boss's dodge ("Dodge 2%", from its base Speed) while dodge is on, else null. */
export function foeDodge(id: string): string | null {
  const baseSpd =
    content.bosses.find((b) => b.id === id)?.baseSpd ??
    dungeonContent.foes.find((f) => f.id === id)?.baseSpd;
  const text = foeDodgeText(baseSpd);
  return text === null ? null : `Dodge ${text}`;
}

/** The line about the foe from the content. */
function aboutOf(id: string): string | null {
  const foe = dungeonContent.foes.find((f) => f.id === id);
  if (foe !== undefined) return foe.flavor;
  return lore.bosses[id]?.description ?? null;
}

/**
 * The popover's info for the foe on the stage. `element` is the one the server sent, when there is
 * one (the content's own otherwise). `added` are the gimmicks the room's modifier gives the foe.
 * `wording` is the stage's: `row` for the dungeon (a hit lands on "the left creature"), `zones` for
 * the raid.
 */
export function foeInfoOf(args: {
  id: string;
  name: string;
  element?: string | undefined;
  hp: number;
  added?: readonly Gimmick[];
  wording: 'zones' | 'row';
}): FoeInfo {
  const { id, wording } = args;
  return {
    id,
    name: args.name,
    element: args.element ?? foeElement(id) ?? 'unknown',
    hp: args.hp,
    about: aboutOf(id),
    dodge: foeDodge(id),
    moves: [
      ATTACK_LINE,
      ...gimmicksOf(id, args.added ?? []).map((g) => `${g.name}. ${gimmickText(g, wording)}`),
    ],
  };
}

/** The spoken label of the button on the foe's picture. */
export function foeButtonLabel(name: string): string {
  return `${name}. Shows its element, HP and moves.`;
}
