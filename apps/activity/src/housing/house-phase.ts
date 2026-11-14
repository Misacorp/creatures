/**
 * The light the house is shown in. It is the living room's phase (`useRoomPhase`, the server's clock in the guild's timezone):
 * `Game` gives it to `HouseHost`, which provides it here, so every picture of the house (the cutaway, a room, a visit, a
 * part's preview) reads one source and the house and the living room always agree. Outside a provider (a test, the workbench
 * without a control) it is day, which draws exactly as the house always did.
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { RoomPhase } from '@creatures/game';

export const HousePhaseContext = createContext<RoomPhase>('day');

/** The phase the house is drawn in. */
export function useHousePhase(): RoomPhase {
  return useContext(HousePhaseContext);
}
