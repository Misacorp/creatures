/**
 * The destination catalogue as plain data: for each place a banner card with its element, who lives
 * there (known ones by name, the rest as silhouettes), whether the deeper area is open to the creature
 * that would go, the weekly twist, and why it is closed. Familiarity (stars and trips) is a trait of the
 * creature, not of the place, so it is not on the card: see `send-view.ts`. Names, species and flavour
 * come from the shared content; what is open and the twist come from the server
 * (`GET /api/destinations`); the night window is worked out in the guild's own timezone, passed in
 * explicitly.
 */
import { RULES, deepOpen, destinationDef, expeditionContent, isNightHour } from '@creatures/game';
import type { Creature } from './api';
import type { DestinationsView } from './expedition-types';
import { speciesName } from './game';
import { formatHourOfDay, formatZoned, zonedClock } from './time-format';

interface LockReason {
  kind: 'rank' | 'night' | 'festival';
  text: string;
}

export interface Resident {
  species: string;
  /** The creature has been caught here, by any of the player's explorers: its name and colours show. */
  known: boolean;
  /** It lives in the deeper area. */
  deep: boolean;
  /** The name to show: the species name once known, "???" before. */
  name: string;
}

export interface DestinationCard {
  id: string;
  name: string;
  flavor: string;
  /** The place's element id, or null for a mixed place. */
  element: string | null;
  minRank: number;
  /**
   * Plain facts about the place that are not flavour (shown in plain text under the italic flavour
   * line). Only Moonlit Reef has one: its night window.
   */
  facts: string[];
  residents: Resident[];
  /** The deeper area is open to the explorer that would go (it has a star here). */
  deepOpen: boolean;
  /** The weekly twist if this is the special place this week. */
  twist: { name: string; description: string; festival: boolean } | null;
  /** Why it is closed to the chosen explorer; empty when it is open. */
  locked: LockReason[];
}

/**
 * When the night next begins in the guild's timezone: the first minute from `now` on that is night.
 * Null for an unknown timezone. Works through daylight-saving changes because it reads the real clock
 * of the zone for every minute it tries.
 */
export function nextNightStart(now: number, timeZone: string): number | null {
  const start = Math.floor(now / 60_000) * 60_000;
  for (let i = 0; i <= 26 * 60; i++) {
    const at = start + i * 60_000;
    const clock = zonedClock(at, timeZone);
    if (clock === null) return null;
    if (isNightHour(clock.hour)) return at;
  }
  return null;
}

/** "Only open at night, 20:00 to 06:00 server time.": the place's description, whatever the hour. */
export function nightWindowText(): string {
  const { fromHour, toHour } = RULES.expeditions.night;
  return `Only open at night, ${formatHourOfDay(fromHour)} to ${formatHourOfDay(toHour)} server time.`;
}

/** "Night only (20:00 to 06:00). Opens Fri 20:00." for a place that is closed by day. */
export function nightText(now: number, timeZone: string | null): string {
  const { fromHour, toHour } = RULES.expeditions.night;
  const base = `Night only (${formatHourOfDay(fromHour)} to ${formatHourOfDay(toHour)} server time)`;
  if (timeZone === null) return `${base}.`;
  const next = nextNightStart(now, timeZone);
  return next === null ? `${base}.` : `${base}. Opens ${formatZoned(next, timeZone, 'short')}.`;
}

function lockReasons(
  view: DestinationsView,
  place: DestinationsView['destinations'][number],
  explorer: Pick<Creature, 'explorer'> | undefined,
  timeZone: string | null,
): LockReason[] {
  const out: LockReason[] = [];
  const rank = explorer?.explorer.rank;
  if (rank !== undefined ? rank < place.minRank : place.minRank > 1) {
    out.push({
      kind: 'rank',
      text:
        rank === undefined
          ? `Needs explorer rank ${String(place.minRank)}.`
          : `Needs explorer rank ${String(place.minRank)} (this one is rank ${String(rank)}).`,
    });
  }
  if (place.closed.includes('night')) {
    out.push({ kind: 'night', text: nightText(view.serverNow, timeZone) });
  }
  if (place.closed.includes('festival')) {
    out.push({ kind: 'festival', text: 'Only open in Festival weeks.' });
  }
  return out;
}

/**
 * One card per place the server lists, in its order. `explorer` is the creature that would go (its stars
 * decide whether the deeper area is open, and its rank gate applies); without one the deeper area is
 * closed and the rank gate shows for rank 2 and above.
 */
export function destinationCards(
  view: DestinationsView,
  explorer: Pick<Creature, 'id' | 'explorer'> | undefined,
  timeZone: string | null,
): DestinationCard[] {
  return view.destinations.flatMap((place) => {
    const def = destinationDef(place.id);
    if (def === undefined) return [];
    const rows = view.familiarity.filter((f) => f.destination === place.id);
    const found = new Set(rows.flatMap((f) => f.found));
    const mine =
      explorer === undefined ? undefined : rows.find((f) => f.creatureId === explorer.id);
    const twist =
      view.special.destination === place.id
        ? {
            name:
              expeditionContent.specials.twists.find((t) => t.id === view.special.twist)?.name ??
              '',
            description: view.special.description,
            festival: view.special.festival,
          }
        : null;
    const resident = (species: string, deep: boolean): Resident => ({
      species,
      known: found.has(species),
      deep,
      name: found.has(species) ? speciesName(species) : '???',
    });
    return [
      {
        id: place.id,
        name: def.name,
        flavor: def.flavor,
        element: def.element,
        minRank: place.minRank,
        facts: def.access.night === true ? [nightWindowText()] : [],
        residents: [
          ...def.species.map((s) => resident(s, false)),
          ...def.deep.species.map((s) => resident(s, true)),
        ],
        deepOpen: deepOpen(def, mine?.stars ?? 0, []),
        twist,
        locked: lockReasons(view, place, explorer, timeZone),
      },
    ];
  });
}

/** The index of a card to show after moving `step` places in the catalogue (it wraps round). */
export function turnCatalogue(index: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}
