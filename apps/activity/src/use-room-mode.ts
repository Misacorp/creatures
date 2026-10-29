import { useEffect, useState } from 'preact/hooks';
import { readRoom, ROOM_EVENT, type RoomMode } from './looks';

/** The room mode on the page (`applyRoom` in `looks.ts`), live: the frame redraws when it is switched. */
export function useRoomMode(): RoomMode {
  const [mode, setMode] = useState<RoomMode>(() => readRoom());
  useEffect(() => {
    const read = (): void => {
      setMode(readRoom());
    };
    read();
    window.addEventListener(ROOM_EVENT, read);
    return () => {
      window.removeEventListener(ROOM_EVENT, read);
    };
  }, []);
  return mode;
}
