/**
 * Which light the living room is in (day, twilight or night) for a moment and the guild's timezone,
 * and how long until it changes, so the room can swap with one timer at the boundary and no polling.
 * The rule itself is `roomPhase` in `@creatures/game` (night is the Moonlit Reef's night). The
 * timezone is always passed explicitly; pass server time, not the device clock.
 */
import { roomPhase, type RoomPhase } from '@creatures/game';
import { zonedClock } from './time-format';

/** Phases change on whole local hours, and every timezone offset is a multiple of 15 minutes. */
const STEP_MS = 15 * 60_000;
/** The longest a phase can last is about 10 hours (more with a clock change); look a day ahead. */
const LOOK_AHEAD_STEPS = (26 * 60) / 15;

/** The room's phase at `serverNow` in `timeZone`; null for an unknown timezone. */
export function phaseAt(serverNow: number, timeZone: string): RoomPhase | null {
  const clock = zonedClock(serverNow, timeZone);
  return clock === null ? null : roomPhase(clock.hour);
}

/**
 * Milliseconds from `serverNow` until the phase next changes in `timeZone` (always more than 0 and
 * at most about a day), or null for an unknown timezone. It reads the zone's real clock a quarter
 * hour at a time, so it is right across daylight-saving changes.
 */
export function msUntilNextPhase(serverNow: number, timeZone: string): number | null {
  const current = phaseAt(serverNow, timeZone);
  if (current === null) return null;
  const start = Math.floor(serverNow / STEP_MS) * STEP_MS;
  for (let i = 1; i <= LOOK_AHEAD_STEPS; i++) {
    const at = start + i * STEP_MS;
    if (phaseAt(at, timeZone) !== current) return at - serverNow;
  }
  return null;
}
