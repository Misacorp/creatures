/**
 * The state side of the Accordion (`Accordion.tsx`): what is remembered per viewer, whether motion is
 * allowed, and the little context objects the group and nested accordions share. No drawing here.
 */
import { createContext } from 'preact';

/** The part of Web Storage an accordion uses (so tests can pass a fake). */
export interface AccordionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Where one accordion's open or closed state is kept. Put the viewer's id in `persistKey`. */
export function accordionStorageKey(persistKey: string): string {
  return `creatures:accordion:${persistKey}`;
}

/** The browser's storage, or null where it is missing or blocked (inside Discord it may be). */
export function browserAccordionStorage(): AccordionStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** What was remembered for this key: true, false, or null when nothing (usable) is stored. */
export function loadAccordionOpen(persistKey: string): boolean | null {
  try {
    const raw = browserAccordionStorage()?.getItem(accordionStorageKey(persistKey)) ?? null;
    return raw === '1' ? true : raw === '0' ? false : null;
  } catch {
    return null;
  }
}

export function saveAccordionOpen(persistKey: string, open: boolean): void {
  try {
    browserAccordionStorage()?.setItem(accordionStorageKey(persistKey), open ? '1' : '0');
  } catch {
    // Storage is a convenience: when it is full or blocked the accordion still works.
  }
}

/** A group remembers the name of its open item ('' for none); names are short ids, never text. */
const NAME_LIMIT = 64;

/** The remembered open item of a group: a name, '' for "none open", or null when nothing is stored. */
export function loadGroupOpen(persistKey: string): string | null {
  try {
    const raw = browserAccordionStorage()?.getItem(accordionStorageKey(persistKey)) ?? null;
    return raw !== null && raw.length <= NAME_LIMIT ? raw : null;
  } catch {
    return null;
  }
}

export function saveGroupOpen(persistKey: string, name: string | null): void {
  try {
    browserAccordionStorage()?.setItem(accordionStorageKey(persistKey), name ?? '');
  } catch {
    // See saveAccordionOpen.
  }
}

/** How long the open and close animation may take (the stylesheet's durations plus a little). */
export const ACCORDION_MOTION_MS = 180;

/** True when the player has not asked for reduced motion. Without `matchMedia` (tests) it is false. */
export function motionAllowed(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    );
  } catch {
    return false;
  }
}

/** What an accordion inside a group knows about it. */
export interface GroupApi {
  /** One open at a time. */
  exclusive: boolean;
  openName: string | null;
  setOpenName: (name: string | null) => void;
}

export const GroupContext = createContext<GroupApi | null>(null);

/** How many accordions this one sits inside (0 at the top). One level of nesting is supported. */
export const DepthContext = createContext(0);
