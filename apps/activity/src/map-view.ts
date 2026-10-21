/**
 * What the Expeditions world map says about each place, as plain functions (tested without a browser):
 * who is out there, whether a trip is ready or waits for a push-on choice, the spoken label, the whole-number
 * scale of the art and arrow-key movement in reading order. The art and the spots are in
 * `sprites/world-map-art.ts`; the drawing is in `WorldMap.tsx`. Every place is open on the map: rank
 * limits are per creature (the explorer picker), and a place's time rule is only passed through as a line.
 */
import { expeditionContent, type Element } from '@creatures/game';
import type { Creature } from './api';
import type { Trip } from './expedition-types';
import { MAP_SIZE, MAP_SPOTS, type MapPoint } from './sprites/world-map-art';
import { tripStatus } from './trip-view';

/** At most this many faces show over a marker; the rest are a "+N". */
export const MAP_MAX_FACES = 2;

export interface MapFace {
  creatureId: string;
  species: string;
  shiny: boolean;
}

export interface MapPlace {
  id: string;
  name: string;
  /** The place's element; null for a mixed place. */
  element: Element | null;
  /** Where the marker sits, in map pixels. */
  spot: MapPoint;
  /** Up to two explorers out there (trip order). */
  faces: MapFace[];
  /** Explorers out there beyond the faces. */
  more: number;
  /** Trips out there in all (running, ready or waiting for a choice). */
  count: number;
  /** A trip there is ready to claim. */
  home: boolean;
  /** A trip there waits for the player's push-on choice. */
  pushOn: boolean;
  /** A small muted line about a time rule ("Night only"), passed through by the caller; null for none. */
  rule: string | null;
  selected: boolean;
  /** The spoken label, for example "Ember Caves, 2 explorers there, 1 home". */
  label: string;
}

interface MapPlacesInput {
  trips: readonly Trip[];
  creatures: readonly Pick<Creature, 'id' | 'species' | 'shiny'>[];
  /** Server time (ms): decides which trips are home. */
  now: number;
  selected: string | null;
  /** A time-rule line per destination id ("Night only"), shown under the name. */
  rules?: Readonly<Record<string, string>>;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** The spoken label of a place. */
export function placeLabel(
  name: string,
  counts: { count: number; home: number; pushOn: number },
  rule: string | null,
): string {
  const parts = [name];
  if (counts.count > 0) parts.push(plural(counts.count, 'explorer there', 'explorers there'));
  if (counts.home > 0) parts.push(`${String(counts.home)} home`);
  if (counts.pushOn > 0) parts.push(`${String(counts.pushOn)} waiting for a choice`);
  if (rule !== null) parts.push(rule);
  return parts.join(', ');
}

/** One entry per destination of the content, in content order. */
export function mapPlaces(input: MapPlacesInput): MapPlace[] {
  const byId = new Map(input.creatures.map((c) => [c.id, c]));
  return expeditionContent.destinations.flatMap((d) => {
    const spot = MAP_SPOTS[d.id];
    if (spot === undefined) return [];
    const here = input.trips.filter((t) => t.status === 'active' && t.destination === d.id);
    let home = 0;
    let pushOn = 0;
    for (const trip of here) {
      const phase = tripStatus(trip, input.now).phase;
      if (phase === 'ready') home++;
      else if (phase === 'choice') pushOn++;
    }
    const faces = here.flatMap((t) => {
      const c = byId.get(t.creatureId);
      return c === undefined ? [] : [{ creatureId: c.id, species: c.species, shiny: c.shiny }];
    });
    const rule = input.rules?.[d.id] ?? null;
    return [
      {
        id: d.id,
        name: d.name,
        element: d.element,
        spot,
        faces: faces.slice(0, MAP_MAX_FACES),
        more: Math.max(0, here.length - MAP_MAX_FACES),
        count: here.length,
        home: home > 0,
        pushOn: pushOn > 0,
        rule,
        selected: input.selected === d.id,
        label: placeLabel(d.name, { count: here.length, home, pushOn }, rule),
      },
    ];
  });
}

export const MAP_SCALE_SMALL = 2;
export const MAP_SCALE_LARGE = 3;

/**
 * The whole-number scale of the map art: 3 once the whole map fits at 3, else 2 (crisp, never a fraction).
 * At 2 the 368 px map is 736 px wide: it fits whole in the desktop card (48rem) and pans sideways on a phone.
 */
export function mapScale(width: number): number {
  return width >= MAP_SIZE.width * MAP_SCALE_LARGE ? MAP_SCALE_LARGE : MAP_SCALE_SMALL;
}

/** True when the map at its scale is wider than its window (it pans sideways). */
export function mapScrolls(width: number): boolean {
  return MAP_SIZE.width * mapScale(width) > width;
}

/**
 * The places in reading order, west to east and, within the same column, north to south: the order of the
 * list over the map and of the arrow keys. Places keep their content order from `mapPlaces`.
 */
export function mapReadingOrder<T extends { spot: { x: number; y: number } }>(
  places: readonly T[],
): T[] {
  return [...places].sort((a, b) => a.spot.x - b.spot.x || a.spot.y - b.spot.y);
}

/**
 * The marker an arrow key moves to: the next (`1`) or previous (`-1`) in reading order (the order of the ids), stopping at the
 * ends. With nothing current, `1` goes to the first and `-1` to the last. Null for an empty list.
 */
export function nextMarker(
  ids: readonly string[],
  current: string | null,
  dir: 1 | -1,
): string | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return (dir === 1 ? ids[0] : ids[ids.length - 1]) ?? null;
  return ids[Math.min(ids.length - 1, Math.max(0, at + dir))] ?? null;
}
