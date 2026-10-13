/**
 * The pure parts of the small-creature popover: what a small creature sprite opens when it is tapped
 * and how that one popover moves between its two faces. It shows the creature (name, level, role and
 * element); tapping the role or the element switches the SAME popover to that glossary entry, with
 * a back control, and Escape goes back before it closes. `Glossary.tsx` draws it with `StagePopover`
 * and the glossary's body; no DOM access here, so all of it is unit-tested.
 */
import { GLOSSARY_IDS } from '@creatures/game';

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

/** The face the popover shows: the creature itself, or one glossary entry reached from it. */
export type PopView =
  { readonly kind: 'creature' } | { readonly kind: 'tag'; readonly entry: string };

/** The face a popover opens on. */
export const CREATURE_VIEW: PopView = { kind: 'creature' };

/** A tag of the creature face: what it says and the glossary entry it switches to. */
export interface CreatureTag {
  kind: 'element' | 'role';
  /** The id of the element or the role, for the colour and the icon. */
  id: string;
  entry: string;
}

/** The creature's two tags, element first. */
export function creatureTags(info: Pick<CreatureInfo, 'element' | 'role'>): CreatureTag[] {
  return [
    { kind: 'element', id: info.element, entry: GLOSSARY_IDS.element(info.element) },
    { kind: 'role', id: info.role, entry: GLOSSARY_IDS.role(info.role) },
  ];
}

/** A tap on one of the tags: the same popover shows that entry (there is one face at a time). */
export function openTag(entry: string): PopView {
  return { kind: 'tag', entry };
}

/** The back control: always to the creature, whichever entry (or chain of entries) was open. */
export function goBack(): PopView {
  return CREATURE_VIEW;
}

/** True when there is a creature face to go back to. */
export function canGoBack(view: PopView): boolean {
  return view.kind === 'tag';
}

/** What Escape does: on an entry it goes back to the creature, on the creature it closes. */
export function onEscape(view: PopView): { view: PopView; close: boolean } {
  return view.kind === 'tag' ? { view: CREATURE_VIEW, close: false } : { view, close: true };
}

/** The open popover: which creature, which face, and the element it points at. */
export interface ActiveCreature<A> {
  /** A key that is the same for the same creature at the same place, so a second tap closes it. */
  key: string;
  info: CreatureInfo;
  view: PopView;
  anchor: A;
}

/**
 * A tap on a small creature: opens its popover, or closes it when that very creature's popover is
 * already open (on either face). Tapping another creature switches to it, on the creature face.
 */
export function toggleCreature<A>(
  current: ActiveCreature<A> | null,
  next: Omit<ActiveCreature<A>, 'view'>,
): ActiveCreature<A> | null {
  if (current !== null && current.key === next.key && current.anchor === next.anchor) return null;
  return { ...next, view: CREATURE_VIEW };
}

/** The spoken label of a small creature's button. */
export function creatureButtonLabel(info: Pick<CreatureInfo, 'name' | 'level'>): string {
  return `${info.name}, level ${String(info.level)}. Shows its role and element.`;
}

/** The label of the back control: where it goes. */
export function backLabel(info: Pick<CreatureInfo, 'name'>): string {
  return `Back to ${info.name}`;
}
