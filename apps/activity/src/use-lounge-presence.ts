/**
 * Keeps the player "in the room" whether or not the room is drawn. Everything that makes presence work
 * lives here, in the game screen's own hooks, and none of it reads whether the living room is on screen:
 * the room's data (`useRoom`: Discord's participants, the one slow poll, the live socket, your own resident)
 * and the reload of your state once per XP while your lounger earns company XP (the server pays what you
 * collected when you make a request). On a phone the room is drawn in a sheet (`LoungeSheet`) that is open
 * only now and then; opening or closing it changes nothing here (decisions.md 2026-10-24, the Lounge button).
 */
import { useEffect } from 'preact/hooks';
import type { GameState } from './api';
import { LOUNGE_REFRESH_MS, loungeEarning } from './room-data';
import { useRoom, type RoomHandle } from './use-room';

type RoomArgs = Parameters<typeof useRoom>[0];

export function useLoungePresence(
  room: RoomArgs,
  /** The state the earning check reads (the lounger and what it earned today). */
  state: Pick<GameState, 'loungerId' | 'loungeXp'>,
  /** Reloads the state in the background (the game's own). */
  refresh: () => void,
): RoomHandle {
  const handle = useRoom(room);
  // Nothing while alone, hidden or Rested.
  const earning = loungeEarning(handle.company, false, state);
  useEffect(() => {
    if (!earning) return undefined;
    const timer = setInterval(refresh, LOUNGE_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [earning]);
  return handle;
}
