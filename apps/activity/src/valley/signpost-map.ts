/**
 * What the Signpost's map says about each destination (the expedition map as the Signpost place's canvas, Misa 2026-11-11), as plain
 * functions: the places the valley lists at their spots on the map, the scouts standing at each (the map's creature-at-place look), a
 * small flag for the fullest pack there, the closed ones dimmed with what opens them, and the spoken label. The map's art, its spots
 * and its drawing are the Expeditions screen's (`WorldMap`, `sprites/world-map-art`); only the words come from the valley's `places`
 * and `seats`. Pure: the server's view goes in, `MapPlace`s come out.
 */
import { ELEMENTS, type Element, type ValleySeatView } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { MAP_MAX_FACES, type MapPlace } from '../map-view';
import { MAP_SPOTS } from '../sprites/world-map-art';
import { placeName } from './signpost-view';

/** What opens a closed destination (V-SCOUT-8), said under its marker and in its drawer. */
export const CLOSED_RULE = 'Opens in Festival weeks';

const isElement = (e: string | null): e is Element =>
  e !== null && (ELEMENTS as readonly string[]).includes(e);

/** The scouts standing at a destination: the seats pointing at it that hold a creature. */
export function seatsAt(visit: ValleyVisit, destination: string): ValleySeatView[] {
  return visit.seats.filter((s) => s.destination === destination && s.creatureId !== null);
}

/** The fullest pack among seats, as a whole percent (100 for a full one). */
function fullestPercent(seats: readonly ValleySeatView[]): number {
  let most = 0;
  for (const seat of seats) {
    const part = seat.store.full
      ? 1
      : seat.store.capHours <= 0
        ? 0
        : seat.store.hours / seat.store.capHours;
    most = Math.max(most, part);
  }
  return Math.min(100, Math.floor(most * 100));
}

/** The small flag of a destination with scouts: "FULL" when a pack is full, else the fullest pack's fill ("40%"). */
export function packFlag(seats: readonly ValleySeatView[]): string | null {
  const active = seats.filter((s) => s.paused === null);
  if (active.length === 0) return null;
  if (active.some((s) => s.store.full)) return 'FULL';
  return `${String(fullestPercent(active))}%`;
}

/** The small muted line under a marker: what opens a closed place, else this week's special, else the night's bonus. */
function ruleOf(place: ValleyVisit['places'][number]): string | null {
  if (!place.open) return CLOSED_RULE;
  if (place.special) return 'Special';
  if (place.night) return 'More at night';
  return null;
}

/** The spoken label of a destination: its name, who scouts there, what its pack says, and what opens it or marks it. */
export function destinationLabel(
  place: ValleyVisit['places'][number],
  seats: readonly ValleySeatView[],
): string {
  const parts = [placeName(place.id)];
  if (seats.length > 0) {
    parts.push(seats.length === 1 ? '1 scout there' : `${String(seats.length)} scouts there`);
    const full = seats.filter((s) => s.store.full).length;
    if (full > 0) parts.push(full === 1 ? 'a pack is full' : `${String(full)} packs are full`);
    if (seats.some((s) => s.paused !== null)) parts.push('in the raid');
  }
  if (!place.open) parts.push('closed, opens in Festival weeks');
  else {
    if (place.special) parts.push("this week's special");
    if (place.night) parts.push('more at night');
  }
  return parts.join(', ');
}

/**
 * One map place for each destination the valley lists that the map has a spot for, in the server's order. The explorers' faces are
 * the scouts standing there (up to two, the rest a "+N"), `home` shows the flag (the pack's state), `locked` dims a closed place.
 */
export function signpostMapPlaces(
  visit: ValleyVisit,
  creatures: readonly Pick<Creature, 'id' | 'species' | 'shiny'>[],
  selected: string | null,
): MapPlace[] {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  return visit.places.flatMap((place) => {
    const spot = MAP_SPOTS[place.id];
    if (spot === undefined) return [];
    const seats = seatsAt(visit, place.id);
    const faces = seats.flatMap((s) => {
      const c = byId.get(s.creatureId ?? '');
      return c === undefined ? [] : [{ creatureId: c.id, species: c.species, shiny: c.shiny }];
    });
    const flag = packFlag(seats);
    return [
      {
        id: place.id,
        name: placeName(place.id),
        element: isElement(place.element) ? place.element : null,
        spot,
        faces: faces.slice(0, MAP_MAX_FACES),
        more: Math.max(0, faces.length - MAP_MAX_FACES),
        count: faces.length,
        home: flag !== null,
        pushOn: false,
        rule: ruleOf(place),
        selected: selected === place.id,
        label: destinationLabel(place, seats),
        flag,
        locked: !place.open,
      },
    ];
  });
}
