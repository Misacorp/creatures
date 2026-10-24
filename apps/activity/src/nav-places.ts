/**
 * The places of the main navigation as plain data, and the rules of the phone dock: which places fit in
 * the dock, which go to "More", that the place you are in is always in the dock, and the roll-up pip on
 * "More". The dock, the desktop rail and the More drawer all read the one list (`navPlaces`), so a new
 * screen, or one day a map home, is one entry. Ids are plain strings here: nothing in this file knows what
 * the places are.
 */
import type { TabAlerts } from './tab-alerts';
import { TABS } from './tabs';

export interface NavPlace {
  id: string;
  /** The word under the picture, also the accessible name. */
  label: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
  /** Why the place has a pip (the words a screen reader adds to its name), or null when it has none. */
  pip: string | null;
}

/** The places in their order (rising danger, see `tabs.ts`), each with its pip from the alerts of `tab-alerts.ts`. */
export function navPlaces(alerts: TabAlerts): NavPlace[] {
  return TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    glyph: tab.glyph,
    pip: alerts[tab.id] ?? null,
  }));
}

export interface DockSplit {
  /** The places drawn in the dock, left to right. */
  dock: readonly NavPlace[];
  /** The places in the More drawer, in list order; empty when every place fits (no More button). */
  more: readonly NavPlace[];
}

/**
 * Splits `places` for a dock of `capacity` buttons. When they all fit there is no More. Otherwise the last
 * button is More and the first `capacity - 1` places fill the rest; if the active place is not among them it
 * takes the last of those buttons (the others keep their spots, so the dock does not reshuffle) and the place
 * it displaces moves to More.
 */
export function splitDock(
  places: readonly NavPlace[],
  activeId: string,
  capacity: number,
): DockSplit {
  if (places.length <= capacity) return { dock: places, more: [] };
  const slots = Math.max(1, capacity - 1);
  const dock = places.slice(0, slots);
  const active = places.find((p) => p.id === activeId);
  if (active !== undefined && !dock.some((p) => p.id === activeId)) dock[slots - 1] = active;
  const shown = new Set(dock.map((p) => p.id));
  return { dock, more: places.filter((p) => !shown.has(p.id)) };
}

/**
 * The roll-up pip of More: why a place inside it needs the player, or null when none does. One place is
 * named with its reason ("Expeditions: a trip is home"); several are counted ("3 places need you").
 */
export function moreAlert(more: readonly NavPlace[]): string | null {
  const waiting = more.filter((p) => p.pip !== null);
  const [first] = waiting;
  if (first === undefined) return null;
  if (waiting.length === 1) return `${first.label}: ${first.pip ?? ''}`;
  return `${String(waiting.length)} places need you`;
}

/** The gap between dock buttons in px (`--dock-gap` in `main-nav.css` is the same, 0.25 rem). */
export const DOCK_GAP_PX = 4;

/** The dock never gets fewer buttons than the active place and More. */
const MIN_CAPACITY = 2;

/** The measured natural widths (px) of the dock's buttons: each place by id, and the More button. */
export interface DockWidths {
  places: Readonly<Record<string, number>>;
  more: number;
}

/**
 * How many buttons fit a dock `room` px wide, for `splitDock`: all of the places if their natural widths
 * (the picture over the word, at least a 44 px touch target; measured, so a long word takes what it needs)
 * and the gaps fit; otherwise the most that fit together with the More button, counting the active place
 * that may take the last button. Never fewer than two. A place with no measured width counts as a 44 px target.
 */
export function dockCapacity(
  places: readonly NavPlace[],
  activeId: string,
  widths: DockWidths,
  room: number,
): number {
  const width = (place: NavPlace): number => widths.places[place.id] ?? 44;
  const used = (shown: readonly NavPlace[], withMore: boolean): number => {
    const count = shown.length + (withMore ? 1 : 0);
    const sum = shown.reduce((total, place) => total + width(place), withMore ? widths.more : 0);
    return sum + Math.max(0, count - 1) * DOCK_GAP_PX;
  };
  if (used(places, false) <= room) return places.length;
  for (let capacity = places.length - 1; capacity > MIN_CAPACITY; capacity -= 1) {
    if (used(splitDock(places, activeId, capacity).dock, true) <= room) return capacity;
  }
  return MIN_CAPACITY;
}
