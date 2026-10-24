import type { ComponentChildren } from 'preact';
import type { HomeInput } from '../home-view';
import type { Screen, Tab } from '../tabs';
import type { BoardSettings } from './board';
import type { PinTeasers } from './BoardPins';
import { NoticeBoard } from './NoticeBoard';

/**
 * The Home page, the place the app opens on: the Today board, and on a phone the living room above it
 * (`room`, the shared `RoomBand`; on a wide window the room is the band above every screen, so none is passed
 * here). It only draws what `HomeInput` and the board's settings say; `HomeScreen` fills those in from the game
 * screen's own data.
 */
export function HomePage({
  input,
  settings,
  onGo,
  room,
  teasers,
  onOpenPage,
}: {
  input: HomeInput;
  settings: BoardSettings;
  onGo: (place: Tab, needsFilter?: boolean) => void;
  room?: ComponentChildren;
  /** The pins' teasers (the Journal's and the Stats'); null parts until the profile has loaded. */
  teasers?: PinTeasers;
  /** Opens the screen of a pin (the Journal or the Stats); without it the pins are not drawn. */
  onOpenPage?: (screen: Screen) => void;
}) {
  return (
    <div class="home-page">
      {room}
      <NoticeBoard
        input={input}
        settings={settings}
        onGo={onGo}
        {...(teasers === undefined ? {} : { teasers })}
        {...(onOpenPage === undefined ? {} : { onOpenPage })}
      />
    </div>
  );
}
