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

/** The time rule that keeps a place shut right now: only at night, or only in Festival weeks. */
export interface TimeRule {
  kind: 'night' | 'festival';
  /** When it opens, as a phrase: "Opens tonight at 20:00", "Opens Fri 20:00", "Opens in Festival weeks". */
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
  /**
   * Why it is shut right now (night only, Festival only); null when it is open. The explorer's rank is
   * not here: it is enforced per creature (see `explorerOptions`), every place is open on the map.
   */
  timeRule: TimeRule | null;
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

/**
 * When a shut place opens, as a phrase. Night: "Opens tonight at 20:00" when the night starts later on
 * the same local day as `now`, else "Opens Fri 20:00" (without a usable timezone just "Opens at night").
 * Festival: "Opens in Festival weeks". The timezone is the guild's, passed explicitly.
 */
export function opensText(kind: TimeRule['kind'], now: number, timeZone: string | null): string {
  if (kind === 'festival') return 'Opens in Festival weeks';
  if (timeZone === null) return 'Opens at night';
  const next = nextNightStart(now, timeZone);
  if (next === null) return 'Opens at night';
  const [nowDay] = formatZoned(now, timeZone, 'short').split(' ');
  const [nextDay, nextTime] = formatZoned(next, timeZone, 'short').split(' ');
  return nowDay === nextDay
    ? `Opens tonight at ${nextTime ?? ''}`
    : `Opens ${nextDay ?? ''} ${nextTime ?? ''}`;
}

function timeRuleOf(
  view: Pick<DestinationsView, 'serverNow'>,
  place: DestinationsView['destinations'][number],
  timeZone: string | null,
): TimeRule | null {
  const kind = place.closed.includes('night')
    ? 'night'
    : place.closed.includes('festival')
      ? 'festival'
      : null;
  return kind === null ? null : { kind, text: opensText(kind, view.serverNow, timeZone) };
}

/**
 * One card per place the server lists, in its order. `explorer` is the creature that would go (its stars
 * decide whether the deeper area is open); without one the deeper area is closed.
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
        timeRule: timeRuleOf(view, place, timeZone),
      },
    ];
  });
}

/** The index of a card to show after moving `step` places in the catalogue (it wraps round). */
export function turnCatalogue(index: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}
