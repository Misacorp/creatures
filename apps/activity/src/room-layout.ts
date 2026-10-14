/**
 * Pure layout rules for the living room (no DOM): which integer scale fits a width, how many wall
 * tiles fill the sides of a wide screen, which participant sits in which spot, where a narrow screen
 * starts scrolled, and the slow idle pan. The room's art is in `sprites/room-art.ts`.
 */
import { EDGE_TILE_WIDTH, ROOM_SIZE, SPOT_SIZE, type RoomSpot } from './sprites/room-art';

export const MIN_SCALE = 2;
export const MAX_SCALE = 4;
/** The scale used when the room does not fit and scrolls sideways. */
export const SCROLL_SCALE = 3;
/** How fast the idle pan moves, in CSS pixels per second. */
export const PAN_SPEED = 8;
/** The longest time step the pan will take at once (ms), so a stalled frame cannot make it jump. */
const PAN_MAX_STEP_MS = 250;

/**
 * The largest integer scale (2 to 4) at which the whole room fits in `containerWidth` CSS pixels. When
 * even scale 2 does not fit (phones), the room is shown at scale 3 and scrolls sideways.
 */
export function roomScale(containerWidth: number): { scale: number; scroll: boolean } {
  for (let scale = MAX_SCALE; scale >= MIN_SCALE; scale--) {
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

/**
 * Gives each participant a spot. Everyone with the same instance id and the same set of user ids gets
 * the same assignment, whatever order the ids arrive in. A user's preferred spot comes from a hash of
 * `instanceId:userId`; users are placed in hash order (then by id) and take the preferred spot or
 * the next free one, wrapping around. With more users than spots, the last ones in that order get no
 * spot (they are not in the map). Repeated ids count once.
 */
export function assignSpots(
  instanceId: string,
  userIds: readonly string[],
  spots: readonly Pick<RoomSpot, 'id'>[],
): Map<string, string> {
  const assigned = new Map<string, string>();
  if (spots.length === 0) return assigned;
  const people = [...new Set(userIds)]
    .map((id) => ({ id, hash: fnv1a(`${instanceId}:${id}`) }))
    .sort((a, b) => a.hash - b.hash || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const taken = new Array<boolean>(spots.length).fill(false);
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
