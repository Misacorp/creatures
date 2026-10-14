/**
 * The light of the living room right now, in the guild's timezone and by the server's clock (not the
 * device's). One timeout swaps it at the next boundary and is armed again after every swap; it is
 * cleared when the component goes away. No interval.
 */
import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { msUntilNextPhase, phaseAt } from './room-phase';
import type { RoomPhase } from './sprites/room-art';

/** The room is lit as at night when the timezone is unknown. */
export const FALLBACK_PHASE: RoomPhase = 'night';
/** Wake a moment after the boundary, so a timer that fires a hair early still finds the new phase. */
const WAKE_MARGIN_MS = 250;

/** The phase at a server time, or the fallback when the timezone is not known (null or unusable). */
export function phaseOrFallback(serverNow: number, timeZone: string | null): RoomPhase {
  return (timeZone === null ? null : phaseAt(serverNow, timeZone)) ?? FALLBACK_PHASE;
}

/**
 * `offset` is the server clock minus the local clock (kept in a ref so a new state does not re-arm
 * the timer); `timeZone` comes with `GET /api/state`.
 */
export function useRoomPhase(offset: RefObject<number>, timeZone: string | null): RoomPhase {
  const serverNow = (): number => Date.now() + (offset.current ?? 0);
  const [phase, setPhase] = useState<RoomPhase>(() => phaseOrFallback(serverNow(), timeZone));
  useEffect(() => {
    setPhase(phaseOrFallback(serverNow(), timeZone));
    if (timeZone === null) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      const wait = msUntilNextPhase(serverNow(), timeZone);
      if (wait === null) return;
      timer = setTimeout(() => {
        setPhase(phaseOrFallback(serverNow(), timeZone));
        arm();
      }, wait + WAKE_MARGIN_MS);
    };
    arm();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [timeZone]);
  return phase;
}
