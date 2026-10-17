/**
 * Find and filter on the Creatures tab: the search field's suggestions (name, nickname or species, typed
 * live), the filter chips (Needs you, elements, roles) and the last chips per viewer. Pure; the screen
 * (`CreatureFinder.tsx`, `Collection.tsx`) only draws and wires it. Everything here is text matching on
 * what the server already sent.
 */
import { content } from '@creatures/game';
import type { Creature } from './api';
import { capitalize, creatureName, getSpecies, speciesName } from './game';

/** The element chips, in the content's order. */
export const ELEMENT_OPTIONS: readonly { id: string; name: string }[] = content.elements.map(
  (e) => ({ id: e.id, name: e.name }),
);

/** The role chips (the game's four roles). A test checks every species' role is one of them. */
export const ROLE_OPTIONS: readonly { id: string; name: string }[] = [
  'guard',
  'setter',
  'payoff',
  'support',
].map((id) => ({ id, name: capitalize(id) }));

/** Below this many creatures the finder is not drawn: a short list needs no search. */
export const FINDER_MIN_CREATURES = 4;

/** Longest search the field takes (a nickname is at most 40 characters). */
export const QUERY_MAX = 40;

/** Most suggestions the list shows. */
export const SUGGESTION_LIMIT = 6;

export interface Filters {
  /** Only creatures that need the player. */
  needs: boolean;
  /** Element ids; a creature matches when it has any of them (none selected: all). */
  elements: readonly string[];
  /** Role ids; same rule. Element and role groups combine with "and". */
  roles: readonly string[];
}

export const NO_FILTERS: Filters = { needs: false, elements: [], roles: [] };

export function isFiltered(filters: Filters): boolean {
  return filters.needs || filters.elements.length > 0 || filters.roles.length > 0;
}

/** Adds the value to the list, or takes it out when it is there. */
export function toggled(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Whether one creature passes the chips. `needy` is the set of ids that need the player. */
export function matchesFilters(
  creature: Creature,
  filters: Filters,
  needy: ReadonlySet<string>,
): boolean {
  if (filters.needs && !needy.has(creature.id)) return false;
  const species = getSpecies(creature.species);
  if (filters.elements.length > 0 && !filters.elements.includes(species?.element ?? '')) {
    return false;
  }
  if (filters.roles.length > 0 && !filters.roles.includes(species?.role ?? '')) return false;
  return true;
}

export function applyFilters(
  creatures: readonly Creature[],
  filters: Filters,
  needy: ReadonlySet<string>,
): Creature[] {
  return creatures.filter((c) => matchesFilters(c, filters, needy));
}

/** Lower case, NFKC, accents folded, so "ZIPMOUSE", "Zipmouse" and "Zipmöuse" meet. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFKC').toLowerCase();
}

export interface Suggestion {
  creature: Creature;
  /** The name shown (nickname or species). */
  name: string;
  /** The species name when it differs from the name (a nicknamed creature), else null. */
  species: string | null;
  /** 0 is the best match. */
  rank: number;
}

/** How well `query` (already folded) matches `text` (folded): 0 exact, 1 prefix, 2 word start, 3 inside, null no. */
function matchRank(text: string, query: string): number | null {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.split(/[\s'-]+/).some((word) => word.startsWith(query))) return 2;
  return text.includes(query) ? 3 : null;
}

/**
 * The creatures a search suggests: those whose nickname or species name contains the query, best match
 * first (exact, prefix, word start, inside; a hit on the shown name before one on the species), then the
 * higher level, then the name. An empty or blank query suggests nothing.
 */
export function suggest(
  creatures: readonly Creature[],
  query: string,
  limit: number = SUGGESTION_LIMIT,
): Suggestion[] {
  const q = fold(query.trim().slice(0, QUERY_MAX));
  if (q === '') return [];
  const found: Suggestion[] = [];
  for (const creature of creatures) {
    const name = creatureName(creature);
    const species = speciesName(creature.species);
    const onName = matchRank(fold(name), q);
    const onSpecies = creature.nickname === null ? null : matchRank(fold(species), q);
    const rank = onName ?? (onSpecies === null ? null : 4 + onSpecies);
    if (rank === null) continue;
    found.push({ creature, name, species: creature.nickname === null ? null : species, rank });
  }
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.creature.level - a.creature.level ||
      a.name.localeCompare(b.name) ||
      a.creature.id.localeCompare(b.creature.id),
  );
  return found.slice(0, limit);
}

/** The words under the chips: how many creatures show, and what an empty result means. */
export function resultLine(shown: number, total: number, filters: Filters): string {
  if (!isFiltered(filters)) return `${String(total)} ${total === 1 ? 'creature' : 'creatures'}`;
  if (shown === 0) {
    return filters.needs && filters.elements.length === 0 && filters.roles.length === 0
      ? 'Nothing needs you right now.'
      : 'No creature matches these filters.';
  }
  return `Showing ${String(shown)} of ${String(total)}`;
}

/** The words of the search field's live count, for assistive technology. */
export function suggestionCount(count: number): string {
  if (count === 0) return 'No match';
  return count === 1 ? '1 suggestion' : `${String(count)} suggestions`;
}

// --- The last chips, per viewer (a local convenience; the server never sees it) ---

/** The part of Web Storage the filters use (so tests can pass a fake). */
export interface FilterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function filterStorageKey(viewerId: string): string {
  return `creatures:creature-filters:${viewerId}`;
}

/** The browser's storage, or null where it is missing or blocked (inside Discord it may be). */
export function browserFilterStorage(): FilterStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function idList(value: unknown, known: readonly string[]): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && known.includes(v))
    : [];
}

/**
 * The element and role chips this viewer left on last time. "Needs you" is not kept: it is a question
 * for today, and a stale one would hide the roster. Anything unreadable counts as no filter.
 */
export function loadFilters(
  storage: FilterStorage | null,
  viewerId: string,
  elements: readonly string[],
  roles: readonly string[],
): Filters {
  if (storage === null) return NO_FILTERS;
  try {
    const raw = storage.getItem(filterStorageKey(viewerId));
    if (raw === null) return NO_FILTERS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NO_FILTERS;
    const record = parsed as Record<string, unknown>;
    return {
      needs: false,
      elements: idList(record['elements'], elements),
      roles: idList(record['roles'], roles),
    };
  } catch {
    return NO_FILTERS;
  }
}

/** Remembers the element and role chips. Returns false when the storage refused. */
export function saveFilters(
  storage: FilterStorage | null,
  viewerId: string,
  filters: Filters,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(
      filterStorageKey(viewerId),
      JSON.stringify({ elements: filters.elements, roles: filters.roles }),
    );
    return true;
  } catch {
    return false;
  }
}
