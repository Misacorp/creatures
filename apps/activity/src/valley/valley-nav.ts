/**
 * Where each of today's pages lives in the valley (`docs/design/valley/phase4-plan.md`, "Where each of today's
 * screens lives"), and what the four places that are not open yet say. The game keeps its one `tab` state; the
 * valley only decides which place a tab belongs to, so both shells draw the same page components. Pure.
 */
import type { Place } from '../tabs';
import type { PlaceId } from './valley-art';

/** The seven places that open one of today's pages. */
export const OPEN_PLACES = [
  'cave',
  'fair',
  'house',
  'paddock',
  'forge',
  'arena',
  'signpost',
] as const;
export type OpenPlaceId = (typeof OPEN_PLACES)[number];

/** The four newer places: drawn, not open yet (Q58). */
export type SoonPlaceId = Exclude<PlaceId, OpenPlaceId>;

export function isOpenPlace(id: PlaceId): id is OpenPlaceId {
  return (OPEN_PLACES as readonly string[]).includes(id);
}

/** The tab a place opens (the House opens Home's tab, drawn as its two entries; Journal and Stats are its two entries). */
export const PLACE_TAB: Readonly<Record<OpenPlaceId, Place>> = {
  cave: 'dungeon',
  fair: 'games',
  house: 'home',
  paddock: 'collection',
  forge: 'workshop',
  arena: 'raid',
  signpost: 'expeditions',
};

/** What a place's page is called, for the way back's row. */
export const PAGE_TITLES: Readonly<Record<OpenPlaceId, string>> = {
  cave: 'Dungeon',
  fair: 'Valley Games',
  house: 'House',
  paddock: 'Creatures',
  forge: 'Workshop',
  arena: 'Raid',
  signpost: 'Expeditions',
};

/** One line of what each new place will be, in the game's voice. */
export const SOON_LINES: Readonly<Record<SoonPlaceId, string>> = {
  bonfire: 'A fire will burn here, and your creatures will rest by it.',
  school: 'A teacher will visit here.',
  visitor: 'A stranger will set up a stall here once a week.',
  market: 'A market will open here, for shards and trades.',
};

export function soonLine(id: SoonPlaceId): string {
  return SOON_LINES[id];
}

/** Where Home's tab is drawn from: the map, the House, or a place that is not open yet. */
export type HomeAt = 'valley' | 'house' | SoonPlaceId;

/** What the valley shows. */
export type ValleyView =
  | { kind: 'valley' }
  | { kind: 'place'; place: OpenPlaceId; book: 'journal' | 'stats' | null }
  | { kind: 'soon'; place: SoonPlaceId };

/** The view for the game's current tab (the tab states are today's; `homeAt` only tells Home's three apart). */
export function viewOf(tab: Place, homeAt: HomeAt): ValleyView {
  switch (tab) {
    case 'home':
      if (homeAt === 'valley') return { kind: 'valley' };
      if (homeAt === 'house') return { kind: 'place', place: 'house', book: null };
      return { kind: 'soon', place: homeAt };
    case 'journal':
    case 'stats':
      return { kind: 'place', place: 'house', book: tab };
    case 'collection':
      return { kind: 'place', place: 'paddock', book: null };
    case 'workshop':
      return { kind: 'place', place: 'forge', book: null };
    case 'expeditions':
      return { kind: 'place', place: 'signpost', book: null };
    case 'dungeon':
      return { kind: 'place', place: 'cave', book: null };
    case 'raid':
      return { kind: 'place', place: 'arena', book: null };
    case 'games':
      return { kind: 'place', place: 'fair', book: null };
  }
}

/** The place a view is in, or null in the valley. */
export function placeOfView(view: ValleyView): PlaceId | null {
  return view.kind === 'valley' ? null : view.place;
}
