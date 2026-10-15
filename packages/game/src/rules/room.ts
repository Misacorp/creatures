import { RULES } from './config';
import { isNightHour } from './expeditions';

/** The light in the living room: daylight, the warm hours around night, or night itself. */
export type RoomPhase = 'day' | 'twilight' | 'night';

/** Whole hours from `from` forward to `hour` on the 24-hour clock (0 to 23). */
const hoursSince = (from: number, hour: number): number => (((hour - from) % 24) + 24) % 24;

/**
 * The room's phase for a guild-local hour (0 to 23). Night is exactly `isNightHour`, so it matches the
 * Moonlit Reef's night (20:00 to 06:00). Twilight is `RULES.room.twilightHours` on either side of it:
 * dawn from 06:00 to 08:00 and dusk from 18:00 to 20:00. Day is the rest.
 */
export function roomPhase(localHour: number): RoomPhase {
  if (isNightHour(localHour)) return 'night';
  const { fromHour, toHour } = RULES.expeditions.night;
  const span = RULES.room.twilightHours;
  const dawn = hoursSince(toHour, localHour) < span;
  const dusk = hoursSince(localHour, fromHour) <= span;
  return dawn || dusk ? 'twilight' : 'day';
}

/**
 * The ids of the living room's 16 spots, in room order (left to right, bay by bay). The Activity's
 * `ROOM_SPOTS` (apps/activity/src/sprites/room-art.ts) has the same ids in the same order, which a test
 * there checks. The server stores a player's chosen spot as one of these ids.
 */
export const ROOM_SPOT_IDS = [
  'window-sill',
  'window-floor',
  'window-cushion',
  'couch-left',
  'couch-middle',
  'couch-right',
  'table-chair-left',
  'table-chair-right',
  'table-stool',
  'fire-mantel',
  'fire-rug-left',
  'fire-rug-right',
  'fire-pouf',
  'shelf-top',
  'shelf-floor',
  'shelf-beanbag',
] as const;

export type RoomSpotId = (typeof ROOM_SPOT_IDS)[number];

const SPOT_ID_SET: ReadonlySet<string> = new Set(ROOM_SPOT_IDS);

/** True for the id of one of the room's spots. */
export function isRoomSpotId(value: unknown): value is RoomSpotId {
  return typeof value === 'string' && SPOT_ID_SET.has(value);
}
