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
