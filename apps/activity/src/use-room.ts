/**
 * The living room's residents as the screen needs them: the player's own lounger built locally from
 * the game state (so it updates the moment they train it), and the others from `POST /api/room`
 * through the loader (see `room-loader.ts` for when it asks). Reacts to Discord's participant
 * updates and nothing else: no intervals, no polling.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fetchRoom, type GameState } from './api';
import type { GearItem } from './gear-types';
import type { ParticipantSource } from './participants';
import { ownResident, roomResidents, type Resident } from './room-data';
import { createRoomLoader, type RoomLoader } from './room-loader';

interface RoomInputs {
  /** False until the player has a starter: the room is not shown and nothing is asked. */
  enabled: boolean;
  participants: ParticipantSource;
  selfId: string;
  /** The player's own display name. */
  selfName: string;
  state: Pick<GameState, 'creatures' | 'loungerId'>;
  /** Crafting level by creature id, once the gear view has loaded. */
  craftingLevels: ReadonlyMap<string, number>;
  /** The gear view's items, once loaded: they give your worn item its main stat. */
  gearItems?: readonly GearItem[];
}

export interface RoomHandle {
  residents: readonly Resident[];
  /** Call on tab switches: refetches the others only when the last full fetch is over 60 s old. */
  refreshIfStale: () => void;
}

export function useRoom({
  enabled,
  participants,
  selfId,
  selfName,
  state,
  craftingLevels,
  gearItems,
}: RoomInputs): RoomHandle {
  const [present, setPresent] = useState<readonly string[]>(() => participants.ids());
  const [known, setKnown] = useState<ReadonlyMap<string, Resident>>(() => new Map());
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
    return () => {
      unsubscribe();
      next.dispose();
      loader.current = null;
    };
  }, [enabled, participants, selfId]);

  const residents = useMemo(
    () =>
      roomResidents(
        present,
        known,
        ownResident(
          { creatures: state.creatures, loungerId: state.loungerId },
          selfId,
          selfName,
          craftingLevels,
          gearItems,
        ),
      ),
    [present, known, state.creatures, state.loungerId, selfId, selfName, craftingLevels, gearItems],
  );

  return {
    residents,
    refreshIfStale: () => {
      loader.current?.refreshIfStale();
    },
  };
}
