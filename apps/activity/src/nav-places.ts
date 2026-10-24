/**
 * The places of the main navigation as plain data, and the groups they sit in. The dock (three group
 * buttons with upward sub-menus) and the desktop rail (every place under group headings) read the one list
 * (`navPlaces`) and the one group list (`NAV_GROUPS`), so a new screen, or one day a map home, is one entry.
 * A group with one place is a direct button. Ids are plain strings here: nothing in this file knows what the
 * places are.
 */
import type { TabAlerts } from './tab-alerts';
import { NAV_GROUPS, TABS } from './tabs';

export interface NavPlace {
  id: string;
  /** The word under the picture, also the accessible name. */
  label: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
  /** The id of the group the place belongs to. */
  group: string;
  /** Why the place has a pip (the words a screen reader adds to its name), or null when it has none. */
  pip: string | null;
}

export interface NavGroup {
  id: string;
  label: string;
  glyph: string;
  /** The group's places in list order; never empty. */
  places: readonly NavPlace[];
  /** The roll-up pip of the group's places (`groupAlert`), or null. */
  pip: string | null;
  /** True when the group has one place: its button goes straight there, with no menu. */
  direct: boolean;
}

/** The places in their order (rising danger, see `tabs.ts`), each with its pip from the alerts of `tab-alerts.ts`. */
export function navPlaces(alerts: TabAlerts): NavPlace[] {
  return TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    glyph: tab.glyph,
    group: tab.group,
    pip: alerts[tab.id] ?? null,
  }));
}

/**
 * The roll-up pip of a group: why a place inside it needs the player, or null when none does. One place
 * is named with its reason ("Expeditions: a trip is home"); several are counted ("2 places need you"). A
 * group of one place is that place's own pip, with no name repeated.
 */
export function groupAlert(places: readonly NavPlace[]): string | null {
  const waiting = places.filter((p) => p.pip !== null);
  const [first] = waiting;
  if (first === undefined) return null;
  if (places.length === 1) return first.pip;
  if (waiting.length === 1) return `${first.label}: ${first.pip ?? ''}`;
  return `${String(waiting.length)} places need you`;
}

/**
 * The groups in their order, each with its places (in list order) and its roll-up pip. A group with no
 * place is left out; a place whose group is unknown is not shown (a content mistake the tests catch).
 */
export function navGroups(
  places: readonly NavPlace[],
  groups: readonly { id: string; label: string; glyph: string }[] = NAV_GROUPS,
): NavGroup[] {
  const result: NavGroup[] = [];
  for (const group of groups) {
    const inGroup = places.filter((p) => p.group === group.id);
    if (inGroup.length === 0) continue;
    result.push({
      id: group.id,
      label: group.label,
      glyph: group.glyph,
      places: inGroup,
      pip: groupAlert(inGroup),
      direct: inGroup.length === 1,
    });
  }
  return result;
}
