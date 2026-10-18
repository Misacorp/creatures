/**
 * Where the page goes in the dungeon tab, so the player never scrolls back and forth between the map and
 * the arena. The page itself scrolls (the Activity's iframe window; there is no inner scroll container).
 *
 * - A fight on the stage: the arena's top goes to the top of the view (`fightScroll`, `DungeonPlayback`).
 * - A card that replaces the map (a mystery room, the camp, the descent): the card brings itself into view
 *   (`RevealShell`, `arrive`).
 * - Back on the map: the room just played goes into the top half of the view (`mapScrollTop`), so the
 *   rooms below it, which the run may go to next, are on screen (the map goes downward).
 *
 * The functions here are pure (numbers in, number out); `scrollRoomIntoTopHalf` is the one that touches the page.
 */
import type { DungeonRunState } from './dungeon-types';

/** Where the room's centre should land, as a share of the view's height, when the page moves for it. */
export const ROOM_FOCUS = 0.3;

/**
 * The id of the room to bring into view on the map: the one the run stands in, or the entrance of the
 * Undercroft level it is about to start. Null: none (the top of the run is shown instead).
 */
export function mapFocusNode(
  state: Pick<DungeonRunState, 'at' | 'undercroft' | 'level'>,
): string | null {
  if (state.at !== null) return state.at;
  const level = state.level;
  if (level <= 0) return null;
  const entrance = state.undercroft?.maps[level - 1]?.nodes.find((n) => n.floor === 0);
  return entrance?.id ?? null;
}

interface MapScrollInput {
  /** The room's top edge, relative to the view (`getBoundingClientRect().top`). */
  roomTop: number;
  roomHeight: number;
  /** The view's height. */
  viewportHeight: number;
  /** How far the page is scrolled now. */
  scrollY: number;
  /** How far the page can scroll at most (document height minus the view). */
  maxScroll: number;
}

/**
 * The scroll position that puts the room in the top half of the view, or null when it already is there
 * (the whole room on screen and its centre above the middle), so the page does not move for nothing.
 * Otherwise the room's centre goes to `ROOM_FOCUS` of the view's height, and the result stays within the page.
 */
export function mapScrollTop(input: MapScrollInput): number | null {
  const { roomTop, roomHeight, viewportHeight, scrollY, maxScroll } = input;
  const centre = roomTop + roomHeight / 2;
  if (roomTop >= 0 && centre <= viewportHeight / 2) return null;
  const wanted = scrollY + centre - viewportHeight * ROOM_FOCUS;
  return Math.round(Math.min(Math.max(0, maxScroll), Math.max(0, wanted)));
}

/**
 * Scrolls the page so the room's button sits in the top half of the view: at once for a player who prefers
 * reduced motion, smoothly otherwise. Returns false (and does nothing) where there is no page to scroll.
 */
export function scrollRoomIntoTopHalf(room: Element, reducedMotion: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return false;
  const rect = room.getBoundingClientRect();
  const target = mapScrollTop({
    roomTop: rect.top,
    roomHeight: rect.height,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
    maxScroll: document.documentElement.scrollHeight - window.innerHeight,
  });
  if (target !== null) {
    window.scrollTo({ top: target, left: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  return true;
}
