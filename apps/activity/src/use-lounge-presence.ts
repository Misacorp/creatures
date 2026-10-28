/**
 * Keeps the player "in the room" whether or not the room is drawn. Everything that makes presence work
 * lives here, in the game screen's own hooks, and none of it reads whether the living room is on screen:
 * the room's data (`useRoom`: Discord's participants, the one slow poll, the live socket, your own resident)
 * and, while your lounger earns company XP, the move of its bar: pushed by the live socket (`onLoungeXp`), or,
 * only while the socket is not delivering, a reload of your state once per XP. On a phone the room is drawn only on the Home page; going there or away
 * changes nothing here (decisions.md 2026-10-24, the Home page).
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
  // Nothing while alone, hidden or Rested, and nothing while the socket delivers each payment itself.
  const earning = loungeEarning(handle.company, false, state) && !handle.live;
  useEffect(() => {
    if (!earning) return undefined;
    const timer = setInterval(refresh, LOUNGE_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [earning]);
  return handle;
}
