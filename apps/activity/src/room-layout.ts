/**
 * Pure layout rules for the living room (no DOM): which integer scale fits a width, how many wall
 * tiles fill the sides of a wide screen, which participant sits in which spot, where a narrow screen
 * starts scrolled, and the slow idle pan. The room's art is in `sprites/room-art.ts`.
 */
import { hitTest, type Rect, type Point } from './dnd-core';
import { EDGE_TILE_WIDTH, ROOM_SIZE, SPOT_SIZE, type RoomSpot } from './sprites/room-art';

export const MIN_SCALE = 2;
export const MAX_SCALE = 4;
/** The largest scale of Home's hero room (`room` mode `home`, a wide window): 6 gives 1728 px of art at 1920. */
export const HERO_MAX_SCALE = 6;
/**
 * How many px narrower than a scale the window may be for the hero room to still use it: 1440 px is exactly
 * scale 5, so without it a scrollbar (15 px) would flip the hero between 5 and 4. The room's end walls are plain.
 */
export const HERO_SLACK = 16;
/** The scale used when the room does not fit and scrolls sideways. */
export const SCROLL_SCALE = 3;
/** How fast the idle pan moves, in CSS pixels per second. */
export const PAN_SPEED = 8;
/** The longest time step the pan will take at once (ms), so a stalled frame cannot make it jump. */
const PAN_MAX_STEP_MS = 250;

/**
 * The largest integer scale (2 to `maxScale`, 4 unless given) at which the whole room fits in `containerWidth` CSS
 * pixels. When even scale 2 does not fit (phones), the room is shown at scale 3 and scrolls sideways.
 */
export function roomScale(
  containerWidth: number,
  maxScale: number = MAX_SCALE,
): { scale: number; scroll: boolean } {
  for (let scale = maxScale; scale >= MIN_SCALE; scale--) {
    if (ROOM_SIZE.width * scale <= containerWidth) return { scale, scroll: false };
  }
  return { scale: SCROLL_SCALE, scroll: true };
}

/**
 * How many wall-and-floor edge tiles are needed on the left and on the right to fill a wide
 * container around the centred room. Zero when the room fills (or overflows) the width.
 */
export function edgeFill(containerWidth: number, scale: number): { left: number; right: number } {
  const spare = containerWidth - ROOM_SIZE.width * scale;
  if (!(spare > 0)) return { left: 0, right: 0 };
  const tile = EDGE_TILE_WIDTH * scale;
  const leftGap = Math.floor(spare / 2);
  const rightGap = spare - leftGap;
  return { left: Math.ceil(leftGap / tile), right: Math.ceil(rightGap / tile) };
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over the UTF-8 bytes of `text`. */
export function fnv1a(text: string): number {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** A spot a player chose: a `ROOM_SPOTS` id and the server time (ms) it was chosen. */
export interface SpotClaim {
  id: string;
  at: number;
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Gives each participant a spot. Everyone with the same instance id, the same set of user ids and the
 * same claims gets the same assignment, whatever order the ids arrive in. Repeated ids count once.
 *
 * 1. Claims first, oldest first (`at`, then user id): a player who chose a spot gets it unless an older
 *    claim already took it (or the id is not a spot of the room); that player then falls back to step 2.
 * 2. Everyone left, in hash order (then by id): a user's preferred spot comes from a hash of
 *    `instanceId:userId`; they take it or the next free one, wrapping around. With more users than
 *    spots, the last ones in that order get no spot (they are not in the map).
 *
 * `claims` maps a user id to the spot they chose, or null / absent for no choice.
 */
export function assignSpots(
  instanceId: string,
  userIds: readonly string[],
  spots: readonly Pick<RoomSpot, 'id'>[],
  claims: ReadonlyMap<string, SpotClaim | null> = new Map(),
): Map<string, string> {
  const assigned = new Map<string, string>();
  if (spots.length === 0) return assigned;
  const taken = new Array<boolean>(spots.length).fill(false);
  const ids = [...new Set(userIds)];

  const claimed = ids
    .flatMap((id) => {
      const claim = claims.get(id);
      return claim === null || claim === undefined ? [] : [{ id, claim }];
    })
    .sort((a, b) => a.claim.at - b.claim.at || byText(a.id, b.id));
  for (const { id, claim } of claimed) {
    const index = spots.findIndex((spot) => spot.id === claim.id);
    if (index < 0 || taken[index] === true) continue;
    taken[index] = true;
    assigned.set(id, claim.id);
  }

  const people = ids
    .filter((id) => !assigned.has(id))
    .map((id) => ({ id, hash: fnv1a(`${instanceId}:${id}`) }))
    .sort((a, b) => a.hash - b.hash || byText(a.id, b.id));
  for (const person of people) {
    const preferred = person.hash % spots.length;
    for (let step = 0; step < spots.length; step++) {
      const index = (preferred + step) % spots.length;
      const spot = spots[index];
      if (taken[index] === true || spot === undefined) continue;
      taken[index] = true;
      assigned.set(person.id, spot.id);
      break;
    }
  }
  return assigned;
}

/**
 * The spots a creature being moved may be dropped on: every spot nobody sits in, and the spot the
 * mover sits in now (dropping there changes nothing). `occupied` maps spot ids to the user sitting in
 * each, as `assignSpots` gave them; `self` is the mover's user id. In the room's spot order.
 */
export function dropSpotIds(
  spots: readonly Pick<RoomSpot, 'id'>[],
  occupied: ReadonlyMap<string, string>,
  self: string,
): string[] {
  return spots
    .filter((spot) => {
      const sitter = occupied.get(spot.id);
      return sitter === undefined || sitter === self;
    })
    .map((spot) => spot.id);
}

/** What a viewport needs to turn room pixels into screen pixels. */
export interface RoomGeometry {
  /** The room view's box on screen (CSS px). */
  view: Rect;
  /** How far the room view is scrolled sideways. */
  scrollLeft: number;
  /** Where the room's left edge is in the stage (wide screens centre it). */
  originX: number;
  scale: number;
}

/** The screen box of a spot's 16x16 creature footprint. */
export function spotRect(spot: Pick<RoomSpot, 'x' | 'y'>, geo: RoomGeometry): Rect {
  const left = geo.view.left + geo.originX + spot.x * geo.scale - geo.scrollLeft;
  const top = geo.view.top + spot.y * geo.scale;
  return {
    left,
    top,
    right: left + SPOT_SIZE.width * geo.scale,
    bottom: top + SPOT_SIZE.height * geo.scale,
  };
}

/**
 * The drop spot under the pointer, among `candidates` (ids from `dropSpotIds`). Null when the pointer
 * is outside the room view (the part of a scrolling room that is out of sight is not a target) or
 * over no candidate; where two footprints overlap the nearer centre wins (`hitTest`). `slop` widens
 * every footprint a little.
 */
export function dropSpotAt(
  p: Point,
  spots: readonly RoomSpot[],
  candidates: readonly string[],
  geo: RoomGeometry,
  slop = 0,
): string | null {
  const inside =
    p.x >= geo.view.left && p.x <= geo.view.right && p.y >= geo.view.top && p.y <= geo.view.bottom;
  if (!inside) return null;
  const targets = spots
    .filter((spot) => candidates.includes(spot.id))
    .map((spot) => ({ id: spot.id, rect: spotRect(spot, geo) }));
  return hitTest(targets, p, slop);
}

/**
 * The scroll position (CSS px) that centres a spot in the viewport, clamped to the room.
 * `spotX` is the spot's left edge in room pixels; `roomPixelWidth` is the room's width in CSS px
 * (that is, `ROOM_SIZE.width * scale`).
 */
export function initialScroll(
  spotX: number,
  scale: number,
  viewportWidth: number,
  roomPixelWidth: number,
): number {
  const max = Math.max(0, roomPixelWidth - viewportWidth);
  const centred = (spotX + SPOT_SIZE.width / 2) * scale - viewportWidth / 2;
  return Math.round(Math.min(max, Math.max(0, centred)));
}

/**
 * One step of the idle pan: moves `PAN_SPEED` CSS px per second in `direction` (1 right, -1 left) and
 * turns around at either end. `dt` is the time since the last step in milliseconds. Keep the
 * returned position yourself (it is fractional) and write it to `scrollLeft`.
 */
export function panStep(
  scrollLeft: number,
  direction: 1 | -1,
  maxScroll: number,
  dt: number,
): { scrollLeft: number; direction: 1 | -1 } {
  if (!(maxScroll > 0)) return { scrollLeft: 0, direction: 1 };
  const step = (PAN_SPEED * Math.min(Math.max(dt, 0), PAN_MAX_STEP_MS)) / 1000;
  const next = scrollLeft + direction * step;
  if (next >= maxScroll) return { scrollLeft: maxScroll, direction: -1 };
  if (next <= 0) return { scrollLeft: 0, direction: 1 };
  return { scrollLeft: next, direction };
}
