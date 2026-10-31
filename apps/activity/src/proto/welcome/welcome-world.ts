/**
 * What the welcome-back popup plays in (prototype, dev only): the shared sample world with nothing waiting (no
 * trip home, no job done), so the only markers in the valley are the popup's own; the cast, the creatures and
 * pieces the stories name; the markers as bubbles; and the two small things a screenshot holds still by (`&t=`,
 * `&closed=1` in the address).
 */
import { gearBase } from '@creatures/game';
import { creatureName } from '../../game';
import type { Bubble } from '../valley/valley-logic';
import { placeOf } from '../valley/valley-art';
import { initialWorld, type ProtoWorld } from '../world';
import type { Cast, Marker } from './highlights';

/** How many creatures of the roster the stories can name (two scouts, two smiths, four that rest). */
export const CAST_SIZE = 8;
/** How many different pieces of the sample bag the pictures show, in turn. */
export const PIECE_KINDS = 6;

/** The sample world as a quiet morning: everyone is home and free, nothing is waiting at a place. */
export function welcomeWorld(): ProtoWorld {
  const world = initialWorld();
  return {
    ...world,
    trips: [],
    jobs: [],
    creatures: world.creatures.map((c) => ({ ...c, away: false, busy: null })),
  };
}

/** The creatures and pieces the stories name, from the world's own roster and bag. */
export function castOf(world: ProtoWorld): Cast {
  const baseIds = world.items
    .map((i) => i.baseId)
    .filter((id, at, all) => all.indexOf(id) === at && gearBase(id) !== undefined)
    .slice(0, PIECE_KINDS);
  return {
    creatures: world.creatures.slice(0, CAST_SIZE).map((c) => ({
      name: creatureName(c),
      species: c.species,
      shiny: c.shiny,
    })),
    pieces: baseIds.map((baseId) => ({ baseId, name: gearBase(baseId)?.name ?? baseId })),
  };
}

/** The markers as the valley's own bubbles over their places, a picture and a number, never words. */
export function markerBubbles(markers: readonly Marker[]): Bubble[] {
  return markers.map((m) => ({
    place: m.place,
    need: null,
    picture: { glyph: m.glyph, species: m.species, count: m.count },
    spoken:
      m.count === 1
        ? `1 thing waiting at the ${placeOf(m.place).name}`
        : `${String(m.count)} things waiting at the ${placeOf(m.place).name}`,
    time: null,
  }));
}

/** `&t=<ms>` in the address: how far a screenshot holds the comic's reveal; null when absent. */
export function frozenAt(hash: string): number | null {
  const found = /[?&]t=(\d{1,6})(?:&|$)/.exec(hash);
  return found?.[1] === undefined ? null : Number.parseInt(found[1], 10);
}

/** `&closed=1` in the address: the popup is already closed (a screenshot of the valley it leaves). */
export function startsClosed(hash: string): boolean {
  return /[?&]closed=1(?:&|$)/.test(hash);
}
