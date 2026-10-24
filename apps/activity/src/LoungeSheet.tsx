import { LivingRoom } from './LivingRoom';
import { Drawer } from './ui/Drawer';

type RoomProps = Parameters<typeof LivingRoom>[0];

/**
 * The living room on a phone: a bottom sheet (the shared `ui/Drawer`) the dock's Lounge button opens, with
 * a close button, a pull down on the handle, a tap outside and Escape. It only draws: who is in the room, the
 * polling and the XP reload are the game screen's (`use-lounge-presence.ts`) and run while the sheet is shut.
 * Closed, nothing is drawn at all.
 */
export function LoungeSheet({
  open,
  onClose,
  room,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomProps;
  /** The Lounge button, which gets the focus back. */
  returnFocusTo?: HTMLElement | null | undefined;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Lounge"
      returnFocusTo={returnFocusTo}
      class="lounge-sheet"
    >
      <LivingRoom {...room} />
    </Drawer>
  );
}
