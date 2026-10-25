/**
 * The living room's residents as the screen needs them: the player's own lounger built locally from
 * the game state (so it updates the moment they train it), and the others from `POST /api/room`
 * through the loader (see `room-loader.ts` for when it asks). Reacts to Discord's participant
 * updates and to the page being hidden or shown; the loader's single slow poll (every 45 s while
 * someone else is here and the page is visible) is its only timer. With the server's `loungeLive`
 * flag the room also opens the live socket (`live-socket.ts`) while someone else is here and the
 * page is visible: pushes replace the poll, and any trouble hands the room back to the poll.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fetchLoungeTicket, fetchRoom, loungeSocketUrl, type GameState } from './api';
import type { GearItem } from './gear-types';
import type { ParticipantSource } from './participants';
import { othersOf, ownResident, roomResidents, shouldOpenSocket, type Resident } from './room-data';
import { browserSocket, createLiveSocket } from './live-socket';
import { createRoomLoader, type RoomLoader } from './room-loader';

interface RoomInputs {
  /** False until the player has a starter: the room is not shown and nothing is asked. */
  enabled: boolean;
  participants: ParticipantSource;
  selfId: string;
  /** The player's own display name. */
  selfName: string;
  state: Pick<GameState, 'creatures' | 'loungerId' | 'loungeSpot' | 'serverFirsts'>;
  /** Crafting level by creature id, once the gear view has loaded. */
  craftingLevels: ReadonlyMap<string, number>;
  /** The gear view's items, once loaded: they give your worn item its main stat. */
  gearItems?: readonly GearItem[];
  /** The server offers the live socket (`/api/config`'s `loungeLive`). Default false. */
  loungeLive?: boolean;
}

export interface RoomHandle {
  residents: readonly Resident[];
  /** Call on tab switches: refetches the others only when the last full fetch is over 60 s old. */
  refreshIfStale: () => void;
  /** Somebody else is here (Discord's participants) and the page is visible: your lounger can earn. */
  company: boolean;
}

export function useRoom({
  enabled,
  participants,
  selfId,
  selfName,
  state,
  craftingLevels,
  gearItems,
  loungeLive = false,
}: RoomInputs): RoomHandle {
  const [present, setPresent] = useState<readonly string[]>(() => participants.ids());
  const [known, setKnown] = useState<ReadonlyMap<string, Resident>>(() => new Map());
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const loader = useRef<RoomLoader | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const next = createRoomLoader({ selfId, fetch: fetchRoom, onChange: setKnown });
    loader.current = next;
    setPresent(participants.ids());
    next.start(participants.ids());
    const unsubscribe = participants.subscribe(() => {
      const ids = participants.ids();
      setPresent(ids);
      next.update(ids);
    });
    // Hidden pages do not poll; a page shown again refetches at once if its data is over 45 s old.
    const onVisibility = (): void => {
      setHidden(document.hidden);
      next.setHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
      next.dispose();
      loader.current = null;
    };
  }, [enabled, participants, selfId]);

  // The live socket is open only while it can matter: somebody else is here and the page is visible.
  const wantSocket = shouldOpenSocket({ enabled, offered: loungeLive, hidden }, present, selfId);
  useEffect(() => {
    if (!wantSocket) return undefined;
    const socket = createLiveSocket({
      getTicket: fetchLoungeTicket,
      url: (ticket) => loungeSocketUrl(ticket, window.location),
      createSocket: browserSocket,
      onLive: (live) => {
        loader.current?.setLive(live);
      },
      onMessage: (message) => {
        if (message.type === 'resident') loader.current?.applyResident(message.resident);
      },
    });
    socket.start();
    return () => {
      socket.stop();
    };
  }, [wantSocket, selfId]);

  const residents = useMemo(
    () =>
      roomResidents(
        present,
        known,
        ownResident(
          {
            creatures: state.creatures,
            loungerId: state.loungerId,
            loungeSpot: state.loungeSpot,
            serverFirsts: state.serverFirsts,
          },
          selfId,
          selfName,
          craftingLevels,
          gearItems,
        ),
      ),
    [
      present,
      known,
      state.creatures,
      state.loungerId,
      state.loungeSpot,
      state.serverFirsts,
      selfId,
      selfName,
      craftingLevels,
      gearItems,
    ],
  );

  return {
    residents,
    refreshIfStale: () => {
      loader.current?.refreshIfStale();
    },
    company: enabled && !hidden && othersOf(present, selfId).length > 0,
  };
}
